import { describe, it, expect, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { env } from "cloudflare:test";
import { authenticate, AuthError } from "../src/auth";

const SECRET = new TextEncoder().encode(env.SUPABASE_JWT_SECRET);

async function makeJwt(sub: string, opts: { expSeconds?: number; iss?: string } = {}) {
  return new SignJWT({ sub, role: "authenticated" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(opts.iss ?? "supabase")
    .setExpirationTime(opts.expSeconds ?? "1h")
    .sign(SECRET);
}

describe("authenticate", () => {
  it("rejects when Authorization header missing", async () => {
    const req = new Request("https://api.lexena.app/transcribe");
    await expect(authenticate(req, env)).rejects.toBeInstanceOf(AuthError);
  });

  it("rejects when token is malformed", async () => {
    const req = new Request("https://api.lexena.app/transcribe", {
      headers: { Authorization: "Bearer not-a-jwt" },
    });
    await expect(authenticate(req, env)).rejects.toBeInstanceOf(AuthError);
  });

  it("rejects when token is expired", async () => {
    const expired = await new SignJWT({ sub: "user-1", role: "authenticated", exp: Math.floor(Date.now() / 1000) - 60 })
      .setProtectedHeader({ alg: "HS256" })
      .sign(SECRET);
    const req = new Request("https://api.lexena.app/transcribe", {
      headers: { Authorization: `Bearer ${expired}` },
    });
    await expect(authenticate(req, env)).rejects.toBeInstanceOf(AuthError);
  });

  it("returns user_id when token is valid", async () => {
    const jwt = await makeJwt("user-1");
    const req = new Request("https://api.lexena.app/transcribe", {
      headers: { Authorization: `Bearer ${jwt}` },
    });
    const auth = await authenticate(req, env);
    expect(auth.user_id).toBe("user-1");
  });
});
