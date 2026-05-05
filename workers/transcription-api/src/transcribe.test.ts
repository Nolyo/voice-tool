import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock usage so the quota check doesn't try to hit Supabase. Tests in this
// file target validation paths that fire BEFORE quota — but the N1 test for
// blob.type = "" is allowed to fall through to quota, so we stub it.
vi.mock("./usage", () => ({
  checkQuotaForTranscription: vi.fn(async () => ({
    source: "trial",
    remaining_minutes_estimate: 60,
  })),
  recordUsageEvent: vi.fn(async () => ({ event_id: "evt_test", deduplicated: false })),
  QuotaExhausted: class extends Error {},
}));

// Mock groq so transcription doesn't hit the network if we ever reach it.
vi.mock("./groq", () => ({
  transcribeWithGroq: vi.fn(async () => ({
    text: "hello",
    duration: 1.2,
    request_id: "req-test",
  })),
  GroqError: class extends Error {},
}));

import { handleTranscribe } from "./transcribe";
import type { AuthenticatedUser, Env } from "./types";

const ENV: Env = {
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_SECRET_KEY: "sb_secret_test",
  GROQ_API_KEY: "g",
  OPENAI_API_KEY: "o",
};

const USER: AuthenticatedUser = { user_id: "user-1", email: "u@test.local" };

const MAX_AUDIO_BYTES = 50 * 1024 * 1024;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("handleTranscribe Content-Length pre-check (I3)", () => {
  it("returns 413 payload_too_large when Content-Length exceeds 50MB before parsing body", async () => {
    // Build a request with a Content-Length header that lies — claims a huge body.
    // We pass a small real body but override the header. We also stub req.formData
    // to throw so we can verify the pre-check fires before any body parsing.
    const req = new Request("https://api.test/transcribe", {
      method: "POST",
      headers: {
        "Content-Length": String(MAX_AUDIO_BYTES + 1),
        "Content-Type": "multipart/form-data; boundary=boundary",
      },
      body: "irrelevant",
    });
    // Stub formData to ensure the test fails loudly if pre-check skips.
    const formDataSpy = vi.fn(async () => {
      throw new Error("formData should not be called");
    });
    Object.defineProperty(req, "formData", { value: formDataSpy });

    const res = await handleTranscribe(req, ENV, USER);
    expect(res.status).toBe(413);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("payload_too_large");
    expect(formDataSpy).not.toHaveBeenCalled();
  });
});

describe("handleTranscribe MIME validation (N1)", () => {
  it("rejects unsupported MIME type with 415", async () => {
    const fd = new FormData();
    const blob = new Blob([new Uint8Array([0, 1, 2, 3])], { type: "video/mp4" });
    fd.append("audio", blob, "clip.mp4");

    const req = new Request("https://api.test/transcribe", {
      method: "POST",
      body: fd,
    });

    const res = await handleTranscribe(req, ENV, USER);
    expect(res.status).toBe(415);
    const body = (await res.json()) as { error: string; message: string };
    expect(body.error).toBe("unsupported_format");
    expect(body.message).toContain("video/mp4");
  });

  it("treats empty blob.type as audio/wav (frontend default) and does not return 415", async () => {
    // We can't easily produce blob.type === "" via real multipart parsing in Node
    // (undici defaults to "application/octet-stream" or "text/plain"), so we mock
    // req.formData() to return a FormData whose audio entry is a Blob with empty
    // type. This isolates the validation logic under test.
    const blob = new Blob([new Uint8Array([0, 1, 2, 3])]); // blob.type === ""
    expect(blob.type).toBe("");
    const fd = new FormData();
    fd.append("audio", blob, "clip.wav");

    const req = new Request("https://api.test/transcribe", {
      method: "POST",
      headers: { "Content-Type": "multipart/form-data; boundary=x" },
      body: "ignored",
    });
    Object.defineProperty(req, "formData", {
      value: vi.fn(async () => fd),
    });

    const res = await handleTranscribe(req, ENV, USER);
    // Should proceed past MIME validation. With usage and groq mocked, we expect 200.
    expect(res.status).not.toBe(415);
    expect(res.status).toBe(200);
  });

  it("accepts a known audio MIME (audio/wav)", async () => {
    const fd = new FormData();
    const blob = new Blob([new Uint8Array([0, 1, 2, 3])], { type: "audio/wav" });
    fd.append("audio", blob, "clip.wav");

    const req = new Request("https://api.test/transcribe", {
      method: "POST",
      body: fd,
    });

    const res = await handleTranscribe(req, ENV, USER);
    expect(res.status).toBe(200);
  });
});
