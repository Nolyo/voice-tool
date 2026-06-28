import { describe, it, expect } from "vitest";
import { bubblePosition } from "./GuidedTour";

const VW = 1280;
const VH = 800;
const BUBBLE = { width: 320, height: 200 };

function nums(style: ReturnType<typeof bubblePosition>) {
  return { top: style.top as number, left: style.left as number };
}

describe("bubblePosition", () => {
  it("centers the anchorless step within the viewport", () => {
    const { top, left } = nums(bubblePosition("center", null, BUBBLE, VW, VH));
    expect(left).toBe(Math.round(VW / 2 - BUBBLE.width / 2));
    expect(top).toBe(Math.round(VH / 2 - BUBBLE.height / 2));
  });

  it("never lets the bubble overflow the bottom edge (anchor at screen bottom)", () => {
    // Profile switcher: anchored near the very bottom of the sidebar.
    const spot = { top: VH - 40, left: 8, width: 244, height: 56 };
    const { top, left } = nums(bubblePosition("right", spot, BUBBLE, VW, VH));
    expect(top + BUBBLE.height).toBeLessThanOrEqual(VH);
    expect(left + BUBBLE.width).toBeLessThanOrEqual(VW);
  });

  it("never lets the bubble overflow the right edge", () => {
    const spot = { top: 100, left: VW - 60, width: 50, height: 50 };
    const { left } = nums(bubblePosition("right", spot, BUBBLE, VW, VH));
    expect(left + BUBBLE.width).toBeLessThanOrEqual(VW);
  });

  it("clamps to the top-left margin when the anchor sits past the edge", () => {
    const spot = { top: -500, left: -500, width: 10, height: 10 };
    const { top, left } = nums(bubblePosition("top", spot, BUBBLE, VW, VH));
    expect(top).toBeGreaterThanOrEqual(0);
    expect(left).toBeGreaterThanOrEqual(0);
  });

  it("keeps the bubble on-screen even when it is larger than a tiny viewport", () => {
    const { top, left } = nums(
      bubblePosition("center", null, BUBBLE, 200, 150),
    );
    expect(top).toBeGreaterThanOrEqual(0);
    expect(left).toBeGreaterThanOrEqual(0);
  });
});
