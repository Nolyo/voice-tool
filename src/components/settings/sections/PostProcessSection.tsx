import { useTranslation } from "react-i18next";
import { useSettings } from "@/hooks/useSettings";
import { useCloud } from "@/hooks/useCloud";
import {
  Callout,
  Row,
  SectionHeader,
  Toggle,
  VtIcon,
} from "../vt";

const ACCENT = "var(--vt-pin)";

type PostProcessMode =
  | "auto"
  | "list"
  | "email"
  | "formal"
  | "casual"
  | "summary"
  | "grammar";

export function PostProcessSection() {
  const { t } = useTranslation();
  const { settings, updateSetting } = useSettings();
  const { isCloudEligible } = useCloud();

  const modes: PostProcessMode[] = [
    "auto",
    "list",
    "email",
    "formal",
    "casual",
    "summary",
    "grammar",
  ];
  const recommendedLabel = t("common.recommended", { defaultValue: "Recommandé" });
  const activeModeDesc = t(
    `settings.postProcess.modes.${settings.post_process_mode}.desc`,
  );

  return (
    <div className="vt-anim-fade-up space-y-5">
      <div className="vt-card-sectioned" style={{ overflow: "hidden" }}>
        <SectionHeader
          color={ACCENT}
          icon={<VtIcon.wand />}
          title={t("settings.postProcess.title")}
          description={t("settings.postProcess.subtitle")}
          trailing={
            settings.post_process_enabled && isCloudEligible ? (
              <div
                className="flex items-center gap-2 text-[11px] px-2.5 h-7 rounded-md vt-mono"
                style={{
                  background: "oklch(from var(--vt-accent) l c h / 0.1)",
                  color: "var(--vt-accent-2)",
                  border: "1px solid oklch(from var(--vt-accent) l c h / 0.25)",
                }}
              >
                <span
                  className="vt-anim-pulse-dot w-1.5 h-1.5 rounded-full"
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
            on={settings.post_process_enabled && isCloudEligible}
            disabled={!isCloudEligible}
            onClick={() => {
              if (!isCloudEligible) return;
              updateSetting(
                "post_process_enabled",
                !settings.post_process_enabled,
              );
            }}
            label={
              !isCloudEligible
                ? t("common.disabled", { defaultValue: "Désactivé" })
                : settings.post_process_enabled
                  ? t("common.enabled", { defaultValue: "Activé" })
                  : t("common.disabled", { defaultValue: "Désactivé" })
            }
          />
        </Row>

        {!isCloudEligible && (
          <div className="vt-row">
            <Callout
              kind="info"
              icon={<VtIcon.sparkle />}
              title={t("settings.postProcess.cloudUpsellTitle")}
            >
              {t("settings.postProcess.cloudUpsellBody")}
            </Callout>
          </div>
        )}

        {isCloudEligible && settings.post_process_enabled && (
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
              label={t("settings.postProcess.mode")}
              hint={t("settings.postProcess.modeHint", {
                defaultValue: "Détermine le style appliqué à la sortie.",
              })}
              align="start"
            >
              <div className="flex flex-col gap-2" style={{ maxWidth: 360 }}>
                <select
                  className="vt-select"
                  value={settings.post_process_mode}
                  onChange={(e) =>
                    updateSetting(
                      "post_process_mode",
                      e.target.value as PostProcessMode,
                    )
                  }
                >
                  {modes.map((m) => {
                    const label = t(`settings.postProcess.modes.${m}.label`);
                    return (
                      <option key={m} value={m}>
                        {m === "auto" ? `${label} — ${recommendedLabel}` : label}
                      </option>
                    );
                  })}
                </select>
                <span
                  className="text-[12px] leading-snug"
                  style={{ color: "var(--vt-fg-3)" }}
                >
                  {activeModeDesc}
                </span>
              </div>
            </Row>
          </>
        )}
      </div>
    </div>
  );
}
