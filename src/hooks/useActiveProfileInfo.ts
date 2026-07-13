import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

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
 * Loads the active profile's name and avatar once on mount. Errors are
 * swallowed (the mini window must never break over an avatar), and no
 * listener is needed: switching profiles reloads every WebView, so
 * mount-time data is always fresh.
 */
export function useActiveProfileInfo(): ActiveProfileInfo {
  const [info, setInfo] = useState<ActiveProfileInfo>({
    name: null,
    avatarUrl: null,
  });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
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
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return info;
}
