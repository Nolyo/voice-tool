import { invoke } from "@tauri-apps/api/core";
import type { ProfileMeta } from "@/contexts/ProfilesContext";

/**
 * Resolve (and lazily create) the stable cloud profile id for the ACTIVE local
 * profile. Generated once per profile, stored in its per-profile sync-meta.
 * Returns { id, name } so callers can push a profile-upsert op.
 */
export async function ensureCloudProfileId(
  getMeta: <T>(k: string, d: T) => Promise<T>,
  setMeta: (k: string, v: unknown) => Promise<void>,
): Promise<{ id: string; name: string }> {
  let id = await getMeta<string | null>("cloud_profile_id", null);
  if (!id) {
    id = crypto.randomUUID();
    await setMeta("cloud_profile_id", id);
  }
  const activeId = await invoke<string>("get_active_profile");
  const profiles = await invoke<ProfileMeta[]>("list_profiles");
  const name = profiles.find((p) => p.id === activeId)?.name ?? "Profil";
  return { id, name };
}
