"use client";

import { useCallback, useEffect, useState } from "react";
import { Mic, Settings, Minus, Plus, Keyboard, RefreshCw } from "lucide-react";
import { Label } from "./ui/label";
import { Checkbox } from "./ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { useSettings } from "@/hooks/useSettings";
import { useAudioDevices } from "@/hooks/useAudioDevices";
import { ApiConfigDialog } from "./api-config-dialog";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { invoke } from "@tauri-apps/api/core";

const MODIFIER_KEYS = new Set(["Shift", "Control", "Alt", "Meta"]);

const isMacPlatform = () =>
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

function normalizeKey(key: string): string | null {
  if (!key || key === "Unidentified" || key.toLowerCase() === "dead") {
    return null;
  }

  if (key === " ") {
    return "Space";
  }

  if (key.length === 1) {
    return key.toUpperCase();
  }

  return key;
}

function buildShortcutFromEvent(event: KeyboardEvent): string | null {
  if (MODIFIER_KEYS.has(event.key)) {
    return null;
  }

  const parts: string[] = [];
  if (event.ctrlKey) {
    parts.push("Ctrl");
  }
  if (event.altKey) {
    parts.push("Alt");
  }
  if (event.shiftKey) {
    parts.push("Shift");
  }
  if (event.metaKey) {
    parts.push(isMacPlatform() ? "Cmd" : "Super");
  }

  const key = normalizeKey(event.key);
  if (!key) {
    return null;
  }

  parts.push(key);
  return parts.join("+");
}

function formatShortcutDisplay(value?: string) {
  if (!value) {
    return "Aucun";
  }
  return value
    .split("+")
    .map((token) => token.trim())
    .filter(Boolean)
    .join(" + ");
}

type HotkeyInputProps = {
  id: string;
  label: string;
  value: string;
  defaultValue: string;
  description?: string;
  onChange: (shortcut: string) => Promise<void>;
};

function HotkeyInput({
  id,
  label,
  value,
  defaultValue,
  description,
  onChange,
}: HotkeyInputProps) {
  const [isListening, setIsListening] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isListening) {
      return;
    }

    const handler = async (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();

      if (event.key === "Escape") {
        setIsListening(false);
        setError(null);
        return;
      }

      const shortcut = buildShortcutFromEvent(event);
      if (!shortcut) {
        return;
      }

      if (value && value.toLowerCase() === shortcut.toLowerCase()) {
        setIsListening(false);
        setError(null);
        return;
      }

      setIsSaving(true);
      try {
        await onChange(shortcut);
        setError(null);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
      } finally {
        setIsSaving(false);
        setIsListening(false);
      }
    };

    window.addEventListener("keydown", handler, true);
    return () => {
      window.removeEventListener("keydown", handler, true);
    };
  }, [isListening, onChange, value]);

  const handleReset = useCallback(async () => {
    if (!defaultValue || value.toLowerCase() === defaultValue.toLowerCase()) {
      return;
    }
    setIsSaving(true);
    try {
      await onChange(defaultValue);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setIsSaving(false);
      setIsListening(false);
    }
  }, [defaultValue, onChange, value]);

  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-sm text-foreground">
        {label}
      </Label>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          id={id}
          variant={isListening ? "default" : "outline"}
          onClick={() => {
            if (isSaving) return;
            setError(null);
            setIsListening((prev) => !prev);
          }}
          disabled={isSaving}
          className="flex-1 justify-start font-mono min-w-0"
        >
          {isListening
            ? "Appuyez sur une combinaison... (Échap pour annuler)"
            : formatShortcutDisplay(value)}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleReset}
          disabled={isSaving || value.toLowerCase() === defaultValue.toLowerCase()}
          className="flex-shrink-0"
        >
          Réinitialiser
        </Button>
      </div>
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : isListening ? (
        <p className="text-xs text-muted-foreground">
          Appuyez sur la combinaison souhaitée, ou Échap pour annuler.
        </p>
      ) : description ? (
        <p className="text-xs text-muted-foreground">{description}</p>
      ) : null}
    </div>
  );
}

