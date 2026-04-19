"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Mic, Copy, Play, Pause, X, Sparkles, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { Transcription } from "@/hooks/useTranscriptionHistory";
import { useSettings } from "@/hooks/useSettings";
import { invoke } from "@tauri-apps/api/core";

interface TranscriptionDetailsProps {
  transcription: Transcription | null;
  onCopy: (text: string) => void;
  onClose: () => void;
}

export function TranscriptionDetails({
  transcription,
  onCopy,
  onClose,
}: TranscriptionDetailsProps) {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

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
  }, []);

  useEffect(() => {
    stopPlayback();
  }, [transcription?.id, stopPlayback]);

  useEffect(() => {
    if (!settings.enable_history_audio_preview) {
      stopPlayback();
    }
  }, [settings.enable_history_audio_preview, stopPlayback]);

  useEffect(() => {
    return () => {
      stopPlayback();
    };
  }, [stopPlayback]);

  const handleListen = useCallback(async () => {
    if (!transcription?.audioPath) {
      alert(t('transcriptionDetails.noAudio'));
      return;
    }

    if (!settings.enable_history_audio_preview) {
      alert(t('transcriptionDetails.previewDisabled'));
      return;
    }

    if (isPlaying) {
      stopPlayback();
      return;
    }

    try {
      if (audioRef.current) {
        stopPlayback();
      }

      setIsLoading(true);

      const normalizedPath = transcription.audioPath.replace(/\\/g, "/");
      const rawData = await invoke<Uint8Array | number[]>("load_recording", {
        audioPath: normalizedPath,
      });
      const bytes =
        rawData instanceof Uint8Array ? rawData : new Uint8Array(rawData);
      if (!bytes || bytes.length === 0) {
        throw new Error("Empty audio file");
      }

      const audioBlob = new Blob([bytes], { type: "audio/wav" });
      const objectUrl = URL.createObjectURL(audioBlob);
      objectUrlRef.current = objectUrl;

      const audio = new Audio(objectUrl);
      audioRef.current = audio;

      audio.onended = () => {
        setIsPlaying(false);
        audioRef.current = null;
        if (objectUrlRef.current) {
          URL.revokeObjectURL(objectUrlRef.current);
          objectUrlRef.current = null;
        }
      };

      audio.onerror = () => {
        console.error("Audio playback error");
        alert(t('transcriptionDetails.playbackError'));
        stopPlayback();
      };

      await audio.play();
      setIsPlaying(true);
    } catch (error: unknown) {
      console.error("Failed to play audio preview:", error);
      alert(t('transcriptionDetails.playbackError'));
      stopPlayback();
    } finally {
      setIsLoading(false);
    }
  }, [
    transcription,
    settings.enable_history_audio_preview,
    isPlaying,
    stopPlayback,
    t,
  ]);

  const canListen =
    Boolean(transcription?.audioPath) && settings.enable_history_audio_preview;

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-foreground">{t('transcriptionDetails.details')}</h3>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Fermer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      {transcription ? (
        <div className="space-y-4">
          <div>
            <p className="text-xs text-muted-foreground mb-1">{t('transcriptionDetails.dateTime')}</p>
            <p className="text-sm font-mono text-foreground">
              {transcription.date} {transcription.time}
            </p>
          </div>
          {transcription.apiCost !== undefined && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">{t('transcriptionDetails.cost')}</p>
              <p className="text-sm font-mono text-foreground">
                {transcription.apiCost === 0 ? t('transcriptionDetails.free') : `$${transcription.apiCost.toFixed(4)} USD`}
              </p>
            </div>
          )}
          {transcription.originalText && (
            <details className="group rounded-lg border border-violet-500/30 bg-violet-500/5">
              <summary className="flex items-center gap-2 px-3 py-2 cursor-pointer list-none select-none">
                <Sparkles className="w-3.5 h-3.5 text-violet-400" aria-hidden="true" />
                <span className="text-xs font-medium text-violet-300">
                  {t('transcriptionDetails.postProcessTitle')}
                </span>
                {transcription.postProcessMode && (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-200 border border-violet-500/30">
                    {t(
                      `settings.postProcess.modes.${transcription.postProcessMode}.label`,
                      { defaultValue: transcription.postProcessMode },
                    )}
                  </span>
                )}
                <ChevronDown className="ml-auto w-3.5 h-3.5 text-violet-400 transition-transform group-open:rotate-180" aria-hidden="true" />
              </summary>
              <div className="px-3 pb-3 pt-1 space-y-2">
                <p className="text-[11px] text-muted-foreground">
                  {t('transcriptionDetails.originalHint')}
                </p>
                <p className="text-sm text-foreground/80 leading-relaxed bg-background/60 p-3 rounded border border-border/50 whitespace-pre-wrap">
                  {transcription.originalText}
                </p>
              </div>
            </details>
          )}
          <div>
            <p className="text-xs text-muted-foreground mb-2">
              {transcription.originalText
                ? t('transcriptionDetails.transcriptionFinal')
                : t('transcriptionDetails.transcription')}
            </p>
            <p className="text-sm text-foreground leading-relaxed bg-muted/50 p-4 rounded-lg whitespace-pre-wrap">
              {transcription.text}
            </p>
          </div>
          <div className="flex flex-row gap-2 pt-4">
            <Button
              onClick={() => onCopy(transcription.text)}
              className="flex-1 cursor-pointer dark:hover:border-blue-800"
            >
              <Copy className="w-4 h-4 mr-2" />
              {t('transcriptionDetails.copy')}
            </Button>
            <Button
              variant="outline"
              className="flex-1 bg-transparent"
              onClick={handleListen}
              disabled={!canListen || isLoading}
            >
              {isPlaying ? (
                <Pause className="w-4 h-4 mr-2" />
              ) : (
                <Play className="w-4 h-4 mr-2" />
              )}
              {isPlaying ? t('transcriptionDetails.stop') : t('transcriptionDetails.listen')}
            </Button>
            {transcription.audioPath &&
              !settings.enable_history_audio_preview && (
                <p className="text-xs text-muted-foreground">
                  {t('transcriptionDetails.previewDisabledHelp')}
                </p>
              )}
            {!transcription.audioPath && (
              <p className="text-xs text-muted-foreground">
                {t('transcriptionDetails.noAudioHelp')}
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="py-12 text-center">
          <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-3">
            <Mic className="w-6 h-6 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">
            {t('transcriptionDetails.emptyState')}
          </p>
        </div>
      )}
    </Card>
  );
}
