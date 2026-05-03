import { useTranslation } from "react-i18next";
import { useSettings } from "@/hooks/useSettings";
import { useModelDownload } from "@/hooks/useModelDownload";
import { ApiConfigDialog } from "@/components/common/ApiConfigDialog";
import {
  Callout,
  PickerCardGrid,
  Row,
  SectionHeader,
  Segmented,
  Toggle,
  VtIcon,
} from "../vt";

const ACCENT = "var(--vt-violet)";

type Provider = "OpenAI" | "Google" | "Local" | "Groq";
type LocalModel =
  | "tiny"
  | "base"
  | "small"
  | "medium"
  | "large-v1"
  | "large-v2"
  | "large-v3"
  | "large-v3-turbo"
  | "large-v3-turbo-q5_0";

export function TranscriptionSection() {
  const { t } = useTranslation();
  const { settings, updateSetting } = useSettings();
  const { isDownloading, progress, isDownloaded, isChecking, download, remove } =
    useModelDownload(settings.transcription_provider, settings.local_model_size);

  const providerOptions = [
    {
      id: "OpenAI" as Provider,
      title: t("settings.transcription.providerOpenai"),
      sub: t("settings.transcription.providerOpenaiSub"),
      dot: "var(--vt-ok)",
    },
    {
      id: "Groq" as Provider,
      title: t("settings.transcription.providerGroq"),
      sub: t("settings.transcription.providerGroqSub"),
      dot: "var(--vt-danger)",
    },
    {
      id: "Local" as Provider,
      title: t("settings.transcription.providerLocal"),
      sub: t("settings.transcription.providerLocalSub"),
      dot: "var(--vt-cyan)",
    },
  ];

  const hasOpenaiKey = settings.openai_api_key.trim().length > 0;
  const hasGroqKey = settings.groq_api_key.trim().length > 0;

  return (
    <div className="vt-anim-fade-up space-y-5">
      <div className="vt-card-sectioned" style={{ overflow: "hidden" }}>
        <SectionHeader
          color={ACCENT}
          icon={<VtIcon.sparkle />}
          title={t("settings.transcription.title")}
          description={t("settings.transcription.subtitle")}
        />

        <Row
          label={t("settings.transcription.provider")}
          hint={t("settings.transcription.providerHint", {
            defaultValue:
              "Change le service de transcription. Chacun a ses compromis vitesse / coût / confidentialité.",
          })}
        >
          <PickerCardGrid
            value={settings.transcription_provider}
            onChange={(v) => updateSetting("transcription_provider", v)}
            options={providerOptions}
            columns={3}
          />
        </Row>

        <Row
          label={t("settings.transcription.language")}
          hint={t("settings.transcription.languageHint", {
            defaultValue:
              "Langue parlée principale. Améliore la précision de la transcription.",
          })}
        >
          <select
            className="vt-select"
            value={settings.language}
            onChange={(e) => updateSetting("language", e.target.value)}
            style={{ maxWidth: 240 }}
          >
            <option value="fr-FR">{t("settings.transcription.languageFr")}</option>
            <option value="en-US">{t("settings.transcription.languageEn")}</option>
            <option value="es-ES">{t("settings.transcription.languageEs")}</option>
            <option value="de-DE">{t("settings.transcription.languageDe")}</option>
          </select>
        </Row>

        {(settings.transcription_provider === "OpenAI" ||
          settings.transcription_provider === "Groq") && (
          <div className="vt-row">
            <Callout
              kind="warn"
              icon={<VtIcon.alert />}
              title={t("settings.transcription.paidWarningTitle", {
                defaultValue: "Service payant",
              })}
            >
              {t("settings.transcription.paidWarning")}
            </Callout>
          </div>
        )}

        {settings.transcription_provider === "Groq" && (
          <Row
            label={t("settings.transcription.groqModel")}
            hint={t("settings.transcription.groqInfo")}
          >
            <select
              className="vt-select"
              value={settings.groq_model}
              onChange={(e) =>
                updateSetting(
                  "groq_model",
                  e.target.value as "whisper-large-v3-turbo" | "whisper-large-v3",
                )
              }
              style={{ maxWidth: 320 }}
            >
              <option value="whisper-large-v3-turbo">
                {t("settings.transcription.groqModelTurbo")} ⭐
              </option>
              <option value="whisper-large-v3">
                {t("settings.transcription.groqModelLargeV3")}
              </option>
            </select>
          </Row>
        )}

        {settings.transcription_provider === "Local" && (
          <>
            <Row
              label={t("settings.transcription.whisperModel")}
              hint={t("settings.transcription.whisperModelHint", {
                defaultValue:
                  "Plus le modèle est grand, plus il est précis mais lent et lourd.",
              })}
            >
              <div className="flex items-center gap-2">
                <select
                  className="vt-select flex-1"
                  value={settings.local_model_size}
                  onChange={(e) =>
                    updateSetting("local_model_size", e.target.value as LocalModel)
                  }
                  disabled={isDownloading}
                >
                  <option value="tiny">{t("settings.transcription.modelTiny")}</option>
                  <option value="base">{t("settings.transcription.modelBase")}</option>
                  <option value="small">{t("settings.transcription.modelSmall")}</option>
                  <option value="medium">{t("settings.transcription.modelMedium")}</option>
                  <option value="large-v1">
                    {t("settings.transcription.modelLargeV1")}
                  </option>
                  <option value="large-v2">
                    {t("settings.transcription.modelLargeV2")}
                  </option>
                  <option value="large-v3">
                    {t("settings.transcription.modelLargeV3")}
                  </option>
                  <option value="large-v3-turbo">
                    {t("settings.transcription.modelLargeV3Turbo")} ⭐
                  </option>
                  <option value="large-v3-turbo-q5_0">
                    {t("settings.transcription.modelLargeV3TurboQ5")}
                  </option>
                </select>

                {isDownloaded ? (
                  <>
                    <span
                      className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md text-[12px] font-medium"
                      style={{
                        color: "var(--vt-ok)",
                        background: "var(--vt-ok-soft)",
                        border: "1px solid oklch(from var(--vt-ok) l c h / 0.3)",
                      }}
                    >
                      <VtIcon.check /> {t("settings.transcription.installed")}
                    </span>
                    <button
                      type="button"
                      onClick={remove}
                      className="vt-btn"
                      data-tip={t("settings.transcription.deleteModel")}
                      style={{
                        color: "var(--vt-danger)",
                        borderColor: "oklch(from var(--vt-danger) l c h / 0.3)",
                      }}
                    >
                      <VtIcon.trash />
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={download}
                    disabled={isDownloading || isChecking}
                    className="vt-btn-primary"
                  >
                    {isDownloading ? (
                      <>
                        <VtIcon.spinner />
                        {Math.round(progress)}%
                      </>
                    ) : (
                      <>
                        <VtIcon.refresh />
                        {t("settings.transcription.download")}
                      </>
                    )}
                  </button>
                )}
              </div>
              {isDownloading && (
                <div
                  className="mt-2 h-1.5 rounded-full overflow-hidden"
                  style={{ background: "var(--vt-surface)" }}
                >
                  <div
                    className="h-full"
                    style={{
                      width: `${progress}%`,
                      background: "var(--vt-accent)",
                      transition: "width .2s",
                    }}
                  />
                </div>
              )}
            </Row>

            {isDownloaded && (
              <Row
                label={t("settings.transcription.keepModelInMemory")}
                hint={t("settings.transcription.keepModelInMemoryDesc")}
              >
                <Segmented
                  value={
                    settings.keep_model_in_memory === null
                      ? "auto"
                      : settings.keep_model_in_memory
                        ? "true"
                        : "false"
                  }
                  onChange={(v) => {
                    const mapped = v === "auto" ? null : v === "true";
                    updateSetting("keep_model_in_memory", mapped);
                  }}
                  options={[
                    { id: "auto", label: t("settings.transcription.keepModelInMemoryAuto") },
                    { id: "true", label: t("common.yes") },
                    { id: "false", label: t("common.no") },
                  ]}
                />
              </Row>
            )}
          </>
        )}

        <Row
          label={t("settings.transcription.apiKeysLabel", {
            defaultValue: "Clés API",
          })}
          hint={t("settings.transcription.apiKeyHelp")}
          align="start"
        >
          <div className="flex flex-col gap-2">
            <ApiKeyRow
              name="OpenAI"
              maskedKey={settings.openai_api_key}
              present={hasOpenaiKey}
            />
            <ApiKeyRow
              name="Groq"
              maskedKey={settings.groq_api_key}
              present={hasGroqKey}
            />
            <div className="mt-1">
              <ApiConfigDialog />
            </div>
          </div>
        </Row>

        <Row
          label={t("settings.transcription.smartFormatting")}
          hint={t("settings.transcription.smartFormattingHint")}
        >
          <Toggle
            on={settings.smart_formatting}
            onClick={() =>
              updateSetting("smart_formatting", !settings.smart_formatting)
            }
            label={
              settings.smart_formatting
                ? t("common.enabled", { defaultValue: "Activé" })
                : t("common.disabled", { defaultValue: "Désactivé" })
            }
          />
        </Row>
      </div>
    </div>
  );
}

