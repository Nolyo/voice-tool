import { describe, expect, it } from "vitest";
import {
  DRAG_START_THRESHOLD_PX,
  exceedsDragThreshold,
  isOutsideViewport,
} from "./drag-out";

describe("exceedsDragThreshold", () => {
  it("is false below the threshold", () => {
    expect(exceedsDragThreshold(10, 10, 12, 12)).toBe(false);
  });
  it("is true at or beyond the threshold in any direction", () => {
    expect(exceedsDragThreshold(10, 10, 10 + DRAG_START_THRESHOLD_PX, 10)).toBe(true);
    expect(exceedsDragThreshold(10, 10, 10, 10 - DRAG_START_THRESHOLD_PX)).toBe(true);
    expect(exceedsDragThreshold(10, 10, 15, 15)).toBe(true); // hypot ≈ 7.07
  });
});

describe("isOutsideViewport", () => {
  it("is false inside", () => {
    expect(isOutsideViewport(100, 100, 800, 600)).toBe(false);
    expect(isOutsideViewport(0, 0, 800, 600)).toBe(false);
    expect(isOutsideViewport(800, 600, 800, 600)).toBe(false);
  });
  it("is true outside any edge", () => {
    expect(isOutsideViewport(-1, 100, 800, 600)).toBe(true);
    expect(isOutsideViewport(100, -1, 800, 600)).toBe(true);
    expect(isOutsideViewport(801, 100, 800, 600)).toBe(true);
    expect(isOutsideViewport(100, 601, 800, 600)).toBe(true);
  });
});
