import { Fragment } from "react";
import { History, Mic, Plus, Zap } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSettings } from "@/hooks/useSettings";
import { KeyBadge } from "@/components/settings/common/KeyBadge";

interface QuickActionsCardProps {
  onCreateNote: () => void;
  onViewHistory: () => void;
}

/** Renders a hotkey string ("Ctrl+F11") as a row of key badges. */
function HotkeyTokens({ shortcut }: { shortcut: string }) {
  const tokens = shortcut.split("+").map((s) => s.trim()).filter(Boolean);
  return (
    <span className="inline-flex items-center gap-0.5">
      {tokens.map((tok, i) => (
        <Fragment key={`${tok}-${i}`}>
          {i > 0 && <span className="text-[var(--vt-fg-3)] text-[11px]">+</span>}
          <KeyBadge token={tok} />
        </Fragment>
      ))}
    </span>
  );
}

/**
 * Quick-access actions for the home screen: create a note, jump to the
 * transcription history, and a reminder of the recording hotkeys.
 */
export function QuickActionsCard({
  onCreateNote,
  onViewHistory,
}: QuickActionsCardProps) {
  const { t } = useTranslation();
  const { settings } = useSettings();

  const recordHotkey = settings.record_hotkey || "Ctrl+F11";
  const pttHotkey = settings.ptt_hotkey || "Ctrl+F12";

  return (
    <div className="vt-card-elevated p-5">
      <div className="flex items-center gap-2">
        <Zap className="w-4 h-4 text-[var(--vt-fg-3)]" />
        <h3 className="vt-display text-[15px] font-semibold text-[var(--vt-fg)]">
          {t("home.quickActions.title")}
        </h3>
      </div>

      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onCreateNote}
          className="flex items-center gap-3 text-left px-3 py-2.5 rounded-lg bg-foreground/[0.03] hover:bg-foreground/[0.06] transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-center w-8 h-8 rounded-md bg-[var(--vt-accent-soft)] text-[var(--vt-accent)] shrink-0">
            <Plus className="w-4 h-4" />
          </div>
          <span className="text-[13px] font-medium text-[var(--vt-fg)]">
            {t("home.quickActions.newNote")}
          </span>
        </button>

        <button
          type="button"
          onClick={onViewHistory}
          className="flex items-center gap-3 text-left px-3 py-2.5 rounded-lg bg-foreground/[0.03] hover:bg-foreground/[0.06] transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-center w-8 h-8 rounded-md bg-[var(--vt-surface)] text-[var(--vt-fg-3)] shrink-0">
            <History className="w-4 h-4" />
          </div>
          <span className="text-[13px] font-medium text-[var(--vt-fg)]">
            {t("home.quickActions.viewHistory")}
          </span>
        </button>
      </div>

      <div className="mt-3 flex flex-col gap-2 rounded-lg bg-foreground/[0.03] px-3 py-2.5">
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-1.5 text-[12.5px] text-[var(--vt-fg-2)]">
            <Mic className="w-3.5 h-3.5 text-[var(--vt-fg-3)]" />
            {t("home.quickActions.recordHint")}
          </span>
          <HotkeyTokens shortcut={recordHotkey} />
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-[12.5px] text-[var(--vt-fg-2)] pl-5">
            {t("home.quickActions.pttHint")}
          </span>
          <HotkeyTokens shortcut={pttHotkey} />
        </div>
      </div>
    </div>
  );
}
