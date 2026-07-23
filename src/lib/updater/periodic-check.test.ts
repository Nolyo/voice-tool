import { describe, it, expect } from "vitest";
import {
  PERIODIC_CHECK_INTERVAL_MS,
  shouldCheckNow,
  type PeriodicCheckState,
} from "./periodic-check";

const NOW = 1_800_000_000_000;

function state(overrides: Partial<PeriodicCheckState> = {}): PeriodicCheckState {
  return {
    lastCheckTime: null,
    updateAvailable: false,
    isChecking: false,
    isDownloading: false,
    ...overrides,
  };
}

describe("shouldCheckNow", () => {
  it("returns true when no check has ever completed", () => {
    expect(shouldCheckNow(state(), NOW)).toBe(true);
  });

  it("returns false when less than one hour has elapsed", () => {
    const s = state({ lastCheckTime: NOW - PERIODIC_CHECK_INTERVAL_MS + 1 });
    expect(shouldCheckNow(s, NOW)).toBe(false);
  });

  it("returns true at exactly one hour elapsed", () => {
    const s = state({ lastCheckTime: NOW - PERIODIC_CHECK_INTERVAL_MS });
    expect(shouldCheckNow(s, NOW)).toBe(true);
  });

  it("returns true well past one hour (wake from sleep)", () => {
    const s = state({ lastCheckTime: NOW - 8 * PERIODIC_CHECK_INTERVAL_MS });
    expect(shouldCheckNow(s, NOW)).toBe(true);
  });

  it("returns false when an update is already detected", () => {
    const s = state({
      lastCheckTime: NOW - 2 * PERIODIC_CHECK_INTERVAL_MS,
      updateAvailable: true,
    });
    expect(shouldCheckNow(s, NOW)).toBe(false);
  });

  it("returns false while a check is in flight", () => {
    const s = state({
      lastCheckTime: NOW - 2 * PERIODIC_CHECK_INTERVAL_MS,
      isChecking: true,
    });
    expect(shouldCheckNow(s, NOW)).toBe(false);
  });

  it("returns false while a download is in progress", () => {
    const s = state({
      lastCheckTime: NOW - 2 * PERIODIC_CHECK_INTERVAL_MS,
      isDownloading: true,
    });
    expect(shouldCheckNow(s, NOW)).toBe(false);
  });

  it("returns false when an update is detected even if no check ever completed", () => {
    const s = state({ updateAvailable: true });
    expect(shouldCheckNow(s, NOW)).toBe(false);
  });
});
