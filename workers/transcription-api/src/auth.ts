// JWT HS256 verification using only Web Crypto.
// Avoids any external JWT library so it runs identically in workerd, Node, and browser.
import type { Env, AuthenticatedUser } from "./types";

export class AuthError extends Error {
  constructor(message: string, public readonly code: "missing" | "invalid" | "expired") {
    super(message);
    this.name = "AuthError";
  }
}

interface JwtPayload {
  sub?: unknown;
  email?: unknown;
  exp?: unknown;
  [key: string]: unknown;
}

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

  let jwtHeader: { alg?: unknown };
  let payload: JwtPayload;
  try {
    jwtHeader = decodeJsonPart(headerB64) as { alg?: unknown };
    payload = decodeJsonPart(payloadB64) as JwtPayload;
  } catch {
    throw new AuthError("invalid token encoding", "invalid");
  }

  if (jwtHeader.alg !== "HS256") {
    throw new AuthError(`unsupported alg: ${String(jwtHeader.alg)}`, "invalid");
  }

  if (typeof payload.exp === "number" && payload.exp < Math.floor(Date.now() / 1000)) {
    throw new AuthError("token expired", "expired");
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.SUPABASE_JWT_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const signedData = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const signature = base64UrlDecode(signatureB64);
  const valid = await crypto.subtle.verify("HMAC", key, signature, signedData);
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
