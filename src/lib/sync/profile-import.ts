import { invoke } from "@tauri-apps/api/core";
import { Store } from "@tauri-apps/plugin-store";
import { pullProfilesRegistry } from "./client";

/** Matches ProfileMeta from ProfilesContext / the Rust ProfileMeta serialization. */
interface ProfileMeta {
  id: string;
  name: string;
  createdAt: string;
}

export interface ImportableCloudProfile {
  /** cloud_profile_id (user_profiles.id) */
  id: string;
  name: string;
}

async function loadProfileMetaStore(profileId: string) {
  const path = await invoke<string>("get_profile_sync_meta_path", {
    id: profileId,
  });
  return Store.load(path);
}

/**
 * Build a map of cloud_profile_id → local profile id for every local profile on
 * this device that is already bound to a cloud partition. Profiles whose
 * sync-meta is unreadable or has no binding are simply skipped.
 */
export async function listLocalCloudBindings(): Promise<Map<string, string>> {
  const profiles = await invoke<ProfileMeta[]>("list_profiles");
  const map = new Map<string, string>();
  for (const p of profiles) {
    try {
      const store = await loadProfileMetaStore(p.id);
      const cloudId = await store.get<string | null>("cloud_profile_id");
      if (cloudId) map.set(cloudId, p.id);
    } catch {
      // Unreadable meta (never synced, fresh profile): no binding to record.
    }
  }
  return map;
}

/**
 * Cloud profiles that exist in the account but are NOT yet bound to any local
 * profile on this device — i.e. the profiles a fresh device can import.
 */
export async function listImportableCloudProfiles(): Promise<
  ImportableCloudProfile[]
> {
  const [{ profiles }, bound] = await Promise.all([
    pullProfilesRegistry(),
    listLocalCloudBindings(),
  ]);
  return profiles
    .filter((p) => !bound.has(p.id))
    .map((p) => ({ id: p.id, name: p.name }));
}

/**
 * Import a cloud profile onto this device: create a local profile, bind it to
 * the cloud partition, and pre-enable sync so the post-switch mount lifecycle
 * (pullAndApply → flushQueue → fullPush) pulls its data automatically. Returns
 * the new LOCAL profile id; the caller is expected to switch into it
 * (switch_profile), which reloads the app and triggers the pull.
 */
export async function importCloudProfile(
  cloud: ImportableCloudProfile
): Promise<string> {
  const meta = await invoke<ProfileMeta>("create_profile", { name: cloud.name });
  const store = await loadProfileMetaStore(meta.id);
  // Pre-seed the new profile's sync-meta so it adopts the EXISTING cloud
  // partition instead of minting a fresh random one (ensureCloudProfileId only
  // generates when cloud_profile_id is absent).
  await store.set("cloud_profile_id", cloud.id);
  await store.set("enabled", true);
  // Force a full reconcile + initial push on first mount of the new profile.
  await store.set("initial_push_done", false);
  await store.set("last_pull_at", null);
  await store.save();
  return meta.id;
}
