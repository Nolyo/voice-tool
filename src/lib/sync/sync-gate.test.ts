import { describe, it, expect, beforeEach } from "vitest";
import { setSyncActive, isSyncActive, __resetForTests } from "./sync-gate";

describe("sync-gate", () => {
  beforeEach(() => __resetForTests());

  it("is inactive by default", () => {
    expect(isSyncActive()).toBe(false);
  });

  it("reflects setSyncActive", () => {
    setSyncActive(true);
    expect(isSyncActive()).toBe(true);
    setSyncActive(false);
    expect(isSyncActive()).toBe(false);
  });
});
