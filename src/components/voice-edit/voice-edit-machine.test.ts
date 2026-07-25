import { describe, expect, it } from "vitest";
import { nextVoiceEditState } from "./voice-edit-machine";

describe("nextVoiceEditState", () => {
  it("goes straight to processing when a palette key is pressed", () => {
    expect(nextVoiceEditState("listening", { type: "palette-key" })).toBe(
      "processing",
    );
  });

  it("transcribes first when the instruction was dictated", () => {
    expect(
      nextVoiceEditState("listening", { type: "instruction-captured" }),
    ).toBe("transcribing");
  });

  it("moves from transcribing to processing once the text is known", () => {
    expect(nextVoiceEditState("transcribing", { type: "transcribed" })).toBe(
      "processing",
    );
  });

  it("reaches result once the cloud call resolves", () => {
    expect(nextVoiceEditState("processing", { type: "resolved" })).toBe(
      "result",
    );
  });

  it("surfaces failures from any working state", () => {
    for (const state of ["listening", "transcribing", "processing"] as const) {
      expect(nextVoiceEditState(state, { type: "failed" })).toBe("error");
    }
  });

  it("ignores a resolution that arrives after an error", () => {
    expect(nextVoiceEditState("error", { type: "resolved" })).toBe("error");
  });

  it("never leaves upsell on anything but a close", () => {
    expect(nextVoiceEditState("upsell", { type: "resolved" })).toBe("upsell");
    expect(nextVoiceEditState("upsell", { type: "palette-key" })).toBe("upsell");
    expect(nextVoiceEditState("upsell", { type: "instruction-captured" })).toBe(
      "upsell",
    );
  });

  it("allows retrying from result and from error", () => {
    expect(nextVoiceEditState("result", { type: "retry" })).toBe("processing");
    expect(nextVoiceEditState("error", { type: "retry" })).toBe("processing");
  });

  it("goes to upsell as soon as ineligibility is known, from any state", () => {
    expect(nextVoiceEditState("listening", { type: "ineligible" })).toBe(
      "upsell",
    );
    expect(nextVoiceEditState("processing", { type: "ineligible" })).toBe(
      "upsell",
    );
  });

  it("resets to listening on close, ready for the next invocation", () => {
    for (const state of ["result", "error", "upsell", "processing"] as const) {
      expect(nextVoiceEditState(state, { type: "close" })).toBe("listening");
    }
  });

  it("ignores a second palette key once processing has started", () => {
    expect(nextVoiceEditState("processing", { type: "palette-key" })).toBe(
      "processing",
    );
  });

  it("ignores a late instruction that lands after a palette key won the race", () => {
    // The user pressed '1' while still talking: the mic is cancelled, but a
    // segment may already be in flight. It must not rewind the state machine.
    expect(
      nextVoiceEditState("processing", { type: "instruction-captured" }),
    ).toBe("processing");
  });
});
