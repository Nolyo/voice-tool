import { describe, it, expect } from "vitest";
import { isPwnedPassword } from "./pwned-passwords";

describe("isPwnedPassword", () => {
  it("detects 'password' as pwned", async () => {
    expect(await isPwnedPassword("password")).toBe(true);
  });

  it("detects '123456' as pwned", async () => {
    expect(await isPwnedPassword("123456")).toBe(true);
  });

  it("returns false for a random non-dictionary string", async () => {
    expect(await isPwnedPassword("X9#qL!vZ.kR7$nMw2pB")).toBe(false);
  });
});
