"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Mic,
  Copy,
  Play,
  Pause,
  X,
  ArrowLeft,
  Sparkles,
  Download,
  Trash2,
  Loader2,
  ChevronRight,
} from "lucide-react";
import type { Transcription } from "@/hooks/useTranscriptionHistory";
import { useSettings } from "@/hooks/useSettings";
import { invoke } from "@tauri-apps/api/core";

interface TranscriptionDetailsProps {
  transcription: Transcription | null;
  onCopy: (text: string) => void;
  onClose: () => void;
  onDelete?: (id: string) => void;
  compact?: boolean;
}

const DAY_NAMES = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

function parseAt(t: Transcription): Date {
  const iso = `${t.date}T${t.time}`;
  const d = new Date(iso);
  if (!Number.isNaN(d.getTime())) return d;
  return new Date(`${t.date} ${t.time}`);
}

function dayLabel(d: Date): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dd = new Date(d);
  dd.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - dd.getTime()) / 86400000);
  if (diff === 0) return "Aujourd'hui";
  if (diff === 1) return "Hier";
  if (diff < 7 && diff > 0) return DAY_NAMES[dd.getDay()];
  return `${dd.getDate()} ${MONTHS[dd.getMonth()]}`;
}

function timeFmt(d: Date): string {
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

function durFmt(s?: number): string {
  if (!s || s <= 0) return "—";
  if (s < 60) return `${Math.round(s)}s`;
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return `${m}m ${String(r).padStart(2, "0")}s`;
}

function wordsOf(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

/* ── Waveform (placeholder bars; progress driven by actual audio) ───── */
function Waveform({
  progress,
  accent,
}: {
  progress: number;
  accent: string;
}) {
  const bars = useMemo(
    () => Array.from({ length: 56 }, () => Math.random() * 0.8 + 0.2),
    [],
  );

  return (
    <div className="flex items-end gap-[2px] h-10 overflow-hidden">
      {bars.map((v, i) => {
        const played = i / bars.length < progress;
        return (
          <div
            key={i}
            className="wave-bar"
            style={{
              width: 3,
              height: Math.max(4, v * 38),
              background: played
                ? accent
                : `oklch(from ${accent} l c h / 0.22)`,
              transition: "background 120ms linear",
            }}
          />
        );
      })}
    </div>
  );
}

export function TranscriptionDetails({
  transcription,
  onCopy,
  onClose,
  onDelete,
  compact = false,
}: TranscriptionDetailsProps) {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const [playbackProgress, setPlaybackProgress] = useState(0);

  const stopPlayback = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setIsPlaying(false);
    setIsLoading(false);
    setPlaybackProgress(0);
  }, []);

  useEffect(() => {
    stopPlayback();
    setShowOriginal(false);
  }, [transcription?.id, stopPlayback]);

  useEffect(() => {
    if (!settings.enable_history_audio_preview) stopPlayback();
  }, [settings.enable_history_audio_preview, stopPlayback]);

  useEffect(() => {
    return () => stopPlayback();
  }, [stopPlayback]);

  const handleListen = useCallback(async () => {
    if (!transcription?.audioPath) {
      alert(t("transcriptionDetails.noAudio"));
      return;
    }
    if (!settings.enable_history_audio_preview) {
      alert(t("transcriptionDetails.previewDisabled"));
      return;
    }
    if (isPlaying) {
      stopPlayback();
      return;
    }
    try {
      if (audioRef.current) stopPlayback();
      setIsLoading(true);

      const normalizedPath = transcription.audioPath.replace(/\\/g, "/");
      const rawData = await invoke<Uint8Array | number[]>("load_recording", {
        audioPath: normalizedPath,
      });
      const bytes = rawData instanceof Uint8Array ? rawData : new Uint8Array(rawData);
      if (!bytes || bytes.length === 0) throw new Error("Empty audio file");

      const audioBlob = new Blob([bytes], { type: "audio/wav" });
      const objectUrl = URL.createObjectURL(audioBlob);
      objectUrlRef.current = objectUrl;

      const audio = new Audio(objectUrl);
      audioRef.current = audio;

      audio.ontimeupdate = () => {
        const total = audio.duration;
        if (!Number.isFinite(total) || total <= 0) return;
        setPlaybackProgress(Math.min(1, audio.currentTime / total));
      };

      audio.onended = () => {
        setPlaybackProgress(1);
        setIsPlaying(false);
        audioRef.current = null;
        if (objectUrlRef.current) {
          URL.revokeObjectURL(objectUrlRef.current);
          objectUrlRef.current = null;
        }
      };

      audio.onerror = () => {
        console.error("Audio playback error");
        alert(t("transcriptionDetails.playbackError"));
        stopPlayback();
      };

      setPlaybackProgress(0);
      await audio.play();
      setIsPlaying(true);
    } catch (error: unknown) {
      console.error("Failed to play audio preview:", error);
      alert(t("transcriptionDetails.playbackError"));
      stopPlayback();
    } finally {
      setIsLoading(false);
    }
  }, [transcription, settings.enable_history_audio_preview, isPlaying, stopPlayback, t]);

  if (!transcription) {
    return (
      <div
        className="vt-card-sectioned p-10 text-center flex flex-col items-center gap-3 relative"
        style={{ minHeight: 400 }}
      >
        {compact && (
          <button
            type="button"
            onClick={onClose}
            className="absolute top-3 left-3 inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[12px] vt-hover-bg"
            style={{ color: "var(--vt-fg-3)" }}
            aria-label={t("transcriptionDetails.backToList", {
              defaultValue: "Retour à la liste",
            })}
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            {t("transcriptionDetails.back", { defaultValue: "Retour" })}
          </button>
        )}
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center"
          style={{ background: "var(--vt-hover)", color: "var(--vt-fg-4)" }}
        >
          <Mic className="w-5 h-5" />
        </div>
        <div>
          <div className="text-[13.5px] font-medium">
            {t("transcriptionDetails.emptyState")}
          </div>
          <div
            className="text-[12px] mt-1"
            style={{ color: "var(--vt-fg-3)" }}
          >
            Clique sur un élément de la chronologie pour l'ouvrir.
          </div>
        </div>
      </div>
    );
  }

  const at = parseAt(transcription);
  const postProcess = Boolean(transcription.originalText);
  const accent = postProcess ? "oklch(0.72 0.17 295)" : "var(--vt-accent)";
  const durationSec = transcription.duration ?? 0;
  const canListen =
    Boolean(transcription.audioPath) && settings.enable_history_audio_preview;
  const totalCost =
    (transcription.apiCost ?? 0) + (transcription.postProcessCost ?? 0);
  const words = wordsOf(transcription.text);
  const wpm = durationSec > 0 ? Math.round(words / (durationSec / 60)) : 0;

  return (
    <div className="vt-card-sectioned vt-fade-up overflow-hidden" key={transcription.id}>
      {/* Header */}
      <div
        className="flex items-start gap-3 px-5 pt-5 pb-4"
        style={{ borderBottom: "1px solid var(--vt-border)" }}
      >
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
          style={{
            background: `oklch(from ${accent} l c h / 0.15)`,
            color: accent,
            boxShadow: `inset 0 0 0 1px oklch(from ${accent} l c h / 0.3)`,
          }}
        >
          {postProcess ? (
            <Sparkles className="w-4 h-4" />
          ) : (
            <Mic className="w-4 h-4" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-[14.5px] font-semibold tracking-tight">
              {dayLabel(at)} · {timeFmt(at)}
            </h2>
            <span
              className="vt-mono text-[10.5px] px-1.5 py-0.5 rounded"
              style={{
                background: "var(--vt-hover)",
                border: "1px solid var(--vt-border)",
                color: "var(--vt-fg-3)",
              }}
            >
              {transcription.id.slice(0, 6).toUpperCase()}
            </span>
          </div>
          <div
            className="flex items-center gap-3 mt-1 text-[11.5px] flex-wrap"
            style={{ color: "var(--vt-fg-3)" }}
          >
            <span className="inline-flex items-center gap-1.5">
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{
                  background: "var(--vt-accent)",
                  boxShadow: "0 0 6px var(--vt-accent)",
                }}
              />
              Whisper
            </span>
            {durationSec > 0 && (
              <>
                <span>·</span>
                <span className="vt-mono">{durFmt(durationSec)}</span>
              </>
            )}
            {postProcess && transcription.postProcessMode && (
              <>
                <span>·</span>
                <span
                  className="vt-mono text-[10.5px] px-1.5 py-0.5 rounded"
                  style={{
                    background: "oklch(0.72 0.17 295 / 0.16)",
                    color: "oklch(0.78 0.15 295)",
                  }}
                >
                  {t(
                    `settings.postProcess.modes.${transcription.postProcessMode}.label`,
                    { defaultValue: transcription.postProcessMode },
                  )}
                </span>
              </>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className={
            compact
              ? "inline-flex items-center gap-1.5 px-2 h-7 rounded-md text-[12px] vt-hover-bg"
              : "w-7 h-7 rounded-md flex items-center justify-center vt-hover-bg"
          }
          style={{ color: "var(--vt-fg-3)" }}
          aria-label={
            compact
              ? t("transcriptionDetails.backToList", {
                  defaultValue: "Retour à la liste",
                })
              : "Fermer"
          }
        >
          {compact ? (
            <>
              <ArrowLeft className="w-3.5 h-3.5" />
              {t("transcriptionDetails.back", { defaultValue: "Retour" })}
            </>
          ) : (
            <X className="w-3.5 h-3.5" />
          )}
        </button>
      </div>

      {/* Waveform player */}
      {transcription.audioPath && (
        <div
          className="px-5 py-4 flex items-center gap-4"
          style={{ borderBottom: "1px solid var(--vt-border)" }}
        >
          <button
            type="button"
            onClick={handleListen}
            disabled={!canListen || isLoading}
            className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition"
            style={{
              background: isPlaying
                ? "var(--vt-accent)"
                : "oklch(from var(--vt-accent) l c h / 0.15)",
              color: isPlaying ? "white" : "var(--vt-accent-2)",
              border: "1px solid oklch(from var(--vt-accent) l c h / 0.35)",
              opacity: !canListen || isLoading ? 0.5 : 1,
              cursor: !canListen || isLoading ? "not-allowed" : "pointer",
            }}
            aria-label={isPlaying ? t("transcriptionDetails.stop") : t("transcriptionDetails.listen")}
          >
            {isLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : isPlaying ? (
              <Pause className="w-3.5 h-3.5" />
            ) : (
              <Play className="w-3.5 h-3.5 ml-0.5" />
            )}
          </button>
          <div className="flex-1 min-w-0">
            <Waveform progress={playbackProgress} accent="var(--vt-accent)" />
          </div>
          <span
            className="vt-mono text-[11px]"
            style={{ color: "var(--vt-fg-4)" }}
          >
            {durFmt(durationSec)}
          </span>
        </div>
      )}

      {/* Metrics */}
      <div
        className="px-5 py-3 grid grid-cols-3 gap-3"
        style={{ borderBottom: "1px solid var(--vt-border)" }}
      >
        <div>
          <div
            className="text-[10.5px] uppercase tracking-wider"
            style={{ color: "var(--vt-fg-4)" }}
          >
            Mots
          </div>
          <div className="text-[16px] font-semibold vt-mono mt-0.5">{words}</div>
        </div>
        <div>
          <div
            className="text-[10.5px] uppercase tracking-wider"
            style={{ color: "var(--vt-fg-4)" }}
          >
            Débit
          </div>
          <div className="text-[16px] font-semibold vt-mono mt-0.5">
            {wpm > 0 ? (
              <>
                {wpm}
                <span
                  className="text-[11px] font-normal ml-1"
                  style={{ color: "var(--vt-fg-4)" }}
                >
                  mpm
                </span>
              </>
            ) : (
              "—"
            )}
          </div>
        </div>
        <div>
          <div
            className="text-[10.5px] uppercase tracking-wider"
            style={{ color: "var(--vt-fg-4)" }}
          >
            {t("transcriptionDetails.cost")}
          </div>
          <div className="text-[16px] font-semibold vt-mono mt-0.5">
            {totalCost > 0 ? `$${totalCost.toFixed(4)}` : t("transcriptionDetails.free")}
          </div>
        </div>
      </div>

      {/* Post-process banner + original text */}
      {postProcess && (
        <details
          className="vt-details"
          style={{ borderBottom: "1px solid var(--vt-border)" }}
          open={showOriginal}
        >
          <summary
            onClick={(e) => {
              e.preventDefault();
              setShowOriginal((v) => !v);
            }}
            className="flex items-center gap-2.5 px-5 py-2.5 vt-trace"
            style={{ background: "oklch(0.72 0.17 295 / 0.06)" }}
          >
            <span
              className="w-5 h-5 rounded-md flex items-center justify-center"
              style={{
                background: "oklch(0.72 0.17 295 / 0.18)",
                color: "oklch(0.72 0.17 295)",
              }}
            >
              <Sparkles className="w-3 h-3" />
            </span>
            <span
              className="text-[12px] font-medium"
              style={{ color: "oklch(0.72 0.17 295)" }}
            >
              {t("transcriptionDetails.postProcessTitle")}
              {transcription.postProcessMode && (
                <>
                  {" · "}
                  {t(`settings.postProcess.modes.${transcription.postProcessMode}.label`, {
                    defaultValue: transcription.postProcessMode,
                  })}
                </>
              )}
            </span>
            <span
              className="vt-chev ml-auto"
              style={{ color: "oklch(0.72 0.17 295)" }}
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </span>
          </summary>
          {transcription.originalText && (
            <div
              className="px-5 py-3"
              style={{ background: "oklch(0.72 0.17 295 / 0.03)" }}
            >
              <div
                className="text-[10.5px] uppercase tracking-wider mb-1.5"
                style={{ color: "var(--vt-fg-4)" }}
              >
                {t("transcriptionDetails.originalHint").replace(":", "")}
              </div>
              <p
                className="text-[12.5px] leading-relaxed italic"
                style={{ color: "var(--vt-fg-2)" }}
              >
                « {transcription.originalText} »
              </p>
            </div>
          )}
        </details>
      )}

      {/* Transcript */}
      <div
        className="px-5 py-4"
        style={{ borderBottom: "1px solid var(--vt-border)" }}
      >
        <div className="flex items-center justify-between mb-2">
          <div
            className="text-[10.5px] uppercase tracking-wider"
            style={{ color: "var(--vt-fg-4)" }}
          >
            {postProcess
              ? t("transcriptionDetails.transcriptionFinal")
              : t("transcriptionDetails.transcription")}
          </div>
          <div
            className="text-[10.5px] vt-mono"
            style={{ color: "var(--vt-fg-4)" }}
          >
            {words} {words === 1 ? "mot" : "mots"}
          </div>
        </div>
        <p
          className="text-[13.5px] leading-relaxed whitespace-pre-wrap"
          style={{ color: "var(--vt-fg)" }}
        >
          {transcription.text}
        </p>

        {transcription.apiCost !== undefined &&
          transcription.postProcessCost !== undefined && (
            <div
              className="mt-4 pt-3 text-[11px] vt-mono space-y-0.5"
              style={{
                borderTop: "1px dashed var(--vt-border)",
                color: "var(--vt-fg-3)",
              }}
            >
              <div className="flex justify-between">
                <span>{t("transcriptionDetails.costWhisper")}</span>
                <span>
                  {transcription.apiCost === 0
                    ? t("transcriptionDetails.free")
                    : `$${transcription.apiCost.toFixed(5)}`}
                </span>
              </div>
              <div className="flex justify-between" style={{ color: "oklch(0.72 0.17 295)" }}>
                <span>{t("transcriptionDetails.costPostProcess")}</span>
                <span>${transcription.postProcessCost.toFixed(5)}</span>
              </div>
            </div>
          )}
      </div>

      {/* Actions */}
      <div className="px-5 py-3 flex items-center gap-2 flex-wrap">
        <button
          type="button"
          className="vt-btn-primary"
          onClick={() => onCopy(transcription.text)}
        >
          <Copy className="w-3.5 h-3.5" />
          {t("transcriptionDetails.copy")}
        </button>
        <button
          type="button"
          className="vt-btn"
          disabled
          data-tip="Export (bientôt)"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Exporter</span>
        </button>
        {onDelete && (
          <button
            type="button"
            className="vt-btn vt-btn-danger"
            style={{ marginLeft: "auto" }}
            onClick={() => {
              if (confirm(t("history.deleteConfirm"))) {
                onDelete(transcription.id);
              }
            }}
            aria-label={t("history.deleteConfirm")}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {!transcription.audioPath && (
        <div
          className="px-5 py-2 text-[11px]"
          style={{
            color: "var(--vt-fg-4)",
            borderTop: "1px solid var(--vt-border)",
          }}
        >
          {t("transcriptionDetails.noAudioHelp")}
        </div>
      )}
      {transcription.audioPath && !settings.enable_history_audio_preview && (
        <div
          className="px-5 py-2 text-[11px]"
          style={{
            color: "var(--vt-fg-4)",
            borderTop: "1px solid var(--vt-border)",
          }}
        >
          {t("transcriptionDetails.previewDisabledHelp")}
        </div>
      )}
    </div>
  );
}
