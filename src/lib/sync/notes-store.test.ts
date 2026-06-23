import { describe, it, expect, beforeEach, vi } from "vitest";
import type { CloudUserNoteRow, LocalNoteMeta, SyncOperation } from "./types";

// ── Mocks ────────────────────────────────────────────────────────────────────
// Mock invoke + enqueue at the module boundary so tests don't depend on Tauri.

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
  listNotes,
  readNote,
  createNoteSynced,
  updateNoteSynced,
  deleteNoteSynced,
  toggleNoteFavoriteSynced,
  moveNoteToFolderSynced,
  applyRemoteNote,
} from "./notes-store";

function makeMeta(partial: Partial<LocalNoteMeta> = {}): LocalNoteMeta {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    title: "Untitled Note",
    createdAt: "2026-05-19T10:00:00Z",
    updatedAt: "2026-05-19T10:00:00Z",
    favorite: false,
    order: 0,
    ...partial,
  };
}

function makeCloud(partial: Partial<CloudUserNoteRow> = {}): CloudUserNoteRow {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    user_id: "22222222-2222-4222-8222-222222222222",
    title: "Cloud Title",
    content_html: "<p>cloud</p>",
    folder_id: null,
    favorite: false,
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

describe("notes-store passthrough helpers", () => {
  it("listNotes invokes list_notes and returns the result", async () => {
    const fixture = [makeMeta({ title: "a" }), makeMeta({ id: "x", title: "b" })];
    invokeHandlers["list_notes"] = () => fixture;
    const result = await listNotes();
    expect(result).toEqual(fixture);
  });

  it("readNote invokes read_note with id", async () => {
    invokeHandlers["read_note"] = (args) => {
      expect(args).toEqual({ id: "abc" });
      return { meta: makeMeta({ id: "abc" }), content: "<p>x</p>" };
    };
    const result = await readNote("abc");
    expect(result.meta.id).toBe("abc");
    expect(result.content).toBe("<p>x</p>");
  });
});

describe("createNoteSynced", () => {
  it("invokes create_note then enqueues note-upsert with empty content", async () => {
    const meta = makeMeta({ id: "new-id", folderId: "fld" });
    invokeHandlers["create_note"] = (args) => {
      expect(args).toEqual({ folderId: "fld" });
      return meta;
    };
    const result = await createNoteSynced("fld");
    expect(result).toEqual(meta);
    expect(enqueueMock).toHaveBeenCalledTimes(1);
    const op = enqueueMock.mock.calls[0][0];
    expect(op.kind).toBe("note-upsert");
    if (op.kind !== "note-upsert") throw new Error("type narrowing");
    expect(op.note.id).toBe("new-id");
    expect(op.note.content_html).toBe("");
    expect(op.note.folder_id).toBe("fld");
  });

  it("invokes create_note with folderId=null when called with null", async () => {
    invokeHandlers["create_note"] = (args) => {
      expect(args).toEqual({ folderId: null });
      return makeMeta();
    };
    await createNoteSynced(null);
  });

  it("local write succeeds even if enqueue throws", async () => {
    invokeHandlers["create_note"] = () => makeMeta({ id: "local-only" });
    enqueueMock.mockRejectedValueOnce(new Error("queue offline"));
    const result = await createNoteSynced(null);
    expect(result.id).toBe("local-only");
  });

  it("does NOT enqueue when sync gate is inactive", async () => {
    gateActive = false;
    invokeHandlers["create_note"] = () => ({
      id: "n1",
      title: "",
      folderId: null,
      favorite: false,
      order: 0,
      createdAt: "2026-06-23T00:00:00Z",
      updatedAt: "2026-06-23T00:00:00Z",
      deletedAt: null,
    });
    enqueueMock.mockClear();
    await createNoteSynced(null);
    expect(enqueueMock).not.toHaveBeenCalled();
    gateActive = true; // restore for other tests
  });

  it("DOES enqueue when sync gate is active", async () => {
    gateActive = true;
    invokeHandlers["create_note"] = () => ({
      id: "n2",
      title: "",
      folderId: null,
      favorite: false,
      order: 0,
      createdAt: "2026-06-23T00:00:00Z",
      updatedAt: "2026-06-23T00:00:00Z",
      deletedAt: null,
    });
    enqueueMock.mockClear();
    await createNoteSynced(null);
    expect(enqueueMock).toHaveBeenCalledTimes(1);
  });
});

describe("updateNoteSynced", () => {
  it("invokes update_note then enqueues note-upsert with content", async () => {
    const meta = makeMeta({ id: "u1", title: "Updated" });
    invokeHandlers["update_note"] = (args) => {
      expect(args).toEqual({ id: "u1", content: "<p>body</p>", title: "Updated" });
      return meta;
    };
    const result = await updateNoteSynced("u1", "<p>body</p>", "Updated");
    expect(result).toEqual(meta);
    expect(enqueueMock).toHaveBeenCalledTimes(1);
    const op = enqueueMock.mock.calls[0][0];
    if (op.kind !== "note-upsert") throw new Error("expected note-upsert");
    expect(op.note.content_html).toBe("<p>body</p>");
    expect(op.note.title).toBe("Updated");
    expect(op.note.id).toBe("u1");
  });

  it("local write succeeds even if enqueue throws", async () => {
    invokeHandlers["update_note"] = () => makeMeta({ id: "u2" });
    enqueueMock.mockRejectedValueOnce(new Error("queue offline"));
    const result = await updateNoteSynced("u2", "x", "y");
    expect(result.id).toBe("u2");
  });
});

describe("deleteNoteSynced", () => {
  it("invokes delete_note then enqueues note-delete", async () => {
    let deleted = false;
    invokeHandlers["delete_note"] = (args) => {
      expect(args).toEqual({ id: "d1" });
      deleted = true;
      return undefined;
    };
    await deleteNoteSynced("d1");
    expect(deleted).toBe(true);
    expect(enqueueMock).toHaveBeenCalledTimes(1);
    const op = enqueueMock.mock.calls[0][0];
    if (op.kind !== "note-delete") throw new Error("expected note-delete");
    expect(op.id).toBe("d1");
  });

  it("local write succeeds even if enqueue throws", async () => {
    invokeHandlers["delete_note"] = () => undefined;
    enqueueMock.mockRejectedValueOnce(new Error("queue offline"));
    await expect(deleteNoteSynced("d2")).resolves.toBeUndefined();
  });
});

describe("toggleNoteFavoriteSynced", () => {
  it("invokes toggle + read then enqueues note-upsert with current content", async () => {
    const meta = makeMeta({ id: "fav1", favorite: true });
    invokeHandlers["toggle_note_favorite"] = (args) => {
      expect(args).toEqual({ id: "fav1" });
      return meta;
    };
    invokeHandlers["read_note"] = (args) => {
      expect(args).toEqual({ id: "fav1" });
      return { meta, content: "<p>preserved</p>" };
    };
    const result = await toggleNoteFavoriteSynced("fav1");
    expect(result.favorite).toBe(true);
    expect(enqueueMock).toHaveBeenCalledTimes(1);
    const op = enqueueMock.mock.calls[0][0];
    if (op.kind !== "note-upsert") throw new Error("expected note-upsert");
    expect(op.note.favorite).toBe(true);
    expect(op.note.content_html).toBe("<p>preserved</p>");
  });
});

describe("moveNoteToFolderSynced", () => {
  it("invokes move + read then enqueues note-upsert with new folder id", async () => {
    const meta = makeMeta({ id: "mv1", folderId: "target" });
    invokeHandlers["move_note_to_folder"] = (args) => {
      expect(args).toEqual({ noteId: "mv1", folderId: "target" });
      return meta;
    };
    invokeHandlers["read_note"] = () => ({ meta, content: "<p>moved</p>" });
    const result = await moveNoteToFolderSynced("mv1", "target");
    expect(result.folderId).toBe("target");
    const op = enqueueMock.mock.calls[0][0];
    if (op.kind !== "note-upsert") throw new Error("expected note-upsert");
    expect(op.note.folder_id).toBe("target");
  });

  it("normalizes folderId=null to folder_id: null on the payload", async () => {
    const meta = makeMeta({ id: "mv2" });
    invokeHandlers["move_note_to_folder"] = (args) => {
      expect(args).toEqual({ noteId: "mv2", folderId: null });
      return meta;
    };
    invokeHandlers["read_note"] = () => ({ meta, content: "" });
    await moveNoteToFolderSynced("mv2", null);
    const op = enqueueMock.mock.calls[0][0];
    if (op.kind !== "note-upsert") throw new Error("expected note-upsert");
    expect(op.note.folder_id).toBeNull();
  });
});

describe("applyRemoteNote", () => {
  it("no local note → invokes import_note_for_backup with remote meta + content", async () => {
    const row = makeCloud({
      id: "r1",
      title: "From Cloud",
      content_html: "<p>cloud body</p>",
      updated_at: "2026-05-19T11:00:00Z",
      folder_id: "f-cloud",
    });
    invokeHandlers["read_note"] = () => {
      throw new Error("not found");
    };
    let imported: { meta: LocalNoteMeta; content: string } | null = null;
    invokeHandlers["import_note_for_backup"] = (args) => {
      imported = args as { meta: LocalNoteMeta; content: string };
      return undefined;
    };
    await applyRemoteNote(row);
    expect(imported).not.toBeNull();
    expect(imported!.meta.title).toBe("From Cloud");
    expect(imported!.meta.folderId).toBe("f-cloud");
    expect(imported!.content).toBe("<p>cloud body</p>");
  });

  it("local newer than remote → does NOT call import_note_for_backup", async () => {
    const localMeta = makeMeta({
      id: "r2",
      title: "Local Newer",
      updatedAt: "2026-05-19T12:00:00Z",
    });
    invokeHandlers["read_note"] = () => ({
      meta: localMeta,
      content: "<p>local body</p>",
    });
    let imported = false;
    invokeHandlers["import_note_for_backup"] = () => {
      imported = true;
      return undefined;
    };
    const row = makeCloud({ id: "r2", updated_at: "2026-05-19T11:00:00Z" });
    await applyRemoteNote(row);
    expect(imported).toBe(false);
  });

  it("no local note + remote tombstone → no-op (no import call)", async () => {
    // Task 18 guard: when the server confirms a tombstone for a note we never
    // had locally, we must not materialize an empty tombstoned dir.
    invokeHandlers["read_note"] = () => {
      throw new Error("not found");
    };
    let imported = false;
    invokeHandlers["import_note_for_backup"] = () => {
      imported = true;
      return undefined;
    };
    const row = makeCloud({
      id: "ghost",
      deleted_at: "2026-05-19T12:00:00Z",
      updated_at: "2026-05-19T12:00:00Z",
    });
    await applyRemoteNote(row);
    expect(imported).toBe(false);
  });

  it("remote newer than local → imports merged (remote) state", async () => {
    const localMeta = makeMeta({
      id: "r3",
      title: "Stale",
      updatedAt: "2026-05-19T10:00:00Z",
    });
    invokeHandlers["read_note"] = () => ({
      meta: localMeta,
      content: "<p>stale</p>",
    });
    let imported: { meta: LocalNoteMeta; content: string } | null = null;
    invokeHandlers["import_note_for_backup"] = (args) => {
      imported = args as { meta: LocalNoteMeta; content: string };
      return undefined;
    };
    const row = makeCloud({
      id: "r3",
      title: "Fresh",
      content_html: "<p>fresh</p>",
      updated_at: "2026-05-19T12:00:00Z",
    });
    await applyRemoteNote(row);
    expect(imported).not.toBeNull();
    expect(imported!.meta.title).toBe("Fresh");
    expect(imported!.content).toBe("<p>fresh</p>");
  });
});
