import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

interface ProfileMeta {
  id: string;
  name: string;
  createdAt: string;
}

export interface ActiveProfileInfo {
  name: string | null;
  avatarUrl: string | null;
}

/**
 * Emitted by the main window whenever a profile's display identity (name,
 * avatar) changes, so long-lived windows (mini) can refresh what they show.
 */
export const PROFILE_IDENTITY_CHANGED_EVENT = "profile-identity-changed";

/**
 * Loads the active profile's name and avatar on mount, and reloads on
 * PROFILE_IDENTITY_CHANGED_EVENT (avatar/name edits in the main window).
 * Errors are swallowed (the mini window must never break over an avatar).
 * Profile switches reload every WebView, so they need no extra handling.
 */
export function useActiveProfileInfo(): ActiveProfileInfo {
  const [info, setInfo] = useState<ActiveProfileInfo>({
    name: null,
    avatarUrl: null,
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [id, profiles] = await Promise.all([
          invoke<string>("get_active_profile"),
          invoke<ProfileMeta[]>("list_profiles"),
        ]);
        const name = profiles.find((p) => p.id === id)?.name ?? null;
        const avatarUrl = await invoke<string | null>("get_profile_avatar", {
          id,
        }).catch(() => null);
        if (!cancelled) {
          setInfo({
            name,
            avatarUrl: typeof avatarUrl === "string" ? avatarUrl : null,
          });
        }
      } catch {
        // Swallow — the mini window renders without the avatar.
      }
    }

    void load();
    const unlistenPromise = listen(PROFILE_IDENTITY_CHANGED_EVENT, () => {
      void load();
    });

    return () => {
      cancelled = true;
      void unlistenPromise.then((unlisten) => unlisten()).catch(() => {});
    };
  }, []);

  return info;
}
