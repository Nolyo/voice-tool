import type { ReactNode } from "react";
import { Mic, Square, Zap } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSettings } from "@/hooks/useSettings";
import { HotkeyTokens } from "@/components/common/HotkeyTokens";

interface HeroDictationCardProps {
  isRecording: boolean;
  isTranscribing?: boolean;
  onToggleRecording: () => void;
}

// Static height pattern for the idle waveform — gives the bars an organic
// silhouette without per-render randomness.
const WAVE_HEIGHTS = [0.3, 0.5, 0.7, 0.45, 0.9, 0.6, 0.35, 0.8, 0.55, 0.4];
const WAVE_BARS = Array.from({ length: 40 }, (_, i) => i);

/**
 * Home-screen hero: the primary "dictate" affordance. The mic tile toggles
 * recording (mirrors the header button), an animated waveform conveys the live
 * state, and the two hotkey rows remind the user of the toggle + push-to-talk
 * shortcuts.
 */
export function HeroDictationCard({
  isRecording,
  isTranscribing = false,
  onToggleRecording,
}: HeroDictationCardProps) {
  const { t } = useTranslation();
  const { settings } = useSettings();

  const recordHotkey = settings.record_hotkey || "Ctrl+F11";
  const pttHotkey = settings.ptt_hotkey || "Ctrl+F12";

  const title = isTranscribing
    ? t("home.hero.transcribing")
    : isRecording
      ? t("home.hero.recording")
      : t("home.hero.ready");
  const desc = isRecording ? t("home.hero.recordingDesc") : t("home.hero.desc");

  return (
    <div
      className="vt-card-elevated relative overflow-hidden p-6 flex flex-col"
      style={{
        background:
          "radial-gradient(120% 120% at 88% -10%, var(--vt-accent-soft), transparent 60%), var(--vt-panel-2)",
      }}
    >
      <div className="flex items-start gap-4">
        <button
          type="button"
          onClick={onToggleRecording}
          disabled={isTranscribing}
          aria-label={isRecording ? t("home.hero.stopAria") : t("home.hero.recordAria")}
          className={`relative w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 transition-all cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed ${
            isRecording
              ? "bg-destructive text-white scale-105"
              : "bg-primary text-primary-foreground hover:bg-primary/90 shadow-[var(--vt-shadow-primary-glow)]"
          }`}
        >
          {isRecording ? (
            <Square className="w-5 h-5 fill-current" />
          ) : (
            <Mic className="w-6 h-6" />
          )}
        </button>
        <div className="min-w-0">
          <h2 className="vt-display text-[19px] font-semibold tracking-tight text-[var(--vt-fg)] mt-0.5">
            {title}
          </h2>
          <p className="text-[13px] text-[var(--vt-fg-3)] mt-1 max-w-[360px] text-pretty">
            {desc}
          </p>
        </div>
      </div>

      {/* Live / idle waveform */}
      <div className="flex items-center gap-[3px] h-10 my-5" aria-hidden="true">
        {WAVE_BARS.map((i) => (
          <span
            key={i}
            className="flex-1 max-w-[5px] min-w-[3px] rounded-full vt-anim-wave-bar"
            style={{
              height: `${28 + WAVE_HEIGHTS[i % WAVE_HEIGHTS.length] * 12}px`,
              background: isRecording
                ? "var(--vt-accent)"
                : "color-mix(in oklab, var(--vt-accent) 38%, transparent)",
              opacity: isRecording ? 1 : 0.6,
              animationDelay: `${(i * 0.04).toFixed(2)}s`,
              animationDuration: isRecording ? "0.7s" : "1.8s",
            }}
          />
        ))}
      </div>

      <div className="grid gap-2 mt-auto">
        <HeroKeyRow
          icon={<Mic className="w-[15px] h-[15px]" />}
          label={t("home.hero.toggleLabel")}
          desc={t("home.hero.toggleDesc")}
          shortcut={recordHotkey}
        />
        <HeroKeyRow
          icon={<Zap className="w-[15px] h-[15px]" />}
          label={t("home.hero.pttLabel")}
          desc={t("home.hero.pttDesc")}
          shortcut={pttHotkey}
        />
      </div>
    </div>
  );
}

function HeroKeyRow({
  icon,
  label,
  desc,
  shortcut,
}: {
  icon: ReactNode;
  label: string;
  desc: string;
  shortcut: string;
}) {
  return (
    <div
      className="flex items-center gap-3 px-3.5 py-2.5 rounded-[10px] border border-[var(--vt-border)]"
      style={{
        background: "color-mix(in oklab, var(--vt-bg) 40%, var(--vt-panel-2) 60%)",
      }}
    >
      <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-[var(--vt-accent-soft)] text-[var(--vt-accent)] shrink-0">
        {icon}
      </span>
      <div className="min-w-0">
        <div className="text-[13px] font-medium text-[var(--vt-fg)]">{label}</div>
        <div className="text-[11.5px] text-[var(--vt-fg-4)]">{desc}</div>
      </div>
      <div className="ml-auto shrink-0">
        <HotkeyTokens shortcut={shortcut} />
      </div>
    </div>
  );
}
