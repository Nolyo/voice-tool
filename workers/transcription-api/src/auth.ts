// JWT verification for Supabase tokens.
// Supabase signs access tokens with ES256 (asymmetric, P-256 ECDSA).
// We fetch the public key from <SUPABASE_URL>/auth/v1/.well-known/jwks.json,
// cache it in module memory with a 1h TTL, and verify via Web Crypto.
import type { Env, AuthenticatedUser } from "./types";

export class AuthError extends Error {
  constructor(message: string, public readonly code: "missing" | "invalid" | "expired") {
    super(message);
    this.name = "AuthError";
  }
}

interface JwtHeader {
  alg?: unknown;
  kid?: unknown;
  typ?: unknown;
}

interface JwtPayload {
  sub?: unknown;
  email?: unknown;
  exp?: unknown;
  [key: string]: unknown;
}

interface JwkEC {
  kty: "EC";
  crv: "P-256";
  x: string;
  y: string;
  kid: string;
  alg?: string;
}

interface JwksResponse {
  keys: JwkEC[];
}

interface JwksCache {
  fetchedAt: number;
  byKid: Map<string, CryptoKey>;
}

const JWKS_TTL_MS = 60 * 60 * 1000; // 1h
let jwksCache: JwksCache | null = null;

function base64UrlDecode(input: string): Uint8Array {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/")
    + "=".repeat((4 - (input.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function decodeJsonPart(part: string): unknown {
  return JSON.parse(new TextDecoder().decode(base64UrlDecode(part)));
}

async function importEcPublicKey(jwk: JwkEC): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "jwk",
    {
      kty: jwk.kty,
      crv: jwk.crv,
      x: jwk.x,
      y: jwk.y,
      ext: true,
      key_ops: ["verify"],
    },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"],
  );
}

async function loadJwks(env: Env): Promise<JwksCache> {
  const url = `${env.SUPABASE_URL.replace(/\/$/, "")}/auth/v1/.well-known/jwks.json`;
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) {
    throw new AuthError(`jwks fetch failed: HTTP ${res.status}`, "invalid");
  }
  const body = (await res.json()) as JwksResponse;
  const byKid = new Map<string, CryptoKey>();
  for (const key of body.keys ?? []) {
    if (key.kty === "EC" && key.crv === "P-256" && key.kid) {
      byKid.set(key.kid, await importEcPublicKey(key));
    }
  }
  return { fetchedAt: Date.now(), byKid };
}

async function getKeyForKid(env: Env, kid: string): Promise<CryptoKey> {
  const stale =
    !jwksCache || Date.now() - jwksCache.fetchedAt > JWKS_TTL_MS || !jwksCache.byKid.has(kid);
  if (stale) {
    jwksCache = await loadJwks(env);
  }
  const key = jwksCache!.byKid.get(kid);
  if (!key) {
    // Force one refresh in case Supabase rotated keys mid-request.
    jwksCache = await loadJwks(env);
    const refreshed = jwksCache.byKid.get(kid);
    if (!refreshed) {
      throw new AuthError(`unknown kid: ${kid}`, "invalid");
    }
    return refreshed;
  }
  return key;
}

export async function authenticate(
  req: Request,
  env: Env,
): Promise<AuthenticatedUser> {
  const header = req.headers.get("Authorization");
  if (!header || !header.startsWith("Bearer ")) {
    throw new AuthError("missing Authorization header", "missing");
  }
  const token = header.slice("Bearer ".length).trim();
  if (!token) {
    throw new AuthError("empty bearer token", "missing");
  }

  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new AuthError("malformed token", "invalid");
  }
  const [headerB64, payloadB64, signatureB64] = parts;

  let jwtHeader: JwtHeader;
  let payload: JwtPayload;
  try {
    jwtHeader = decodeJsonPart(headerB64) as JwtHeader;
    payload = decodeJsonPart(payloadB64) as JwtPayload;
  } catch {
    throw new AuthError("invalid token encoding", "invalid");
  }

  if (jwtHeader.alg !== "ES256") {
    throw new AuthError(`unsupported alg: ${String(jwtHeader.alg)}`, "invalid");
  }
  if (typeof jwtHeader.kid !== "string" || !jwtHeader.kid) {
    throw new AuthError("missing kid in token header", "invalid");
  }

  if (typeof payload.exp === "number" && payload.exp < Math.floor(Date.now() / 1000)) {
    throw new AuthError("token expired", "expired");
  }

  const publicKey = await getKeyForKid(env, jwtHeader.kid);
  const signedData = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const signature = base64UrlDecode(signatureB64);
  // ES256 signatures in JWT use IEEE P1363 (raw r|s, 64 bytes) which matches
  // what crypto.subtle.verify expects for ECDSA — no DER conversion needed.
  const valid = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    publicKey,
    signature,
    signedData,
  );
  if (!valid) {
    throw new AuthError("invalid signature", "invalid");
  }

  if (typeof payload.sub !== "string" || !payload.sub) {
    throw new AuthError("missing sub claim", "invalid");
  }

  return {
    user_id: payload.sub,
    email: typeof payload.email === "string" ? payload.email : undefined,
  };
}

// Test helper: force a JWKS refetch on next call.
export function _resetJwksCacheForTest(): void {
  jwksCache = null;
}
