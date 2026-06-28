import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the Tauri-backed notes store (hoisted so the factory can reference it).
const { createNoteSynced, readNote, updateNoteSynced } = vi.hoisted(() => ({
  createNoteSynced: vi.fn(),
  readNote: vi.fn(),
  updateNoteSynced: vi.fn(),
}));
vi.mock("@/lib/sync/notes-store", () => ({
  createNoteSynced,
  readNote,
  updateNoteSynced,
}));

// deriveTitle lives in the notes hook (pulls React / i18n) — stub it so this
// stays a pure unit test of the orchestration.
vi.mock("@/hooks/useNotes", () => ({
  deriveTitle: (html: string) => `title:${html}`,
}));

import {
  createNoteFromTranscription,
  appendTranscriptionToNote,
  NoteTooLargeError,
} from "./transcription-note-actions";
import { NOTE_SIZE_LIMIT_BYTES } from "@/lib/sync/note-size";

beforeEach(() => {
  createNoteSynced.mockReset();
  readNote.mockReset();
  updateNoteSynced.mockReset();
});

describe("createNoteFromTranscription", () => {
  it("creates a note, then writes the transcription HTML + derived title", async () => {
    createNoteSynced.mockResolvedValue({ id: "n1", title: "" });
    updateNoteSynced.mockImplementation(async (id: string, _c: string, title: string) => ({
      id,
      title,
    }));

    const meta = await createNoteFromTranscription("Bonjour");

    expect(createNoteSynced).toHaveBeenCalledWith(null);
    expect(updateNoteSynced).toHaveBeenCalledWith(
      "n1",
      "<p>Bonjour</p>",
      "title:<p>Bonjour</p>",
    );
    expect(meta).toEqual({ id: "n1", title: "title:<p>Bonjour</p>" });
  });
});

describe("appendTranscriptionToNote", () => {
  it("appends paragraph(s) and preserves the existing title", async () => {
    readNote.mockResolvedValue({
      meta: { id: "n1", title: "Mon titre" },
      content: "<p>existant</p>",
    });
    updateNoteSynced.mockImplementation(
      async (id: string, content: string, title: string) => ({ id, content, title }),
    );

    await appendTranscriptionToNote("n1", "ajout");

    expect(updateNoteSynced).toHaveBeenCalledWith(
      "n1",
      "<p>existant</p><p>ajout</p>",
      "Mon titre",
    );
  });

  it("throws NoteTooLargeError and writes nothing when over the 1 MB cap", async () => {
    const huge = "x".repeat(NOTE_SIZE_LIMIT_BYTES);
    readNote.mockResolvedValue({
      meta: { id: "n1", title: "t" },
      content: `<p>${huge}</p>`,
    });

    await expect(appendTranscriptionToNote("n1", "more")).rejects.toBeInstanceOf(
      NoteTooLargeError,
    );
    expect(updateNoteSynced).not.toHaveBeenCalled();
  });
});
