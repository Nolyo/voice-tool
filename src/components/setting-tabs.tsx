"use client";

import { useState } from "react";
import {
  Search,
  Copy,
  Play,
  Trash2,
  Mic,
  Settings,
  Minus,
  Plus,
  Keyboard,
} from "lucide-react";
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

export function SettingTabs() {
  const [settings, setSettings] = useState({
    interfaceSounds: true,
    showListenButton: true,
    inputMicrophone: "default",
    serviceProvider: "openai-whisper",
    transcriptionLanguage: "fr",
    autoInsertCursor: true,
    smartFormatting: true,
    autoStartWindows: true,
    keepRecordings: 25,
    shortcutRecord: "<alt>+<f1>",
    shortcutPushToTalk: "<ctrl>+<f1>",
    shortcutOpenWindow: "<ctrl>+<alt>+o",
  });
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
              checked={settings.interfaceSounds}
              onCheckedChange={(checked) =>
                setSettings({
                  ...settings,
                  interfaceSounds: checked as boolean,
                })
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
              checked={settings.showListenButton}
              onCheckedChange={(checked) =>
                setSettings({
                  ...settings,
                  showListenButton: checked as boolean,
                })
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
            <Label htmlFor="microphone" className="text-sm text-foreground">
              Microphone d'entrée
            </Label>
            <Select
              value={settings.inputMicrophone}
              onValueChange={(value) =>
                setSettings({ ...settings, inputMicrophone: value })
              }
            >
              <SelectTrigger id="microphone">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Par défaut (Windows)</SelectItem>
                <SelectItem value="microphone-1">Microphone 1</SelectItem>
                <SelectItem value="microphone-2">Microphone 2</SelectItem>
              </SelectContent>
            </Select>
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
              value={settings.serviceProvider}
              onValueChange={(value) =>
                setSettings({ ...settings, serviceProvider: value })
              }
            >
              <SelectTrigger id="service-provider">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="openai-whisper">
                  OpenAI Whisper (recommandé)
                </SelectItem>
                <SelectItem value="google-speech">
                  Google Speech-to-Text
                </SelectItem>
                <SelectItem value="azure-speech">
                  Azure Speech Services
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="language" className="text-sm text-foreground">
              Langue de transcription
            </Label>
            <Select
              value={settings.transcriptionLanguage}
              onValueChange={(value) =>
                setSettings({ ...settings, transcriptionLanguage: value })
              }
            >
              <SelectTrigger id="language">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fr">Français</SelectItem>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="es">Español</SelectItem>
                <SelectItem value="de">Deutsch</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button variant="outline" className="w-full bg-transparent">
            Configurer les accès API...
          </Button>
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
              checked={settings.autoInsertCursor}
              onCheckedChange={(checked) =>
                setSettings({
                  ...settings,
                  autoInsertCursor: checked as boolean,
                })
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
              checked={settings.smartFormatting}
              onCheckedChange={(checked) =>
                setSettings({
                  ...settings,
                  smartFormatting: checked as boolean,
                })
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
              checked={settings.autoStartWindows}
              onCheckedChange={(checked) =>
                setSettings({
                  ...settings,
                  autoStartWindows: checked as boolean,
                })
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
                  setSettings({
                    ...settings,
                    keepRecordings: Math.max(0, settings.keepRecordings - 1),
                  })
                }
              >
                <Minus className="w-4 h-4" />
              </Button>
              <Input
                id="keep-recordings"
                type="number"
                value={settings.keepRecordings}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    keepRecordings: Number.parseInt(e.target.value) || 0,
                  })
                }
                className="w-20 text-center"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() =>
                  setSettings({
                    ...settings,
                    keepRecordings: settings.keepRecordings + 1,
                  })
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
            <div className="flex gap-2">
              <Input
                id="shortcut-record"
                value={settings.shortcutRecord}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    shortcutRecord: e.target.value,
                  })
                }
                className="font-mono"
              />
              <Button variant="outline">Définir...</Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="shortcut-push" className="text-sm text-foreground">
              Raccourci Push-to-talk (maintenir)
            </Label>
            <div className="flex gap-2">
              <Input
                id="shortcut-push"
                value={settings.shortcutPushToTalk}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    shortcutPushToTalk: e.target.value,
                  })
                }
                className="font-mono"
              />
              <Button variant="outline">Définir...</Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="shortcut-window"
              className="text-sm text-foreground"
            >
              Raccourci pour Ouvrir cette fenêtre
            </Label>
            <div className="flex gap-2">
              <Input
                id="shortcut-window"
                value={settings.shortcutOpenWindow}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    shortcutOpenWindow: e.target.value,
                  })
                }
                className="font-mono"
              />
              <Button variant="outline">Définir...</Button>
            </div>
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
        <Button variant="destructive" className="w-full">
          Fermer complètement l'application
        </Button>
      </div>
    </div>
  );
}
