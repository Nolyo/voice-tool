import { useRef } from "react";
import { useTranslation } from "react-i18next";
import type { MiniLayout } from "@/hooks/useMiniWindowSize";
import { splitLiveDelta, type LiveDelta } from "@/lib/streaming/live-delta";

/** Longest transcript tail per layout — what fits without wrapping madness. */
const TAIL_CHARS: Record<MiniLayout, number> = {
  compact: 90,
  standard: 110,
  extended: 320,
};

const PIP_MIN_HEIGHT = 3;
const PIP_MAX_HEIGHT = 16;
/** Same perceptual easing as the full-size visualizers. */
const AMPLIFICATION = 2.4;
/** Static per-bar variation so the pip never looks like a solid block. */
const PIP_MODIFIERS = [0.65, 1, 0.8];

interface MiniStreamingHudProps {
  /** Assembled live transcript so far (empty until the first chunk lands). */
  text: string;
  audioLevel: number;
  layout: MiniLayout;
}

interface DeltaSnapshot extends LiveDelta {
  text: string;
  /** Bumped on every text change so the fresh <span> remounts and re-animates. */
  animKey: number;
}

/**
 * Tiny 3-bar level meter shown while streaming. The full visualizer hands the
 * stage over to the live text, but the microphone feedback must not disappear
 * with it — this keeps a heartbeat-sized version alive.
 */
function AudioPip({ audioLevel }: { audioLevel: number }) {
  const eased = Math.pow(Math.min(audioLevel * AMPLIFICATION, 1.0), 0.75);
  return (
    <div
      className="flex flex-shrink-0 items-center gap-[2px]"
      aria-hidden="true"
      data-tauri-drag-region
    >
      {PIP_MODIFIERS.map((modifier, i) => (
        <div
          key={i}
          className="rounded-full transition-all duration-150 ease-out"
          style={{
            width: "2.5px",
            height: `${
              eased * (PIP_MAX_HEIGHT - PIP_MIN_HEIGHT) * modifier +
              PIP_MIN_HEIGHT
            }px`,
            backgroundImage:
              "linear-gradient(180deg, oklch(from var(--vt-accent) l c h / 0.95) 0%, oklch(from var(--vt-accent) l c h / 0.55) 100%)",
          }}
        />
      ))}
    </div>
  );
}

/**
 * Live-dictation HUD shown in place of the visualizer during a streaming
 * session: audio pip + transcript tail + pulsing caret. Newly transcribed
 * words fade in with an accent tint before settling into the body color.
 *
 * On the extended layout the text wraps over several lines (bottom-anchored,
 * top fade); compact/standard keep the single right-anchored line.
 */
export function MiniStreamingHud({
  text,
  audioLevel,
  layout,
}: MiniStreamingHudProps) {
  const { t } = useTranslation();
  const tailChars = TAIL_CHARS[layout];

  // The delta lives in a ref mutated during render (idempotent): the parent
  // re-renders on every audio-level event, and recomputing against the last
  // render would empty `fresh` after one frame, cutting the animation short.
  const snapRef = useRef<DeltaSnapshot>({
    text: "",
    truncated: false,
    stable: "",
    fresh: "",
    animKey: 0,
  });
  if (text !== snapRef.current.text) {
    snapRef.current = {
      text,
      ...splitLiveDelta(snapRef.current.text, text, tailChars),
      animKey: snapRef.current.animKey + 1,
    };
  }
  const { truncated, stable, fresh, animKey } = snapRef.current;

  const multiline = layout === "extended";

  return (
    <div
      className="flex min-w-0 flex-1 items-center gap-2 self-stretch"
      data-tauri-drag-region
    >
      <AudioPip audioLevel={audioLevel} />
      <div
        className={`mini-live-clip min-w-0 flex-1 ${
          multiline ? "mini-live-clip--multiline" : ""
        }`}
        aria-live="polite"
        data-tauri-drag-region
      >
        {text ? (
          <p
            className={`text-xs text-vt-fg-2 ${
              multiline
                ? "whitespace-normal break-words text-left"
                : "whitespace-nowrap text-right"
            }`}
          >
            {truncated && !multiline ? "…" : ""}
            {stable}
            <span key={animKey} className="mini-live-fresh">
              {fresh}
            </span>
            <span className="mini-live-caret" aria-hidden="true" />
          </p>
        ) : (
          <p
            className={`text-xs italic text-vt-fg-4 ${
              multiline ? "text-left" : "whitespace-nowrap text-right"
            }`}
          >
            {t("mini.listening")}
            <span className="mini-live-caret" aria-hidden="true" />
          </p>
        )}
      </div>
    </div>
  );
}
