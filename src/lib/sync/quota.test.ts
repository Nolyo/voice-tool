import { describe, it, expect } from "vitest";
import {
  QUOTA_BY_PLAN,
  formatBytes,
  getQuotaForPlan,
  getWarningThreshold,
} from "./quota";

describe("QUOTA_BY_PLAN", () => {
  it("matches the server-side schema in sync-push/schema.ts", () => {
    // If these break, also update supabase/functions/sync-push/schema.ts.
    expect(QUOTA_BY_PLAN.free).toBe(10 * 1024 * 1024);
    expect(QUOTA_BY_PLAN.starter).toBe(100 * 1024 * 1024);
    expect(QUOTA_BY_PLAN.pro).toBe(500 * 1024 * 1024);
  });
});

describe("getQuotaForPlan", () => {
  it("returns the matching quota for a known plan", () => {
    expect(getQuotaForPlan("free")).toBe(QUOTA_BY_PLAN.free);
    expect(getQuotaForPlan("starter")).toBe(QUOTA_BY_PLAN.starter);
    expect(getQuotaForPlan("pro")).toBe(QUOTA_BY_PLAN.pro);
  });

  it("falls back to free for unknown / nullish plans", () => {
    expect(getQuotaForPlan(null)).toBe(QUOTA_BY_PLAN.free);
    expect(getQuotaForPlan(undefined)).toBe(QUOTA_BY_PLAN.free);
    expect(getQuotaForPlan("")).toBe(QUOTA_BY_PLAN.free);
    expect(getQuotaForPlan("enterprise")).toBe(QUOTA_BY_PLAN.free);
  });
});

describe("getWarningThreshold", () => {
  it("returns 80% of the quota, floored", () => {
    expect(getWarningThreshold(100)).toBe(80);
    expect(getWarningThreshold(QUOTA_BY_PLAN.free)).toBe(
      Math.floor(QUOTA_BY_PLAN.free * 0.8),
    );
    // 0.8 * 1024 = 819.2 → floored to 819
    expect(getWarningThreshold(1024)).toBe(819);
  });
});

describe("formatBytes", () => {
  it("formats bytes < 1KB as plain bytes", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1023)).toBe("1023 B");
  });

  it("formats kilobytes with one decimal", () => {
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(1024 * 1024 - 1)).toBe("1024.0 KB");
  });

  it("formats megabytes with one decimal", () => {
    expect(formatBytes(1024 * 1024)).toBe("1.0 MB");
    expect(formatBytes(10 * 1024 * 1024)).toBe("10.0 MB");
    expect(formatBytes(500 * 1024 * 1024)).toBe("500.0 MB");
  });
});
