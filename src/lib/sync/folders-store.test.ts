import { describe, it, expect, beforeEach, vi } from "vitest";
import type { CloudUserFolderRow, LocalFolderMeta, SyncOperation } from "./types";

type InvokeHandler = (args: Record<string, unknown> | undefined) => unknown;
const invokeHandlers: Record<string, InvokeHandler> = {};

let gateActive = true;
vi.mock("./sync-gate", () => ({ isSyncActive: () => gateActive }));

vi.mock("@tauri-apps/api/core", () => {
  return {
    invoke: vi.fn(async (cmd: string, args?: Record<string, unknown>) => {
      const handler = invokeHandlers[cmd];
      if (!handler) {
        throw new Error(`No mock handler registered for invoke('${cmd}')`);
      }
      return handler(args);
    }),
  };
});

const enqueueMock = vi.fn(async (_op: SyncOperation) => ({
  id: "queue-entry-id",
  operation: _op,
  enqueued_at: "2026-05-19T00:00:00Z",
  retry_count: 0,
  last_error: null,
  next_retry_at: null,
}));

vi.mock("./queue", () => {
  return {
    enqueue: (op: SyncOperation) => enqueueMock(op),
  };
});

import {
  listFolders,
  createFolderSynced,
  renameFolderSynced,
  deleteFolderSynced,
  applyRemoteFolder,
} from "./folders-store";

function makeFolder(partial: Partial<LocalFolderMeta> = {}): LocalFolderMeta {
  return {
    id: "55555555-5555-4555-8555-555555555555",
    name: "Test Folder",
    createdAt: "2026-05-19T10:00:00Z",
    updatedAt: "2026-05-19T10:00:00Z",
    order: 0,
    ...partial,
  };
}

function makeCloudFolder(partial: Partial<CloudUserFolderRow> = {}): CloudUserFolderRow {
  return {
    id: "55555555-5555-4555-8555-555555555555",
    user_id: "22222222-2222-4222-8222-222222222222",
    name: "Cloud Folder",
    order: 0,
    created_at: "2026-05-19T10:00:00Z",
    updated_at: "2026-05-19T10:00:00Z",
    deleted_at: null,
    ...partial,
  };
}

beforeEach(() => {
  Object.keys(invokeHandlers).forEach((k) => delete invokeHandlers[k]);
  enqueueMock.mockClear();
  enqueueMock.mockImplementation(async (op: SyncOperation) => ({
    id: "queue-entry-id",
    operation: op,
    enqueued_at: "2026-05-19T00:00:00Z",
    retry_count: 0,
    last_error: null,
    next_retry_at: null,
  }));
});

describe("listFolders", () => {
  it("invokes list_folders and returns the result", async () => {
    const fixture = [makeFolder({ name: "a" }), makeFolder({ id: "x", name: "b" })];
    invokeHandlers["list_folders"] = () => fixture;
    expect(await listFolders()).toEqual(fixture);
  });
});

describe("createFolderSynced", () => {
  it("invokes create_folder then enqueues folder-upsert", async () => {
    const folder = makeFolder({ id: "fld-1", name: "Work", order: 2 });
    invokeHandlers["create_folder"] = (args) => {
      expect(args).toEqual({ name: "Work" });
      return folder;
    };
    const result = await createFolderSynced("Work");
    expect(result).toEqual(folder);
    expect(enqueueMock).toHaveBeenCalledTimes(1);
    const op = enqueueMock.mock.calls[0][0];
    if (op.kind !== "folder-upsert") throw new Error("expected folder-upsert");
    expect(op.folder.id).toBe("fld-1");
    expect(op.folder.name).toBe("Work");
    expect(op.folder.order).toBe(2);
  });

  it("local write succeeds even if enqueue throws", async () => {
    invokeHandlers["create_folder"] = () => makeFolder({ id: "local-only" });
    enqueueMock.mockRejectedValueOnce(new Error("queue offline"));
    const result = await createFolderSynced("X");
    expect(result.id).toBe("local-only");
  });

  it("does NOT enqueue when sync gate is inactive", async () => {
    gateActive = false;
    invokeHandlers["create_folder"] = () => makeFolder({ id: "fld-gate", name: "Gated" });
    enqueueMock.mockClear();
    const result = await createFolderSynced("Gated");
    expect(result.id).toBe("fld-gate");
    expect(enqueueMock).not.toHaveBeenCalled();
    gateActive = true; // restore for other tests
  });

  it("DOES enqueue when sync gate is active", async () => {
    gateActive = true;
    invokeHandlers["create_folder"] = () => makeFolder({ id: "fld-gate2", name: "Active" });
    enqueueMock.mockClear();
    await createFolderSynced("Active");
    expect(enqueueMock).toHaveBeenCalledTimes(1);
  });
});

