import { useTranslation } from "react-i18next";
import { Languages, Sparkles } from "lucide-react";
import type { MiniLayout } from "@/hooks/useMiniWindowSize";

interface MiniHeaderProps {
  isRecording: boolean;
  recordingTime: number;
  translateMode: boolean;
  onToggleTranslateMode: () => void;
  translateDisabled?: boolean;
  translateDisabledReason?: string;
  postProcessEnabled: boolean;
  onTogglePostProcess: () => void;
  layout: MiniLayout;
  language?: string;
}

function formatTime(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, "0")}:${secs
    .toString()
    .padStart(2, "0")}`;
}

export function MiniHeader({
  isRecording,
  recordingTime,
  translateMode,
  onToggleTranslateMode,
  translateDisabled = false,
  translateDisabledReason,
  postProcessEnabled,
  onTogglePostProcess,
  layout,
  language,
}: MiniHeaderProps) {
  const { t } = useTranslation();

  const dotSize = layout === "compact" ? "h-2.5 w-2.5" : "h-3 w-3";
  const timerSize = layout === "compact" ? "text-sm" : "text-base";

  const languageBadge = language ? language.split("-")[0]?.toUpperCase() : "";

  return (
    <>
      <span
        className={`${dotSize} rounded-full flex-shrink-0 ${
          isRecording
            ? "bg-vt-danger vt-anim-pulse-dot"
            : "bg-signal-green/40"
        }`}
        style={
          isRecording
            ? {
                boxShadow:
                  "0 0 8px oklch(from var(--vt-danger) l c h / 0.6)",
              }
            : undefined
        }
      />
      {layout !== "compact" && languageBadge && (
        <span
          className="vt-mono flex-shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-vt-fg-3"
          style={{
            background: "oklch(from var(--vt-surface) l c h / 0.55)",
            border: "1px solid var(--vt-border)",
          }}
        >
          {languageBadge}
        </span>
      )}
      {isRecording ? (
        <span
          className={`vt-mono w-auto min-w-[3rem] text-right ${timerSize} tabular-nums flex-shrink-0`}
          style={{ color: "var(--vt-accent-2)" }}
        >
          {formatTime(recordingTime)}
        </span>
      ) : (
        <span
          className={`vt-mono w-auto min-w-[3rem] text-right ${timerSize} text-vt-fg-4 italic tabular-nums flex-shrink-0`}
        >
          00:00
        </span>
      )}
      <button
        data-tauri-drag-region="false"
        onClick={onTogglePostProcess}
        aria-pressed={postProcessEnabled}
        aria-label={
          postProcessEnabled
            ? t("mini.postProcessOn")
            : t("mini.postProcessOff")
        }
        className={`inline-flex items-center justify-center p-1.5 rounded flex-shrink-0 transition-colors border ${
          postProcessEnabled
            ? "text-vt-violet"
            : "text-vt-fg-3 hover:text-vt-fg-2"
        }`}
        style={
          postProcessEnabled
            ? {
                background: "var(--vt-violet-soft)",
                borderColor:
                  "oklch(from var(--vt-violet) l c h / 0.55)",
              }
            : {
                background: "oklch(from var(--vt-surface) l c h / 0.45)",
                borderColor: "var(--vt-border)",
              }
        }
        title={
          postProcessEnabled
            ? t("mini.postProcessOn")
            : t("mini.postProcessOff")
        }
      >
        <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      <button
        data-tauri-drag-region="false"
        onClick={onToggleTranslateMode}
        disabled={translateDisabled}
        aria-pressed={translateMode}
        aria-disabled={translateDisabled}
        aria-label={
          translateDisabled
            ? translateDisabledReason ?? t("mini.translateModeOff")
            : translateMode
              ? t("mini.translateModeOn")
              : t("mini.translateModeOff")
        }
        className={`inline-flex items-center justify-center p-1.5 rounded flex-shrink-0 transition-colors border ${
          translateDisabled
            ? "text-vt-fg-4 opacity-50 cursor-not-allowed"
            : translateMode
              ? "text-vt-accent-2"
              : "text-vt-fg-3 hover:text-vt-fg-2"
        }`}
        style={
          translateDisabled
            ? {
                background: "oklch(from var(--vt-surface) l c h / 0.3)",
                borderColor:
                  "oklch(from var(--vt-border) l c h / 0.5)",
              }
            : translateMode
              ? {
                  background: "var(--vt-accent-soft)",
                  borderColor: "var(--vt-accent)",
                }
              : {
                  background: "oklch(from var(--vt-surface) l c h / 0.45)",
                  borderColor: "var(--vt-border)",
                }
        }
        title={
          translateDisabled
            ? translateDisabledReason ?? t("mini.translateModeOff")
            : translateMode
              ? t("mini.translateModeOn")
              : t("mini.translateModeOff")
        }
      >
        <Languages className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </>
  );
}
