import { useTranslation } from "react-i18next";
import { Settings, AlertTriangle, Check, Download, Loader2, Trash2, MemoryStick, Zap } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ApiConfigDialog } from "@/components/common/ApiConfigDialog";
import { useSettings } from "@/hooks/useSettings";
import { useModelDownload } from "@/hooks/useModelDownload";
import { SectionCard } from "../common/SectionCard";
import { Divider } from "../common/Divider";

export function TranscriptionSection() {
  const { t } = useTranslation();
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
      title={t('settings.transcription.title')}
      subtitle={t('settings.transcription.subtitle')}
    >
      <div className="space-y-4">
        {/* Provider + Language on the same row */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label
              htmlFor="service-provider"
              className="text-xs font-medium text-muted-foreground uppercase tracking-wide"
            >
              {t('settings.transcription.provider')}
            </Label>
            <Select
              value={settings.transcription_provider}
              onValueChange={(value) =>
                updateSetting(
                  "transcription_provider",
                  value as "OpenAI" | "Google" | "Local" | "Groq",
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
                <SelectItem value="OpenAI">{t('settings.transcription.providerOpenai')}</SelectItem>
                <SelectItem value="Groq">{t('settings.transcription.providerGroq')}</SelectItem>
                <SelectItem value="Local">{t('settings.transcription.providerLocal')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label
              htmlFor="language"
              className="text-xs font-medium text-muted-foreground uppercase tracking-wide"
            >
              {t('settings.transcription.language')}
            </Label>
            <Select
              value={settings.language}
              onValueChange={(value) => updateSetting("language", value)}
            >
              <SelectTrigger id="language" className="h-9 bg-background/50 w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fr-FR">{t('settings.transcription.languageFr')}</SelectItem>
                <SelectItem value="en-US">{t('settings.transcription.languageEn')}</SelectItem>
                <SelectItem value="es-ES">{t('settings.transcription.languageEs')}</SelectItem>
                <SelectItem value="de-DE">{t('settings.transcription.languageDe')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Warning for paid providers */}
        {settings.transcription_provider === "OpenAI" && (
          <div className="flex items-start gap-2 p-3 rounded-md bg-amber-500/10 border border-amber-500/20 text-sm text-amber-600 dark:text-amber-400">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{t('settings.transcription.paidWarning')}</span>
          </div>
        )}

        {/* Groq model section */}
        {settings.transcription_provider === "Groq" && (
          <div className="space-y-3 p-4 rounded-lg bg-muted/30 border border-border/60 animate-in fade-in slide-in-from-top-1">
            <div className="flex items-start gap-2 text-sm text-orange-600 dark:text-orange-400">
              <Zap className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{t('settings.transcription.groqInfo')}</span>
            </div>
            <div className="space-y-1.5">
              <Label
                htmlFor="groq-model"
                className="text-xs font-medium text-muted-foreground uppercase tracking-wide"
              >
                {t('settings.transcription.groqModel')}
              </Label>
              <Select
                value={settings.groq_model}
                onValueChange={(value) =>
                  updateSetting(
                    "groq_model",
                    value as "whisper-large-v3-turbo" | "whisper-large-v3",
                  )
                }
              >
                <SelectTrigger id="groq-model" className="h-9 bg-background/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="whisper-large-v3-turbo">{t('settings.transcription.groqModelTurbo')} ⭐</SelectItem>
                  <SelectItem value="whisper-large-v3">{t('settings.transcription.groqModelLargeV3')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
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
                  {t('settings.transcription.whisperModel')}
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
                        | "large-v3-turbo-q5_0",
                    )
                  }
                  disabled={isDownloading}
                >
                  <SelectTrigger id="model-size" className="h-9 bg-background/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tiny">{t('settings.transcription.modelTiny')}</SelectItem>
                    <SelectItem value="base">{t('settings.transcription.modelBase')}</SelectItem>
                    <SelectItem value="small">{t('settings.transcription.modelSmall')}</SelectItem>
                    <SelectItem value="medium">{t('settings.transcription.modelMedium')}</SelectItem>
                    <SelectItem value="large-v1">{t('settings.transcription.modelLargeV1')}</SelectItem>
                    <SelectItem value="large-v2">{t('settings.transcription.modelLargeV2')}</SelectItem>
                    <SelectItem value="large-v3">{t('settings.transcription.modelLargeV3')}</SelectItem>
                    <SelectItem value="large-v3-turbo">{t('settings.transcription.modelLargeV3Turbo')} ⭐</SelectItem>
                    <SelectItem value="large-v3-turbo-q5_0">{t('settings.transcription.modelLargeV3TurboQ5')}</SelectItem>
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
                      {t('settings.transcription.installed')}
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={remove}
                      className="h-9 w-9 text-destructive hover:bg-destructive/10 border-destructive/20"
                      title={t('settings.transcription.deleteModel')}
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
                        {t('settings.transcription.download')}
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>

            {isDownloading && <Progress value={progress} className="h-1.5" />}

            {/* Keep model in memory option */}
            {isDownloaded && (
              <div className="flex items-center justify-between gap-3 pt-2 border-t border-border/40">
                <div className="flex items-center gap-2 min-w-0">
                  <MemoryStick className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <Label className="text-xs font-medium text-foreground">
                      {t('settings.transcription.keepModelInMemory')}
                    </Label>
                    <p className="text-[10px] text-muted-foreground leading-tight">
                      {t('settings.transcription.keepModelInMemoryDesc')}
                    </p>
                  </div>
                </div>
                <Select
                  value={settings.keep_model_in_memory === null ? "auto" : settings.keep_model_in_memory ? "true" : "false"}
                  onValueChange={(value) => {
                    const mapped = value === "auto" ? null : value === "true";
                    updateSetting("keep_model_in_memory", mapped);
                  }}
                >
                  <SelectTrigger className="h-8 w-24 text-xs bg-background/50 shrink-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">{t('settings.transcription.keepModelInMemoryAuto')}</SelectItem>
                    <SelectItem value="true">{t('common.yes')}</SelectItem>
                    <SelectItem value="false">{t('common.no')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        )}

        {/* Translation mode section */}
        <Divider />
        {/* <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label className="text-sm font-medium text-foreground">
                {t('settings.transcription.translateMode')}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t('settings.transcription.translateModeDesc')}
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
              🌐 {t('settings.transcription.translateOpenaiInfo')}
            </div>
          )}
        </div> */}

        {/* API keys – always visible */}
        <Divider />
        <div className="space-y-2">
          <ApiConfigDialog />
          <p className="text-xs text-muted-foreground">
            {t('settings.transcription.apiKeyHelp')}
          </p>
        </div>
      </div>
    </SectionCard>
  );
}
