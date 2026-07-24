import { describe, expect, it } from "vitest";
import {
  DRAG_START_THRESHOLD_PX,
  STRIP_EXIT_MARGIN_PX,
  exceedsDragThreshold,
  isOutsideStrip,
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

describe("isOutsideStrip", () => {
  const strip = { left: 0, top: 0, right: 800, bottom: 30 };

  it("is false on the strip and within the forgiveness margin", () => {
    expect(isOutsideStrip(400, 15, strip)).toBe(false);
    expect(isOutsideStrip(0, 0, strip)).toBe(false);
    expect(isOutsideStrip(800, 30, strip)).toBe(false);
    expect(isOutsideStrip(400, 30 + STRIP_EXIT_MARGIN_PX, strip)).toBe(false);
    expect(isOutsideStrip(800 + STRIP_EXIT_MARGIN_PX, 15, strip)).toBe(false);
  });

  it("is true beyond the margin on any side, even inside the window", () => {
    expect(isOutsideStrip(400, 30 + STRIP_EXIT_MARGIN_PX + 1, strip)).toBe(true);
    expect(isOutsideStrip(400, -STRIP_EXIT_MARGIN_PX - 1, strip)).toBe(true);
    expect(isOutsideStrip(-STRIP_EXIT_MARGIN_PX - 1, 15, strip)).toBe(true);
    expect(isOutsideStrip(800 + STRIP_EXIT_MARGIN_PX + 1, 15, strip)).toBe(true);
  });

  it("honors a custom margin", () => {
    expect(isOutsideStrip(400, 80, strip, 50)).toBe(false);
    expect(isOutsideStrip(400, 81, strip, 50)).toBe(true);
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
