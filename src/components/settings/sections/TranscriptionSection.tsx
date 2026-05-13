import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useSettings } from "@/hooks/useSettings";
import { useModelDownload } from "@/hooks/useModelDownload";
import { useCloud } from "@/hooks/useCloud";
import { useAuth } from "@/hooks/useAuth";
import type { SettingsSectionId } from "../common/SettingsNav";
import {
  PickerCardGrid,
  Row,
  SectionHeader,
  Segmented,
  Toggle,
  VtIcon,
} from "../vt";

const ACCENT = "var(--vt-violet)";

type Provider = "Local" | "LexenaCloud";
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

interface TranscriptionSectionProps {
  onSectionChange?: (id: SettingsSectionId) => void;
}

/**
 * Computes the cloud-eligibility chip displayed on the LexenaCloud provider
 * card so the user sees, at a glance, why picking cloud might or might not
 * work. Mirrors the gating logic in `useRecordingWorkflow` and the Rust
 * `cloud_gate` so the UI signal is consistent with what would happen on
 * record.
 */
function cloudStatusVariant({
  isSignedIn,
  isCloudEligible,
  trialActive,
  planName,
}: {
  isSignedIn: boolean;
  isCloudEligible: boolean;
  trialActive: boolean;
  planName: string | null;
}): { kind: "signin" | "trial" | "plan" | "none"; planName?: string } {
  if (!isSignedIn) return { kind: "signin" };
  if (isCloudEligible) {
    if (planName) return { kind: "plan", planName };
    if (trialActive) return { kind: "trial" };
  }
  return { kind: "none" };
}

export function TranscriptionSection({ onSectionChange }: TranscriptionSectionProps) {
  const { t } = useTranslation();
  const { settings, updateSetting } = useSettings();
  const { isDownloading, progress, isDownloaded, isChecking, download, remove } =
    useModelDownload(settings.transcription_provider, settings.local_model_size);
  const { isCloudEligible, trial, plan } = useCloud();
  const { user, openAuthModal } = useAuth();

  const isSignedIn = Boolean(user);
  const planName = plan?.plan ?? null;
  const status = cloudStatusVariant({
    isSignedIn,
    isCloudEligible,
    trialActive: trial.is_active,
    planName,
  });

  const cloudStatusBadge =
    status.kind === "signin" ? (
      <ProviderBadge color="var(--vt-danger)">
        {t("settings.transcription.cloudStatus.signinRequired")}
      </ProviderBadge>
    ) : status.kind === "plan" ? (
      <ProviderBadge color="var(--vt-ok)">
        {t("settings.transcription.cloudStatus.planActive", {
          plan: status.planName,
        })}
      </ProviderBadge>
    ) : status.kind === "trial" ? (
      <ProviderBadge color="var(--vt-ok)">
        {t("settings.transcription.cloudStatus.trialActive")}
      </ProviderBadge>
    ) : (
      <ProviderBadge color="var(--vt-warn)">
        {t("settings.transcription.cloudStatus.noActivePlan")}
      </ProviderBadge>
    );

  const providerOptions = [
    {
      id: "Local" as Provider,
      title: t("settings.transcription.providerLocal"),
      sub: t("settings.transcription.providerLocalSub"),
      dot: "var(--vt-cyan)",
    },
    {
      id: "LexenaCloud" as Provider,
      title: t("settings.transcription.providerLexenaCloud"),
      sub: t("settings.transcription.providerLexenaCloudSub"),
      dot: "var(--vt-accent)",
      badge: (
        <div className="flex items-center gap-1.5">
          <ProviderBadge color="var(--vt-accent)">
            {t("settings.transcription.providerBetaBadge")}
          </ProviderBadge>
          {cloudStatusBadge}
        </div>
      ),
    },
  ];

  const cloudSelected = settings.transcription_provider === "LexenaCloud";
  const showCloudBanner = cloudSelected && !isCloudEligible;

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
          hint={t("settings.transcription.providerHint")}
        >
          <div className="flex flex-col gap-2">
            <PickerCardGrid
              value={settings.transcription_provider}
              onChange={(v) => updateSetting("transcription_provider", v)}
              options={providerOptions}
              columns={2}
            />
            {showCloudBanner && (
              <CloudEligibilityBanner
                isSignedIn={isSignedIn}
                onSignIn={() => openAuthModal()}
                onManagePlan={() => onSectionChange?.("section-cloud")}
                t={t}
              />
            )}
          </div>
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

interface ProviderBadgeProps {
  color: string;
  children: ReactNode;
}

function ProviderBadge({ color, children }: ProviderBadgeProps) {
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide"
      style={{
        color,
        background: `oklch(from ${color} l c h / 0.16)`,
        border: `1px solid oklch(from ${color} l c h / 0.32)`,
      }}
    >
      {children}
    </span>
  );
}

interface CloudEligibilityBannerProps {
  isSignedIn: boolean;
  onSignIn: () => void;
  onManagePlan: () => void;
  t: (key: string, opts?: Record<string, unknown>) => string;
}

function CloudEligibilityBanner({
  isSignedIn,
  onSignIn,
  onManagePlan,
  t,
}: CloudEligibilityBannerProps) {
  const titleKey = isSignedIn
    ? "settings.transcription.cloudBanner.noPlanTitle"
    : "settings.transcription.cloudBanner.signinRequiredTitle";
  const bodyKey = isSignedIn
    ? "settings.transcription.cloudBanner.noPlanBody"
    : "settings.transcription.cloudBanner.signinRequiredBody";

  return (
    <div
      className="rounded-lg px-3 py-2.5 flex items-start gap-3"
      style={{
        background: "oklch(from var(--vt-warn) l c h / 0.10)",
        border: "1px solid oklch(from var(--vt-warn) l c h / 0.32)",
      }}
    >
      <span
        className="mt-0.5 shrink-0"
        style={{ color: "var(--vt-warn)" }}
      >
        <VtIcon.alert />
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-[12.5px] font-semibold">{t(titleKey)}</div>
        <div
          className="text-[12px] mt-0.5 leading-relaxed"
          style={{ color: "var(--vt-fg-3)" }}
        >
          {t(bodyKey)}
        </div>
      </div>
      <button
        type="button"
        onClick={isSignedIn ? onManagePlan : onSignIn}
        className="vt-btn-primary shrink-0"
        style={{ height: 30 }}
      >
        {isSignedIn
          ? t("settings.transcription.cloudBanner.managePlanCta")
          : t("settings.transcription.cloudBanner.signinCta")}
      </button>
    </div>
  );
}
