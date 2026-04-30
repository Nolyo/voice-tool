// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders, preflight } from "../_shared/cors.ts";
import { getAuthenticatedUser } from "../_shared/auth.ts";

export interface Deps {
  /** Authenticate the request. Returns `{ userId }` or `{ error, status }`. */
  authenticate: (req: Request) =>
    | Promise<{ userId: string } | { error: string; status: number }>;
  /** Atomically validate + mark a recovery code as used. Returns true if matched. */
  consume: (userId: string, code: string) => Promise<boolean>;
  /** Delete every MFA factor for the user (requires service-role admin client). */
  deleteAllFactors: (userId: string) => Promise<{ error: { message: string } | null }>;
}

interface Body {
  code?: unknown;
}

function jsonResponse(req: Request, body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

export async function handler(req: Request, deps: Deps): Promise<Response> {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") {
    return jsonResponse(req, { error: "method not allowed" }, 405);
  }

  const auth = await deps.authenticate(req);
  if ("error" in auth) {
    return jsonResponse(req, { error: auth.error }, auth.status);
  }

  const body = (await req.json().catch(() => null)) as Body | null;
  const rawCode = typeof body?.code === "string" ? body.code.trim() : "";
  if (rawCode.length < 4) {
    return jsonResponse(req, { error: "invalid code" }, 400);
  }

  const ok = await deps.consume(auth.userId, rawCode);
  if (!ok) {
    return jsonResponse(req, { error: "invalid code" }, 401);
  }

  const { error } = await deps.deleteAllFactors(auth.userId);
  if (error) {
    return jsonResponse(
      req,
      { error: "factor cleanup failed", message: error.message },
      500,
    );
  }

  return jsonResponse(req, { ok: true }, 200);
}

function realDeps(): Deps {
  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, serviceKey);

  return {
    authenticate: getAuthenticatedUser,

    async consume(userId, code) {
      // Service-role variant — picks the user_id from the parameter rather
      // than auth.uid(), since this RPC is invoked from a privileged context.
      const { data, error } = await admin.rpc("consume_recovery_code_for", {
        p_user: userId,
        p_code: code,
      });
      if (error) throw error;
      return Boolean(data);
    },

    async deleteAllFactors(userId) {
      const { data, error: listErr } = await (admin.auth.admin as any).mfa.listFactors({ userId });
      if (listErr) return { error: listErr };
      for (const f of data?.factors ?? []) {
        const { error: delErr } = await (admin.auth.admin as any).mfa.deleteFactor({ id: f.id });
        if (delErr) return { error: delErr };
      }
      return { error: null };
    },
  };
}

if (import.meta.main) {
  Deno.serve((req) => handler(req, realDeps()));
}
