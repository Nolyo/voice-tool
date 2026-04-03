"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  Mic,
  Settings,
  Minus,
  Plus,
  Keyboard,
  RefreshCw,
  Download,
  Check,
  Loader2,
  Trash2,
  AlertTriangle,
  RotateCcw,
  BookOpen,
  X,
} from "lucide-react";
import { Label } from "./ui/label";
import { Progress } from "./ui/progress";
import { toast } from "sonner";
import { listen } from "@tauri-apps/api/event";
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
import { UpdaterTab } from "./updater-tab";
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
  if (key === " ") return "Space";
  if (key.length === 1) return key.toUpperCase();
  return key;
}

function buildShortcutFromEvent(event: KeyboardEvent): string | null {
  if (MODIFIER_KEYS.has(event.key)) return null;

  const parts: string[] = [];
  if (event.ctrlKey) parts.push("Ctrl");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");
  if (event.metaKey) parts.push(isMacPlatform() ? "Cmd" : "Super");

  const key = normalizeKey(event.key);
  if (!key) return null;

  parts.push(key);
  return parts.join("+");
}

// ─── Section card ────────────────────────────────────────────────────────────

interface SectionCardProps {
  icon: ReactNode;
  title: string;
  subtitle: string;
  children: ReactNode;
  iconBg?: string;
}

function SectionCard({ icon, title, subtitle, children, iconBg = "bg-primary/10" }: SectionCardProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 px-0.5">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${iconBg}`}>
          {icon}
        </div>
        <div>
          <h3 className="text-sm font-semibold text-foreground leading-tight">
            {title}
          </h3>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      <div className="rounded-xl border border-border bg-card p-5">
        {children}
      </div>
    </div>
  );
}

function Divider() {
  return <div className="h-px bg-border" />;
}

// ─── Key badge ────────────────────────────────────────────────────────────────

function KeyBadge({ token }: { token: string }) {
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 text-[11px] font-mono font-semibold bg-background border border-border rounded-md leading-none shadow-[0_2px_0_0_hsl(var(--border))]">
      {token}
    </span>
  );
}

// ─── Hotkey input ─────────────────────────────────────────────────────────────

type HotkeyInputProps = {
  id: string;
  label: string;
  value: string;
  defaultValue: string;
  description?: string;
  allowEscape?: boolean;
  onChange: (shortcut: string) => Promise<void>;
};

