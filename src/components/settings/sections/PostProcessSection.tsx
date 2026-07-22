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

export function PostProcessSection() {
  const { t } = useTranslation();
  const { settings, updateSetting } = useSettings();
  const { isCloudEligible } = useCloud();

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

            <div className="vt-row">
              <Callout
                kind="info"
                icon={<VtIcon.wand />}
                title={t("settings.postProcess.autoTitle", {
                  defaultValue: "Mode automatique",
                })}
              >
                {t("settings.postProcess.autoBody")}
              </Callout>
            </div>

            <Row
              label={t("settings.postProcess.customInstructions")}
              hint={t("settings.postProcess.customInstructionsDesc")}
              align="start"
            >
              <div
                className="rounded-lg overflow-hidden"
                style={{
                  border: "1px solid var(--vt-border)",
                  background: "var(--vt-surface)",
                }}
              >
                <textarea
                  value={settings.post_process_custom_instructions}
                  onChange={(e) =>
                    updateSetting(
                      "post_process_custom_instructions",
                      e.target.value.slice(0, 1000),
                    )
                  }
                  placeholder={t("settings.postProcess.customInstructionsPlaceholder")}
                  className="w-full p-3 bg-transparent focus:outline-none text-[13px] resize-none"
                  rows={4}
                  style={{ color: "var(--vt-fg)" }}
                />
                <div
                  className="flex items-center justify-end px-3 py-1.5 border-t"
                  style={{ borderColor: "var(--vt-border)" }}
                >
                  <span
                    className="vt-mono text-[11px]"
                    style={{ color: "var(--vt-fg-3)" }}
                  >
                    {t("settings.postProcess.customInstructionsCount", {
                      count: settings.post_process_custom_instructions.length,
                    })}
                  </span>
                </div>
              </div>
            </Row>
          </>
        )}
      </div>
    </div>
  );
}
