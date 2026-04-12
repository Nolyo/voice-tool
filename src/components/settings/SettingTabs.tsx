import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "@/components/ui/button";
import { useSettings } from "@/hooks/useSettings";
import { NAV_ITEM_DEFS, SettingsNav } from "./common/SettingsNav";
import { TranscriptionSection } from "./sections/TranscriptionSection";
import { AudioSection } from "./sections/AudioSection";
import { TextSection } from "./sections/TextSection";
import { VocabularySection } from "./sections/VocabularySection";
import { SystemSection } from "./sections/SystemSection";
import { ShortcutsSection } from "./sections/ShortcutsSection";
import { UpdaterSection } from "./sections/UpdaterSection";

/**
 * Settings screen orchestrator.
 *
 * Responsibilities:
 * - Load gate via `useSettings().isLoaded`
 * - Left-hand nav with scroll-spy (updates `activeSection` based on scroll position)
 * - Assembles all settings sections; each section owns its own state via hooks
 */
export function SettingTabs() {
  const { t } = useTranslation();
  const { isLoaded } = useSettings();
  const [activeSection, setActiveSection] = useState("section-transcription");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    const handleScroll = () => {
      const containerTop = container.getBoundingClientRect().top;
      let current = NAV_ITEM_DEFS[0].id;
      for (const item of NAV_ITEM_DEFS) {
        const el = document.getElementById(item.id);
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (rect.top - containerTop <= 32) {
          current = item.id;
        }
      }
      setActiveSection(current);
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, []);

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">{t('settings.loading')}</p>
      </div>
    );
  }

  return (
    <div className="flex gap-5">
      <SettingsNav activeId={activeSection} scrollContainer={scrollRef} />

      <div
        ref={scrollRef}
        className="flex-1 min-w-0 space-y-8 pb-6 overflow-y-auto max-h-[calc(100vh-160px)] pr-1"
      >
        <TranscriptionSection />
        <AudioSection />
        <TextSection />
        <VocabularySection />
        <SystemSection />
        <ShortcutsSection />
        <UpdaterSection />

        <Button
          variant="destructive"
          className="w-full h-10 font-medium"
          onClick={async () => {
            await invoke("exit_app");
          }}
        >
          {t('settings.quitApp')}
        </Button>
        <div className="my-20">
          <p className="text-center text-sm text-muted-foreground">
            {t('settings.footer')}
          </p>
        </div>
      </div>
    </div>
  );
}
