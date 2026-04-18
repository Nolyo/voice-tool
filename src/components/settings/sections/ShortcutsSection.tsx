import { useTranslation } from "react-i18next";
import { Keyboard } from "lucide-react";
import { useSettings } from "@/hooks/useSettings";
import { useHotkeyConfig } from "@/hooks/useHotkeyConfig";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { SectionCard } from "../common/SectionCard";
import { HotkeyInput } from "../common/HotkeyInput";

export function ShortcutsSection() {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const { handleHotkeyChange } = useHotkeyConfig();

  return (
    <SectionCard
      id="section-raccourcis"
      icon={<Keyboard className="w-3.5 h-3.5 text-rose-500" />}
      iconBg="bg-rose-500/10"
      title={t('settings.shortcuts.title')}
      subtitle={t('settings.shortcuts.subtitle')}
    >
      <div className="divide-y divide-border/50">
        <HotkeyInput
          id="shortcut-record"
          label={t('settings.shortcuts.toggle')}
          value={settings.record_hotkey}
          defaultValue={DEFAULT_SETTINGS.settings.record_hotkey}
          description={t('settings.shortcuts.toggleDesc')}
          onChange={(shortcut) => handleHotkeyChange("record_hotkey", shortcut)}
        />
        <HotkeyInput
          id="shortcut-push"
          label={t('settings.shortcuts.ptt')}
          value={settings.ptt_hotkey}
          defaultValue={DEFAULT_SETTINGS.settings.ptt_hotkey}
          description={t('settings.shortcuts.pttDesc')}
          onChange={(shortcut) => handleHotkeyChange("ptt_hotkey", shortcut)}
        />
        <HotkeyInput
          id="shortcut-window"
          label={t('settings.shortcuts.showWindow')}
          value={settings.open_window_hotkey}
          defaultValue={DEFAULT_SETTINGS.settings.open_window_hotkey}
          description={t('settings.shortcuts.showWindowDesc')}
          onChange={(shortcut) =>
            handleHotkeyChange("open_window_hotkey", shortcut)
          }
        />
        <HotkeyInput
          id="shortcut-cancel"
          label={t('settings.shortcuts.cancel')}
          value={settings.cancel_hotkey}
          defaultValue={DEFAULT_SETTINGS.settings.cancel_hotkey}
          description={t('settings.shortcuts.cancelDesc')}
          allowEscape={true}
          onChange={(shortcut) => handleHotkeyChange("cancel_hotkey", shortcut)}
        />
        <HotkeyInput
          id="shortcut-translate-toggle"
          label={t('settings.shortcuts.translateToggle')}
          value={settings.translate_toggle_hotkey}
          defaultValue={DEFAULT_SETTINGS.settings.translate_toggle_hotkey}
          description={t('settings.shortcuts.translateToggleDesc')}
          onChange={(shortcut) =>
            handleHotkeyChange("translate_toggle_hotkey", shortcut)
          }
        />
      </div>
    </SectionCard>
  );
}
