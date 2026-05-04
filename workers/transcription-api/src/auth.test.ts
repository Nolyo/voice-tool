import { describe, it, expect, vi, beforeEach } from "vitest";
import { authenticate, _resetJwksCacheForTest } from "./auth";

const ENV = {
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_SECRET_KEY: "sb_secret_test",
  GROQ_API_KEY: "g",
  OPENAI_API_KEY: "o",
} as const;

function b64url(input: ArrayBuffer | Uint8Array | string): string {
  const bytes =
    typeof input === "string"
      ? new TextEncoder().encode(input)
      : input instanceof Uint8Array
        ? input
        : new Uint8Array(input);
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function generateKeypair() {
  const pair = (await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  const jwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  return { privateKey: pair.privateKey, jwk };
}

async function makeToken(
  privateKey: CryptoKey,
  kid: string,
  payload: Record<string, unknown>,
): Promise<string> {
  const header = { alg: "ES256", typ: "JWT", kid };
  const headerB64 = b64url(JSON.stringify(header));
  const payloadB64 = b64url(JSON.stringify(payload));
  const signed = `${headerB64}.${payloadB64}`;
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privateKey,
    new TextEncoder().encode(signed),
  );
  return `${signed}.${b64url(signature)}`;
}

function mockJwksFetch(jwks: { keys: Array<Record<string, unknown>> }) {
  globalThis.fetch = vi.fn(async () =>
    new Response(JSON.stringify(jwks), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  ) as typeof fetch;
}

beforeEach(() => {
  _resetJwksCacheForTest();
});

describe("authenticate", () => {
  it("accepts a valid ES256 token", async () => {
    const { privateKey, jwk } = await generateKeypair();
    const kid = "kid-1";
    mockJwksFetch({ keys: [{ ...jwk, kid, kty: "EC", crv: "P-256" }] });

    const token = await makeToken(privateKey, kid, {
      sub: "user-123",
      email: "user@test.local",
      exp: Math.floor(Date.now() / 1000) + 60,
    });
    const req = new Request("https://api.test/transcribe", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const user = await authenticate(req, ENV);
    expect(user.user_id).toBe("user-123");
    expect(user.email).toBe("user@test.local");
  });

  it("rejects a missing Authorization header", async () => {
    const req = new Request("https://api.test/transcribe", { method: "POST" });
    const err = await authenticate(req, ENV).catch((e) => e);
    expect(err.name).toBe("AuthError");
    expect(err.code).toBe("missing");
  });

  it("rejects an expired token", async () => {
    const { privateKey, jwk } = await generateKeypair();
    const kid = "kid-1";
    mockJwksFetch({ keys: [{ ...jwk, kid, kty: "EC", crv: "P-256" }] });

    const token = await makeToken(privateKey, kid, {
      sub: "user-123",
      exp: Math.floor(Date.now() / 1000) - 10,
    });
    const req = new Request("https://api.test/transcribe", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const err = await authenticate(req, ENV).catch((e) => e);
    expect(err.name).toBe("AuthError");
    expect(err.code).toBe("expired");
  });

  it("rejects an unsupported alg", async () => {
    // Hand-craft a token with alg=HS256 — signature does not matter; the alg gate trips first.
    const headerB64 = b64url(JSON.stringify({ alg: "HS256", typ: "JWT", kid: "k" }));
    const payloadB64 = b64url(
      JSON.stringify({ sub: "u", exp: Math.floor(Date.now() / 1000) + 60 }),
    );
    const sig = b64url("nope");
    const token = `${headerB64}.${payloadB64}.${sig}`;
    const req = new Request("https://api.test/transcribe", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const err = await authenticate(req, ENV).catch((e) => e);
    expect(err.name).toBe("AuthError");
    expect(err.code).toBe("invalid");
  });

  it("rejects a token signed by a different key", async () => {
    const { privateKey: priv1 } = await generateKeypair();
    const { jwk: jwk2 } = await generateKeypair();
    const kid = "kid-1";
    mockJwksFetch({ keys: [{ ...jwk2, kid, kty: "EC", crv: "P-256" }] });

    const token = await makeToken(priv1, kid, {
      sub: "user-123",
      exp: Math.floor(Date.now() / 1000) + 60,
    });
    const req = new Request("https://api.test/transcribe", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const err = await authenticate(req, ENV).catch((e) => e);
    expect(err.name).toBe("AuthError");
    expect(err.code).toBe("invalid");
  });

  it("rejects an unknown kid (and forces one JWKS refresh)", async () => {
    const { jwk } = await generateKeypair();
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ keys: [{ ...jwk, kid: "kid-other", kty: "EC", crv: "P-256" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    globalThis.fetch = fetchMock as typeof fetch;

    const { privateKey } = await generateKeypair();
    const token = await makeToken(privateKey, "kid-missing", {
      sub: "user-123",
      exp: Math.floor(Date.now() / 1000) + 60,
    });
    const req = new Request("https://api.test/transcribe", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const err = await authenticate(req, ENV).catch((e) => e);
    expect(err.name).toBe("AuthError");
    expect(err.code).toBe("invalid");
    // First call to populate cache, second forced refresh on unknown kid.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
