import { Keyboard } from "lucide-react";
import { useSettings } from "@/hooks/useSettings";
import { useHotkeyConfig } from "@/hooks/useHotkeyConfig";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { SectionCard } from "../common/SectionCard";
import { HotkeyInput } from "../common/HotkeyInput";

export function ShortcutsSection() {
  const { settings } = useSettings();
  const { handleHotkeyChange } = useHotkeyConfig();

  return (
    <SectionCard
      id="section-raccourcis"
      icon={<Keyboard className="w-3.5 h-3.5 text-rose-500" />}
      iconBg="bg-rose-500/10"
      title="Raccourcis clavier"
      subtitle="Cliquez sur un raccourci pour le modifier"
    >
      <div className="divide-y divide-border/50">
        <HotkeyInput
          id="shortcut-record"
          label="Toggle enregistrement"
          value={settings.record_hotkey}
          defaultValue={DEFAULT_SETTINGS.settings.record_hotkey}
          description="Démarrer et arrêter l'enregistrement"
          onChange={(shortcut) => handleHotkeyChange("record_hotkey", shortcut)}
        />
        <HotkeyInput
          id="shortcut-push"
          label="Push-to-talk"
          value={settings.ptt_hotkey}
          defaultValue={DEFAULT_SETTINGS.settings.ptt_hotkey}
          description="Maintenir pour enregistrer, relâcher pour transcrire"
          onChange={(shortcut) => handleHotkeyChange("ptt_hotkey", shortcut)}
        />
        <HotkeyInput
          id="shortcut-window"
          label="Afficher la fenêtre"
          value={settings.open_window_hotkey}
          defaultValue={DEFAULT_SETTINGS.settings.open_window_hotkey}
          description="Ouvre et met au premier plan la fenêtre principale"
          onChange={(shortcut) =>
            handleHotkeyChange("open_window_hotkey", shortcut)
          }
        />
        <HotkeyInput
          id="shortcut-cancel"
          label="Annuler l'enregistrement"
          value={settings.cancel_hotkey}
          defaultValue={DEFAULT_SETTINGS.settings.cancel_hotkey}
          description="Stoppe l'enregistrement sans transcrire"
          allowEscape={true}
          onChange={(shortcut) => handleHotkeyChange("cancel_hotkey", shortcut)}
        />
      </div>
    </SectionCard>
  );
}
