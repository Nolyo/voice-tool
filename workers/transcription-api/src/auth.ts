// workers/transcription-api/src/auth.ts
import { jwtVerify } from "jose";
import type { Env, AuthenticatedUser } from "./types";

export class AuthError extends Error {
  constructor(message: string, public readonly code: "missing" | "invalid" | "expired") {
    super(message);
    this.name = "AuthError";
  }
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

  const secret = new TextEncoder().encode(env.SUPABASE_JWT_SECRET);
  let payload;
  try {
    const result = await jwtVerify(token, secret, {
      algorithms: ["HS256"],
    });
    payload = result.payload;
  } catch (err) {
    const code = (err as Error).message.toLowerCase().includes("exp")
      ? "expired"
      : "invalid";
    throw new AuthError(`jwt verify failed: ${(err as Error).message}`, code);
  }

  if (typeof payload.sub !== "string" || !payload.sub) {
    throw new AuthError("missing sub claim", "invalid");
  }

  return {
    user_id: payload.sub,
    email: typeof payload.email === "string" ? payload.email : undefined,
  };
}
