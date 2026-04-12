import { useEffect, useMemo } from "react";
import ReactDOM from "react-dom/client";
import { useMiniWindowState } from "@/hooks/useMiniWindowState";
import { useTranslation } from "react-i18next";
import "./i18n";
import "./App.css";

function MiniWindow() {
  const { t } = useTranslation();
  const {
    audioLevel,
    isRecording,
    recordingTime,
    status,
    errorMessage,
    translateMode,
    handleToggleTranslateMode,
  } = useMiniWindowState();

  const barModifiers = useMemo(
    () => Array.from({ length: 16 }, () => 0.7 + Math.random() * 0.3),
    [],
  );

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;
  };

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
      if (previousRootBg) {
        rootEl.style.backgroundColor = previousRootBg;
      } else {
        rootEl.style.removeProperty("background-color");
      }
      if (previousBodyBg) {
        bodyEl.style.backgroundColor = previousBodyBg;
      } else {
        bodyEl.style.removeProperty("background-color");
      }
    };
  }, []);

  const bars = useMemo(() => {
    const BAR_COUNT = barModifiers.length;
    const MIN_HEIGHT = 4;
    const MAX_HEIGHT = 28;
    const AMPLIFICATION = 2.4;

    return Array.from({ length: BAR_COUNT }).map((_, i) => {
      const delay = i * 0.03;
      const modifier = barModifiers[i];
      const easedLevel = Math.pow(
        Math.min(audioLevel * AMPLIFICATION, 1.0),
        0.75,
      );
      const dynamicHeight =
        easedLevel * (MAX_HEIGHT - MIN_HEIGHT) * modifier + MIN_HEIGHT;
      const height = isRecording ? dynamicHeight : MIN_HEIGHT;

      const color = isRecording
        ? `linear-gradient(180deg, rgba(248, 113, 113, 0.95) 0%, rgba(248, 113, 113, 0.6) 100%)`
        : `linear-gradient(180deg, rgba(148, 163, 184, 0.4) 0%, rgba(148, 163, 184, 0.2) 100%)`;

      return (
        <div
          key={i}
          className="rounded-full transition-all duration-150 ease-out"
          style={{
            width: "2.5px",
            height: `${height}px`,
            backgroundImage: color,
            transitionDelay: `${delay}s`,
          }}
        />
      );
    });
  }, [audioLevel, barModifiers, isRecording]);

  return (
    <div className="dark flex h-full w-full items-center justify-center bg-transparent overflow-hidden">
      <div className="mini-shell flex w-full max-w-[240px] flex-col gap-0">
        {/* Audio visualizer (idle / recording) */}
        {(status === "idle" || status === "recording") && (
          <div className="flex items-center gap-2">
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                isRecording
                  ? "bg-red-400 animate-pulse"
                  : "bg-slate-500/70"
              } flex-shrink-0`}
            />
            <div className="flex h-7 flex-1 items-end gap-[3px] px-2">
              {bars}
            </div>
            {isRecording ? (
              <span className="w-10 text-right text-sm font-mono text-slate-300 tabular-nums flex-shrink-0">
                {formatTime(recordingTime)}
              </span>
            ) : (
              <span className="w-10 text-right text-sm font-mono text-slate-500 italic flex-shrink-0">
                00:00
              </span>
            )}
            <button
              onClick={handleToggleTranslateMode}
              className={`px-2 py-1 text-xs font-medium rounded whitespace-nowrap flex-shrink-0 transition-colors ${
                translateMode
                  ? "bg-blue-500/30 text-blue-300 border border-blue-500/50 hover:bg-blue-500/40"
                  : "bg-slate-700/30 text-slate-400 border border-slate-600/30 hover:bg-slate-700/40"
              }`}
              title={
                translateMode
                  ? t('mini.translateModeOn')
                  : t('mini.translateModeOff')
              }
            >
              {translateMode ? "🌐 EN" : "—"}
            </button>
          </div>
        )}

        {/* Status section (processing / success / error) */}
        {(status === "processing" ||
          status === "success" ||
          status === "error") && (
          <div className="w-full">
            {status === "processing" && (
              <div className="flex items-center justify-center gap-2">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" />
                <p className="text-xs text-slate-300">{t('mini.sendingAudio')}</p>
              </div>
            )}
            {status === "error" && (
              <div className="flex items-center justify-center gap-2">
                <span className="text-red-400 text-lg">✕</span>
                <p className="text-xs text-red-400 font-medium">
                  {errorMessage}
                </p>
              </div>
            )}
            {status === "success" && (
              <div className="flex items-center justify-center gap-2">
                <span className="text-green-400 text-lg">✓</span>
                <p className="text-xs text-green-400 font-medium">
                  {t('mini.transcriptionSuccess')}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(<MiniWindow />);
