import { describe, it, expect } from "vitest";
import { normalizeEmail, isDisposableDomain } from "./email-normalize";

describe("normalizeEmail", () => {
  it("lowercases passthrough", () => {
    expect(normalizeEmail("user@example.com")).toBe("user@example.com");
    expect(normalizeEmail("USER@Example.COM")).toBe("user@example.com");
  });

  it("strips +suffix on any domain", () => {
    expect(normalizeEmail("user+a@example.com")).toBe("user@example.com");
    expect(normalizeEmail("User+a+b+c@Example.com")).toBe("user@example.com");
  });

  it("strips dots only on gmail.com / googlemail.com", () => {
    expect(normalizeEmail("u.s.e.r@gmail.com")).toBe("user@gmail.com");
    expect(normalizeEmail("u.s.e.r@googlemail.com")).toBe("user@googlemail.com");
    expect(normalizeEmail("u.s.e.r+x@gmail.com")).toBe("user@gmail.com");
    expect(normalizeEmail("u.s.e.r@outlook.com")).toBe("u.s.e.r@outlook.com");
    expect(normalizeEmail("u.s.e.r@yahoo.com")).toBe("u.s.e.r@yahoo.com");
  });

  it("handles malformed input gracefully", () => {
    expect(normalizeEmail("no-at-sign")).toBe("no-at-sign");
    expect(normalizeEmail("")).toBe("");
  });

  it("trims whitespace before normalizing", () => {
    expect(normalizeEmail("  user@gmail.com  ")).toBe("user@gmail.com");
  });
});

describe("isDisposableDomain", () => {
  it("flags known disposable domains", () => {
    expect(isDisposableDomain("user@mailinator.com")).toBe(true);
    expect(isDisposableDomain("user@tempmail.com")).toBe(true);
    expect(isDisposableDomain("user@guerrillamail.com")).toBe(true);
  });

  it("does not flag legitimate domains", () => {
    expect(isDisposableDomain("user@gmail.com")).toBe(false);
    expect(isDisposableDomain("user@outlook.com")).toBe(false);
    expect(isDisposableDomain("user@protonmail.com")).toBe(false);
    expect(isDisposableDomain("user@icloud.com")).toBe(false);
  });

  it("is case-insensitive on the domain", () => {
    expect(isDisposableDomain("user@MAILINATOR.com")).toBe(true);
  });

  it("returns false on malformed input", () => {
    expect(isDisposableDomain("no-at-sign")).toBe(false);
    expect(isDisposableDomain("")).toBe(false);
  });
});
