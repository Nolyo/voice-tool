import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, RotateCcw } from "lucide-react";
import { KeyBadge } from "./KeyBadge";

const MODIFIER_KEYS = new Set(["Shift", "Control", "Alt", "Meta"]);

const isMacPlatform = () =>
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

function normalizeKey(key: string): string | null {
  if (!key || key === "Unidentified" || key.toLowerCase() === "dead") {
    return null;
  }
  if (key === " ") return "Space";
  if (key.length === 1) return key.toUpperCase();
  return key;
}

export function buildShortcutFromEvent(event: KeyboardEvent): string | null {
  if (MODIFIER_KEYS.has(event.key)) return null;

  const parts: string[] = [];
  if (event.ctrlKey) parts.push("Ctrl");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");
  if (event.metaKey) parts.push(isMacPlatform() ? "Cmd" : "Super");

  const key = normalizeKey(event.key);
  if (!key) return null;

  parts.push(key);
  return parts.join("+");
}

interface HotkeyInputProps {
  id: string;
  label: string;
  value: string;
  defaultValue: string;
  description?: string;
  allowEscape?: boolean;
  onChange: (shortcut: string) => Promise<void>;
}

export function HotkeyInput({
  id,
  label,
  value,
  defaultValue,
  description,
  allowEscape = false,
  onChange,
}: HotkeyInputProps) {
  const { t } = useTranslation();
  const [isListening, setIsListening] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isListening) return;

    const handler = async (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();

      if (event.key === "Escape" && !allowEscape) {
        setIsListening(false);
        setError(null);
        return;
      }

      const shortcut = buildShortcutFromEvent(event);
      if (!shortcut) return;

      if (value && value.toLowerCase() === shortcut.toLowerCase()) {
        setIsListening(false);
        setError(null);
        return;
      }

      setIsSaving(true);
      try {
        await onChange(shortcut);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setIsSaving(false);
        setIsListening(false);
      }
    };

    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [isListening, onChange, value, allowEscape]);

  const handleReset = useCallback(async () => {
    if (value.toLowerCase() === defaultValue.toLowerCase()) return;
    setIsSaving(true);
    try {
      await onChange(defaultValue);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSaving(false);
      setIsListening(false);
    }
  }, [defaultValue, onChange, value]);

  const tokens = value
    ? value.split("+").map((t) => t.trim()).filter(Boolean)
    : [];
  const isDefault = value.toLowerCase() === defaultValue.toLowerCase();

  return (
    <div className="flex items-center justify-between gap-4 py-3">
      {/* Label + status line */}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground leading-none">{label}</p>
        <p
          className={`text-xs mt-1 leading-snug transition-colors ${
            error
              ? "text-destructive"
              : isListening
                ? "text-primary"
                : "text-muted-foreground"
          }`}
        >
          {error
            ? error
            : isListening
              ? allowEscape
                ? t('hotkeyInput.listeningEscape')
                : t('hotkeyInput.listening')
              : description}
        </p>
      </div>

      {/* Key display + reset */}
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          id={id}
          onClick={() => {
            if (isSaving) return;
            setError(null);
            setIsListening((prev) => !prev);
          }}
          disabled={isSaving}
          title={t('hotkeyInput.clickToModify')}
          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border transition-all min-w-[88px] justify-center ${
            isListening
              ? "border-primary/50 bg-primary/5 ring-1 ring-primary/20 cursor-default"
              : "border-border/70 bg-muted/40 hover:border-primary/40 hover:bg-muted/70 cursor-pointer"
          }`}
        >
          {isSaving ? (
            <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
          ) : isListening ? (
            <span className="text-[11px] text-primary font-medium vt-anim-pulse-dot whitespace-nowrap">
              {t('hotkeyInput.pressKey')}
            </span>
          ) : tokens.length > 0 ? (
            tokens.map((token, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && (
                  <span className="text-muted-foreground/50 text-[10px] font-bold leading-none">
                    +
                  </span>
                )}
                <KeyBadge token={token} />
              </span>
            ))
          ) : (
            <span className="text-xs text-muted-foreground italic">—</span>
          )}
        </button>

        <button
          type="button"
          onClick={handleReset}
          disabled={isSaving || isDefault}
          title={t('hotkeyInput.reset')}
          className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
        >
          <RotateCcw className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}
