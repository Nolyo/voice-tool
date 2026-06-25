import { describe, it, expect } from "vitest";
import {
  CloudUserNoteRowSchema,
  CloudUserProfileRowSchema,
} from "./schemas";

// Valid RFC-4122 UUIDs (Zod v4 enforces strict uuid format)
const NOTE_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";

describe("schemas profile_id", () => {
  it("rejects a note row without profile_id", () => {
    const r = CloudUserNoteRowSchema.safeParse({
      id: NOTE_ID,
      user_id: USER_ID,
      title: "t", content_html: "", folder_id: null,
      favorite: false, order: 0,
      created_at: "2026-06-25T00:00:00Z",
      updated_at: "2026-06-25T00:00:00Z",
      deleted_at: null,
    });
    expect(r.success).toBe(false);
  });

  it("accepts a valid user_profiles row", () => {
    const r = CloudUserProfileRowSchema.safeParse({
      id: NOTE_ID,
      user_id: USER_ID,
      name: "Perso",
      created_at: "2026-06-25T00:00:00Z",
      updated_at: "2026-06-25T00:00:00Z",
      deleted_at: null,
    });
    expect(r.success).toBe(true);
  });
});
