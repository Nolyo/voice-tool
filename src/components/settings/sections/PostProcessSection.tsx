import { useTranslation } from "react-i18next";
import { useSettings } from "@/hooks/useSettings";
import {
  Callout,
  PickerCardGrid,
  RadioCardList,
  Row,
  SectionHeader,
  Toggle,
  VtIcon,
} from "../vt";

const ACCENT = "oklch(0.72 0.18 15)";

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

  const modeOptions: { id: PostProcessMode; title: string; sub: string; badge?: string }[] =
    (
      [
        "auto",
        "list",
        "email",
        "formal",
        "casual",
        "summary",
        "grammar",
        "custom",
      ] as PostProcessMode[]
    ).map((m) => ({
      id: m,
      title: t(`settings.postProcess.modes.${m}.label`),
      sub: t(`settings.postProcess.modes.${m}.desc`),
      badge: m === "auto" ? t("common.recommended", { defaultValue: "Recommandé" }) : undefined,
    }));

  return (
    <>
      <div className="vt-card-sectioned" style={{ overflow: "hidden" }}>
        <SectionHeader
          color={ACCENT}
          icon={<VtIcon.wand />}
          title={t("settings.postProcess.title")}
          description={t("settings.postProcess.subtitle")}
          trailing={
            settings.post_process_enabled ? (
              <div
                className="flex items-center gap-2 text-[11px] px-2.5 h-7 rounded-md vt-mono"
                style={{
                  background: "oklch(from var(--vt-accent) l c h / 0.1)",
                  color: "var(--vt-accent-2)",
                  border: "1px solid oklch(from var(--vt-accent) l c h / 0.25)",
                }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{
                    background: "var(--vt-accent-2)",
                    boxShadow: "0 0 8px currentColor",
                  }}
                />
                {t("common.active", { defaultValue: "Actif" })}
              </div>
            ) : null
          }
        />

        <Row
          label={t("settings.postProcess.enable")}
          hint={t("settings.postProcess.enableDesc")}
        >
          <Toggle
            on={settings.post_process_enabled}
            onClick={() =>
              updateSetting(
                "post_process_enabled",
                !settings.post_process_enabled,
              )
            }
            label={
              settings.post_process_enabled
                ? t("common.enabled", { defaultValue: "Activé" })
                : t("common.disabled", { defaultValue: "Désactivé" })
            }
          />
        </Row>

        {settings.post_process_enabled && (
          <>
            <div className="vt-row" style={{ background: "var(--vt-hover-soft)" }}>
              <Callout
                kind="warn"
                icon={<VtIcon.clock />}
                title={t("settings.postProcess.delayWarningTitle", {
                  defaultValue: "Latence supplémentaire",
                })}
              >
                {t("settings.postProcess.delayWarning")}
              </Callout>
            </div>

            <Row
              label={t("settings.postProcess.provider")}
              hint={t("settings.postProcess.providerHint", {
                defaultValue: "Service appelé pour la reformulation.",
              })}
            >
              <PickerCardGrid
                value={provider}
                onChange={(v) => updateSetting("post_process_provider", v)}
                options={[
                  {
                    id: "OpenAI" as PostProcessProvider,
                    title: t("settings.postProcess.providerOpenai"),
                    sub: "gpt-4.1-mini",
                    dot: "oklch(0.72 0.17 155)",
                  },
                  {
                    id: "Groq" as PostProcessProvider,
                    title: t("settings.postProcess.providerGroq"),
                    sub: "llama-3.3-70b",
                    dot: "oklch(0.72 0.18 15)",
                  },
                ]}
                columns={2}
              />
            </Row>

            {!hasApiKey && (
              <div className="vt-row">
                <Callout
                  kind="danger"
                  icon={<VtIcon.alert />}
                  title={t("settings.postProcess.missingKeyTitle", {
                    defaultValue: "Clé API manquante",
                  })}
                >
                  {t("settings.postProcess.missingKey", {
                    provider:
                      provider === "OpenAI"
                        ? t("settings.postProcess.providerOpenai")
                        : t("settings.postProcess.providerGroq"),
                  })}
                </Callout>
              </div>
            )}

            <Row
              label={t("settings.postProcess.mode")}
              hint={t("settings.postProcess.modeHint", {
                defaultValue: "Détermine le style appliqué à la sortie.",
              })}
              align="start"
            >
              <RadioCardList<PostProcessMode>
                value={settings.post_process_mode}
                onChange={(v) => updateSetting("post_process_mode", v)}
                options={modeOptions}
              />
            </Row>

            {settings.post_process_mode === "custom" && (
              <Row
                label={t("settings.postProcess.customPrompt")}
                hint={
                  missingCustomPrompt
                    ? t("settings.postProcess.customPromptRequired")
                    : t("settings.postProcess.customPromptHint", {
                        defaultValue: "Instruction utilisée par l'IA sur chaque dictée.",
                      })
                }
                align="start"
              >
                <div
                  className="rounded-lg overflow-hidden"
                  style={{
                    border: "1px solid var(--vt-border)",
                    background: "var(--vt-surface)",
                  }}
                >
                  <div
                    className="flex items-center justify-between px-3 py-1.5 border-b"
                    style={{
                      borderColor: "var(--vt-border)",
                      background: "var(--vt-hover-soft)",
                    }}
                  >
                    <span
                      className="vt-mono text-[11px]"
                      style={{ color: "var(--vt-fg-3)" }}
                    >
                      prompt.md
                    </span>
                  </div>
                  <textarea
                    className="w-full p-3 bg-transparent focus:outline-none vt-mono text-[12.5px] resize-none"
                    rows={5}
                    value={settings.post_process_custom_prompt}
                    onChange={(e) =>
                      updateSetting("post_process_custom_prompt", e.target.value)
                    }
                    placeholder={t("settings.postProcess.customPromptPlaceholder")}
                    style={{ color: "var(--vt-fg)" }}
                  />
                </div>
              </Row>
            )}
          </>
        )}
      </div>

      {settings.post_process_enabled && hasApiKey && (
        <Callout
          kind="ok"
          icon={<VtIcon.check />}
          title={t("settings.postProcess.keyActiveTitle", {
            defaultValue: `Clé ${provider} active`,
            provider,
          })}
        >
          {t("settings.postProcess.keyActiveBody", {
            defaultValue: "Le post-traitement s'appliquera après chaque transcription.",
          })}
        </Callout>
      )}
    </>
  );
}
