import { Store } from "@tauri-apps/plugin-store";

const STORE_FILE = "device-id.json";
const KEY = "demo_device_id";

let cached: string | null = null;

/**
 * Returns a stable per-install UUID, persisted via the Tauri Store plugin.
 *
 * Used by the anonymous demo transcription flow to enforce a lifetime cap
 * (2 successful demos / device). The id is NOT a security boundary — a user
 * wiping AppData generates a new one — but it raises the friction enough to
 * deter casual abuse before signup, alongside the IP-based rate limit.
 */
export async function getDemoDeviceId(): Promise<string> {
  if (cached) return cached;
  const store = await Store.load(STORE_FILE);
  const existing = await store.get<string>(KEY);
  if (typeof existing === "string" && existing.length >= 8) {
    cached = existing;
    return existing;
  }
  const fresh = crypto.randomUUID();
  await store.set(KEY, fresh);
  await store.save();
  cached = fresh;
  return fresh;
}

/** Test helper — resets the in-memory cache (NOT the persisted store). */
export function _resetDemoDeviceIdCache(): void {
  cached = null;
}
