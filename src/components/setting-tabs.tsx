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
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad/.test(navigator.platform);

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
          disabled={
            isSaving || value.toLowerCase() === defaultValue.toLowerCase()
          }
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
  const {
    devices,
    isLoading: devicesLoading,
    error: devicesError,
    refresh,
  } = useAudioDevices();
  const [isUpdatingAutostart, setIsUpdatingAutostart] = useState(false);
  const [autoStartEnabled, setAutoStartEnabled] = useState(false);

  // Load autostart state from registry on mount
  useEffect(() => {
    const loadAutostartState = async () => {
      try {
        const enabled = await invoke<boolean>("is_autostart_enabled");
        setAutoStartEnabled(enabled);
      } catch (error) {
        console.error("Failed to load autostart state:", error);
      }
    };
    loadAutostartState();
  }, []);

  const handleHotkeyChange = useCallback(
    async (
      key: "record_hotkey" | "ptt_hotkey" | "open_window_hotkey",
      shortcut: string
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
    [settings, updateSetting]
  );

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Chargement des paramètres...</p>
      </div>
    );
  }
  return (
    <div className="space-y-4 pb-6">
      {/* Transcription Service Card */}
      <div className="rounded-xl border border-border/50 bg-card/30 backdrop-blur-sm overflow-hidden transition-all hover:border-border hover:shadow-lg hover:shadow-primary/5">
        <div className="px-5 py-4 bg-gradient-to-r from-primary/5 via-primary/3 to-transparent border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center shadow-sm">
              <Settings className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground">
                Transcription
              </h3>
              <p className="text-xs text-muted-foreground">
                Service de reconnaissance vocale
              </p>
            </div>
          </div>
        </div>

        <div className="p-5 space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2.5">
              <Label
                htmlFor="service-provider"
                className="text-sm font-medium text-foreground"
              >
                Fournisseur
              </Label>
              <Select
                value={settings.transcription_provider}
                onValueChange={(value) =>
                  updateSetting(
                    "transcription_provider",
                    value as "OpenAI" | "Deepgram" | "Google"
                  )
                }
              >
                <SelectTrigger
                  id="service-provider"
                  className="h-10 bg-background/50"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Deepgram">Deepgram (Streaming)</SelectItem>
                  {/* <SelectItem value="Google">Google Speech-to-Text</SelectItem> */}
                  <SelectItem value="OpenAI">OpenAI Whisper</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2.5">
              <Label
                htmlFor="language"
                className="text-sm font-medium text-foreground"
              >
                Langue
              </Label>
              <Select
                value={settings.language}
                onValueChange={(value) => updateSetting("language", value)}
              >
                <SelectTrigger id="language" className="h-10 bg-background/50">
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
          </div>

          <ApiConfigDialog />
        </div>
      </div>

      {/* Audio Card */}
      <div className="rounded-xl border border-border/50 bg-card/30 backdrop-blur-sm overflow-hidden transition-all hover:border-border hover:shadow-lg hover:shadow-primary/5">
        <div className="px-5 py-4 bg-gradient-to-r from-primary/5 via-primary/3 to-transparent border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center shadow-sm">
              <Mic className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground">Audio</h3>
              <p className="text-xs text-muted-foreground">
                Configuration de l'enregistrement et des sons
              </p>
            </div>
          </div>
        </div>

        <div className="p-5 space-y-5">
          {/* Microphone Selection */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <Label
                htmlFor="microphone"
                className="text-sm font-medium text-foreground"
              >
                Périphérique d'entrée
              </Label>
              <Button
                variant="ghost"
                size="sm"
                onClick={refresh}
                disabled={devicesLoading}
                className="h-7 px-2.5 -mr-2 hover:bg-primary/10"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${devicesLoading ? "animate-spin" : ""
                    }`}
                />
              </Button>
            </div>
            <Select
              value={settings.input_device_index?.toString() ?? "null"}
              onValueChange={(value) =>
                updateSetting(
                  "input_device_index",
                  value === "null" ? null : Number.parseInt(value)
                )
              }
              disabled={devicesLoading || !!devicesError}
            >
              <SelectTrigger id="microphone" className="h-10 bg-background/50">
                <SelectValue
                  placeholder={
                    devicesLoading
                      ? "Chargement..."
                      : devicesError
                        ? "Erreur de chargement"
                        : "Sélectionner un microphone"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="null">Par défaut (Système)</SelectItem>
                {devices.map((device) => (
                  <SelectItem
                    key={device.index}
                    value={device.index.toString()}
                  >
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

          {/* Silence Threshold */}
          <div className="space-y-2.5 p-4 rounded-lg bg-muted/30 border border-border/50">
            <div className="flex items-center justify-between">
              <Label
                htmlFor="silence-threshold"
                className="text-sm font-medium text-foreground"
              >
                Seuil de détection du silence
              </Label>
              <span className="text-sm font-mono font-semibold text-primary tabular-nums">
                {(settings.silence_threshold * 100).toFixed(1)}%
              </span>
            </div>
            <input
              id="silence-threshold"
              type="range"
              min="0"
              max="0.1"
              step="0.001"
              value={settings.silence_threshold}
              onChange={(e) =>
                updateSetting("silence_threshold", parseFloat(e.target.value))
              }
              className="w-full h-2.5 bg-muted rounded-full appearance-none cursor-pointer accent-primary [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:shadow-primary/20 [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:hover:scale-110"
            />
            <p className="text-xs text-muted-foreground leading-relaxed">
              Les enregistrements en dessous de ce seuil seront considérés comme
              silence
            </p>
          </div>

          {/* Audio Options */}
          <div className="space-y-3 pt-1">
            <div
              className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/30 transition-colors cursor-pointer"
              onClick={() =>
                updateSetting("enable_sounds", !settings.enable_sounds)
              }
            >
              <Checkbox
                id="interface-sounds"
                checked={settings.enable_sounds}
                onCheckedChange={(checked) =>
                  updateSetting("enable_sounds", checked as boolean)
                }
              />
              <Label
                htmlFor="interface-sounds"
                className="text-sm text-foreground cursor-pointer flex-1"
              >
                Sons d'interface
              </Label>
            </div>

            <div
              className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/30 transition-colors cursor-pointer"
              onClick={() =>
                updateSetting(
                  "enable_history_audio_preview",
                  !settings.enable_history_audio_preview
                )
              }
            >
              <Checkbox
                id="show-listen"
                checked={settings.enable_history_audio_preview}
                onCheckedChange={(checked) =>
                  updateSetting(
                    "enable_history_audio_preview",
                    checked as boolean
                  )
                }
              />
              <Label
                htmlFor="show-listen"
                className="text-sm text-foreground cursor-pointer flex-1"
              >
                Bouton Écouter dans l'historique
              </Label>
            </div>
          </div>
        </div>
      </div>

      {/* Text Settings Card */}
      <div className="rounded-xl border border-border/50 bg-card/30 backdrop-blur-sm overflow-hidden transition-all hover:border-border hover:shadow-lg hover:shadow-primary/5">
        <div className="px-5 py-4 bg-gradient-to-r from-primary/5 via-primary/3 to-transparent border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center shadow-sm">
              <span className="text-lg font-bold text-primary">T</span>
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground">Texte</h3>
              <p className="text-xs text-muted-foreground">
                Formatage et insertion automatique
              </p>
            </div>
          </div>
        </div>

        <div className="p-5 space-y-3">
          <div
            className="flex items-start gap-3 p-3 rounded-lg hover:bg-muted/30 transition-colors cursor-pointer"
            onClick={() =>
              updateSetting("paste_at_cursor", !settings.paste_at_cursor)
            }
          >
            <Checkbox
              id="auto-insert"
              checked={settings.paste_at_cursor}
              onCheckedChange={(checked) =>
                updateSetting("paste_at_cursor", checked as boolean)
              }
              className="mt-0.5"
            />
            <Label
              htmlFor="auto-insert"
              className="text-sm text-foreground cursor-pointer leading-relaxed flex-1"
            >
              Insertion automatique au curseur après transcription
            </Label>
          </div>

          <div
            className="flex items-start gap-3 p-3 rounded-lg hover:bg-muted/30 transition-colors cursor-pointer"
            onClick={() =>
              updateSetting("smart_formatting", !settings.smart_formatting)
            }
          >
            <Checkbox
              id="smart-formatting"
              checked={settings.smart_formatting}
              onCheckedChange={(checked) =>
                updateSetting("smart_formatting", checked as boolean)
              }
              className="mt-0.5"
            />
            <Label
              htmlFor="smart-formatting"
              className="text-sm text-foreground cursor-pointer leading-relaxed flex-1"
            >
              Formatage intelligent (ponctuation, majuscules, espaces)
            </Label>
          </div>
        </div>
      </div>

      {/* System Card */}
      <div className="rounded-xl border border-border/50 bg-card/30 backdrop-blur-sm overflow-hidden transition-all hover:border-border hover:shadow-lg hover:shadow-primary/5">
        <div className="px-5 py-4 bg-gradient-to-r from-primary/5 via-primary/3 to-transparent border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center shadow-sm">
              <Settings className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground">
                Système
              </h3>
              <p className="text-xs text-muted-foreground">
                Démarrage et gestion des fichiers
              </p>
            </div>
          </div>
        </div>

        <div className="p-5 space-y-5">
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/30 transition-colors">
              <Checkbox
                id="auto-start"
                checked={autoStartEnabled}
                disabled={isUpdatingAutostart}
                onCheckedChange={async (checked) => {
                  setIsUpdatingAutostart(true);
                  try {
                    await invoke("set_autostart", {
                      enable: checked as boolean,
                    });
                    setAutoStartEnabled(checked as boolean);
                  } catch (error) {
                    console.error("Failed to update autostart:", error);
                    alert(
                      `Erreur lors de la mise à jour du démarrage automatique: ${error}`
                    );
                  } finally {
                    setIsUpdatingAutostart(false);
                  }
                }}
              />
              <Label
                htmlFor="auto-start"
                className="text-sm text-foreground cursor-pointer flex-1"
              >
                Démarrer avec Windows
                {isUpdatingAutostart && (
                  <span className="text-muted-foreground ml-1">
                    (mise à jour...)
                  </span>
                )}
              </Label>
            </div>

            {autoStartEnabled && (
              <div className="flex items-center gap-3 p-3 pl-12 rounded-lg hover:bg-muted/30 transition-colors">
                <Checkbox
                  id="start-minimized"
                  checked={settings.start_minimized_on_boot}
                  onCheckedChange={(checked) =>
                    updateSetting("start_minimized_on_boot", checked as boolean)
                  }
                />
                <Label
                  htmlFor="start-minimized"
                  className="text-sm text-muted-foreground cursor-pointer flex-1"
                >
                  Démarrer minimisé dans la barre système
                </Label>
              </div>
            )}
          </div>

          <div className="p-4 rounded-lg bg-muted/30 border border-border/50 space-y-2.5">
            <Label
              htmlFor="keep-recordings"
              className="text-sm font-medium text-foreground"
            >
              Enregistrements conservés (WAV)
            </Label>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="icon"
                onClick={() =>
                  updateSetting(
                    "recordings_keep_last",
                    Math.max(0, settings.recordings_keep_last - 1)
                  )
                }
                className="h-10 w-10 shrink-0"
              >
                <Minus className="w-4 h-4" />
              </Button>
              <Input
                id="keep-recordings"
                type="number"
                value={settings.recordings_keep_last}
                onChange={(e) =>
                  updateSetting(
                    "recordings_keep_last",
                    Number.parseInt(e.target.value) || 0
                  )
                }
                className="h-10 text-center font-mono text-base bg-background/50"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() =>
                  updateSetting(
                    "recordings_keep_last",
                    settings.recordings_keep_last + 1
                  )
                }
                className="h-10 w-10 shrink-0"
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Nombre de fichiers audio à conserver localement
            </p>
          </div>
        </div>
      </div>

      {/* Mini Window Card */}
      <div className="rounded-xl border border-border/50 bg-card/30 backdrop-blur-sm overflow-hidden transition-all hover:border-border hover:shadow-lg hover:shadow-primary/5">
        <div className="px-5 py-4 bg-gradient-to-r from-primary/5 via-primary/3 to-transparent border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center shadow-sm">
              <span className="text-lg font-bold text-primary">⬚</span>
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground">
                Mini fenêtre
              </h3>
              <p className="text-xs text-muted-foreground">
                Visualiseur d'enregistrement flottant
              </p>
            </div>
          </div>
        </div>

        <div className="p-5">
          <div className="p-4 rounded-lg bg-muted/30 border border-border/50">
            <p className="text-sm text-foreground mb-2 font-medium">
              La mini fenêtre affiche :
            </p>
            <ul className="text-xs text-muted-foreground space-y-1">
              <li>• <span className="text-red-400">●</span> Enregistrement en cours</li>
              <li>• <span className="animate-spin inline-block">↻</span> Envoi de l'audio...</li>
              <li>• <span className="text-green-400">✓</span> Transcription réussie</li>
              <li>• <span className="text-red-400">✗</span> Erreur (avec message détaillé)</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Keyboard Shortcuts Card */}
      <div className="rounded-xl border border-border/50 bg-card/30 backdrop-blur-sm overflow-hidden transition-all hover:border-border hover:shadow-lg hover:shadow-primary/5">
        <div className="px-5 py-4 bg-gradient-to-r from-primary/5 via-primary/3 to-transparent border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center shadow-sm">
              <Keyboard className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground">
                Raccourcis clavier
              </h3>
              <p className="text-xs text-muted-foreground">
                Contrôle global de l'enregistrement
              </p>
            </div>
          </div>
        </div>

        <div className="p-5 space-y-5">
          {/* <div className="p-3.5 rounded-lg bg-primary/5 border border-primary/10">
            <p className="text-xs text-muted-foreground leading-relaxed">
              <span className="font-semibold text-foreground">
                Deux modes disponibles :
              </span>{" "}
              Toggle (appui simple) et Push-to-talk (maintenir)
            </p>
          </div> */}

          <HotkeyInput
            id="shortcut-record"
            label="Toggle enregistrement"
            value={settings.record_hotkey}
            defaultValue={DEFAULT_SETTINGS.settings.record_hotkey}
            description="Démarrer et arrêter l'enregistrement avec le même raccourci"
            onChange={(shortcut) =>
              handleHotkeyChange("record_hotkey", shortcut)
            }
          />

          <HotkeyInput
            id="shortcut-push"
            label="Push-to-talk"
            value={settings.ptt_hotkey}
            defaultValue={DEFAULT_SETTINGS.settings.ptt_hotkey}
            description="Enregistrer tant que le raccourci est maintenu"
            onChange={(shortcut) => handleHotkeyChange("ptt_hotkey", shortcut)}
          />

          <HotkeyInput
            id="shortcut-window"
            label="Afficher la fenêtre"
            value={settings.open_window_hotkey}
            defaultValue={DEFAULT_SETTINGS.settings.open_window_hotkey}
            description="Ouvre et met au premier plan la fenêtre principale"
            onChange={(shortcut) =>
              handleHotkeyChange("open_window_hotkey", shortcut)
            }
          />

          <div className="p-3.5 rounded-lg bg-muted/30 border border-border/50">
            <p className="text-xs text-muted-foreground leading-relaxed">
              <span className="font-medium text-foreground">
                Modificateurs disponibles :
              </span>{" "}
              Ctrl, Alt, Shift, Cmd (Mac)
              <br />
              <span className="font-medium text-foreground">
                Exemples :
              </span>{" "}
              Ctrl+Shift+R, F1-F12, Ctrl+Space
            </p>
          </div>
        </div>
      </div>

      {/* Exit Button */}
      <div className="pt-2">
        <Button
          variant="destructive"
          className="w-full h-11 font-medium shadow-lg shadow-destructive/20 hover:shadow-xl hover:shadow-destructive/30 transition-all"
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
