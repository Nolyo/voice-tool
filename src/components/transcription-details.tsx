"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
      alert("Aucun enregistrement audio associé à cette transcription.");
      return;
    }

    if (!settings.enable_history_audio_preview) {
      alert("La pré-écoute audio est désactivée dans les paramètres.");
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
        throw new Error("Fichier audio vide");
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
        alert("Impossible de lire l'audio.");
        stopPlayback();
      };

      await audio.play();
      setIsPlaying(true);
    } catch (error: unknown) {
      console.error("Failed to play audio preview:", error);
      alert("Impossible de lire l'audio.");
      stopPlayback();
    } finally {
      setIsLoading(false);
    }
  }, [
    transcription,
    settings.enable_history_audio_preview,
    isPlaying,
    stopPlayback,
  ]);

  const canListen =
    Boolean(transcription?.audioPath) && settings.enable_history_audio_preview;

  return (
    <Card className="p-6 sticky top-24">
      <h3 className="text-sm font-semibold text-foreground mb-4">Détails</h3>
      {transcription ? (
        <div className="space-y-4">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Date et heure</p>
            <p className="text-sm font-mono text-foreground">
              {transcription.date} {transcription.time}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-2">Transcription</p>
            <p className="text-sm text-foreground leading-relaxed bg-muted/50 p-4 rounded-lg">
              {transcription.text}
            </p>
          </div>
          <div className="flex flex-col gap-2 pt-4">
            <Button
              onClick={() => onCopy(transcription.text)}
              className="w-full cursor-pointer dark:hover:border-blue-800"
            >
              <Copy className="w-4 h-4 mr-2" />
              Copier
            </Button>
            <Button
              variant="outline"
              className="w-full bg-transparent"
              onClick={handleListen}
              disabled={!canListen || isLoading}
            >
              {isPlaying ? (
                <Pause className="w-4 h-4 mr-2" />
              ) : (
                <Play className="w-4 h-4 mr-2" />
              )}
              {isPlaying ? "Arrêter" : "Écouter"}
            </Button>
            {transcription.audioPath &&
              !settings.enable_history_audio_preview && (
                <p className="text-xs text-muted-foreground">
                  Pré-écoute désactivée dans les paramètres audio.
                </p>
              )}
            {!transcription.audioPath && (
              <p className="text-xs text-muted-foreground">
                Aucun audio sauvegardé pour cette transcription.
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
            Sélectionnez une transcription pour voir les détails
          </p>
        </div>
      )}
    </Card>
  );
}
