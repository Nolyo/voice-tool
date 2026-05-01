import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Github, RefreshCw } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useSettings } from "@/hooks/useSettings";
import { LexenaWordmark } from "@/components/common/LexenaWordmark";
import { type SettingsSectionId } from "../common/SettingsNav";
import { Callout, SectionHeader, VtIcon } from "../vt";

const ACCENT = "oklch(0.72 0.16 130)";
const GITHUB_URL = "https://github.com/Nolyo/lexena";

interface AboutSectionProps {
  onSectionChange?: (id: SettingsSectionId) => void;
}

export function AboutSection({ onSectionChange }: AboutSectionProps) {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const [version, setVersion] = useState<string>("");
  const [versionError, setVersionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { getVersion } = await import("@tauri-apps/api/app");
        const v = await getVersion();
        if (!cancelled) setVersion(v);
      } catch (err) {
        if (!cancelled) {
          console.error("Failed to get app version:", err);
          setVersionError(String(err));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const wordmarkVariant = settings.theme === "light" ? "light" : "dark";

  const handleOpenGithub = async () => {
    try {
      await openUrl(GITHUB_URL);
    } catch (err) {
      console.error("Failed to open GitHub URL:", err);
    }
  };

  return (
    <div className="vt-fade-up space-y-5">
      <div className="vt-card-sectioned" style={{ overflow: "hidden" }}>
        <SectionHeader
          color={ACCENT}
          icon={<VtIcon.info />}
          title={t("settings.about.title", { defaultValue: "À propos" })}
          description={t("settings.about.subtitle", {
            defaultValue: "Informations sur l'application Lexena.",
          })}
        />

        <div className="vt-row">
          <div className="flex flex-col items-center gap-4 py-4">
            <LexenaWordmark variant={wordmarkVariant} height={32} />
            <p
              className="text-[15px] font-medium text-center"
              style={{ color: "var(--vt-fg-2)" }}
            >
              {t("settings.about.slogan", {
                defaultValue: "Capturez vos idées, précisément.",
              })}
            </p>
            {version ? (
              <span
                className="vt-mono text-[12px] px-2 py-0.5 rounded"
                style={{
                  background: "var(--vt-surface-hi)",
                  color: "var(--vt-fg-3)",
                }}
              >
                v{version}
              </span>
            ) : versionError ? (
              <span
                className="text-[11px]"
                style={{ color: "var(--vt-fg-4)" }}
              >
                {t("settings.about.versionUnavailable", {
                  defaultValue: "Version indisponible",
                })}
              </span>
            ) : null}
          </div>
        </div>

        <div className="vt-row">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-0.5">
              <span className="text-[13px] font-semibold">
                {t("settings.about.sourceCode", {
                  defaultValue: "Code source",
                })}
              </span>
              <span
                className="text-[12px]"
                style={{ color: "var(--vt-fg-3)" }}
              >
                {t("settings.about.sourceCodeDesc", {
                  defaultValue: "Le projet est open-source sur GitHub.",
                })}
              </span>
            </div>
            <button
              type="button"
              onClick={handleOpenGithub}
              className="vt-btn inline-flex items-center gap-2"
            >
              <Github className="w-4 h-4" />
              {t("settings.about.openGithub", {
                defaultValue: "Ouvrir GitHub",
              })}
            </button>
          </div>
        </div>

        {onSectionChange && (
          <div className="vt-row">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-col gap-0.5">
                <span className="text-[13px] font-semibold">
                  {t("settings.about.checkUpdates", {
                    defaultValue: "Mises à jour",
                  })}
                </span>
                <span
                  className="text-[12px]"
                  style={{ color: "var(--vt-fg-3)" }}
                >
                  {t("settings.about.checkUpdatesDesc", {
                    defaultValue:
                      "Vérifier la disponibilité d'une nouvelle version.",
                  })}
                </span>
              </div>
              <button
                type="button"
                onClick={() => onSectionChange("section-mises-a-jour")}
                className="vt-btn-primary inline-flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                {t("settings.about.checkUpdatesBtn", {
                  defaultValue: "Vérifier les mises à jour",
                })}
              </button>
            </div>
          </div>
        )}
      </div>

      {versionError && (
        <Callout
          kind="danger"
          icon={<VtIcon.alert />}
          title={t("settings.about.versionErrorTitle", {
            defaultValue: "Impossible de récupérer la version",
          })}
        >
          {versionError}
        </Callout>
      )}
    </div>
  );
}
