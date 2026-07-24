import { describe, expect, it } from "vitest";
import {
  detachNote,
  forgetNote,
  mergeDetachedAtLoad,
  reattachNote,
  type NotesTabsState,
} from "./tab-transitions";

const base: NotesTabsState = {
  openNoteIds: ["a", "b", "c"],
  activeNoteId: "b",
  detachedNoteIds: [],
};

describe("detachNote", () => {
  it("removes the tab and registers the note as detached", () => {
    const next = detachNote(base, "b");
    expect(next.openNoteIds).toEqual(["a", "c"]);
    expect(next.detachedNoteIds).toEqual(["b"]);
  });

  it("moves the active tab to the last remaining tab", () => {
    expect(detachNote(base, "b").activeNoteId).toBe("c");
  });

  it("keeps the active tab when detaching an inactive one", () => {
    expect(detachNote(base, "a").activeNoteId).toBe("b");
  });

  it("detaching the only tab leaves no active note", () => {
    const solo: NotesTabsState = { openNoteIds: ["a"], activeNoteId: "a", detachedNoteIds: [] };
    const next = detachNote(solo, "a");
    expect(next.openNoteIds).toEqual([]);
    expect(next.activeNoteId).toBeNull();
  });

  it("is idempotent on the detached registry", () => {
    const once = detachNote(base, "b");
    const twice = detachNote(once, "b");
    expect(twice.detachedNoteIds).toEqual(["b"]);
  });
});

describe("reattachNote", () => {
  const detached: NotesTabsState = {
    openNoteIds: ["a"],
    activeNoteId: "a",
    detachedNoteIds: ["b"],
  };

  it("silently restores the tab without changing the active note", () => {
    const next = reattachNote(detached, "b", { activate: false });
    expect(next.openNoteIds).toEqual(["a", "b"]);
    expect(next.activeNoteId).toBe("a");
    expect(next.detachedNoteIds).toEqual([]);
  });

  it("activates the restored tab when asked (explicit reattach)", () => {
    expect(reattachNote(detached, "b", { activate: true }).activeNoteId).toBe("b");
  });

  it("ignores ids absent from the registry (delete/explicit flows removed them first)", () => {
    expect(reattachNote(detached, "zz", { activate: false })).toBe(detached);
  });
});

describe("forgetNote", () => {
  it("removes the note from tabs and registry (delete flow)", () => {
    const s: NotesTabsState = { openNoteIds: ["a", "b"], activeNoteId: "b", detachedNoteIds: ["c"] };
    const next = forgetNote(s, "c");
    expect(next.detachedNoteIds).toEqual([]);
    const next2 = forgetNote(s, "b");
    expect(next2.openNoteIds).toEqual(["a"]);
    expect(next2.activeNoteId).toBe("a");
  });
});

describe("mergeDetachedAtLoad", () => {
  const valid = new Set(["a", "b", "c"]);

  it("brings detached notes back as tabs and clears the registry", () => {
    const next = mergeDetachedAtLoad(
      { openNoteIds: ["a"], activeNoteId: "a", detachedNoteIds: ["b", "c"] },
      valid,
    );
    expect(next.openNoteIds).toEqual(["a", "b", "c"]);
    expect(next.detachedNoteIds).toEqual([]);
    expect(next.activeNoteId).toBe("a");
  });

  it("drops invalid ids and duplicates", () => {
    const next = mergeDetachedAtLoad(
      { openNoteIds: ["a", "gone"], activeNoteId: "gone", detachedNoteIds: ["a", "b"] },
      valid,
    );
    expect(next.openNoteIds).toEqual(["a", "b"]);
    expect(next.activeNoteId).toBe("b");
  });

  it("tolerates stores written before the feature (no detachedNoteIds)", () => {
    const next = mergeDetachedAtLoad({ openNoteIds: ["a"], activeNoteId: "a" }, valid);
    expect(next).toEqual({ openNoteIds: ["a"], activeNoteId: "a", detachedNoteIds: [] });
  });

  it("is idempotent — re-merging its own output changes nothing", () => {
    const once = mergeDetachedAtLoad(
      { openNoteIds: ["a", "gone"], activeNoteId: "gone", detachedNoteIds: ["a", "b"] },
      valid,
    );
    expect(mergeDetachedAtLoad(once, valid)).toEqual(once);
  });
});