function HotkeyInput({
  id,
  label,
  value,
  defaultValue,
  description,
  allowEscape = false,
  onChange,
}: HotkeyInputProps) {
  const [isListening, setIsListening] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isListening) return;

    const handler = async (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();

      if (event.key === "Escape" && !allowEscape) {
        setIsListening(false);
        setError(null);
        return;
      }

      const shortcut = buildShortcutFromEvent(event);
      if (!shortcut) return;

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
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setIsSaving(false);
        setIsListening(false);
      }
    };

    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [isListening, onChange, value, allowEscape]);

  const handleReset = useCallback(async () => {
    if (!defaultValue || value.toLowerCase() === defaultValue.toLowerCase())
      return;
    setIsSaving(true);
    try {
      await onChange(defaultValue);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSaving(false);
      setIsListening(false);
    }
  }, [defaultValue, onChange, value]);

  const tokens = value
    ? value.split("+").map((t) => t.trim()).filter(Boolean)
    : [];
  const isDefault =
    !defaultValue || value.toLowerCase() === defaultValue.toLowerCase();

  return (
    <div className="flex items-center justify-between gap-4 py-3">
      {/* Label + status line */}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground leading-none">
          {label}
        </p>
        <p
          className={`text-xs mt-1 leading-snug transition-colors ${error
            ? "text-destructive"
            : isListening
              ? "text-primary"
              : "text-muted-foreground"
            }`}
        >
          {error
            ? error
            : isListening
              ? allowEscape
                ? "Appuyez sur une touche (Échap pour effacer)…"
                : "Appuyez sur la combinaison… (Échap pour annuler)"
              : description}
        </p>
      </div>

      {/* Key display + reset */}
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          id={id}
          onClick={() => {
            if (isSaving) return;
            setError(null);
            setIsListening((prev) => !prev);
          }}
          disabled={isSaving}
          title="Cliquer pour modifier"
          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border transition-all min-w-[88px] justify-center ${isListening
            ? "border-primary/50 bg-primary/5 ring-1 ring-primary/20 cursor-default"
            : "border-border/70 bg-muted/40 hover:border-primary/40 hover:bg-muted/70 cursor-pointer"
            }`}
        >
          {isSaving ? (
            <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
          ) : isListening ? (
            <span className="text-[11px] text-primary font-medium animate-pulse whitespace-nowrap">
              Appuyez…
            </span>
          ) : tokens.length > 0 ? (
            tokens.map((token, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && (
                  <span className="text-muted-foreground/50 text-[10px] font-bold leading-none">
                    +
                  </span>
                )}
                <KeyBadge token={token} />
              </span>
            ))
          ) : (
            <span className="text-xs text-muted-foreground italic">—</span>
          )}
        </button>

        <button
          type="button"
          onClick={handleReset}
          disabled={isSaving || isDefault}
          title="Remettre par défaut"
          className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
        >
          <RotateCcw className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

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

  // Local Model state
  const [isDownloadingModel, setIsDownloadingModel] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const [isModelDownloaded, setIsModelDownloaded] = useState(false);
  const [isCheckingModel, setIsCheckingModel] = useState(false);

  const checkModelStatus = useCallback(async () => {
    if (settings.transcription_provider !== "Local") return;
    setIsCheckingModel(true);
    try {
      const exists = await invoke<boolean>("check_local_model_exists", {
        model: settings.local_model_size || "base",
      });
      setIsModelDownloaded(exists);
    } catch (e) {
      console.error("Failed to check model status:", e);
    } finally {
      setIsCheckingModel(false);
    }
  }, [settings.transcription_provider, settings.local_model_size]);

  useEffect(() => {
    checkModelStatus();
  }, [checkModelStatus]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    const setupListener = async () => {
      const u = await listen<number>("model-download-progress", (event) => {
        setDownloadProgress(event.payload);
      });
      unlisten = u;
    };
    setupListener();
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  const handleDownloadModel = async () => {
    setIsDownloadingModel(true);
    setDownloadProgress(0);
    try {
      await invoke("download_local_model", {
        model: settings.local_model_size,
      });
      toast.success(
        `Modèle ${settings.local_model_size} téléchargé avec succès !`
      );
      setIsModelDownloaded(true);
    } catch (error) {
      console.error("Download failed:", error);
      toast.error(`Erreur lors du téléchargement : ${error}`);
    } finally {
      setIsDownloadingModel(false);
      setDownloadProgress(0);
    }
  };

  const handleDeleteModel = async () => {
    try {
      await invoke("delete_local_model", { model: settings.local_model_size });
      toast.success(`Modèle ${settings.local_model_size} supprimé`);
      setIsModelDownloaded(false);
    } catch (error) {
      console.error("Delete failed:", error);
      toast.error(`Erreur lors de la suppression : ${error}`);
    }
  };

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
      key:
        | "record_hotkey"
        | "ptt_hotkey"
        | "open_window_hotkey"
        | "cancel_hotkey",
      shortcut: string
    ) => {
      const normalized = shortcut
        .split("+")
        .map((token) => token.trim())
        .filter(Boolean)
        .join("+");

      if (!normalized) throw new Error("Le raccourci ne peut pas être vide.");

      const currentValue = settings[key];
      if (currentValue && currentValue.toLowerCase() === normalized.toLowerCase())
        return;

      await invoke("update_hotkeys", {
        recordHotkey:
          key === "record_hotkey" ? normalized : settings.record_hotkey,
        pttHotkey: key === "ptt_hotkey" ? normalized : settings.ptt_hotkey,
        openWindowHotkey:
          key === "open_window_hotkey"
            ? normalized
            : settings.open_window_hotkey,
        cancelHotkey:
          key === "cancel_hotkey" ? normalized : settings.cancel_hotkey,
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
    <div className="space-y-8 pb-6">
      {/* ── Transcription ── */}
      <SectionCard
        icon={<Settings className="w-3.5 h-3.5 text-violet-500" />}
        iconBg="bg-violet-500/10"
        title="Transcription"
        subtitle="Service de reconnaissance vocale"
      >
        <div className="space-y-4">
          {/* Provider + Language on the same row */}
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label
                htmlFor="service-provider"
                className="text-xs font-medium text-muted-foreground uppercase tracking-wide"
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
                  className="h-9 bg-background/50 w-48"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Deepgram">Deepgram (Streaming)</SelectItem>
                  <SelectItem value="OpenAI">OpenAI Whisper</SelectItem>
                  <SelectItem value="Local">Local (Offline)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label
                htmlFor="language"
                className="text-xs font-medium text-muted-foreground uppercase tracking-wide"
              >
                Langue
              </Label>
              <Select
                value={settings.language}
                onValueChange={(value) => updateSetting("language", value)}
              >
                <SelectTrigger
                  id="language"
                  className="h-9 bg-background/50 w-36"
                >
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

          {/* Warning for paid providers */}
          {(settings.transcription_provider === "OpenAI" || settings.transcription_provider === "Deepgram") && (
            <div className="flex items-start gap-2 p-3 rounded-md bg-amber-500/10 border border-amber-500/20 text-sm text-amber-600 dark:text-amber-400">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>Ce service est payant à l'usage. Utilisez le mode <strong>Local (Offline)</strong> pour une transcription gratuite et privée.</span>
            </div>
          )}

          {/* API config for paid providers */}
          {settings.transcription_provider !== "Local" && (
            <>
              <Divider />
              <ApiConfigDialog />
            </>
          )}

          {/* Local model section */}
          {settings.transcription_provider === "Local" && (
            <div className="space-y-3 p-4 rounded-lg bg-muted/30 border border-border/60 animate-in fade-in slide-in-from-top-1">
              {/* Model size + action button on same row */}
              <div className="flex items-end gap-3">
                <div className="space-y-1.5 flex-1 min-w-0">
                  <Label
                    htmlFor="model-size"
                    className="text-xs font-medium text-muted-foreground uppercase tracking-wide"
                  >
                    Modèle Whisper
                  </Label>
                  <Select
                    value={settings.local_model_size}
                    onValueChange={(value) =>
                      updateSetting(
                        "local_model_size",
                        value as
                        | "tiny"
                        | "base"
                        | "small"
                        | "medium"
                        | "large-v1"
                        | "large-v2"
                        | "large-v3"
                        | "large-v3-turbo"
                      )
                    }
                    disabled={isDownloadingModel}
                  >
                    <SelectTrigger id="model-size" className="h-9 bg-background/50">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="tiny">Tiny (39 MB) – Très Rapide</SelectItem>
                      <SelectItem value="base">Base (74 MB) – Recommandé</SelectItem>
                      <SelectItem value="small">Small (244 MB) – Précis</SelectItem>
                      <SelectItem value="medium">Medium (1.5 GB) – Très Précis</SelectItem>
                      <SelectItem value="large-v1">Large v1 (2.9 GB) – Excellent</SelectItem>
                      <SelectItem value="large-v2">Large v2 (2.9 GB) – Excellent</SelectItem>
                      <SelectItem value="large-v3">Large v3 (2.9 GB) – Meilleur</SelectItem>
                      <SelectItem value="large-v3-turbo">Large v3 Turbo (1.6 GB) – Meilleur + Rapide ⭐</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {isModelDownloaded ? (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-green-500 border-green-500/20 bg-green-500/5 hover:bg-green-500/10 hover:text-green-600"
                        disabled
                      >
                        <Check className="w-3.5 h-3.5" />
                        Installé
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={handleDeleteModel}
                        className="h-9 w-9 text-destructive hover:bg-destructive/10 border-destructive/20"
                        title="Supprimer le modèle"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </>
                  ) : (
                    <Button
                      onClick={handleDownloadModel}
                      disabled={isDownloadingModel || isCheckingModel}
                      size="sm"
                    >
                      {isDownloadingModel ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          {Math.round(downloadProgress)}%
                        </>
                      ) : (
                        <>
                          <Download className="w-3.5 h-3.5" />
                          Télécharger
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </div>

              {isDownloadingModel && (
                <Progress value={downloadProgress} className="h-1.5" />
              )}
            </div>
          )}
        </div>
      </SectionCard>

      {/* ── Audio ── */}
      <SectionCard
        icon={<Mic className="w-3.5 h-3.5 text-blue-500" />}
        iconBg="bg-blue-500/10"
        title="Audio"
        subtitle="Configuration de l'enregistrement et des sons"
      >
        <div className="space-y-5">
          {/* Microphone */}
          <div className="space-y-1.5">
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
                className="h-7 px-2 -mr-1"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${devicesLoading ? "animate-spin" : ""}`}
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
              <SelectTrigger id="microphone" className="h-9 bg-background/50">
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
                    {device.name}{" "}
                    {device.is_default ? "(par défaut)" : ""}
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

          {/* Silence threshold */}
          <div className="space-y-2">
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
              min="0.001"
              max="0.05"
              step="0.001"
              value={settings.silence_threshold}
              onChange={(e) =>
                updateSetting(
                  "silence_threshold",
                  parseFloat(e.target.value)
                )
              }
              className="w-full h-1.5 bg-muted rounded-full appearance-none cursor-pointer accent-primary"
            />
            <p className="text-xs text-muted-foreground">
              Les enregistrements en dessous de ce seuil seront considérés
              comme silence
            </p>
          </div>

          <Divider />

          {/* Audio options */}
          <div className="space-y-1">
            <div
              className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/30 transition-colors cursor-pointer"
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
              className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/30 transition-colors cursor-pointer"
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
      </SectionCard>

      {/* ── Texte ── */}
      <SectionCard
        icon={
          <span className="text-xs font-bold text-emerald-500 leading-none">T</span>
        }
        iconBg="bg-emerald-500/10"
        title="Texte"
        subtitle="Formatage et insertion automatique"
      >
        <div className="space-y-1">
          <div
            className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-muted/30 transition-colors cursor-pointer"
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
            className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-muted/30 transition-colors cursor-pointer"
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
      </SectionCard>

      {/* ── Vocabulaire ── */}
      <SectionCard
        icon={<BookOpen className="w-3.5 h-3.5 text-cyan-500" />}
        iconBg="bg-cyan-500/10"
        title="Vocabulaire"
        subtitle="Snippets et mots personnalisés"
      >
        <div className="space-y-5">
          {/* Snippets */}
          <div className="space-y-3">
            <div>
              <h4 className="text-sm font-medium text-foreground">Snippets</h4>
              <p className="text-xs text-muted-foreground">
                Remplace automatiquement une phrase dictée par un texte prédéfini
              </p>
            </div>

            {(settings.snippets ?? []).map((snippet, index) => (
              <div key={index} className="flex items-center gap-2">
                <Input
                  value={snippet.trigger}
                  placeholder="Déclencheur"
                  className="flex-1 text-sm"
                  onChange={(e) => {
                    const updated = [...(settings.snippets ?? [])];
                    updated[index] = { ...updated[index], trigger: e.target.value };
                    updateSetting("snippets", updated);
                  }}
                />
                <span className="text-muted-foreground text-xs shrink-0">&rarr;</span>
                <Input
                  value={snippet.replacement}
                  placeholder="Remplacement"
                  className="flex-1 text-sm"
                  onChange={(e) => {
                    const updated = [...(settings.snippets ?? [])];
                    updated[index] = { ...updated[index], replacement: e.target.value };
                    updateSetting("snippets", updated);
                  }}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0 h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => {
                    const updated = (settings.snippets ?? []).filter((_, i) => i !== index);
                    updateSetting("snippets", updated);
                  }}
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}

            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => {
                const updated = [...(settings.snippets ?? []), { trigger: "", replacement: "" }];
                updateSetting("snippets", updated);
              }}
            >
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Ajouter un snippet
            </Button>
          </div>

          <Divider />

          {/* Dictionnaire */}
          <div className="space-y-3">
            <div>
              <h4 className="text-sm font-medium text-foreground">Dictionnaire</h4>
              <p className="text-xs text-muted-foreground">
                Mots ou expressions à favoriser lors de la transcription
              </p>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {(settings.dictionary ?? []).map((word, index) => (
                <span
                  key={index}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-sm bg-muted rounded-md"
                >
                  {word}
                  <button
                    className="text-muted-foreground hover:text-destructive transition-colors"
                    onClick={() => {
                      const updated = (settings.dictionary ?? []).filter((_, i) => i !== index);
                      updateSetting("dictionary", updated);
                    }}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>

            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const input = e.currentTarget.elements.namedItem("dict-word") as HTMLInputElement;
                const value = input.value.trim();
                if (value && !(settings.dictionary ?? []).includes(value)) {
                  updateSetting("dictionary", [...(settings.dictionary ?? []), value]);
                  input.value = "";
                }
              }}
            >
              <Input
                name="dict-word"
                placeholder="Ajouter un mot..."
                className="flex-1 text-sm"
              />
              <Button type="submit" variant="outline" size="sm">
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                Ajouter
              </Button>
            </form>
          </div>
        </div>
      </SectionCard>

      {/* ── Système ── */}
      <SectionCard
        icon={<Settings className="w-3.5 h-3.5 text-orange-500" />}
        iconBg="bg-orange-500/10"
        title="Système"
        subtitle="Démarrage et gestion des fichiers"
      >
        <div className="space-y-5">
          {/* Autostart */}
          <div className="space-y-1">
            <div className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/30 transition-colors">
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
                  <span className="text-muted-foreground ml-1 text-xs">
                    (mise à jour...)
                  </span>
                )}
              </Label>
            </div>

            {autoStartEnabled && (
              <div className="flex items-center gap-3 p-2.5 pl-10 rounded-lg hover:bg-muted/30 transition-colors">
                <Checkbox
                  id="start-minimized"
                  checked={settings.start_minimized_on_boot}
                  onCheckedChange={(checked) =>
                    updateSetting(
                      "start_minimized_on_boot",
                      checked as boolean
                    )
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

          <Divider />

          {/* Keep recordings */}
          <div className="space-y-1.5">
            <Label
              htmlFor="keep-recordings"
              className="text-sm font-medium text-foreground"
            >
              Enregistrements conservés (WAV)
            </Label>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={() =>
                  updateSetting(
                    "recordings_keep_last",
                    Math.max(0, settings.recordings_keep_last - 1)
                  )
                }
                className="h-9 w-9 shrink-0"
              >
                <Minus className="w-3.5 h-3.5" />
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
                className="h-9 text-center font-mono bg-background/50 w-20"
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
                className="h-9 w-9 shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Nombre de fichiers audio à conserver localement
            </p>
          </div>
        </div>
      </SectionCard>

      {/* ── Raccourcis clavier ── */}
      <SectionCard
        icon={<Keyboard className="w-3.5 h-3.5 text-rose-500" />}
        iconBg="bg-rose-500/10"
        title="Raccourcis clavier"
        subtitle="Cliquez sur un raccourci pour le modifier"
      >
        <div className="divide-y divide-border/50">
          <HotkeyInput
            id="shortcut-record"
            label="Toggle enregistrement"
            value={settings.record_hotkey}
            defaultValue={DEFAULT_SETTINGS.settings.record_hotkey}
            description="Démarrer et arrêter l'enregistrement"
            onChange={(shortcut) =>
              handleHotkeyChange("record_hotkey", shortcut)
            }
          />
          <HotkeyInput
            id="shortcut-push"
            label="Push-to-talk"
            value={settings.ptt_hotkey}
            defaultValue={DEFAULT_SETTINGS.settings.ptt_hotkey}
            description="Maintenir pour enregistrer, relâcher pour transcrire"
            onChange={(shortcut) =>
              handleHotkeyChange("ptt_hotkey", shortcut)
            }
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
          <HotkeyInput
            id="shortcut-cancel"
            label="Annuler l'enregistrement"
            value={settings.cancel_hotkey}
            defaultValue={DEFAULT_SETTINGS.settings.cancel_hotkey}
            description="Stoppe l'enregistrement sans transcrire"
            allowEscape={true}
            onChange={(shortcut) =>
              handleHotkeyChange("cancel_hotkey", shortcut)
            }
          />
        </div>
      </SectionCard>

      {/* ── Mises à jour ── */}
      <SectionCard
        icon={<RefreshCw className="w-3.5 h-3.5 text-sky-500" />}
        iconBg="bg-sky-500/10"
        title="Mises à jour"
        subtitle="Vérification et installation des nouvelles versions"
      >
        <UpdaterTab />
      </SectionCard>

      {/* Exit */}
      <Button
        variant="destructive"
        className="w-full h-10 font-medium"
        onClick={async () => {
          const { invoke } = await import("@tauri-apps/api/core");
          await invoke("exit_app");
        }}
      >
        Fermer complètement l'application
      </Button>
    </div>
  );
}