interface ApiKeyRowProps {
  name: string;
  maskedKey: string;
  present: boolean;
}

function ApiKeyRow({ name, maskedKey, present }: ApiKeyRowProps) {
  const { t } = useTranslation();
  const masked =
    maskedKey.length > 8
      ? `${maskedKey.slice(0, 3)}${"•".repeat(Math.max(0, maskedKey.length - 6))}${maskedKey.slice(-3)}`
      : undefined;

  return (
    <div
      className="flex items-center justify-between px-3 h-11 rounded-lg"
      style={{ background: "var(--vt-surface)", border: "1px solid var(--vt-border)" }}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <span
          className={`w-2 h-2 rounded-full shrink-0 ${present ? "vt-anim-pulse-dot" : ""}`}
          style={
            present
              ? { background: "var(--vt-ok)", boxShadow: "0 0 6px var(--vt-ok)" }
              : { background: "var(--vt-fg-4)" }
          }
        />
        <span className="text-[13px] font-medium">{name}</span>
        {present ? (
          <span
            className="vt-mono text-[11px] truncate"
            style={{ color: "var(--vt-fg-4)" }}
          >
            {masked}
          </span>
        ) : (
          <span className="text-[11px]" style={{ color: "var(--vt-fg-4)" }}>
            {t("settings.transcription.apiKeyMissing", {
              defaultValue: "Non configurée",
            })}
          </span>
        )}
      </div>
    </div>
  );
}
