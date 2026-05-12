import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const { invokeFn } = vi.hoisted(() => ({ invokeFn: vi.fn() }));
vi.mock("@/lib/supabase", () => ({
  supabase: { functions: { invoke: invokeFn } },
}));

import { invoke } from "@tauri-apps/api/core";
import { openCheckout } from "./checkout";

describe("openCheckout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("invokes the create-checkout Edge Function with plan/cycle then opens the returned url", async () => {
    invokeFn.mockResolvedValueOnce({
      data: { checkout_url: "https://lexena.lemonsqueezy.com/buy/abc" },
      error: null,
    });
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      opened_url: "https://lexena.lemonsqueezy.com/buy/abc",
    });

    const result = await openCheckout({ tier: "starter", cycle: "monthly" });

    expect(invokeFn).toHaveBeenCalledWith("lemonsqueezy-create-checkout", {
      body: { plan: "starter", cycle: "monthly" },
    });
    expect(invoke).toHaveBeenCalledWith("open_checkout", {
      checkoutUrl: "https://lexena.lemonsqueezy.com/buy/abc",
    });
    expect(result.opened_url).toContain("lemonsqueezy.com");
  });

  it("throws when the Edge Function returns an error", async () => {
    invokeFn.mockResolvedValueOnce({ data: null, error: { message: "ls_api_error" } });
    await expect(openCheckout({ tier: "pro", cycle: "annual" })).rejects.toThrow(
      /create_checkout_failed/,
    );
    expect(invoke).not.toHaveBeenCalled();
  });

  it("throws when the Edge Function returns no url", async () => {
    invokeFn.mockResolvedValueOnce({ data: {}, error: null });
    await expect(openCheckout({ tier: "pro", cycle: "monthly" })).rejects.toThrow(/missing url/);
  });
});
