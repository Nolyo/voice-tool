// deno-lint-ignore-file no-explicit-any
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2.49.1";

interface Deps {
  cronSecret: string;
  selectExpired: () => Promise<string[]>;
  deleteUser: (uid: string) => Promise<{ data: any; error: { message: string } | null }>;
  deleteTombstone: (uid: string) => Promise<void>;
  /** Sub-epic 03 sync-notes : purge des items soft-deleted (notes + folders) >30j. */
  purgeSoftDeletedSyncItems: () => Promise<{ notes: number; folders: number }>;
}

function realDeps(): Deps {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const cronSecret = Deno.env.get("CRON_SECRET")!;
  const client: SupabaseClient = createClient(url, key);

  return {
    cronSecret,
    async selectExpired() {
      // SELECT only — do NOT delete here.
      const cutoff = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
      const { data: rows, error } = await client
        .from("account_deletion_requests")
        .select("user_id")
        .lt("requested_at", cutoff);
      if (error) throw error;
      return (rows ?? []).map((r: any) => r.user_id as string);
    },
    async deleteUser(uid) {
      return await client.auth.admin.deleteUser(uid);
    },
    async deleteTombstone(uid) {
      const { error } = await client
        .from("account_deletion_requests")
        .delete()
        .eq("user_id", uid);
      if (error) throw error;
    },
    async purgeSoftDeletedSyncItems() {
      const cutoff = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
      const { count: notesCount, error: notesErr } = await client
        .from("user_notes")
        .delete({ count: "exact" })
        .lt("deleted_at", cutoff);
      if (notesErr) throw notesErr;
      const { count: foldersCount, error: foldersErr } = await client
        .from("user_folders")
        .delete({ count: "exact" })
        .lt("deleted_at", cutoff);
      if (foldersErr) throw foldersErr;
      return { notes: notesCount ?? 0, folders: foldersCount ?? 0 };
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

  // Sub-epic 03 sync-notes : purge des items soft-deleted >30j (indépendant du flow account deletion).
  // Erreur ici n'interrompt PAS la suite — log + report.
  let sync_items_purged: { notes: number; folders: number } = { notes: 0, folders: 0 };
  let sync_purge_error: string | null = null;
  try {
    sync_items_purged = await deps.purgeSoftDeletedSyncItems();
  } catch (err: unknown) {
    sync_purge_error = err instanceof Error ? err.message : String(err);
    console.log(JSON.stringify({ event: "purge_run_error", phase: "purgeSoftDeletedSyncItems", message: sync_purge_error }));
  }

  const errors: Array<{ uid: string; message: string }> = [];
  let purged = 0;

  for (const uid of uids) {
    try {
      const { error } = await deps.deleteUser(uid);
      if (error) {
        errors.push({ uid, message: error.message });
        continue; // don't delete the tombstone — retry tomorrow
      }
      try {
        await deps.deleteTombstone(uid);
      } catch (tombErr: unknown) {
        const m = tombErr instanceof Error ? tombErr.message : String(tombErr);
        errors.push({ uid, message: `user deleted but tombstone still present: ${m}` });
        continue;
      }
      purged++;
    } catch (err: unknown) {
      errors.push({ uid, message: err instanceof Error ? err.message : String(err) });
    }
  }

  const duration_ms = Math.round(performance.now() - start);
  console.log(JSON.stringify({
    event: "purge_run",
    purged,
    errors: errors.length,
    sync_notes_purged: sync_items_purged.notes,
    sync_folders_purged: sync_items_purged.folders,
    duration_ms,
  }));
  return new Response(JSON.stringify({
    purged,
    errors,
    sync_items_purged,
    sync_purge_error,
    duration_ms,
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

if (import.meta.main) {
  Deno.serve((req) => handler(req, realDeps()));
}
