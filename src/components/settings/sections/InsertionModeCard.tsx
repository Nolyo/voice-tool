import { useTranslation } from "react-i18next";
import { useSettings } from "@/hooks/useSettings";
import { RadioCardList, Row, SectionHeader, VtIcon } from "../vt";

const ACCENT = "var(--vt-accent)";

type InsertionMode = "cursor" | "clipboard" | "none";

/**
 * "Insertion mode" card — controls how transcribed text is delivered
 * (at cursor, via clipboard, or not at all). Lives on the Shortcuts page since
 * it sits next to the keyboard-driven output behaviour. Reuses the existing
 * `settings.system.*` translation keys (the control only moved pages).
 */
export function InsertionModeCard() {
  const { t } = useTranslation();
  const { settings, updateSetting } = useSettings();

  return (
    <div className="vt-card-sectioned" style={{ overflow: "hidden" }}>
      <SectionHeader
        color={ACCENT}
        icon={<VtIcon.clipboard />}
        title={t("settings.system.insertionMode")}
        description={t("settings.system.insertionModeHint")}
      />
      <Row
        label={t("settings.system.insertionMode")}
        hint={t("settings.system.insertionModeHint")}
        align="start"
      >
        <RadioCardList<InsertionMode>
          value={settings.insertion_mode}
          onChange={(v) => updateSetting("insertion_mode", v)}
          options={[
            {
              id: "cursor",
              title: t("settings.system.modeCursor"),
              sub: t("settings.system.modeCursorDesc"),
              badge: t("common.recommended", { defaultValue: "Recommandé" }),
            },
            {
              id: "clipboard",
              title: t("settings.system.modeClipboard"),
              sub: t("settings.system.modeClipboardDesc"),
            },
            {
              id: "none",
              title: t("settings.system.modeNone"),
              sub: t("settings.system.modeNoneDesc"),
            },
          ]}
        />
      </Row>
    </div>
  );
}
