import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { invoke } from "@tauri-apps/api/core";

export interface ProfileMeta {
  id: string;
  name: string;
  createdAt: string;
}

interface ProfilesContextType {
  profiles: ProfileMeta[];
  activeProfileId: string;
  isLoaded: boolean;
  createProfile: (name: string) => Promise<ProfileMeta>;
  renameProfile: (id: string, newName: string) => Promise<void>;
  deleteProfile: (id: string) => Promise<void>;
  switchProfile: (id: string) => Promise<void>;
}

const ProfilesContext = createContext<ProfilesContextType | undefined>(
  undefined
);

export function ProfilesProvider({ children }: { children: ReactNode }) {
  const [profiles, setProfiles] = useState<ProfileMeta[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string>("");
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [list, active] = await Promise.all([
          invoke<ProfileMeta[]>("list_profiles"),
          invoke<string>("get_active_profile"),
        ]);
        setProfiles(list);
        setActiveProfileId(active);
      } catch (err) {
        console.error("Failed to load profiles:", err);
      } finally {
        setIsLoaded(true);
      }
    }
    load();
  }, []);

  const createProfile = useCallback(async (name: string): Promise<ProfileMeta> => {
    const meta = await invoke<ProfileMeta>("create_profile", { name });
    setProfiles((prev) => [...prev, meta]);
    return meta;
  }, []);

  const renameProfile = useCallback(
    async (id: string, newName: string): Promise<void> => {
      await invoke("rename_profile", { id, newName });
      setProfiles((prev) =>
        prev.map((p) => (p.id === id ? { ...p, name: newName } : p))
      );
    },
    []
  );

  const deleteProfile = useCallback(async (id: string): Promise<void> => {
    await invoke("delete_profile", { id });
    setProfiles((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const switchProfile = useCallback(async (id: string): Promise<void> => {
    await invoke("switch_profile", { id });
    // App will restart — nothing more to do
  }, []);

  return (
    <ProfilesContext.Provider
      value={{
        profiles,
        activeProfileId,
        isLoaded,
        createProfile,
        renameProfile,
        deleteProfile,
        switchProfile,
      }}
    >
      {children}
    </ProfilesContext.Provider>
  );
}

export function useProfiles() {
  const ctx = useContext(ProfilesContext);
  if (!ctx) {
    throw new Error("useProfiles must be used within a ProfilesProvider");
  }
  return ctx;
}
