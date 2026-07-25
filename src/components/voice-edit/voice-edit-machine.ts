/**
 * State machine for the Voice Edit overlay.
 *
 * The overlay is a passive display: it never decides anything on its own, it
 * reacts to events coming from the Rust shortcut handler and from the main
 * window (which owns the cloud session and the settings). Keeping the
 * transitions in one pure function makes the illegal ones — a late instruction
 * rewinding a running request, a resolution landing after an error — explicit
 * and testable.
 */

export type VoiceEditState =
  | "listening"
  | "transcribing"
  | "processing"
  | "result"
  | "error"
  | "upsell";

export type VoiceEditEvent =
  | { type: "palette-key" }
  | { type: "instruction-captured" }
  | { type: "transcribed" }
  | { type: "resolved" }
  | { type: "failed" }
  | { type: "ineligible" }
  | { type: "retry" }
  | { type: "close" };

/** States from which no automatic progress is possible any more. */
const TERMINAL: readonly VoiceEditState[] = ["error", "upsell"];

export function nextVoiceEditState(
  current: VoiceEditState,
  event: VoiceEditEvent,
): VoiceEditState {
  // `close` always wins: the overlay hides and resets for the next keystroke.
  if (event.type === "close") return "listening";

  // Ineligibility is discovered before any network call and outranks whatever
  // the overlay was doing.
  if (event.type === "ineligible") return "upsell";

  if (current === "upsell") return "upsell";

  // From an error, only an explicit retry moves forward — a resolution
  // arriving late (an in-flight request that eventually succeeded) must not
  // silently overwrite the message the user is reading.
  if (current === "error") {
    return event.type === "retry" ? "processing" : "error";
  }

  switch (current) {
    case "listening":
      switch (event.type) {
        case "palette-key":
          return "processing";
        case "instruction-captured":
          return "transcribing";
        case "failed":
          return "error";
        default:
          return current;
      }

    case "transcribing":
      switch (event.type) {
        case "transcribed":
          return "processing";
        case "failed":
          return "error";
        default:
          return current;
      }

    case "processing":
      switch (event.type) {
        case "resolved":
          return "result";
        case "failed":
          return "error";
        default:
          // A palette key pressed twice, or an instruction segment that landed
          // after the palette won the race: both are ignored.
          return current;
      }

    case "result":
      switch (event.type) {
        case "retry":
          return "processing";
        case "failed":
          return "error";
        default:
          return current;
      }

    default:
      return current;
  }
}

export function isTerminal(state: VoiceEditState): boolean {
  return TERMINAL.includes(state);
}
