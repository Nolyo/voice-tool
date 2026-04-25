// deno-lint-ignore-file no-explicit-any
import { createClient, SupabaseClient } from "@supabase/supabase-js";

interface Deps {
  cronSecret: string;
  selectExpired: () => Promise<string[]>;
  deleteUser: (uid: string) => Promise<{ data: any; error: { message: string } | null }>;
}

function realDeps(): Deps {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const cronSecret = Deno.env.get("CRON_SECRET")!;
  const client: SupabaseClient = createClient(url, key);

  return {
    cronSecret,
    async selectExpired() {
      const { data: rows, error } = await client
        .from("account_deletion_requests")
        .delete()
        .lt("requested_at", new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString())
        .select("user_id");
      if (error) throw error;
      return (rows ?? []).map((r: any) => r.user_id as string);
    },
    async deleteUser(uid) {
      return await client.auth.admin.deleteUser(uid);
    },
  };
}

export async function handler(req: Request, deps: Deps): Promise<Response> {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), { status: 405 });
  }

  const auth = req.headers.get("Authorization") ?? "";
  if (auth !== `Bearer ${deps.cronSecret}`) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  const start = performance.now();
  let uids: string[];
  try {
    uids = await deps.selectExpired();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.log(JSON.stringify({ event: "purge_run_error", phase: "selectExpired", message }));
    return new Response(JSON.stringify({ error: "selectExpired failed", message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
  const errors: Array<{ uid: string; message: string }> = [];
  let purged = 0;

  for (const uid of uids) {
    try {
      const { error } = await deps.deleteUser(uid);
      if (error) {
        errors.push({ uid, message: error.message });
      } else {
        purged++;
      }
    } catch (err: unknown) {
      errors.push({ uid, message: err instanceof Error ? err.message : String(err) });
    }
  }

  const duration_ms = Math.round(performance.now() - start);
  console.log(JSON.stringify({ event: "purge_run", purged, errors: errors.length, duration_ms }));
  return new Response(JSON.stringify({ purged, errors, duration_ms }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve((req) => handler(req, realDeps()));
