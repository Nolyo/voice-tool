import type { Env } from "./types";
import { authenticate, AuthError } from "./auth";
import { handleTranscribe } from "./transcribe";
import { handlePostProcess } from "./post-process";
import { errorResponse } from "./errors";

export default {
  async fetch(req: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);

    if (req.method === "GET" && url.pathname === "/health") {
      return Response.json({ ok: true });
    }

    if (req.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    let user;
    try {
      user = await authenticate(req, env);
    } catch (err) {
      if (err instanceof AuthError) {
        const code =
          err.code === "missing" ? "missing_auth" :
          err.code === "expired" ? "expired_auth" : "invalid_auth";
        return errorResponse(code, err.message);
      }
      throw err;
    }

    try {
      switch (url.pathname) {
        case "/transcribe":
          return await handleTranscribe(req, env, user);
        case "/post-process":
          return await handlePostProcess(req, env, user);
        default:
          return new Response("Not Found", { status: 404 });
      }
    } catch (err) {
      console.error("unhandled error", err);
      return errorResponse("internal", (err as Error).message);
    }
  },
} satisfies ExportedHandler<Env>;
