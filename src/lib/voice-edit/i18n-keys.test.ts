import { describe, expect, it } from "vitest";
import fr from "@/locales/fr.json";
import en from "@/locales/en.json";

/**
 * Voice Edit ships user-visible labels *and* system prompts through i18n, so a
 * key present in one locale but missing in the other silently degrades to the
 * raw key being sent to the model. These tests read the locale files directly
 * — no i18next, no DOM.
 */

const REQUIRED_PROMPT_KEYS = ["suffix", "translate", "instruction"] as const;
const REQUIRED_ACTION_KEYS = [
  "translate",
  "fix",
  "rephrase",
  "summarize",
  "fixPrompt",
  "rephrasePrompt",
  "summarizePrompt",
] as const;

const locales = { fr, en } as Record<string, any>;

describe("voiceEdit locale keys", () => {
  for (const [name, locale] of Object.entries(locales)) {
    describe(name, () => {
      it("has a voiceEdit section", () => {
        expect(locale.voiceEdit).toBeDefined();
      });

      for (const key of REQUIRED_PROMPT_KEYS) {
        it(`has a non-empty prompts.${key}`, () => {
          expect(typeof locale.voiceEdit.prompts[key]).toBe("string");
          expect(locale.voiceEdit.prompts[key].length).toBeGreaterThan(0);
        });
      }

      for (const key of REQUIRED_ACTION_KEYS) {
        it(`has a non-empty actions.${key}`, () => {
          expect(typeof locale.voiceEdit.actions[key]).toBe("string");
          expect(locale.voiceEdit.actions[key].length).toBeGreaterThan(0);
        });
      }
    });
  }

  it("uses the same placeholders in both locales for the translate prompt", () => {
    for (const placeholder of ["{{primary}}", "{{secondary}}"]) {
      expect(fr.voiceEdit.prompts.translate).toContain(placeholder);
      expect(en.voiceEdit.prompts.translate).toContain(placeholder);
    }
  });

  it("uses the instruction placeholder in both locales", () => {
    expect(fr.voiceEdit.prompts.instruction).toContain("{{instruction}}");
    expect(en.voiceEdit.prompts.instruction).toContain("{{instruction}}");
  });

  it("exposes exactly the same key set in both locales", () => {
    expect(Object.keys(fr.voiceEdit.prompts).sort()).toEqual(
      Object.keys(en.voiceEdit.prompts).sort(),
    );
    expect(Object.keys(fr.voiceEdit.actions).sort()).toEqual(
      Object.keys(en.voiceEdit.actions).sort(),
    );
  });
});
