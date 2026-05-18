// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "test-publishable-key");

import {
  DemoTranscribeError,
  encodeWav,
  submitDemoTranscription,
} from "./demo-transcribe";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("encodeWav", () => {
  it("produces a valid 44-byte header + PCM data", () => {
    const samples = new Int16Array([0, 1, -1, 32767]);
    const blob = encodeWav(samples, 16000);
    expect(blob.type).toBe("audio/wav");
    expect(blob.size).toBe(44 + samples.length * 2);
  });

  it("encodes sample rate in the header", async () => {
    const samples = new Int16Array(8000);
    const blob = encodeWav(samples, 22050);
    const buf = await blob.arrayBuffer();
    const view = new DataView(buf);
    // sample rate is at offset 24 (little-endian uint32)
    expect(view.getUint32(24, true)).toBe(22050);
  });
});

describe("submitDemoTranscription", () => {
  function makeFetch(response: Partial<Response>) {
    return vi.fn(() => Promise.resolve(response as Response));
  }

  it("posts WAV + device_id and returns transcription on 200", async () => {
    const fetchImpl = vi.fn(async (_url, init?: RequestInit) => {
      const body = init?.body as FormData;
      expect(body.get("device_id")).toBe("dev-12345678");
      expect(body.get("audio")).toBeInstanceOf(File);
      return {
        ok: true,
        status: 200,
        json: () => Promise.resolve({ text: "hello", duration_ms: 1200 }),
      } as Response;
    });
    const result = await submitDemoTranscription({
      samples: new Int16Array(16000),
      sampleRate: 16000,
      deviceId: "dev-12345678",
      endpoint: "https://example.supabase.co/functions/v1/demo-transcribe",
      fetchImpl,
    });
    expect(result).toEqual({ text: "hello", duration_ms: 1200 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("maps 429 to rate_limited", async () => {
    const fetchImpl = makeFetch({
      ok: false,
      status: 429,
      json: () =>
        Promise.resolve({ error: "rate_limited", message: "ip quota exceeded" }),
    });
    try {
      await submitDemoTranscription({
        samples: new Int16Array(16000),
        sampleRate: 16000,
        deviceId: "dev-12345678",
        endpoint: "https://x/y",
        fetchImpl,
      });
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(DemoTranscribeError);
      expect((err as DemoTranscribeError).kind).toBe("rate_limited");
      expect((err as DemoTranscribeError).status).toBe(429);
    }
  });

  it("maps 413 to duration_exceeded", async () => {
    const fetchImpl = makeFetch({
      ok: false,
      status: 413,
      json: () =>
        Promise.resolve({ error: "duration_exceeded", message: "too long" }),
    });
    try {
      await submitDemoTranscription({
        samples: new Int16Array(16000),
        sampleRate: 16000,
        deviceId: "dev-12345678",
        endpoint: "https://x/y",
        fetchImpl,
      });
      throw new Error("should have thrown");
    } catch (err) {
      expect((err as DemoTranscribeError).kind).toBe("duration_exceeded");
    }
  });

  it("maps 502 to provider_unavailable", async () => {
    const fetchImpl = makeFetch({
      ok: false,
      status: 502,
      json: () =>
        Promise.resolve({
          error: "provider_unavailable",
          message: "openai failed",
        }),
    });
    try {
      await submitDemoTranscription({
        samples: new Int16Array(16000),
        sampleRate: 16000,
        deviceId: "dev-12345678",
        endpoint: "https://x/y",
        fetchImpl,
      });
      throw new Error("should have thrown");
    } catch (err) {
      expect((err as DemoTranscribeError).kind).toBe("provider_unavailable");
    }
  });

  it("maps fetch rejection to network error", async () => {
    const fetchImpl = vi.fn(() => Promise.reject(new Error("offline")));
    try {
      await submitDemoTranscription({
        samples: new Int16Array(16000),
        sampleRate: 16000,
        deviceId: "dev-12345678",
        endpoint: "https://x/y",
        fetchImpl,
      });
      throw new Error("should have thrown");
    } catch (err) {
      expect((err as DemoTranscribeError).kind).toBe("network");
    }
  });
});