export function SettingTabs() {
  const { settings, isLoaded, updateSetting } = useSettings();
  const { devices, isLoading: devicesLoading, error: devicesError, refresh } = useAudioDevices();

  const handleHotkeyChange = useCallback(
    async (
      key: "record_hotkey" | "ptt_hotkey" | "open_window_hotkey",
      shortcut: string,
    ) => {
      const normalized = shortcut
        .split("+")
        .map((token) => token.trim())
        .filter(Boolean)
        .join("+");

      if (!normalized) {
        throw new Error("Le raccourci ne peut pas être vide.");
      }

      const currentValue = settings[key];
      if (
        currentValue &&
        currentValue.toLowerCase() === normalized.toLowerCase()
      ) {
        return;
      }

      await invoke("update_hotkeys", {
        recordHotkey:
          key === "record_hotkey" ? normalized : settings.record_hotkey,
        pttHotkey: key === "ptt_hotkey" ? normalized : settings.ptt_hotkey,
        openWindowHotkey:
          key === "open_window_hotkey"
            ? normalized
            : settings.open_window_hotkey,
      });

      await updateSetting(key, normalized);
    },
    [settings, updateSetting],
  );

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Chargement des paramètres...</p>
      </div>
    );
  }
  return (
    <div className="space-y-6 max-h-[600px] overflow-y-auto pr-2">
      {/* Audio Section */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Mic className="w-4 h-4 text-primary" />
          </div>
          <h3 className="text-sm font-semibold text-foreground">Audio</h3>
        </div>

        <div className="space-y-4 pl-10">
          <div className="flex items-center space-x-3">
            <Checkbox
              id="interface-sounds"
              checked={settings.enable_sounds}
              onCheckedChange={(checked) =>
                updateSetting("enable_sounds", checked as boolean)
              }
            />
            <Label
              htmlFor="interface-sounds"
              className="text-sm text-foreground cursor-pointer"
            >
              Activer les sons d'interface
            </Label>
          </div>

          <div className="flex items-center space-x-3">
            <Checkbox
              id="show-listen"
              checked={settings.enable_history_audio_preview}
              onCheckedChange={(checked) =>
                updateSetting("enable_history_audio_preview", checked as boolean)
              }
            />
            <Label
              htmlFor="show-listen"
              className="text-sm text-foreground cursor-pointer"
            >
              Afficher le bouton Écouter dans l'historique
            </Label>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="microphone" className="text-sm text-foreground">
                Microphone d'entrée
              </Label>
              <Button
                variant="ghost"
                size="sm"
                onClick={refresh}
                disabled={devicesLoading}
                className="h-6 px-2"
              >
                <RefreshCw className={`w-3 h-3 ${devicesLoading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
            <Select
              value={settings.input_device_index?.toString() ?? "null"}
              onValueChange={(value) =>
                updateSetting("input_device_index", value === "null" ? null : Number.parseInt(value))
              }
              disabled={devicesLoading || !!devicesError}
            >
              <SelectTrigger id="microphone">
                <SelectValue placeholder={
                  devicesLoading ? "Chargement..." :
                  devicesError ? "Erreur de chargement" :
                  "Sélectionner un microphone"
                } />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="null">Par défaut (Système)</SelectItem>
                {devices.map((device) => (
                  <SelectItem key={device.index} value={device.index.toString()}>
                    {device.name} {device.is_default ? "(par défaut)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {devicesError && (
              <p className="text-xs text-destructive">
                Erreur : {devicesError}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Transcription Service Section */}
      <div className="space-y-4 pt-6 border-t border-border">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Settings className="w-4 h-4 text-primary" />
          </div>
          <h3 className="text-sm font-semibold text-foreground">
            Service de Transcription
          </h3>
        </div>

        <div className="space-y-4 pl-10">
          <div className="space-y-2">
            <Label
              htmlFor="service-provider"
              className="text-sm text-foreground"
            >
              Fournisseur de service
            </Label>
            <Select
              value={settings.transcription_provider}
              onValueChange={(value) =>
                updateSetting("transcription_provider", value as "OpenAI" | "Deepgram" | "Google")
              }
            >
              <SelectTrigger id="service-provider">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Deepgram">Deepgram (Streaming)</SelectItem>
                <SelectItem value="Google">
                  Google Speech-to-Text
                </SelectItem>
                <SelectItem value="OpenAI">OpenAI Whisper</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="language" className="text-sm text-foreground">
              Langue de transcription
            </Label>
            <Select
              value={settings.language}
              onValueChange={(value) =>
                updateSetting("language", value)
              }
            >
              <SelectTrigger id="language">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fr-FR">Français</SelectItem>
                <SelectItem value="en-US">English</SelectItem>
                <SelectItem value="es-ES">Español</SelectItem>
                <SelectItem value="de-DE">Deutsch</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <ApiConfigDialog />
        </div>
      </div>

      {/* Text Section */}
      <div className="space-y-4 pt-6 border-t border-border">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <span className="text-sm font-semibold text-primary">T</span>
          </div>
          <h3 className="text-sm font-semibold text-foreground">Texte</h3>
        </div>

        <div className="space-y-4 pl-10">
          <div className="flex items-start space-x-3">
            <Checkbox
              id="auto-insert"
              checked={settings.paste_at_cursor}
              onCheckedChange={(checked) =>
                updateSetting("paste_at_cursor", checked as boolean)
              }
              className="mt-1"
            />
            <Label
              htmlFor="auto-insert"
              className="text-sm text-foreground cursor-pointer leading-relaxed"
            >
              Insérer automatiquement au curseur après la transcription / copie
              depuis l'historique
            </Label>
          </div>

          <div className="flex items-start space-x-3">
            <Checkbox
              id="smart-formatting"
              checked={settings.smart_formatting}
              onCheckedChange={(checked) =>
                updateSetting("smart_formatting", checked as boolean)
              }
              className="mt-1"
            />
            <Label
              htmlFor="smart-formatting"
              className="text-sm text-foreground cursor-pointer leading-relaxed"
            >
              Activer le formatage intelligent (ponctuation, majuscule, espaces)
            </Label>
          </div>
        </div>
      </div>

      {/* System Section */}
      <div className="space-y-4 pt-6 border-t border-border">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Settings className="w-4 h-4 text-primary" />
          </div>
          <h3 className="text-sm font-semibold text-foreground">Système</h3>
        </div>

        <div className="space-y-4 pl-10">
          <div className="flex items-center space-x-3">
            <Checkbox
              id="auto-start"
              checked={settings.auto_start}
              onCheckedChange={(checked) =>
                updateSetting("auto_start", checked as boolean)
              }
            />
            <Label
              htmlFor="auto-start"
              className="text-sm text-foreground cursor-pointer"
            >
              Démarrer automatiquement avec Windows
            </Label>
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="keep-recordings"
              className="text-sm text-foreground"
            >
              Conserver les N derniers enregistrements (WAV)
            </Label>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={() =>
                  updateSetting("recordings_keep_last", Math.max(0, settings.recordings_keep_last - 1))
                }
              >
                <Minus className="w-4 h-4" />
              </Button>
              <Input
                id="keep-recordings"
                type="number"
                value={settings.recordings_keep_last}
                onChange={(e) =>
                  updateSetting("recordings_keep_last", Number.parseInt(e.target.value) || 0)
                }
                className="w-20 text-center"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() =>
                  updateSetting("recordings_keep_last", settings.recordings_keep_last + 1)
                }
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Shortcuts Section */}
      <div className="space-y-4 pt-6 border-t border-border">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Keyboard className="w-4 h-4 text-primary" />
          </div>
          <h3 className="text-sm font-semibold text-foreground">
            Raccourcis & modes d'enregistrement
          </h3>
        </div>

        <div className="space-y-4 pl-10">
          <div className="p-3 rounded-lg bg-muted/50 border border-border">
            <p className="text-xs text-muted-foreground leading-relaxed">
              <span className="font-semibold text-foreground">
                Modes d'enregistrement :
              </span>{" "}
              Toggle et Push-to-talk sont actifs
            </p>
          </div>

          <HotkeyInput
            id="shortcut-record"
            label="Raccourci pour Démarrer/Arrêter l'enregistrement"
            value={settings.record_hotkey}
            defaultValue={DEFAULT_SETTINGS.settings.record_hotkey}
            description="Mode toggle : une pression pour démarrer, une seconde pour arrêter."
            onChange={(shortcut) => handleHotkeyChange("record_hotkey", shortcut)}
          />

          <HotkeyInput
            id="shortcut-push"
            label="Raccourci Push-to-talk (maintenir)"
            value={settings.ptt_hotkey}
            defaultValue={DEFAULT_SETTINGS.settings.ptt_hotkey}
            description="Maintenez le raccourci pour enregistrer, relâchez pour arrêter."
            onChange={(shortcut) => handleHotkeyChange("ptt_hotkey", shortcut)}
          />

          <HotkeyInput
            id="shortcut-window"
            label="Raccourci pour Ouvrir la fenêtre principale"
            value={settings.open_window_hotkey}
            defaultValue={DEFAULT_SETTINGS.settings.open_window_hotkey}
            description="Affiche la fenêtre principale et lui donne le focus instantanément."
            onChange={(shortcut) => handleHotkeyChange("open_window_hotkey", shortcut)}
          />

          <div className="p-3 rounded-lg bg-muted/50 border border-border">
            <p className="text-xs text-muted-foreground leading-relaxed">
              Modificateurs : {"<ctrl>"}, {"<alt>"}, {"<shift>"}, {"<cmd>"}{" "}
              (Mac)
              <br />
              Exemples : {"<ctrl>+<shift>+r"}, {"<f1>"}, {"<f2>"},{" "}
              {"<ctrl>+<space>"}, {"<f9>"}
            </p>
          </div>
        </div>
      </div>

      {/* Close Application Button */}
      <div className="pt-6 border-t border-border">
        <Button
          variant="destructive"
          className="w-full"
          onClick={async () => {
            const { invoke } = await import("@tauri-apps/api/core");
            await invoke("exit_app");
          }}
        >
          Fermer complètement l'application
        </Button>
      </div>
    </div>
  );
}




