// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

type Handler = (event: { payload: unknown }) => void | Promise<void>;
const listeners = vi.hoisted(() => new Map<string, Handler>());
const emitted = vi.hoisted(
  () => [] as Array<{ name: string; payload: unknown }>,
);

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async (name: string, handler: Handler) => {
    listeners.set(name, handler);
    return () => listeners.delete(name);
  }),
  emit: vi.fn(async (name: string, payload: unknown) => {
    emitted.push({ name, payload });
  }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

// Same reason as actions.test.ts: importing the real `@/i18n` reaches for
// localStorage at module load. The fake echoes keys back.
vi.mock("@/i18n", () => ({ default: { t: (key: string) => key } }));

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: { access_token: "jwt" } },
      })),
    },
  },
}));

const notesAssistCloud = vi.hoisted(() =>
  vi.fn(async (_args: { systemPrompt: string; userText: string }) => ({
    text: "processed",
  })),
);
const transcribeCloud = vi.hoisted(() =>
  vi.fn(async () => ({ text: "translate this" })),
);
vi.mock("@/lib/cloud/api", () => ({ notesAssistCloud, transcribeCloud }));

const eligible = vi.hoisted(() => ({ value: true }));
vi.mock("@/hooks/useCloud", () => ({
  useCloud: () => ({ isCloudEligible: eligible.value }),
}));

vi.mock("@/hooks/useSettings", () => ({
  useSettings: () => ({
    settings: {
      language: "fr",
      voice_edit_primary_lang: "fr",
      voice_edit_secondary_lang: "en",
    },
  }),
}));

import { useVoiceEdit } from "./useVoiceEdit";

const OPEN_PAYLOAD = {
  text: "Le texte sélectionné",
  sourceWindow: 42,
  hadSelection: true,
  truncated: false,
};

const INSTRUCTION_PAYLOAD = { samples: [1, 2, 3], sampleRate: 16000 };

/** Mount the hook and wait for the async `listen()` registrations to settle. */
async function mount() {
  renderHook(() => useVoiceEdit());
  await Promise.resolve();
  await Promise.resolve();
}

async function fire(name: string, payload: unknown) {
  await listeners.get(name)!({ payload });
}

/** Machine events pushed to the overlay, in order. */
function pushedEvents(): string[] {
  return emitted
    .filter((e) => e.name === "voice-edit-state")
    .map((e) => (e.payload as { event: { type: string } }).event.type);
}

beforeEach(() => {
  listeners.clear();
  emitted.length = 0;
  eligible.value = true;
  notesAssistCloud.mockClear();
  transcribeCloud.mockClear();
});

describe("useVoiceEdit", () => {
  it("sends the captured selection along with a dictated instruction", async () => {
    await mount();
    await fire("voice-edit-open", OPEN_PAYLOAD);
    await fire("voice-edit-instruction", INSTRUCTION_PAYLOAD);

    expect(notesAssistCloud).toHaveBeenCalledTimes(1);
    expect(notesAssistCloud.mock.calls[0][0]).toMatchObject({
      userText: OPEN_PAYLOAD.text,
    });
  });

  it("drops an instruction that lands after a palette key won the race", async () => {
    await mount();
    await fire("voice-edit-open", OPEN_PAYLOAD);
    await fire("voice-edit-run", {
      actionIndex: 2,
      text: OPEN_PAYLOAD.text,
      sourceWindow: 42,
    });
    await fire("voice-edit-instruction", INSTRUCTION_PAYLOAD);

    // The palette pipeline ran; the stale audio was never uploaded.
    expect(transcribeCloud).not.toHaveBeenCalled();
    expect(notesAssistCloud).toHaveBeenCalledTimes(1);
  });

  it("pushes machine events, not raw states", async () => {
    await mount();
    await fire("voice-edit-open", OPEN_PAYLOAD);
    await fire("voice-edit-instruction", INSTRUCTION_PAYLOAD);

    expect(pushedEvents()).toEqual([
      "instruction-captured",
      "transcribed",
      "resolved",
    ]);
  });

  it("checks eligibility before spending anything on the network", async () => {
    eligible.value = false;
    await mount();
    await fire("voice-edit-open", OPEN_PAYLOAD);
    await fire("voice-edit-instruction", INSTRUCTION_PAYLOAD);

    expect(transcribeCloud).not.toHaveBeenCalled();
    expect(notesAssistCloud).not.toHaveBeenCalled();
    expect(pushedEvents()).toEqual(["ineligible"]);
  });

  it("reports a failure instead of hanging when the mic could not be opened", async () => {
    await mount();
    await fire("voice-edit-open", OPEN_PAYLOAD);
    await fire("voice-edit-blocked", "mic_unavailable");

    const last = emitted[emitted.length - 1].payload as {
      event: { type: string };
      error?: string;
    };
    expect(last.event.type).toBe("failed");
    expect(last.error).toBe("voiceEdit.errors.micUnavailable");
  });

  it("forgets the selection once the overlay is closed", async () => {
    await mount();
    await fire("voice-edit-open", OPEN_PAYLOAD);
    await fire("voice-edit-close", undefined);
    await fire("voice-edit-instruction", INSTRUCTION_PAYLOAD);

    expect(notesAssistCloud.mock.calls[0][0]).toMatchObject({ userText: "" });
  });
});
