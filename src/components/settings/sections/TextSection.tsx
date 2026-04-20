import { useTranslation } from "react-i18next";
import { useSettings } from "@/hooks/useSettings";
import { RadioCardList, Row, SectionHeader, Toggle } from "../vt";

const ACCENT = "oklch(0.72 0.15 135)";

type InsertionMode = "cursor" | "clipboard" | "none";

export function TextSection() {
  const { t } = useTranslation();
  const { settings, updateSetting } = useSettings();

  const icon = (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="4 7 4 4 20 4 20 7" />
      <line x1="9" y1="20" x2="15" y2="20" />
      <line x1="12" y1="4" x2="12" y2="20" />
    </svg>
  );

  return (
    <div className="vt-fade-up space-y-5">
      <div className="vt-card-sectioned" style={{ overflow: "hidden" }}>
        <SectionHeader
          color={ACCENT}
          icon={icon}
          title={t("settings.text.title")}
          description={t("settings.text.subtitle")}
        />

        <Row
          label={t("settings.text.insertionMode")}
          hint={t("settings.text.insertionModeHint", {
            defaultValue: "Choisis la méthode la plus fiable selon l'application cible.",
          })}
          align="start"
        >
          <RadioCardList<InsertionMode>
            value={settings.insertion_mode}
            onChange={(v) => updateSetting("insertion_mode", v)}
            options={[
              {
                id: "cursor",
                title: t("settings.text.modeCursor"),
                sub: t("settings.text.modeCursorDesc"),
                badge: t("common.recommended", { defaultValue: "Recommandé" }),
              },
              {
                id: "clipboard",
                title: t("settings.text.modeClipboard"),
                sub: t("settings.text.modeClipboardDesc"),
              },
              {
                id: "none",
                title: t("settings.text.modeNone"),
                sub: t("settings.text.modeNoneDesc"),
              },
            ]}
          />
        </Row>

        <Row
          label={t("settings.text.smartFormatting")}
          hint={t("settings.text.smartFormattingHint", {
            defaultValue: "Corrige majuscules, ponctuation et espaces avant insertion.",
          })}
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
