import { useTranslation } from "react-i18next";
import { useSettings } from "@/hooks/useSettings";
import { useAutostart } from "@/hooks/useAutostart";
import { changeLanguage } from "@/i18n";
import { Row, SectionHeader, Segmented, Toggle, VtIcon } from "../vt";
import { DangerZone } from "./DangerZone";

const ACCENT = "oklch(0.72 0.16 75)";

type ThemeId = "dark" | "light";
type LangId = "fr" | "en";

export function SystemSection() {
  const { t } = useTranslation();
  const { settings, updateSetting } = useSettings();
  const { enabled: autoStartEnabled, isUpdating: isUpdatingAutostart, toggle } =
    useAutostart();

  const keep = settings.recordings_keep_last;

  const systemIcon = (
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
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  );

  return (
    <div className="vt-fade-up space-y-5">
      <div className="vt-card-sectioned" style={{ overflow: "hidden" }}>
        <SectionHeader
          color={ACCENT}
          icon={systemIcon}
          title={t("settings.system.title")}
          description={t("settings.system.subtitle")}
        />

        <Row
          label={t("settings.system.language")}
          hint={t("settings.system.languageDesc")}
        >
          <select
            className="vt-select"
            value={settings.ui_language}
            onChange={async (e) => {
              const v = e.target.value as LangId;
              await updateSetting("ui_language", v);
              changeLanguage(v);
            }}
            style={{ maxWidth: 240 }}
          >
            <option value="fr">Français</option>
            <option value="en">English</option>
          </select>
        </Row>

        <Row
          label={t("settings.system.theme")}
          hint={t("settings.system.themeDesc")}
        >
          <Segmented<ThemeId>
            value={settings.theme}
            onChange={(v) => updateSetting("theme", v)}
            options={[
              {
                id: "dark",
                label: t("settings.system.themeDark"),
                icon: <VtIcon.dark />,
              },
              {
                id: "light",
                label: t("settings.system.themeLight"),
                icon: <VtIcon.light />,
              },
            ]}
          />
        </Row>

        <Row
          label={t("settings.system.startWithWindows")}
          hint={t("settings.system.startWithWindowsHint", {
            defaultValue: "Comportement au lancement de Windows.",
          })}
          align="start"
        >
          <div className="flex flex-col gap-3">
            <Toggle
              on={autoStartEnabled}
              onClick={() => toggle(!autoStartEnabled)}
              label={t("settings.system.startWithWindows")}
              hint={
                isUpdatingAutostart ? t("settings.system.updating") : undefined
              }
              disabled={isUpdatingAutostart}
            />
            <div
              style={{
                opacity: autoStartEnabled ? 1 : 0.4,
                pointerEvents: autoStartEnabled ? "auto" : "none",
                paddingLeft: 46,
              }}
            >
              <Toggle
                on={settings.start_minimized_on_boot}
                onClick={() =>
                  updateSetting(
                    "start_minimized_on_boot",
                    !settings.start_minimized_on_boot,
                  )
                }
                label={t("settings.system.startMinimized")}
              />
            </div>
          </div>
        </Row>

        <Row
          label={t("settings.system.recordingsKeep")}
          hint={t("settings.system.recordingsKeepHelp")}
        >
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                updateSetting("recordings_keep_last", Math.max(0, keep - 1))
              }
              className="w-9 h-9 rounded-md flex items-center justify-center"
              style={{
                background: "var(--vt-surface)",
                border: "1px solid var(--vt-border)",
                color: "var(--vt-fg-2)",
              }}
            >
              <VtIcon.minus />
            </button>
            <input
              type="number"
              value={keep}
              onChange={(e) =>
                updateSetting(
                  "recordings_keep_last",
                  Math.max(0, Number.parseInt(e.target.value) || 0),
                )
              }
              className="vt-mono w-20 h-9 rounded-md text-center text-[13px]"
              style={{
                background: "var(--vt-surface)",
                border: "1px solid var(--vt-border)",
                color: "var(--vt-fg)",
              }}
            />
            <button
              type="button"
              onClick={() => updateSetting("recordings_keep_last", keep + 1)}
              className="w-9 h-9 rounded-md flex items-center justify-center"
              style={{
                background: "var(--vt-surface)",
                border: "1px solid var(--vt-border)",
                color: "var(--vt-fg-2)",
              }}
            >
              <VtIcon.plus />
            </button>
          </div>
        </Row>
      </div>

      <DangerZone />
    </div>
  );
}
