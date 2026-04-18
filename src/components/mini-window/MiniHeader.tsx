import { useTranslation } from "react-i18next";
import { Languages } from "lucide-react";
import type { MiniLayout } from "@/hooks/useMiniWindowSize";

interface MiniHeaderProps {
  isRecording: boolean;
  recordingTime: number;
  translateMode: boolean;
  onToggleTranslateMode: () => void;
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
          isRecording ? "bg-red-400 animate-pulse" : "bg-slate-500/70"
        }`}
      />
      {layout !== "compact" && languageBadge && (
        <span className="flex-shrink-0 rounded bg-slate-700/40 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-300">
          {languageBadge}
        </span>
      )}
      {isRecording ? (
        <span
          className={`w-auto min-w-[3rem] text-right font-mono ${timerSize} text-slate-300 tabular-nums flex-shrink-0`}
        >
          {formatTime(recordingTime)}
        </span>
      ) : (
        <span
          className={`w-auto min-w-[3rem] text-right font-mono ${timerSize} text-slate-500 italic flex-shrink-0`}
        >
          00:00
        </span>
      )}
      <button
        data-tauri-drag-region="false"
        onClick={onToggleTranslateMode}
        aria-pressed={translateMode}
        aria-label={
          translateMode ? t("mini.translateModeOn") : t("mini.translateModeOff")
        }
        className={`inline-flex items-center justify-center p-1.5 rounded flex-shrink-0 transition-colors ${
          translateMode
            ? "bg-blue-500/30 text-blue-300 border border-blue-500/50 hover:bg-blue-500/40"
            : "bg-slate-700/30 text-slate-400 border border-slate-600/40 hover:bg-slate-700/50 hover:text-slate-200"
        }`}
        title={
          translateMode ? t("mini.translateModeOn") : t("mini.translateModeOff")
        }
      >
        <Languages className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </>
  );
}
