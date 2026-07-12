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
  scanOversizedNoteCount,
  setNoteLocalOnlySynced,
  scheduleNoteUpdatePush,
} from "./notes-store";
import { NOTE_SIZE_LIMIT_BYTES } from "./note-size";

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
    profile_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
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
  it("does NOT enqueue on create — new notes are empty, first non-empty update pushes", async () => {
    invokeHandlers["create_note"] = (args) => {
      expect(args).toEqual({ folderId: "fld" });
      return makeMeta({ id: "new-id", folderId: "fld" });
    };
    const result = await createNoteSynced("fld");
    expect(result.id).toBe("new-id");
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it("invokes create_note with folderId=null when called with null", async () => {
    invokeHandlers["create_note"] = (args) => {
      expect(args).toEqual({ folderId: null });
      return makeMeta();
    };
    await createNoteSynced(null);
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

  it("does NOT enqueue when the note is localOnly", async () => {
    const meta = makeMeta({ id: "lo2", localOnly: true });
    invokeHandlers["update_note"] = () => meta;
    const result = await updateNoteSynced("lo2", "<p>body</p>", "T");
    expect(result).toEqual(meta);
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it("does NOT enqueue when sync gate is inactive", async () => {
    gateActive = false;
    invokeHandlers["update_note"] = () => makeMeta({ id: "g0" });
    await updateNoteSynced("g0", "<p>x</p>", "t");
    expect(enqueueMock).not.toHaveBeenCalled();
    gateActive = true; // restore for other tests
  });

  it("DOES enqueue when sync gate is active", async () => {
    gateActive = true;
    invokeHandlers["update_note"] = () => makeMeta({ id: "g1" });
    await updateNoteSynced("g1", "<p>x</p>", "t");
    expect(enqueueMock).toHaveBeenCalledTimes(1);
  });
});

describe("oversized-note sync guard", () => {
  const OVERSIZED = "a".repeat(NOTE_SIZE_LIMIT_BYTES + 1);

  it("updateNoteSynced does NOT enqueue an oversized note but still writes locally", async () => {
    const meta = makeMeta({ id: "big1", title: "Huge" });
    invokeHandlers["update_note"] = () => meta;
    const result = await updateNoteSynced("big1", OVERSIZED, "Huge");
    expect(result).toEqual(meta); // local write succeeded
    expect(enqueueMock).not.toHaveBeenCalled(); // but never queued for sync
  });

  it("updateNoteSynced DOES enqueue a note at exactly the limit", async () => {
    const meta = makeMeta({ id: "ok1" });
    invokeHandlers["update_note"] = () => meta;
    await updateNoteSynced("ok1", "a".repeat(NOTE_SIZE_LIMIT_BYTES), "ok");
    expect(enqueueMock).toHaveBeenCalledTimes(1);
  });

  it("toggleNoteFavoriteSynced skips enqueue when the note is oversized", async () => {
    const meta = makeMeta({ id: "big2", favorite: true });
    invokeHandlers["toggle_note_favorite"] = () => meta;
    invokeHandlers["read_note"] = () => ({ meta, content: OVERSIZED });
    await toggleNoteFavoriteSynced("big2");
    expect(enqueueMock).not.toHaveBeenCalled();
  });
});

describe("scanOversizedNoteCount", () => {
  it("counts active notes whose content exceeds the cap, skipping deleted", async () => {
    const big = makeMeta({ id: "big" });
    const small = makeMeta({ id: "small" });
    const gone = makeMeta({ id: "gone", deletedAt: "2026-05-19T00:00:00Z" });
    invokeHandlers["list_notes"] = () => [big, small, gone];
    invokeHandlers["read_note"] = (args) => {
      const id = (args as { id: string }).id;
      if (id === "big") return { meta: big, content: "a".repeat(NOTE_SIZE_LIMIT_BYTES + 1) };
      return { meta: small, content: "<p>tiny</p>" };
    };
    expect(await scanOversizedNoteCount()).toBe(1);
  });

  it("returns 0 when all notes fit", async () => {
    invokeHandlers["list_notes"] = () => [makeMeta({ id: "a" }), makeMeta({ id: "b" })];
    invokeHandlers["read_note"] = () => ({ meta: makeMeta(), content: "<p>ok</p>" });
    expect(await scanOversizedNoteCount()).toBe(0);
  });

  it("does not count an oversized local-only note (it is not a sync candidate)", async () => {
    const bigLocal = makeMeta({ id: "biglo", localOnly: true });
    invokeHandlers["list_notes"] = () => [bigLocal];
    invokeHandlers["read_note"] = () => ({
      meta: bigLocal,
      content: "a".repeat(NOTE_SIZE_LIMIT_BYTES + 1),
    });
    expect(await scanOversizedNoteCount()).toBe(0);
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
    invokeHandlers["read_note"] = () => ({ meta, content: "<p>x</p>" });
    await moveNoteToFolderSynced("mv2", null);
    const op = enqueueMock.mock.calls[0][0];
    if (op.kind !== "note-upsert") throw new Error("expected note-upsert");
    expect(op.note.folder_id).toBeNull();
  });
});

describe("setNoteLocalOnlySynced", () => {
  it("localOnly=true → invokes set_note_local_only then enqueues note-delete", async () => {
    const meta = makeMeta({ id: "d1", localOnly: true });
    invokeHandlers["set_note_local_only"] = (args) => {
      expect(args).toEqual({ id: "d1", localOnly: true });
      return meta;
    };
    const result = await setNoteLocalOnlySynced("d1", true);
    expect(result).toEqual(meta);
    expect(enqueueMock).toHaveBeenCalledTimes(1);
    const op = enqueueMock.mock.calls[0][0];
    if (op.kind !== "note-delete") throw new Error("expected note-delete");
    expect(op.id).toBe("d1");
  });

  it("localOnly=true cancels a pending debounced upsert (delete must be the only op)", async () => {
    vi.useFakeTimers();
    try {
      const meta = makeMeta({ id: "t1" });
      invokeHandlers["set_note_local_only"] = () => ({ ...meta, localOnly: true });
      scheduleNoteUpdatePush("t1", meta, "<p>typed</p>", 2000);
      await setNoteLocalOnlySynced("t1", true);
      await vi.runAllTimersAsync();
      const kinds = enqueueMock.mock.calls.map((c) => c[0].kind);
      expect(kinds).toEqual(["note-delete"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("localOnly=false → re-enqueues a full note-upsert with current content", async () => {
    const meta = makeMeta({ id: "s1", title: "Back" });
    invokeHandlers["set_note_local_only"] = (args) => {
      expect(args).toEqual({ id: "s1", localOnly: false });
      return meta;
    };
    invokeHandlers["read_note"] = () => ({ meta, content: "<p>body</p>" });
    const result = await setNoteLocalOnlySynced("s1", false);
    expect(result).toEqual(meta);
    expect(enqueueMock).toHaveBeenCalledTimes(1);
    const op = enqueueMock.mock.calls[0][0];
    if (op.kind !== "note-upsert") throw new Error("expected note-upsert");
    expect(op.note.id).toBe("s1");
    expect(op.note.content_html).toBe("<p>body</p>");
  });

  it("localOnly=false with empty content does NOT enqueue", async () => {
    const meta = makeMeta({ id: "e1" });
    invokeHandlers["set_note_local_only"] = () => meta;
    invokeHandlers["read_note"] = () => ({ meta, content: "" });
    await setNoteLocalOnlySynced("e1", false);
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it("does NOT enqueue when sync gate is inactive", async () => {
    gateActive = false;
    invokeHandlers["set_note_local_only"] = () =>
      makeMeta({ id: "g2", localOnly: true });
    await setNoteLocalOnlySynced("g2", true);
    expect(enqueueMock).not.toHaveBeenCalled();
    gateActive = true; // restore for other tests
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

  it("skips the cloud row entirely when the local note is localOnly", async () => {
    const localMeta = makeMeta({
      id: "lo1",
      localOnly: true,
      updatedAt: "2026-05-19T10:00:00Z",
    });
    invokeHandlers["read_note"] = () => ({ meta: localMeta, content: "<p>local</p>" });
    let imported = false;
    invokeHandlers["import_note_for_backup"] = () => {
      imported = true;
      return undefined;
    };
    // Fresh server tombstone (newer than local) — would win LWW and soft-delete
    // the local copy without the guard. This is the synced → local toggle's own
    // tombstone coming back on the source device's next pull.
    const row = makeCloud({
      id: "lo1",
      deleted_at: "2026-05-19T12:00:00Z",
      updated_at: "2026-05-19T12:00:00Z",
    });
    await applyRemoteNote(row);
    expect(imported).toBe(false);
  });
});
