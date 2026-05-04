import { describe, it, expect, vi, beforeEach } from "vitest";
import { transcribeCloud, postProcessCloud } from "./api";
import { CloudApiError } from "./errors";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));
import { invoke } from "@tauri-apps/api/core";

beforeEach(() => vi.resetAllMocks());

describe("transcribeCloud", () => {
  it("calls transcribe_audio_cloud with serialized samples", async () => {
    (invoke as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      text: "hi",
      duration_ms: 1000,
      request_id: "r1",
      source: "trial",
    });
    const res = await transcribeCloud({
      samples: Int16Array.from([1, 2, 3]),
      sampleRate: 16000,
      language: "fr",
      jwt: "jwt",
    });
    expect(res.text).toBe("hi");
    expect(invoke).toHaveBeenCalledWith(
      "transcribe_audio_cloud",
      expect.objectContaining({
        samples: [1, 2, 3],
        sampleRate: 16000,
        language: "fr",
        jwt: "jwt",
      }),
    );
  });

  it("throws CloudApiError when Tauri returns an api error", async () => {
    (invoke as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce({
      kind: "api",
      status: 402,
      code: "quota_exhausted",
      message: "out",
    });
    await expect(
      transcribeCloud({
        samples: Int16Array.from([1]),
        sampleRate: 16000,
        jwt: "jwt",
      }),
    ).rejects.toBeInstanceOf(CloudApiError);
  });

  it("throws auth-flagged CloudApiError when missing_auth surfaces", async () => {
    (invoke as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce({
      kind: "missing_auth",
      message: "missing auth token",
    });
    await expect(
      transcribeCloud({
        samples: Int16Array.from([1]),
        sampleRate: 16000,
        jwt: "",
      }),
    ).rejects.toMatchObject({ status: 401, code: "missing_auth" });
  });
});

describe("network retry", () => {
  it("retries on transient network error then succeeds", async () => {
    (invoke as unknown as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce({
        text: "ok",
        duration_ms: 1000,
        request_id: "r",
        source: "trial",
      });
    const res = await transcribeCloud({
      samples: Int16Array.from([1]),
      sampleRate: 16000,
      jwt: "jwt",
    });
    expect(res.text).toBe("ok");
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it("never retries on CloudApiError (api errors)", async () => {
    (invoke as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce({
      kind: "api",
      status: 402,
      code: "quota_exhausted",
      message: "out",
    });
    await expect(
      transcribeCloud({
        samples: Int16Array.from([1]),
        sampleRate: 16000,
        jwt: "jwt",
      }),
    ).rejects.toBeInstanceOf(CloudApiError);
    expect(invoke).toHaveBeenCalledTimes(1);
  });
});

describe("postProcessCloud", () => {
  it("forwards modelTier and language", async () => {
    (invoke as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      text: "out",
      tokens_in: 10,
      tokens_out: 5,
      request_id: "r2",
      source: "trial",
    });
    await postProcessCloud({
      task: "reformulate",
      text: "in",
      language: "fr",
      modelTier: "mini",
      jwt: "jwt",
    });
    expect(invoke).toHaveBeenCalledWith(
      "post_process_cloud",
      expect.objectContaining({
        task: "reformulate",
        text: "in",
        language: "fr",
        modelTier: "mini",
      }),
    );
  });
});
