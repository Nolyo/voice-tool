import { describe, it, expect } from "vitest";
import { centeredSquareCrop, AVATAR_SIZE } from "./avatar";

describe("centeredSquareCrop", () => {
  it("crops a landscape image horizontally", () => {
    expect(centeredSquareCrop(400, 300)).toEqual({ sx: 50, sy: 0, size: 300 });
  });

  it("crops a portrait image vertically", () => {
    expect(centeredSquareCrop(300, 500)).toEqual({ sx: 0, sy: 100, size: 300 });
  });

  it("keeps a square image untouched", () => {
    expect(centeredSquareCrop(256, 256)).toEqual({ sx: 0, sy: 0, size: 256 });
  });

  it("floors the offset for odd remainders", () => {
    expect(centeredSquareCrop(401, 300)).toEqual({ sx: 50, sy: 0, size: 300 });
  });
});

describe("AVATAR_SIZE", () => {
  it("is 256", () => {
    expect(AVATAR_SIZE).toBe(256);
  });
});