describe("renameFolderSynced", () => {
  it("invokes rename_folder then enqueues folder-upsert", async () => {
    const folder = makeFolder({ id: "fld-2", name: "Renamed" });
    invokeHandlers["rename_folder"] = (args) => {
      expect(args).toEqual({ id: "fld-2", name: "Renamed" });
      return folder;
    };
    const result = await renameFolderSynced("fld-2", "Renamed");
    expect(result).toEqual(folder);
    const op = enqueueMock.mock.calls[0][0];
    if (op.kind !== "folder-upsert") throw new Error("expected folder-upsert");
    expect(op.folder.name).toBe("Renamed");
  });
});

describe("deleteFolderSynced", () => {
  it("invokes delete_folder then enqueues folder-delete", async () => {
    let deleted = false;
    invokeHandlers["delete_folder"] = (args) => {
      expect(args).toEqual({ id: "fld-3" });
      deleted = true;
      return undefined;
    };
    await deleteFolderSynced("fld-3");
    expect(deleted).toBe(true);
    const op = enqueueMock.mock.calls[0][0];
    if (op.kind !== "folder-delete") throw new Error("expected folder-delete");
    expect(op.id).toBe("fld-3");
  });

  it("local write succeeds even if enqueue throws", async () => {
    invokeHandlers["delete_folder"] = () => undefined;
    enqueueMock.mockRejectedValueOnce(new Error("queue offline"));
    await expect(deleteFolderSynced("fld-4")).resolves.toBeUndefined();
  });
});

describe("applyRemoteFolder", () => {
  it("appends new folder to the local list when not present", async () => {
    const existing = makeFolder({ id: "existing", name: "Old" });
    invokeHandlers["list_folders"] = () => [existing];
    let imported: LocalFolderMeta[] | null = null;
    invokeHandlers["import_folders_for_backup"] = (args) => {
      imported = (args as { folders: LocalFolderMeta[] }).folders;
      return undefined;
    };
    const row = makeCloudFolder({
      id: "new-id",
      name: "From Cloud",
      order: 5,
      updated_at: "2026-05-19T11:00:00Z",
    });
    await applyRemoteFolder(row);
    expect(imported).not.toBeNull();
    expect(imported!).toHaveLength(2);
    expect(imported!.find((f) => f.id === "new-id")?.name).toBe("From Cloud");
    expect(imported!.find((f) => f.id === "existing")?.name).toBe("Old");
  });

  it("replaces existing folder when remote is newer", async () => {
    const localFolder = makeFolder({
      id: "shared",
      name: "Stale",
      updatedAt: "2026-05-19T10:00:00Z",
    });
    invokeHandlers["list_folders"] = () => [localFolder];
    let imported: LocalFolderMeta[] | null = null;
    invokeHandlers["import_folders_for_backup"] = (args) => {
      imported = (args as { folders: LocalFolderMeta[] }).folders;
      return undefined;
    };
    const row = makeCloudFolder({
      id: "shared",
      name: "Fresh",
      updated_at: "2026-05-19T12:00:00Z",
    });
    await applyRemoteFolder(row);
    expect(imported).not.toBeNull();
    expect(imported!).toHaveLength(1);
    expect(imported![0].name).toBe("Fresh");
  });

  it("skips disk write when local is newer", async () => {
    const localFolder = makeFolder({
      id: "shared",
      name: "Local Newer",
      updatedAt: "2026-05-19T12:00:00Z",
    });
    invokeHandlers["list_folders"] = () => [localFolder];
    let imported = false;
    invokeHandlers["import_folders_for_backup"] = () => {
      imported = true;
      return undefined;
    };
    const row = makeCloudFolder({
      id: "shared",
      name: "Stale Cloud",
      updated_at: "2026-05-19T11:00:00Z",
    });
    await applyRemoteFolder(row);
    expect(imported).toBe(false);
  });

  it("no local folder + remote tombstone → no-op (no import call)", async () => {
    // Task 18 guard: a server tombstone for a folder absent locally is a no-op.
    invokeHandlers["list_folders"] = () => [];
    let imported = false;
    invokeHandlers["import_folders_for_backup"] = () => {
      imported = true;
      return undefined;
    };
    const row = makeCloudFolder({
      id: "ghost",
      deleted_at: "2026-05-19T12:00:00Z",
      updated_at: "2026-05-19T12:00:00Z",
    });
    await applyRemoteFolder(row);
    expect(imported).toBe(false);
  });

  it("propagates remote tombstone when remote is newer", async () => {
    const localFolder = makeFolder({
      id: "tomb",
      name: "Alive",
      updatedAt: "2026-05-19T10:00:00Z",
    });
    invokeHandlers["list_folders"] = () => [localFolder];
    let imported: LocalFolderMeta[] | null = null;
    invokeHandlers["import_folders_for_backup"] = (args) => {
      imported = (args as { folders: LocalFolderMeta[] }).folders;
      return undefined;
    };
    const row = makeCloudFolder({
      id: "tomb",
      name: "Tombstoned",
      updated_at: "2026-05-19T12:00:00Z",
      deleted_at: "2026-05-19T12:00:00Z",
    });
    await applyRemoteFolder(row);
    expect(imported).not.toBeNull();
    expect(imported!).toHaveLength(1);
    expect(imported![0].deletedAt).toBe("2026-05-19T12:00:00Z");
  });
});
