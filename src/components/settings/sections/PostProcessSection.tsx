import { useTranslation } from "react-i18next";
import { AlertTriangle, Clock, Sparkles } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSettings } from "@/hooks/useSettings";
import { SectionCard } from "../common/SectionCard";
import { Divider } from "../common/Divider";

type PostProcessProvider = "OpenAI" | "Groq";
type PostProcessMode =
  | "auto"
  | "list"
  | "email"
  | "formal"
  | "casual"
  | "summary"
  | "grammar"
  | "custom";

const MODES: PostProcessMode[] = [
  "auto",
  "list",
  "email",
  "formal",
  "casual",
  "summary",
  "grammar",
  "custom",
];

export function PostProcessSection() {
  const { t } = useTranslation();
  const { settings, updateSetting } = useSettings();

  const provider = settings.post_process_provider;
  const apiKey =
    provider === "OpenAI" ? settings.openai_api_key : settings.groq_api_key;
  const hasApiKey = apiKey.trim().length > 0;
  const missingCustomPrompt =
    settings.post_process_mode === "custom" &&
    settings.post_process_custom_prompt.trim().length === 0;

  return (
    <SectionCard
      id="section-post-process"
      icon={<Sparkles className="w-3.5 h-3.5 text-pink-500" />}
      iconBg="bg-pink-500/10"
      title={t("settings.postProcess.title")}
      subtitle={t("settings.postProcess.subtitle")}
    >
      <div className="space-y-4">
        <div
          className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-muted/30 transition-colors cursor-pointer"
          onClick={() =>
            updateSetting("post_process_enabled", !settings.post_process_enabled)
          }
        >
          <Checkbox
            id="post-process-enabled"
            checked={settings.post_process_enabled}
            onCheckedChange={(checked) =>
              updateSetting("post_process_enabled", checked as boolean)
            }
            className="mt-0.5"
          />
          <div className="flex-1">
            <Label
              htmlFor="post-process-enabled"
              className="text-sm text-foreground cursor-pointer leading-relaxed"
            >
              {t("settings.postProcess.enable")}
            </Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t("settings.postProcess.enableDesc")}
            </p>
          </div>
        </div>

        <div className="flex items-start gap-2 p-3 rounded-md bg-amber-500/10 border border-amber-500/20 text-sm text-amber-600 dark:text-amber-400">
          <Clock className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{t("settings.postProcess.delayWarning")}</span>
        </div>

        {settings.post_process_enabled && (
          <>
            <Divider />

            <div className="space-y-1.5">
              <Label
                htmlFor="post-process-provider"
                className="text-xs font-medium text-muted-foreground uppercase tracking-wide"
              >
                {t("settings.postProcess.provider")}
              </Label>
              <Select
                value={provider}
                onValueChange={(value) =>
                  updateSetting(
                    "post_process_provider",
                    value as PostProcessProvider,
                  )
                }
              >
                <SelectTrigger
                  id="post-process-provider"
                  className="h-9 bg-background/50 w-48"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="OpenAI">
                    {t("settings.postProcess.providerOpenai")}
                  </SelectItem>
                  <SelectItem value="Groq">
                    {t("settings.postProcess.providerGroq")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {!hasApiKey && (
              <div className="flex items-start gap-2 p-3 rounded-md bg-red-500/10 border border-red-500/20 text-sm text-red-600 dark:text-red-400">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>
                  {t("settings.postProcess.missingKey", {
                    provider:
                      provider === "OpenAI"
                        ? t("settings.postProcess.providerOpenai")
                        : t("settings.postProcess.providerGroq"),
                  })}
                </span>
              </div>
            )}

            <div className="space-y-1.5">
              <Label
                htmlFor="post-process-mode"
                className="text-xs font-medium text-muted-foreground uppercase tracking-wide"
              >
                {t("settings.postProcess.mode")}
              </Label>
              <Select
                value={settings.post_process_mode}
                onValueChange={(value) =>
                  updateSetting(
                    "post_process_mode",
                    value as PostProcessMode,
                  )
                }
              >
                <SelectTrigger
                  id="post-process-mode"
                  className="h-9 bg-background/50"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MODES.map((mode) => (
                    <SelectItem key={mode} value={mode}>
                      {t(`settings.postProcess.modes.${mode}.label`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {t(
                  `settings.postProcess.modes.${settings.post_process_mode}.desc`,
                )}
              </p>
            </div>

            {settings.post_process_mode === "custom" && (
              <div className="space-y-1.5">
                <Label
                  htmlFor="post-process-custom-prompt"
                  className="text-xs font-medium text-muted-foreground uppercase tracking-wide"
                >
                  {t("settings.postProcess.customPrompt")}
                </Label>
                <textarea
                  id="post-process-custom-prompt"
                  value={settings.post_process_custom_prompt}
                  onChange={(e) =>
                    updateSetting(
                      "post_process_custom_prompt",
                      e.target.value,
                    )
                  }
                  placeholder={t("settings.postProcess.customPromptPlaceholder")}
                  rows={5}
                  className="w-full resize-y rounded-md border border-input bg-background/50 px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
                {missingCustomPrompt && (
                  <p className="text-xs text-amber-500">
                    {t("settings.postProcess.customPromptRequired")}
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </SectionCard>
  );
}
