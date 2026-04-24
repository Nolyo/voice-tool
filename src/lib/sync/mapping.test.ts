import { describe, it, expect } from "vitest";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { extractCloudSettings, applyCloudSettings } from "./mapping";

describe("mapping AppSettings ↔ Cloud", () => {
  it("extractCloudSettings returns the spec shape", () => {
    const cloud = extractCloudSettings(DEFAULT_SETTINGS.settings);
    expect(cloud).toEqual({
      ui: { theme: "dark", language: DEFAULT_SETTINGS.settings.ui_language },
      hotkeys: {
        toggle: "Ctrl+F11",
        push_to_talk: "Ctrl+F12",
        open_window: "Ctrl+Alt+O",
      },
      features: { auto_paste: "cursor", sound_effects: true },
      transcription: { provider: "Local", local_model: "base" },
    });
  });

  it("applyCloudSettings merges only syncable keys", () => {
    const local = { ...DEFAULT_SETTINGS.settings };
    const cloud = {
      ui: { theme: "light" as const, language: "en" as const },
      hotkeys: {
        toggle: "Ctrl+F5",
        push_to_talk: "Ctrl+F6",
        open_window: "Ctrl+Alt+P",
      },
      features: { auto_paste: "clipboard" as const, sound_effects: false },
      transcription: { provider: "OpenAI" as const, local_model: "small" },
    };
    const merged = applyCloudSettings(local, cloud);

    expect(merged.theme).toBe("light");
    expect(merged.ui_language).toBe("en");
    expect(merged.record_hotkey).toBe("Ctrl+F5");
    expect(merged.insertion_mode).toBe("clipboard");
    expect(merged.enable_sounds).toBe(false);
    expect(merged.transcription_provider).toBe("OpenAI");
    expect(merged.local_model_size).toBe("small");

    // Non-syncable keys préservées
    expect(merged.openai_api_key).toBe(local.openai_api_key);
    expect(merged.silence_threshold).toBe(local.silence_threshold);
  });

  it("round-trip extract -> apply est idempotent pour les clés syncées", () => {
    const local = {
      ...DEFAULT_SETTINGS.settings,
      theme: "light" as const,
      transcription_provider: "Groq" as const,
    };
    const cloud = extractCloudSettings(local);
    const merged = applyCloudSettings(DEFAULT_SETTINGS.settings, cloud);
    expect(merged.theme).toBe("light");
    expect(merged.transcription_provider).toBe("Groq");
  });
});
