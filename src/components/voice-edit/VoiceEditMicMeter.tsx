import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { listen } from "@tauri-apps/api/event";

const BAR_COUNT = 14;
/** Floor so the meter stays visible (and legible as "live") during silence. */
const MIN_SCALE = 0.14;
/** Same curve as the mini-window bars, so both read as the same instrument. */
const AMPLIFICATION = 2.4;
/**
 * Sampling period for the audio level. `audio-level` fires on every audio
 * callback (~10 ms); re-rendering that often for 14 bars is waste, and the CSS
 * transition below smooths the gaps.
 */
const TICK_MS = 100;

/**
 * Bell-shaped envelope: the middle bars reach higher than the edges, so the
 * meter reads as a waveform rather than a row of identical sliders. Fixed
 * rather than random — it must look the same on every invocation.
 */
const BAR_ENVELOPE = Array.from({ length: BAR_COUNT }, (_, index) => {
  const position = (index / (BAR_COUNT - 1)) * 2 - 1;
  return 0.45 + 0.55 * Math.cos((position * Math.PI) / 2);
});

interface VoiceEditMicMeterProps {
  /** Epoch ms at which Rust closes the microphone on its own. */
  deadline: number;
  /** Full budget, used as the denominator of the gauge. */
  timeoutMs: number;
}

/**
 * Live indicator for the instruction capture.
 *
 * Rendered only once Rust has confirmed the microphone is open
 * (`voice-edit-listening`), never speculatively: "is the mic recording me right
 * now" must not be a guess in an app that sells privacy. The countdown makes
 * the 30 s auto-close visible instead of merely true.
 */
export function VoiceEditMicMeter({
  deadline,
  timeoutMs,
}: VoiceEditMicMeterProps) {
  const { t } = useTranslation();
  const levelRef = useRef(0);
  const [level, setLevel] = useState(0);
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, deadline - Date.now()),
  );

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let cancelled = false;
    void listen<number>("audio-level", (event) => {
      levelRef.current = event.payload;
    })
      .then((fn) => {
        if (cancelled) fn();
        else unlisten = fn;
      })
      .catch(() => {
        // Without levels the bars simply stay at their floor; the countdown
        // still tells the user the microphone is open.
      });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    const tick = () => {
      setLevel(levelRef.current);
      setRemaining(Math.max(0, deadline - Date.now()));
    };
    tick();
    const id = window.setInterval(tick, TICK_MS);
    return () => window.clearInterval(id);
  }, [deadline]);

  const eased = Math.pow(Math.min(level * AMPLIFICATION, 1), 0.75);
  const seconds = Math.ceil(remaining / 1000);
  const ratio = timeoutMs > 0 ? Math.min(1, remaining / timeoutMs) : 0;

  return (
    <div className="voice-edit-mic">
      <div className="voice-edit-mic__row">
        <div className="voice-edit-mic__bars" aria-hidden="true">
          {BAR_ENVELOPE.map((weight, index) => (
            <span
              key={index}
              className="voice-edit-mic__bar"
              style={{
                transform: `scaleY(${Math.max(MIN_SCALE, eased * weight)})`,
                transitionDelay: `${index * 12}ms`,
              }}
            />
          ))}
        </div>
        <span className="voice-edit-mic__label">
          {t("voiceEdit.overlay.listening")}
        </span>
        <span
          className="voice-edit-mic__countdown"
          title={t("voiceEdit.overlay.micAutoClose", { seconds })}
        >
          {t("voiceEdit.overlay.secondsShort", { seconds })}
        </span>
      </div>
      <div
        className="voice-edit-mic__gauge"
        role="progressbar"
        aria-label={t("voiceEdit.overlay.micAutoClose", { seconds })}
        aria-valuemin={0}
        aria-valuemax={Math.round(timeoutMs / 1000)}
        aria-valuenow={seconds}
      >
        <span
          className="voice-edit-mic__gauge-fill"
          style={{ transform: `scaleX(${ratio})` }}
        />
      </div>
    </div>
  );
}
