import { describe, it, expect } from "vitest";
import { isValidTask, getPromptTemplate } from "./prompts";

describe("isValidTask", () => {
  it("accepts the four documented tasks", () => {
    expect(isValidTask("reformulate")).toBe(true);
    expect(isValidTask("correct")).toBe(true);
    expect(isValidTask("email")).toBe(true);
    expect(isValidTask("summarize")).toBe(true);
  });

  it("rejects Object.prototype keys", () => {
    expect(isValidTask("toString")).toBe(false);
    expect(isValidTask("constructor")).toBe(false);
    expect(isValidTask("hasOwnProperty")).toBe(false);
    expect(isValidTask("__proto__")).toBe(false);
  });

  it("rejects unknown strings", () => {
    expect(isValidTask("translate")).toBe(false);
    expect(isValidTask("")).toBe(false);
  });

  it("rejects non-string inputs", () => {
    expect(isValidTask(undefined as unknown as string)).toBe(false);
    expect(isValidTask(42 as unknown as string)).toBe(false);
    expect(isValidTask(null as unknown as string)).toBe(false);
    expect(isValidTask({} as unknown as string)).toBe(false);
  });
});

describe("getPromptTemplate", () => {
  it("returns a template with system + buildUser for every valid task", () => {
    for (const task of ["reformulate", "correct", "email", "summarize"] as const) {
      const tpl = getPromptTemplate(task);
      expect(typeof tpl.system).toBe("string");
      expect(tpl.system.length).toBeGreaterThan(0);
      expect(typeof tpl.buildUser).toBe("function");
    }
  });
});
