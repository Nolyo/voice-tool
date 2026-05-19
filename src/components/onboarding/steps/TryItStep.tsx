import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  ArrowLeft,
  ArrowRight,
  HardDrive,
  Mic,
  RotateCcw,
  Sparkles,
  Square,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSettings } from "@/hooks/useSettings";
import { getDemoDeviceId } from "@/lib/device-id";
import {
  DemoTranscribeError,
  submitDemoTranscription,
  type DemoErrorKind,
} from "@/lib/demo-transcribe";
import type { RecordingResult } from "@/lib/types";

const MAX_DURATION_SECONDS = 14;

type Phase =
  | { status: "idle" }
  | { status: "recording"; elapsed: number; audioLevel: number }
  | { status: "transcribing" }
  | { status: "success"; text: string }
  | { status: "error"; kind: DemoErrorKind };

interface TryItStepProps {
  onCloud: () => void;
  onLocal: () => void;
  onBack: () => void;
}

export function TryItStep({ onCloud, onLocal, onBack }: TryItStepProps) {
  const { t, i18n } = useTranslation("billing");
  const { settings } = useSettings();
  const [phase, setPhase] = useState<Phase>({ status: "idle" });
  const phaseRef = useRef(phase);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  // Audio level subscription — only active during the recording phase.
  useEffect(() => {
    if (phase.status !== "recording") return;
    let unlisten: UnlistenFn | null = null;
    let disposed = false;
    listen<number>("audio-level", (event) => {
      setPhase((p) =>
        p.status === "recording" ? { ...p, audioLevel: event.payload } : p,
      );
    }).then((fn) => {
      if (disposed) fn();
      else unlisten = fn;
    });
    return () => {
      disposed = true;
      if (unlisten) unlisten();
    };
  }, [phase.status]);

  // Timer + auto-stop at MAX_DURATION_SECONDS.
  useEffect(() => {
    if (phase.status !== "recording") return;
    const start = Date.now();
    const interval = window.setInterval(() => {
      const elapsedSeconds = (Date.now() - start) / 1000;
      if (elapsedSeconds >= MAX_DURATION_SECONDS) {
        window.clearInterval(interval);
        void stopAndTranscribe();
        return;
      }
      setPhase((p) =>
        p.status === "recording" ? { ...p, elapsed: elapsedSeconds } : p,
      );
    }, 100);
    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase.status === "recording"]);

  const handleStart = useCallback(async () => {
    try {
      await invoke("start_recording", {
        deviceIndex: settings.input_device_index ?? null,
      });
      setPhase({ status: "recording", elapsed: 0, audioLevel: 0 });
    } catch (err) {
      console.error("Demo recording start failed:", err);
      setPhase({ status: "error", kind: "unknown" });
    }
  }, [settings.input_device_index]);

  const stopAndTranscribe = useCallback(async () => {
    // Re-entrancy guard: if we already advanced past recording, skip.
    if (phaseRef.current.status !== "recording") return;
    setPhase({ status: "transcribing" });
    let result: RecordingResult;
    try {
      result = await invoke<RecordingResult>("stop_recording", {
        silenceThreshold: settings.silence_threshold ?? 0.01,
      });
    } catch (err) {
      console.error("Demo recording stop failed:", err);
      setPhase({ status: "error", kind: "unknown" });
      return;
    }
    if (result.is_silent || result.audio_data.length === 0) {
      setPhase({ status: "error", kind: "bad_request" });
      return;
    }
    try {
      const deviceId = await getDemoDeviceId();
      const samples = Int16Array.from(result.audio_data);
      const lang = i18n.resolvedLanguage?.slice(0, 2) ?? settings.language?.slice(0, 2);
      const { text } = await submitDemoTranscription({
        samples,
        sampleRate: result.sample_rate,
        deviceId,
        language: lang,
      });
      if (!text.trim()) {
        setPhase({ status: "error", kind: "bad_request" });
        return;
      }
      setPhase({ status: "success", text });
    } catch (err) {
      const kind = err instanceof DemoTranscribeError ? err.kind : "unknown";
      console.error("Demo transcription failed:", err);
      setPhase({ status: "error", kind });
    }
  }, [i18n.resolvedLanguage, settings.language, settings.silence_threshold]);

  const handleRetry = useCallback(() => {
    setPhase({ status: "idle" });
  }, []);

  // Best-effort cleanup: if the user dismisses while recording, stop the Rust
  // stream so we don't leak the microphone.
  useEffect(() => {
    return () => {
      if (phaseRef.current.status === "recording") {
        invoke("stop_recording", { silenceThreshold: 0 }).catch(() => {});
      }
    };
  }, []);

  return (
    <div className="vt-anim-fade-up flex flex-col gap-6">
      <div className="space-y-2 text-center">
        <h2
          className="vt-display text-2xl md:text-3xl font-semibold tracking-tight"
          style={{ color: "var(--vt-fg)" }}
        >
          {t("welcome.try.title")}
        </h2>
        <p className="text-sm" style={{ color: "var(--vt-fg-2)" }}>
          {t("welcome.try.subtitle")}
        </p>
      </div>

      <div
        className="flex min-h-[220px] flex-col items-center justify-center gap-4 rounded-xl border p-6"
        style={{
          background:
            "linear-gradient(135deg, oklch(from var(--vt-violet) l c h / 0.08), oklch(from var(--vt-accent) l c h / 0.04))",
          borderColor: "oklch(from var(--vt-violet) l c h / 0.25)",
        }}
      >
        {phase.status === "idle" && (
          <>
            <Button
              onClick={handleStart}
              size="lg"
              className="gap-2"
              style={{
                background: "var(--vt-violet)",
                color: "white",
              }}
            >
              <Mic className="h-4 w-4" />
              {t("welcome.try.cta_record")}
            </Button>
            <p className="text-xs" style={{ color: "var(--vt-fg-3)" }}>
              {t("welcome.try.max_duration_hint", { seconds: MAX_DURATION_SECONDS })}
            </p>
          </>
        )}

        {phase.status === "recording" && (
          <>
            <DemoBars level={phase.audioLevel} />
            <div className="flex flex-col items-center gap-1">
              <span
                className="text-sm font-medium"
                style={{ color: "var(--vt-violet)" }}
              >
                {t("welcome.try.recording_status")}
              </span>
              <span
                className="font-mono text-xs"
                style={{ color: "var(--vt-fg-3)" }}
              >
                {phase.elapsed.toFixed(1)}s / {MAX_DURATION_SECONDS}s
              </span>
            </div>
            <Button
              onClick={stopAndTranscribe}
              size="lg"
              variant="outline"
              className="gap-2"
            >
              <Square className="h-4 w-4" />
              {t("welcome.try.cta_stop")}
            </Button>
          </>
        )}

        {phase.status === "transcribing" && (
          <div className="flex flex-col items-center gap-3">
            <div
              className="h-10 w-10 animate-spin rounded-full border-2 border-current"
              style={{
                borderRightColor: "transparent",
                color: "var(--vt-violet)",
              }}
              aria-hidden
            />
            <span className="text-sm" style={{ color: "var(--vt-fg-2)" }}>
              {t("welcome.try.transcribing")}
            </span>
          </div>
        )}

        {phase.status === "success" && (
          <div className="flex w-full max-w-xl flex-col gap-3">
            <div className="flex items-center gap-2">
              <Sparkles
                className="h-4 w-4"
                style={{ color: "var(--vt-violet)" }}
              />
              <span
                className="text-xs font-semibold uppercase tracking-wide"
                style={{ color: "var(--vt-violet)" }}
              >
                {t("welcome.try.result_label")}
              </span>
            </div>
            <blockquote
              className="rounded-lg border px-4 py-3 text-base leading-relaxed"
              style={{
                background: "var(--vt-panel-2)",
                borderColor: "oklch(from var(--vt-violet) l c h / 0.35)",
                color: "var(--vt-fg)",
              }}
            >
              {phase.text}
            </blockquote>
            <p
              className="text-center text-xs italic"
              style={{ color: "var(--vt-fg-3)" }}
            >
              {t("welcome.try.result_sparkle")}
            </p>
          </div>
        )}

        {phase.status === "error" && <DemoError kind={phase.kind} />}
      </div>

      {/* Footer actions — different layouts depending on phase. */}
      {phase.status === "idle" && (
        <div className="flex items-center justify-between gap-3">
          <Button variant="ghost" onClick={onBack} className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            {t("welcome.try.cta_back")}
          </Button>
        </div>
      )}

      {phase.status === "success" && (
        <div className="flex flex-col gap-3">
          <Button
            onClick={onCloud}
            size="lg"
            className="w-full justify-center gap-2"
            style={{ background: "var(--vt-violet)", color: "white" }}
          >
            {t("welcome.try.cta_signup")}
            <ArrowRight className="h-4 w-4" />
          </Button>
          <span
            className="text-center text-xs"
            style={{ color: "var(--vt-fg-3)" }}
          >
            {t("welcome.try.cta_signup_subtitle")}
          </span>
          <div className="flex justify-center">
            <button
              type="button"
              onClick={onLocal}
              className="inline-flex items-center gap-1 text-sm underline-offset-4 hover:underline"
              style={{ color: "var(--vt-fg-3)" }}
            >
              <HardDrive className="h-3.5 w-3.5" />
              {t("welcome.try.cta_local")}
            </button>
          </div>
        </div>
      )}

      {phase.status === "error" && (
        <div className="flex flex-col gap-3">
          {/* When rate-limited, push hard for signup — that's the entire point.
              Local stays available as a fallback for users who never want cloud. */}
          {phase.kind === "rate_limited" ? (
            <>
              <Button
                onClick={onCloud}
                size="lg"
                className="w-full justify-center gap-2"
                style={{ background: "var(--vt-violet)", color: "white" }}
              >
                {t("welcome.try.cta_signup")}
                <ArrowRight className="h-4 w-4" />
              </Button>
              <button
                type="button"
                onClick={onLocal}
                className="inline-flex items-center justify-center gap-1 text-center text-sm underline-offset-4 hover:underline"
                style={{ color: "var(--vt-fg-3)" }}
              >
                <HardDrive className="h-3.5 w-3.5" />
                {t("welcome.try.cta_local")}
              </button>
            </>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <Button variant="ghost" onClick={onBack} className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                {t("welcome.try.cta_back")}
              </Button>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={onLocal}
                  className="inline-flex items-center gap-1 text-sm underline-offset-4 hover:underline"
                  style={{ color: "var(--vt-fg-3)" }}
                >
                  <HardDrive className="h-3.5 w-3.5" />
                  {t("welcome.try.cta_local")}
                </button>
                <Button onClick={handleRetry} variant="outline" className="gap-2">
                  <RotateCcw className="h-4 w-4" />
                  {t("welcome.try.cta_retry")}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DemoBars({ level }: { level: number }) {
  // 12 bars whose heights are derived from the live audio-level (0..1).
  const bars = Array.from({ length: 12 });
  return (
    <div className="flex h-12 items-end gap-1">
      {bars.map((_, i) => {
        // Distance from center → bars near the middle react more.
        const distFromCenter = Math.abs(i - 5.5) / 5.5;
        const reactivity = 1 - distFromCenter * 0.6;
        const height = 6 + Math.min(level * reactivity * 80, 38);
        return (
          <span
            key={i}
            className="inline-block rounded-full transition-[height] duration-75"
            style={{
              width: "4px",
              height: `${height}px`,
              background: "var(--vt-violet)",
              opacity: 0.5 + Math.min(level, 0.5),
            }}
          />
        );
      })}
    </div>
  );
}

function DemoError({ kind }: { kind: DemoErrorKind }) {
  const { t } = useTranslation("billing");
  const titleKey = (() => {
    switch (kind) {
      case "rate_limited":
        return "welcome.try.error.rate_limited_title";
      case "bad_request":
        return "welcome.try.error.no_audio_title";
      case "network":
        return "welcome.try.error.network_title";
      default:
        return "welcome.try.error.unknown_title";
    }
  })();
  const bodyKey = (() => {
    switch (kind) {
      case "rate_limited":
        return "welcome.try.error.rate_limited_body";
      case "bad_request":
        return "welcome.try.error.no_audio_body";
      case "network":
        return "welcome.try.error.network_body";
      default:
        return "welcome.try.error.unknown_body";
    }
  })();
  return (
    <div className="flex max-w-md flex-col items-center gap-2 text-center">
      <h3
        className="text-base font-semibold"
        style={{ color: "var(--vt-fg)" }}
      >
        {t(titleKey)}
      </h3>
      <p className="text-sm" style={{ color: "var(--vt-fg-2)" }}>
        {t(bodyKey)}
      </p>
    </div>
  );
}
