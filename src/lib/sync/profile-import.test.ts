import { describe, it, expect, beforeEach, vi } from "vitest";

// In-memory per-path stores so we can model multiple profiles' sync-meta.
const stores: Record<string, Record<string, unknown>> = {};
function storeFor(path: string) {
  if (!stores[path]) stores[path] = {};
  return stores[path];
}

let profiles: Array<{ id: string; name: string; createdAt: string }> = [];

const invokeMock = vi.fn(
  async (cmd: string, args?: Record<string, unknown>): Promise<unknown> => {
    if (cmd === "list_profiles") return profiles;
    if (cmd === "get_profile_sync_meta_path")
      return `profiles/${args!.id}/sync-meta.json`;
    if (cmd === "create_profile") {
      const name = args!.name as string;
      const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      const meta = { id, name, createdAt: "2026-06-26T00:00:00Z" };
      profiles.push(meta);
      return meta;
    }
    throw new Error(`unexpected invoke ${cmd}`);
  }
);
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string, args?: Record<string, unknown>) =>
    invokeMock(cmd, args),
}));

vi.mock("@tauri-apps/plugin-store", () => ({
  Store: {
    load: async (path: string) => ({
      get: async (k: string) => storeFor(path)[k] ?? null,
      set: async (k: string, v: unknown) => {
        storeFor(path)[k] = v;
      },
      save: async () => {},
    }),
  },
}));

const pullProfilesRegistryMock = vi.fn();
vi.mock("./client", () => ({
  pullProfilesRegistry: () => pullProfilesRegistryMock(),
}));

import {
  listLocalCloudBindings,
  listImportableCloudProfiles,
  importCloudProfile,
} from "./profile-import";

function cloudProfile(id: string, name: string) {
  return {
    id,
    user_id: "u1",
    name,
    created_at: "2026-06-25T00:00:00Z",
    updated_at: "2026-06-25T00:00:00Z",
    deleted_at: null,
  };
}

describe("profile-import", () => {
  beforeEach(() => {
    Object.keys(stores).forEach((k) => delete stores[k]);
    profiles = [];
    invokeMock.mockClear();
    pullProfilesRegistryMock.mockReset();
  });

  describe("listLocalCloudBindings", () => {
    it("maps cloud_profile_id → local id for bound profiles only", async () => {
      profiles = [
        { id: "default", name: "Default", createdAt: "" },
        { id: "travail", name: "Travail", createdAt: "" },
      ];
      storeFor("profiles/travail/sync-meta.json").cloud_profile_id = "cloud-A";
      // "default" has no binding → skipped

      const map = await listLocalCloudBindings();
      expect(map.size).toBe(1);
      expect(map.get("cloud-A")).toBe("travail");
    });

    it("returns an empty map when no profile is bound", async () => {
      profiles = [{ id: "default", name: "Default", createdAt: "" }];
      const map = await listLocalCloudBindings();
      expect(map.size).toBe(0);
    });
  });

  describe("listImportableCloudProfiles", () => {
    it("excludes cloud profiles already bound locally, keeps the rest", async () => {
      profiles = [{ id: "travail", name: "Travail", createdAt: "" }];
      storeFor("profiles/travail/sync-meta.json").cloud_profile_id = "cloud-A";
      pullProfilesRegistryMock.mockResolvedValue({
        profiles: [
          cloudProfile("cloud-A", "Travail"),
          cloudProfile("cloud-B", "Perso"),
        ],
        invalid: 0,
      });

      const importable = await listImportableCloudProfiles();
      expect(importable).toEqual([{ id: "cloud-B", name: "Perso" }]);
    });

    it("returns all cloud profiles on a fresh device with no bindings", async () => {
      profiles = [{ id: "default", name: "Default", createdAt: "" }];
      pullProfilesRegistryMock.mockResolvedValue({
        profiles: [
          cloudProfile("cloud-A", "Travail"),
          cloudProfile("cloud-B", "Perso"),
        ],
        invalid: 0,
      });

      const importable = await listImportableCloudProfiles();
      expect(importable.map((p) => p.id)).toEqual(["cloud-A", "cloud-B"]);
    });
  });

  describe("importCloudProfile", () => {
    it("creates a local profile bound to the cloud id, sync pre-enabled", async () => {
      profiles = [{ id: "default", name: "Default", createdAt: "" }];

      const newId = await importCloudProfile({ id: "cloud-A", name: "Travail" });

      expect(newId).toBe("travail");
      expect(invokeMock).toHaveBeenCalledWith("create_profile", {
        name: "Travail",
      });
      const meta = storeFor("profiles/travail/sync-meta.json");
      expect(meta.cloud_profile_id).toBe("cloud-A");
      expect(meta.enabled).toBe(true);
      expect(meta.initial_push_done).toBe(false);
      expect(meta.last_pull_at).toBeNull();
    });

    it("makes the imported profile no longer importable", async () => {
      profiles = [{ id: "default", name: "Default", createdAt: "" }];
      pullProfilesRegistryMock.mockResolvedValue({
        profiles: [cloudProfile("cloud-A", "Travail")],
        invalid: 0,
      });

      await importCloudProfile({ id: "cloud-A", name: "Travail" });
      const importable = await listImportableCloudProfiles();
      expect(importable).toEqual([]);
    });
  });
});
