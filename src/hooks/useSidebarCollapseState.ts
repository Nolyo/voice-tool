import { useCallback, useEffect, useRef, useState } from "react";
import { Store } from "@tauri-apps/plugin-store";
import { invoke } from "@tauri-apps/api/core";

export interface SidebarCollapseState {
  favorites: boolean;
  recents: boolean;
  root: boolean;
  folders: Record<string, boolean>;
}

const DEFAULT_STATE: SidebarCollapseState = {
  favorites: false,
  recents: false,
  root: false,
  folders: {},
};

const STORE_KEY = "collapse";
const SAVE_DEBOUNCE_MS = 300;

let sidebarStore: Store | null = null;
async function getSidebarStore(): Promise<Store> {
  if (!sidebarStore) {
    const path = await invoke<string>("get_active_profile_notes_sidebar_path");
    sidebarStore = await Store.load(path);
  }
  return sidebarStore;
}

/**
 * Persists the collapsed/expanded state of the notes-sidebar sections
 * (Favorites, Recents, Root, and each individual folder) in a per-profile
 * Tauri Store file.
 */
export function useSidebarCollapseState() {
  const [state, setState] = useState<SidebarCollapseState>(DEFAULT_STATE);
  const hasLoadedRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const store = await getSidebarStore();
        const persisted = await store.get<Partial<SidebarCollapseState>>(STORE_KEY);
        if (cancelled) return;
        if (persisted) {
          setState({
            ...DEFAULT_STATE,
            ...persisted,
            folders: persisted.folders ?? {},
          });
        }
      } catch (error) {
        console.error("Failed to load sidebar collapse state:", error);
      } finally {
        if (!cancelled) hasLoadedRef.current = true;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hasLoadedRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        const store = await getSidebarStore();
        await store.set(STORE_KEY, state);
        await store.save();
      } catch (error) {
        console.error("Failed to persist sidebar collapse state:", error);
      }
    }, SAVE_DEBOUNCE_MS);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [state]);

  const toggleFavorites = useCallback(() => {
    setState((prev) => ({ ...prev, favorites: !prev.favorites }));
  }, []);

  const toggleRecents = useCallback(() => {
    setState((prev) => ({ ...prev, recents: !prev.recents }));
  }, []);

  const toggleRoot = useCallback(() => {
    setState((prev) => ({ ...prev, root: !prev.root }));
  }, []);

  const toggleFolder = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      folders: { ...prev.folders, [id]: !prev.folders[id] },
    }));
  }, []);

  return {
    state,
    toggleFavorites,
    toggleRecents,
    toggleRoot,
    toggleFolder,
  };
}
