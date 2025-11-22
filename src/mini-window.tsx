import { useEffect, useMemo, useState } from "react";
import ReactDOM from "react-dom/client";
import { listen, emit } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

interface TranscriptionEvent {
  text: string;
  confidence?: number;
  speech_final?: boolean;
}

type WindowStatus = "idle" | "recording" | "processing" | "success" | "error";

function MiniWindow() {
  const [audioLevel, setAudioLevel] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isExtended, setIsExtended] = useState(false);
  const [interimText, setInterimText] = useState("");
  const [finalText, setFinalText] = useState("");
  const [currentUtterance, setCurrentUtterance] = useState("");
  const [status, setStatus] = useState<WindowStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const barModifiers = useMemo(
    () => Array.from({ length: 16 }, () => 0.7 + Math.random() * 0.3),
    []
  );

  // Timer for recording duration
  useEffect(() => {
    let interval: number | null = null;

    if (isRecording) {
      setRecordingTime(0);
      interval = window.setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } else {
      setRecordingTime(0);
    }

    return () => {
      if (interval !== null) {
        clearInterval(interval);
      }
    };
  }, [isRecording]);

  // Format time as MM:SS
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;
  };

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

  useEffect(() => {
    let unlistenAudioFn: (() => void) | null = null;
    let unlistenRecordingFn: (() => void) | null = null;
    let unlistenDeepgramConnectedFn: (() => void) | null = null;
    let unlistenDeepgramDisconnectedFn: (() => void) | null = null;
    let unlistenTranscriptionInterimFn: (() => void) | null = null;
    let unlistenTranscriptionFinalFn: (() => void) | null = null;
    let unlistenTranscriptionStartFn: (() => void) | null = null;
    let unlistenTranscriptionSuccessFn: (() => void) | null = null;
    let unlistenTranscriptionErrorFn: (() => void) | null = null;

    // Setup listeners asynchronously
    const setupListeners = async () => {
      try {
        // Listen to audio level events
        unlistenAudioFn = await listen<number>("audio-level", (event) => {
          setAudioLevel(event.payload);
        });

        // Listen to recording state changes
        unlistenRecordingFn = await listen<boolean>(
          "recording-state",
          async (event) => {
            const recording = event.payload;
            setIsRecording(recording);
            if (recording) {
              setStatus("recording");
              setErrorMessage("");
              setFinalText("");
              setInterimText("");
              setCurrentUtterance("");
              // Reset extended mode unless deepgram is active (handled separately)
              if (!isExtended) {
                // Keep compact for now
              }
            } else {
              // If we were recording and stopped, we might be waiting for transcription
              // But if we are in Deepgram mode, it handles its own events.
              // If we are in Whisper mode, we wait for "transcription-start"
            }
          }
        );

        // Listen for Whisper transcription events
        unlistenTranscriptionStartFn = await listen("transcription-start", async () => {
          setStatus("processing");
          setIsExtended(true);
          try {
            await invoke("set_mini_window_mode", { mode: "extended" });
          } catch (e) {
            console.error("Failed to set mini window to extended mode:", e);
          }
        });

        unlistenTranscriptionSuccessFn = await listen<{ text: string }>("transcription-success", async (event) => {
          setStatus("success");
          setFinalText(event.payload.text);

          // Hide window after delay
          setTimeout(async () => {
            setStatus("idle");
            setIsExtended(false);
            try {
              await invoke("set_mini_window_mode", { mode: "compact" });
              await invoke("close_mini_window");
            } catch (e) {
              console.error("Failed to hide mini window:", e);
            }
          }, 2000);
        });

        unlistenTranscriptionErrorFn = await listen<{ error: string }>("transcription-error", async (event) => {
          setStatus("error");
          setErrorMessage(event.payload.error);

          // Hide window after delay
          setTimeout(async () => {
            setStatus("idle");
            setIsExtended(false);
            try {
              await invoke("set_mini_window_mode", { mode: "compact" });
              await invoke("close_mini_window");
            } catch (e) {
              console.error("Failed to hide mini window:", e);
            }
          }, 4000);
        });

        // Listen to Deepgram connection events
        unlistenDeepgramConnectedFn = await listen(
          "deepgram-connected",
          async () => {
            setIsExtended(true);
            setFinalText("");
            setCurrentUtterance("");
            setInterimText("");
            try {
              await invoke("set_mini_window_mode", { mode: "extended" });
            } catch (e) {
              console.error("Failed to set mini window to extended mode:", e);
            }
          }
        );

        unlistenDeepgramDisconnectedFn = await listen(
          "deepgram-disconnected",
          async () => {
            setIsExtended(false);
            try {
              await invoke("set_mini_window_mode", { mode: "compact" });
            } catch (e) {
              console.error("Failed to set mini window to compact mode:", e);
            }
          }
        );

        // Listen to Deepgram transcription events
        unlistenTranscriptionInterimFn = await listen<TranscriptionEvent>(
          "transcription-interim",
          (event) => {
            setInterimText(event.payload.text);
          }
        );

        unlistenTranscriptionFinalFn = await listen<TranscriptionEvent>(
          "transcription-final",
          (event) => {
            const newText = event.payload.text;
            const isSpeechFinal = event.payload.speech_final || false;

            if (isSpeechFinal) {
              // Add to final text
              setFinalText((prev) => {
                const trimmed = prev.trim();
                return trimmed ? `${trimmed} ${newText}` : newText;
              });
              setCurrentUtterance("");
            } else {
              // Update current utterance
              setCurrentUtterance(newText);
            }

            // Clear interim text
            setInterimText("");
          }
        );

        // Notify backend we're ready
        await emit("mini-window-ready", {});
      } catch (e) {
        console.error("Failed to setup listeners:", e);
      }
    };

    setupListeners();

    return () => {
      if (unlistenAudioFn) unlistenAudioFn();
      if (unlistenRecordingFn) unlistenRecordingFn();
      if (unlistenDeepgramConnectedFn) unlistenDeepgramConnectedFn();
      if (unlistenDeepgramDisconnectedFn) unlistenDeepgramDisconnectedFn();
      if (unlistenTranscriptionInterimFn) unlistenTranscriptionInterimFn();
      if (unlistenTranscriptionFinalFn) unlistenTranscriptionFinalFn();
      if (unlistenTranscriptionStartFn) unlistenTranscriptionStartFn();
      if (unlistenTranscriptionSuccessFn) unlistenTranscriptionSuccessFn();
      if (unlistenTranscriptionErrorFn) unlistenTranscriptionErrorFn();
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
        0.75
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

  // Combine final text and current utterance for display
  const displayText =
    finalText && currentUtterance
      ? `${finalText} ${currentUtterance}`
      : finalText || currentUtterance;

  return (
    <div className="dark flex min-h-screen w-full items-center justify-center bg-transparent">
      <div className="mini-shell flex w-full max-w-[240px] flex-col gap-0">
        {/* Audio visualizer section (always visible) */}
        <div className="flex items-center gap-4">
          <span
            className={`h-2.5 w-2.5 rounded-full ${isRecording ? "bg-red-400 animate-pulse" : "bg-slate-500/70"
              } flex-shrink-0`}
          />
          <div className="flex h-7 flex-1 items-end gap-[3px] px-2">{bars}</div>
          {isRecording && (
            <span className="w-12 text-right text-sm font-mono text-slate-300 tabular-nums flex-shrink-0">
              {formatTime(recordingTime)}
            </span>
          )}
          {!isRecording && (
            <span className="w-12 text-right text-sm font-mono text-slate-500 italic flex-shrink-0">
              00:00
            </span>
          )}
        </div>

        {/* Transcription section (only in extended mode) */}
        {isExtended && (
          <div className="mt-2 w-full overflow-y-auto px-3 py-2" style={{ maxHeight: "100px" }}>

            {/* Processing State */}
            {status === "processing" && (
              <div className="flex items-center justify-center gap-2 py-2">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-400 border-t-transparent"></div>
                <p className="text-xs text-slate-300">Envoi de l'audio...</p>
              </div>
            )}

            {/* Error State */}
            {status === "error" && (
              <div className="py-1">
                <p className="text-xs text-red-400 font-medium mb-1">Erreur</p>
                <p className="text-xs text-slate-300 leading-tight">{errorMessage}</p>
              </div>
            )}

            {/* Success/Normal State */}
            {(status === "success" || status === "idle" || status === "recording") && (
              <>
                {/* Interim text (partial, gray, italic) */}
                {interimText && (
                  <p className="text-xs text-gray-400 italic mb-1">
                    {interimText}
                  </p>
                )}

                {/* Final text (confirmed) */}
                {displayText && (
                  <p className="text-sm text-white leading-relaxed">
                    {displayText}
                  </p>
                )}

                {/* Placeholder when no text */}
                {!interimText && !displayText && (
                  <p className="text-xs text-gray-500 italic text-center">
                    En attente...
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(<MiniWindow />);
