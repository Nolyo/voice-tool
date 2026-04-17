"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Mic, Copy, Play, Pause } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { Transcription } from "@/hooks/useTranscriptionHistory";
import { useSettings } from "@/hooks/useSettings";
import { invoke } from "@tauri-apps/api/core";

interface TranscriptionDetailsProps {
  transcription: Transcription | null;
  onCopy: (text: string) => void;
}

export function TranscriptionDetails({
  transcription,
  onCopy,
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
    <Card className="p-6 sticky top-24">
      <h3 className="text-sm font-semibold text-foreground mb-4">{t('transcriptionDetails.details')}</h3>
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
          <div>
            <p className="text-xs text-muted-foreground mb-2">{t('transcriptionDetails.transcription')}</p>
            <p className="text-sm text-foreground leading-relaxed bg-muted/50 p-4 rounded-lg">
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
