import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSettings } from "@/hooks/useSettings";
import { useHotkeyConfig } from "@/hooks/useHotkeyConfig";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { buildShortcutFromEvent } from "../common/HotkeyInput";
import { Callout, Kbd, SectionHeader, VtIcon } from "../vt";

const ACCENT = "var(--vt-accent)";

type HotkeyKey =
  | "record_hotkey"
  | "ptt_hotkey"
  | "open_window_hotkey"
  | "cancel_hotkey"
  | "post_process_toggle_hotkey";

interface HotkeyRowProps {
  label: string;
  sub: string;
  value: string;
  defaultValue: string;
  listening: boolean;
  onStartRecording: () => void;
  onCancel: () => void;
  onReset: () => void;
  allowEscape?: boolean;
  onCommit: (shortcut: string) => Promise<void>;
}

function HotkeyRow({
  label,
  sub,
  value,
  defaultValue,
  listening,
  onStartRecording,
  onCancel,
  onReset,
  allowEscape,
  onCommit,
}: HotkeyRowProps) {
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!listening) return;

    const handler = async (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();

      if (event.key === "Escape" && !allowEscape) {
        onCancel();
        setError(null);
        return;
      }

      const shortcut = buildShortcutFromEvent(event);
      if (!shortcut) return;

      if (value && value.toLowerCase() === shortcut.toLowerCase()) {
        onCancel();
        setError(null);
        return;
      }

      setSaving(true);
      try {
        await onCommit(shortcut);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setSaving(false);
        onCancel();
      }
    };

    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [listening, onCommit, value, allowEscape, onCancel]);

  const handleReset = useCallback(async () => {
    if (value.toLowerCase() === defaultValue.toLowerCase()) return;
    setSaving(true);
    try {
      await onCommit(defaultValue);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
      onReset();
    }
  }, [defaultValue, onCommit, onReset, value]);

  const tokens = value ? value.split("+").map((s) => s.trim()).filter(Boolean) : [];
  const isDefault = value.toLowerCase() === defaultValue.toLowerCase();

  return (
    <div className="vt-row flex items-center justify-between gap-4">
      <div className="flex flex-col min-w-0 flex-1">
        <span className="text-[13px] font-medium">{label}</span>
        <span
          className="text-[12px]"
          style={{
            color: error
              ? "var(--vt-danger)"
              : listening
                ? "var(--vt-accent-2)"
                : "var(--vt-fg-3)",
          }}
        >
          {error
            ? error
            : listening
              ? allowEscape
                ? t("hotkeyInput.listeningEscape")
                : t("hotkeyInput.listening")
              : sub}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={listening ? onCancel : onStartRecording}
          disabled={saving}
          className="flex items-center gap-1.5 h-9 px-2.5 rounded-md transition"
          style={{
            background: listening
              ? "oklch(from var(--vt-accent) l c h / 0.15)"
              : "var(--vt-surface)",
            border:
              "1px solid " +
              (listening
                ? "oklch(from var(--vt-accent) l c h / 0.5)"
                : "var(--vt-border)"),
            boxShadow: listening
              ? "0 0 0 3px oklch(from var(--vt-accent) l c h / 0.15)"
              : "none",
            cursor: saving ? "wait" : "pointer",
          }}
        >
          {saving ? (
            <VtIcon.spinner />
          ) : listening ? (
            <span
              className="text-[12px] vt-anim-pulse-dot"
              style={{ color: "var(--vt-accent-2)" }}
            >
              {t("hotkeyInput.pressKey", {
                defaultValue: "Appuie sur une combinaison…",
              })}
            </span>
          ) : tokens.length > 0 ? (
            tokens.map((k, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <span style={{ color: "var(--vt-fg-4)" }}>+</span>}
                <Kbd>{k}</Kbd>
              </span>
            ))
          ) : (
            <span className="text-[12px]" style={{ color: "var(--vt-fg-4)" }}>
              —
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={handleReset}
          disabled={saving || isDefault}
          className="w-9 h-9 rounded-md flex items-center justify-center transition"
          style={{
            color: "var(--vt-fg-4)",
            opacity: isDefault ? 0.3 : 1,
            cursor: isDefault ? "not-allowed" : "pointer",
          }}
          data-tip={t("hotkeyInput.reset", { defaultValue: "Réinitialiser" })}
        >
          <VtIcon.refresh />
        </button>
      </div>
    </div>
  );
}

export function ShortcutsSection() {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const { handleHotkeyChange } = useHotkeyConfig();
  const [listening, setListening] = useState<HotkeyKey | null>(null);

  const sectionIcon = (
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
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M6 12h.01M10 12h.01M14 12h.01M18 12h.01M7 16h10" />
    </svg>
  );

  const items: {
    id: HotkeyKey;
    label: string;
    sub: string;
    allowEscape?: boolean;
    defaultValue: string;
    value: string;
  }[] = [
    {
      id: "record_hotkey",
      label: t("settings.shortcuts.toggle"),
      sub: t("settings.shortcuts.toggleDesc"),
      defaultValue: DEFAULT_SETTINGS.settings.record_hotkey,
      value: settings.record_hotkey,
    },
    {
      id: "ptt_hotkey",
      label: t("settings.shortcuts.ptt"),
      sub: t("settings.shortcuts.pttDesc"),
      defaultValue: DEFAULT_SETTINGS.settings.ptt_hotkey,
      value: settings.ptt_hotkey,
    },
    {
      id: "open_window_hotkey",
      label: t("settings.shortcuts.showWindow"),
      sub: t("settings.shortcuts.showWindowDesc"),
      defaultValue: DEFAULT_SETTINGS.settings.open_window_hotkey,
      value: settings.open_window_hotkey,
    },
    {
      id: "cancel_hotkey",
      label: t("settings.shortcuts.cancel"),
      sub: t("settings.shortcuts.cancelDesc"),
      allowEscape: true,
      defaultValue: DEFAULT_SETTINGS.settings.cancel_hotkey,
      value: settings.cancel_hotkey,
    },
    {
      id: "post_process_toggle_hotkey",
      label: t("settings.shortcuts.postProcessToggle"),
      sub: t("settings.shortcuts.postProcessToggleDesc"),
      defaultValue: DEFAULT_SETTINGS.settings.post_process_toggle_hotkey,
      value: settings.post_process_toggle_hotkey,
    },
  ];

  return (
    <div className="vt-anim-fade-up space-y-5">
      <div className="vt-card-sectioned" style={{ overflow: "hidden" }}>
        <SectionHeader
          color={ACCENT}
          icon={sectionIcon}
          title={t("settings.shortcuts.title")}
          description={t("settings.shortcuts.subtitle")}
        />

        {items.map((item) => (
          <HotkeyRow
            key={item.id}
            label={item.label}
            sub={item.sub}
            value={item.value}
            defaultValue={item.defaultValue}
            allowEscape={item.allowEscape}
            listening={listening === item.id}
            onStartRecording={() => setListening(item.id)}
            onCancel={() => setListening((cur) => (cur === item.id ? null : cur))}
            onReset={() => setListening(null)}
            onCommit={(shortcut) => handleHotkeyChange(item.id, shortcut)}
          />
        ))}
      </div>

      <Callout
        kind="info"
        icon={<VtIcon.info />}
        title={t("settings.shortcuts.conflictsTitle", {
          defaultValue: "Conflits de raccourcis",
        })}
      >
        {t("settings.shortcuts.conflictsBody", {
          defaultValue:
            "Si un raccourci ne répond pas, il est peut-être capturé par une autre application. Essaie une combinaison avec la touche Win ou Alt.",
        })}
      </Callout>
    </div>
  );
}
