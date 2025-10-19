"use client";

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

export function SettingTabs() {
  const { settings, isLoaded, updateSetting } = useSettings();
  const { devices, isLoading: devicesLoading, error: devicesError, refresh } = useAudioDevices();

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

          <div className="space-y-2">
            <Label
              htmlFor="shortcut-record"
              className="text-sm text-foreground"
            >
              Raccourci pour Démarrer/Arrêter l'enregistrement
            </Label>
            <Input
              id="shortcut-record"
              value={settings.record_hotkey}
              onChange={(e) =>
                updateSetting("record_hotkey", e.target.value)
              }
              className="font-mono"
              readOnly
            />
            <p className="text-xs text-muted-foreground">
              Actuellement : {settings.record_hotkey} (non modifiable pour l'instant)
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="shortcut-push" className="text-sm text-foreground">
              Raccourci Push-to-talk (maintenir)
            </Label>
            <Input
              id="shortcut-push"
              value={settings.ptt_hotkey}
              onChange={(e) =>
                updateSetting("ptt_hotkey", e.target.value)
              }
              className="font-mono"
              readOnly
            />
            <p className="text-xs text-muted-foreground">
              Actuellement : {settings.ptt_hotkey} (non modifiable pour l'instant)
            </p>
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="shortcut-window"
              className="text-sm text-foreground"
            >
              Raccourci pour Ouvrir cette fenêtre
            </Label>
            <Input
              id="shortcut-window"
              value={settings.open_window_hotkey}
              onChange={(e) =>
                updateSetting("open_window_hotkey", e.target.value)
              }
              className="font-mono"
              readOnly
            />
            <p className="text-xs text-muted-foreground">
              Actuellement : {settings.open_window_hotkey} (non implémenté)
            </p>
          </div>

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
