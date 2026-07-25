import { useTranslation } from "react-i18next";
import { useSettings } from "@/hooks/useSettings";
import { Row, SectionHeader, VtIcon } from "../vt";

const ACCENT = "var(--vt-accent)";

/**
 * Languages used by the Voice Edit "Translate" action.
 *
 * The palette action is a single key, so the target is resolved by an
 * automatic toggle: text detected in another language goes to the primary
 * language, text already in the primary language goes to the secondary one.
 * That covers both "I'm reading English" and "I'm writing to an English
 * speaker" without a second shortcut.
 *
 * Lives on the Shortcuts page, right under the Voice Edit hotkey row.
 */
export function VoiceEditCard() {
  const { t } = useTranslation();
  const { settings, updateSetting } = useSettings();

  const languages = [
    { code: "fr", label: t("settings.transcription.languageFr") },
    { code: "en", label: t("settings.transcription.languageEn") },
    { code: "es", label: t("settings.transcription.languageEs") },
    { code: "de", label: t("settings.transcription.languageDe") },
  ];

  return (
    <div className="vt-card-sectioned" style={{ overflow: "hidden" }}>
      <SectionHeader
        color={ACCENT}
        icon={<VtIcon.sparkle />}
        title={t("voiceEdit.settings.title")}
        description={t("voiceEdit.settings.description")}
      />

      <Row
        label={t("voiceEdit.settings.primaryLang")}
        hint={t("voiceEdit.settings.langHint")}
      >
        <select
          className="vt-select"
          value={settings.voice_edit_primary_lang}
          onChange={(e) =>
            updateSetting("voice_edit_primary_lang", e.target.value)
          }
          style={{ maxWidth: 240 }}
          aria-label={t("voiceEdit.settings.primaryLang")}
        >
          {languages.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.label}
            </option>
          ))}
        </select>
      </Row>

      <Row label={t("voiceEdit.settings.secondaryLang")}>
        <select
          className="vt-select"
          value={settings.voice_edit_secondary_lang}
          onChange={(e) =>
            updateSetting("voice_edit_secondary_lang", e.target.value)
          }
          style={{ maxWidth: 240 }}
          aria-label={t("voiceEdit.settings.secondaryLang")}
        >
          {languages.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.label}
            </option>
          ))}
        </select>
      </Row>
    </div>
  );
}
