import { describe, it, expect } from "vitest";
import { isValidTask, getPromptTemplate } from "./prompts";

describe("isValidTask", () => {
  it("accepts the auto task", () => {
    expect(isValidTask("auto")).toBe(true);
  });

  it("rejects the legacy 4-task taxonomy", () => {
    expect(isValidTask("reformulate")).toBe(false);
    expect(isValidTask("correct")).toBe(false);
    expect(isValidTask("email")).toBe(false);
    expect(isValidTask("summarize")).toBe(false);
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

describe("getPromptTemplate auto", () => {
  const tpl = getPromptTemplate("auto");

  it("returns a non-empty system prompt and a buildUser function", () => {
    expect(typeof tpl.system).toBe("string");
    expect(tpl.system.length).toBeGreaterThan(0);
    expect(typeof tpl.buildUser).toBe("function");
  });

  it("system prompt encodes the absolute anti-answer rule", () => {
    expect(tpl.system).toMatch(/RÈGLE ABSOLUE/);
    expect(tpl.system).toMatch(/tu ne réponds JAMAIS/);
  });

  it("system prompt encodes the two-step meta-instruction detection", () => {
    expect(tpl.system).toMatch(/ÉTAPE 1/);
    expect(tpl.system).toMatch(/meta-instruction/);
    expect(tpl.system).toMatch(/ÉTAPE 2/);
  });

  it("system prompt carries the translation few-shot", () => {
    // Load-bearing example: confirms the LLM sees a concrete translate
    // meta-instruction and the expected stripped+translated output.
    expect(tpl.system).toMatch(
      /<dictation>Traduis en anglais bonjour comment ça va<\/dictation>/,
    );
    expect(tpl.system).toMatch(/Hello, how are you\?/);
  });

  it("buildUser wraps input in <dictation>...</dictation>", () => {
    const out = tpl.buildUser("Traduis en anglais bonjour");
    expect(out).toBe("<dictation>\nTraduis en anglais bonjour\n</dictation>");
  });

  it("buildUser ignores the language hint", () => {
    // language is irrelevant for auto — the prompt instructs the model to
    // preserve the source language unless a meta-instruction overrides it.
    const out = tpl.buildUser("Bonjour", "fr");
    expect(out).toBe("<dictation>\nBonjour\n</dictation>");
  });
});
