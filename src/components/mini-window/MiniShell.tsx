import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useMiniWindowState } from "@/hooks/useMiniWindowState";
import { useMiniWindowSize } from "@/hooks/useMiniWindowSize";
import { MiniVisualizer } from "./MiniVisualizer";
import { MiniHeader } from "./MiniHeader";
import { MiniTranscriptPreview } from "./MiniTranscriptPreview";

export function MiniShell() {
  const { t } = useTranslation();
  const {
    audioLevel,
    isRecording,
    recordingTime,
    status,
    errorMessage,
    translateMode,
    handleToggleTranslateMode,
    postProcessEnabled,
    handleTogglePostProcess,
    visualizerMode,
    waveformCapacity,
    showTranscriptPreview,
    lastTranscript,
    language,
    provider,
  } = useMiniWindowState();
  const translateDisabled = provider === "Groq";
  const translateDisabledReason = translateDisabled
    ? t("mini.translateUnsupportedGroq")
    : undefined;
  const layout = useMiniWindowSize();

  // Transparent background for the frameless window
  useEffect(() => {
    const rootEl = document.documentElement;
    const bodyEl = document.body;
    const previousRootBg = rootEl.style.backgroundColor;
    const previousBodyBg = bodyEl.style.backgroundColor;

    bodyEl.classList.add("mini-window-body");
    rootEl.style.backgroundColor = "transparent";
    bodyEl.style.backgroundColor = "transparent";

    return () => {
      bodyEl.classList.remove("mini-window-body");
      if (previousRootBg) rootEl.style.backgroundColor = previousRootBg;
      else rootEl.style.removeProperty("background-color");
      if (previousBodyBg) bodyEl.style.backgroundColor = previousBodyBg;
      else bodyEl.style.removeProperty("background-color");
    };
  }, []);

  const showPreviewRow =
    layout === "extended" &&
    showTranscriptPreview &&
    status !== "error" &&
    status !== "recording" &&
    status !== "post-processing";

  // Bars scale with available height: subtract shell padding and preview row if any
  const barMaxHeight = Math.max(
    18,
    Math.min(80, (typeof window !== "undefined" ? window.innerHeight : 42) - 12),
  );

  return (
    <div
      className="flex h-full w-full items-center justify-center bg-transparent overflow-hidden"
      data-tauri-drag-region
    >
      <div
        className="mini-shell flex h-full w-full flex-col gap-0"
        data-tauri-drag-region
      >
        {/* Main row: visualizer + timer + controls (shown in idle / recording) */}
        {(status === "idle" || status === "recording") && (
          <div
            className="flex flex-1 items-center gap-2 min-h-0"
            data-tauri-drag-region
          >
            <MiniVisualizer
              mode={visualizerMode}
              audioLevel={audioLevel}
              isRecording={isRecording}
              waveformCapacity={waveformCapacity}
              barMaxHeight={barMaxHeight}
            />
            <MiniHeader
              isRecording={isRecording}
              recordingTime={recordingTime}
              translateMode={translateMode}
              onToggleTranslateMode={handleToggleTranslateMode}
              translateDisabled={translateDisabled}
              translateDisabledReason={translateDisabledReason}
              postProcessEnabled={postProcessEnabled}
              onTogglePostProcess={handleTogglePostProcess}
              layout={layout}
              language={language}
            />
          </div>
        )}

        {/* Status row (processing / post-processing / success / error) */}
        {(status === "processing" ||
          status === "post-processing" ||
          status === "success" ||
          status === "error") && (
          <div
            className="flex flex-1 items-center justify-center"
            data-tauri-drag-region
          >
            {status === "processing" && (
              <div className="flex items-center gap-2">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" />
                <p className="text-xs text-slate-300">
                  {provider === "Local"
                    ? t("mini.processingLocal")
                    : t("mini.sendingAudio")}
                </p>
              </div>
            )}
            {status === "post-processing" && (
              <div className="flex items-center gap-2">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-violet-400 border-t-transparent" />
                <p className="text-xs text-violet-300">
                  {t("mini.postProcessing")}
                </p>
              </div>
            )}
            {status === "error" && (
              <div className="flex items-center gap-2">
                <span className="text-red-400 text-lg">✕</span>
                <p className="text-xs text-red-400 font-medium">{errorMessage}</p>
              </div>
            )}
            {status === "success" && (
              <div className="flex items-center gap-2">
                <span className="text-green-400 text-lg">✓</span>
                <p className="text-xs text-green-400 font-medium">
                  {t("mini.transcriptionSuccess")}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Extended-layout preview row */}
        {showPreviewRow && (
          <MiniTranscriptPreview
            status={status}
            lastTranscript={lastTranscript}
          />
        )}
      </div>
    </div>
  );
}
