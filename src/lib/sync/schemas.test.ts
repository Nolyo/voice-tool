import { describe, it, expect } from "vitest";
import {
  CloudUserNoteRowSchema,
  CloudUserProfileRowSchema,
  CloudUserFolderRowSchema,
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

const FOLDER_ID = "33333333-3333-4333-8333-333333333333";
const PROFILE_ID = "44444444-4444-4444-8444-444444444444";

describe("CloudUserFolderRowSchema icon", () => {
  const base = {
    id: FOLDER_ID,
    user_id: USER_ID,
    profile_id: PROFILE_ID,
    name: "Inbox",
    order: 0,
    created_at: "2026-07-13T00:00:00Z",
    updated_at: "2026-07-13T00:00:00Z",
    deleted_at: null,
  };

  it("preserves a string icon through parsing (no Zod strip)", () => {
    const r = CloudUserFolderRowSchema.safeParse({ ...base, icon: "📁" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.icon).toBe("📁");
  });

  it("accepts icon null and an absent icon key", () => {
    expect(CloudUserFolderRowSchema.safeParse({ ...base, icon: null }).success).toBe(true);
    expect(CloudUserFolderRowSchema.safeParse(base).success).toBe(true);
  });
});
