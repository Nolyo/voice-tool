import type { PullResult } from "./client";

/**
 * Computes the next incremental-pull cursor from a pull result.
 *
 * CRITICAL: the cursor is derived purely from SERVER `updated_at` values, never
 * from the client wall-clock. The previous implementation stored
 * `new Date().toISOString()` as the cursor and then filtered the next pull with
 * `.gt("updated_at", cursor)` against server timestamps. Any client clock ahead
 * of the server (a few seconds is common) pushed the cursor past the real
 * `updated_at` of rows written on another device, permanently hiding them.
 *
 * By taking the high-water mark of the rows we actually received — and never
 * regressing below `prev` — the cursor stays exactly at the newest change we
 * have seen, so the next `.gt(cursor)` pull skips nothing and re-pulls nothing.
 */
export function computeNextPullCursor(
  prev: string | null,
  result: PullResult
): string | null {
  let max = prev;
  const consider = (ts: string | null | undefined) => {
    if (!ts) return;
    if (max === null || new Date(ts).getTime() > new Date(max).getTime()) {
      max = ts;
    }
  };

  consider(result.settings?.updated_at);
  for (const r of result.dictionary) consider(r.updated_at);
  for (const r of result.snippets) consider(r.updated_at);
  for (const r of result.notes) consider(r.updated_at);
  for (const r of result.folders) consider(r.updated_at);

  return max;
}
