import { Settings, AlertTriangle, Check, Download, Loader2, Trash2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ApiConfigDialog } from "@/components/api-config-dialog";
import { useSettings } from "@/hooks/useSettings";
import { useModelDownload } from "@/hooks/useModelDownload";
import { SectionCard } from "../common/SectionCard";
import { Divider } from "../common/Divider";

export function TranscriptionSection() {
  const { settings, updateSetting } = useSettings();
  const {
    isDownloading,
    progress,
    isDownloaded,
    isChecking,
    download,
    remove,
  } = useModelDownload(settings.transcription_provider, settings.local_model_size);

  return (
    <SectionCard
      id="section-transcription"
      icon={<Settings className="w-3.5 h-3.5 text-violet-500" />}
      iconBg="bg-violet-500/10"
      title="IA"
      subtitle="Transcription & notes intelligentes"
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
                  value as "OpenAI" | "Google",
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
              <SelectTrigger id="language" className="h-9 bg-background/50 w-36">
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
        {settings.transcription_provider === "OpenAI" && (
          <div className="flex items-start gap-2 p-3 rounded-md bg-amber-500/10 border border-amber-500/20 text-sm text-amber-600 dark:text-amber-400">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>
              Ce service est payant à l'usage. Utilisez le mode{" "}
              <strong>Local (Offline)</strong> pour une transcription gratuite et
              privée.
            </span>
          </div>
        )}

        {/* Local model section – right after provider when local */}
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
                        | "large-v3-turbo",
                    )
                  }
                  disabled={isDownloading}
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
                    <SelectItem value="large-v3-turbo">
                      Large v3 Turbo (1.6 GB) – Meilleur + Rapide ⭐
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {isDownloaded ? (
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
                      onClick={remove}
                      className="h-9 w-9 text-destructive hover:bg-destructive/10 border-destructive/20"
                      title="Supprimer le modèle"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </>
                ) : (
                  <Button
                    onClick={download}
                    disabled={isDownloading || isChecking}
                    size="sm"
                  >
                    {isDownloading ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        {Math.round(progress)}%
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

            {isDownloading && <Progress value={progress} className="h-1.5" />}
          </div>
        )}

        {/* Translation mode section */}
        <Divider />
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label className="text-sm font-medium text-foreground">
                Mode Traduction
              </Label>
              <p className="text-xs text-muted-foreground">
                Parler en français, écrire en anglais
              </p>
            </div>
            <Checkbox
              checked={settings.translate_mode ?? false}
              onCheckedChange={(checked) =>
                updateSetting("translate_mode", checked === true)
              }
            />
          </div>
          {settings.translate_mode && (
            <div className="p-3 rounded-md bg-blue-500/5 border border-blue-500/20 text-xs text-blue-600 dark:text-blue-400">
              🌐 Utilise OpenAI Whisper pour traduire vers l'anglais
            </div>
          )}
        </div>

        {/* API keys – always visible */}
        <Divider />
        <div className="space-y-2">
          <ApiConfigDialog />
          <p className="text-xs text-muted-foreground">
            Utilisé par la transcription en ligne et l'assistant IA dans les notes.
            Non requis si vous utilisez uniquement la transcription locale.
          </p>
        </div>
      </div>
    </SectionCard>
  );
}
