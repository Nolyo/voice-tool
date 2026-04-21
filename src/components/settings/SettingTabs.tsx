import { useTranslation } from "react-i18next";
import { useSettings } from "@/hooks/useSettings";
import { type SettingsSectionId } from "./common/SettingsNav";
import { TranscriptionSection } from "./sections/TranscriptionSection";
import { AudioSection } from "./sections/AudioSection";
import { TextSection } from "./sections/TextSection";
import { VocabularySection } from "./sections/VocabularySection";
import { SystemSection } from "./sections/SystemSection";
import { MiniWindowSection } from "./sections/MiniWindowSection";
import { ShortcutsSection } from "./sections/ShortcutsSection";
import { UpdaterSection } from "./sections/UpdaterSection";

interface SettingTabsProps {
  activeSection: SettingsSectionId;
}

/**
 * Settings screen orchestrator.
 *
 * Renders only the section selected in the main sidebar. The sub-navigation
 * lives in DashboardSidebar (SettingsSidebarSection).
 */
export function SettingTabs({ activeSection }: SettingTabsProps) {
  const { t } = useTranslation();
  const { isLoaded } = useSettings();

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">{t('settings.loading')}</p>
      </div>
    );
  }

  return (
    <div className="vt-app mx-auto max-w-4xl px-3 py-6 sm:px-4 md:px-6">
      {activeSection === "section-transcription" && <TranscriptionSection />}
      {activeSection === "section-audio" && <AudioSection />}
      {activeSection === "section-texte" && <TextSection />}
      {activeSection === "section-vocabulaire" && <VocabularySection />}
      {activeSection === "section-systeme" && <SystemSection />}
      {activeSection === "section-mini-window" && <MiniWindowSection />}
      {activeSection === "section-raccourcis" && <ShortcutsSection />}
      {activeSection === "section-mises-a-jour" && <UpdaterSection />}
    </div>
  );
}
