import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";
import { openCheckout } from "./checkout";
import { PLANS } from "./plans";

describe("openCheckout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("invokes open_checkout with snake_case arg names", async () => {
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      opened_url: "https://lemonsqueezy.com/buy/foo?checkout[custom][user_id]=abc",
    });

    const result = await openCheckout({
      plan: PLANS.starter_monthly,
      user_id: "abc",
      email: "alice@example.com",
    });

    expect(invoke).toHaveBeenCalledWith("open_checkout", {
      checkoutUrl: PLANS.starter_monthly.checkout_url,
      userId: "abc",
      email: "alice@example.com",
    });
    expect(result.opened_url).toContain("lemonsqueezy.com");
  });

  it("passes null email when not provided", async () => {
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ opened_url: "x" });
    await openCheckout({ plan: PLANS.pro_annual, user_id: "u1" });
    expect(invoke).toHaveBeenCalledWith("open_checkout", expect.objectContaining({ email: null }));
  });
});
