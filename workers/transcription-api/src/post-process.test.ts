import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the openai module to control chatCompletion behavior in tests.
vi.mock("./openai", async () => {
  const actual = await vi.importActual<typeof import("./openai")>("./openai");
  return {
    ...actual,
    chatCompletion: vi.fn(),
  };
});

// Mock usage to bypass eligibility/recording. We want to reach the chatCompletion
// call so the catch path runs.
vi.mock("./usage", () => ({
  fetchTrialStatus: vi.fn(async () => ({ is_active: true, minutes_remaining: 60 })),
  fetchSubscriptionState: vi.fn(async () => ({
    status: "active",
    plan: "starter",
    quota_minutes: 1000,
    overage_minutes_allowed: 300,
    current_month: "2026-05",
    used_minutes_this_month: 0,
  })),
  recordUsageEvent: vi.fn(async () => ({ event_id: "evt_test", deduplicated: false })),
}));

import { handlePostProcess } from "./post-process";
import { chatCompletion, OpenAIError } from "./openai";
import type { AuthenticatedUser, Env } from "./types";

const ENV: Env = {
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_SECRET_KEY: "sb_secret_test",
  GROQ_API_KEY: "g",
  OPENAI_API_KEY: "o",
};

const USER: AuthenticatedUser = { user_id: "user-1", email: "u@test.local" };

function makeRequest(body: Record<string, unknown>): Request {
  return new Request("https://api.test/post-process", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("handlePostProcess OpenAIError mapping", () => {
  it("maps 4xx non-retryable OpenAIError to 400 bad_request", async () => {
    (chatCompletion as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new OpenAIError("openai 400: content policy", 400, false),
    );
    const res = await handlePostProcess(
      makeRequest({ task: "reformulate", text: "Bonjour" }),
      ENV,
      USER,
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; message: string };
    expect(body.error).toBe("bad_request");
    expect(body.message).toContain("openai rejected request: 400");
  });

  it("maps 5xx OpenAIError to 502 provider_unavailable", async () => {
    (chatCompletion as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new OpenAIError("openai 503: down", 503, true),
    );
    const res = await handlePostProcess(
      makeRequest({ task: "reformulate", text: "Bonjour" }),
      ENV,
      USER,
    );
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string; message: string };
    expect(body.error).toBe("provider_unavailable");
    expect(body.message).toBe("openai 503");
  });

  it("maps 429 retryable OpenAIError to 502 provider_unavailable", async () => {
    (chatCompletion as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new OpenAIError("openai 429: rate limit", 429, true),
    );
    const res = await handlePostProcess(
      makeRequest({ task: "reformulate", text: "Bonjour" }),
      ENV,
      USER,
    );
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string; message: string };
    expect(body.error).toBe("provider_unavailable");
    expect(body.message).toBe("openai 429");
  });
});
