import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Folder } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { firstGrapheme } from "@/lib/emoji";

/** Curated grid of common folder emojis; the free input below covers the rest. */
const EMOJI_GRID: readonly string[] = [
  "📁", "💼", "🏠", "📚", "📝", "💡", "🎯", "⭐",
  "❤️", "🔥", "✅", "📌", "🗓️", "💰", "🛒", "🎮",
  "🎵", "🎬", "✈️", "🍽️", "💪", "🌱", "🔧", "🧠",
];

interface FolderNameDialogProps {
  open: boolean;
  mode: "create" | "rename";
  initialValue?: string;
  /** Current emoji when renaming; null/undefined = default folder glyph. */
  initialIcon?: string | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (name: string, icon: string | null) => void;
}

export function FolderNameDialog({
  open,
  mode,
  initialValue = "",
  initialIcon = null,
  onOpenChange,
  onSubmit,
}: FolderNameDialogProps) {
  const { t } = useTranslation();
  const [value, setValue] = useState(initialValue);
  const [icon, setIcon] = useState<string | null>(initialIcon ?? null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setValue(initialValue);
      setIcon(initialIcon ?? null);
      const id = window.setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 0);
      return () => window.clearTimeout(id);
    }
  }, [open, initialValue, initialIcon]);

  const trimmed = value.trim();
  const unchanged =
    mode === "rename" &&
    trimmed === initialValue.trim() &&
    icon === (initialIcon ?? null);
  const canSubmit = trimmed.length > 0 && !unchanged;

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit(trimmed, icon);
    onOpenChange(false);
  };

  const title =
    mode === "create"
      ? t("notes.folders.newFolder")
      : t("notes.folders.rename");

  // The free input mirrors the icon only when it doesn't come from the grid,
  // so picking a grid emoji visibly clears the custom field.
  const customValue = icon !== null && !EMOJI_GRID.includes(icon) ? icon : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
        >
          <Input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={t("notes.folders.namePrompt")}
            aria-label={t("notes.folders.namePrompt")}
            autoComplete="off"
          />
          <div className="mt-4">
            <p className="text-xs font-medium text-muted-foreground mb-2">
              {t("notes.folders.iconLabel")}
            </p>
            <div className="flex flex-wrap gap-1">
              <button
                type="button"
                onClick={() => setIcon(null)}
                title={t("notes.folders.iconNone")}
                aria-label={t("notes.folders.iconNone")}
                aria-pressed={icon === null}
                className={`h-7 w-7 rounded inline-flex items-center justify-center transition-colors ${
                  icon === null ? "bg-accent ring-2 ring-primary" : "hover:bg-accent"
                }`}
              >
                <Folder className="w-4 h-4" />
              </button>
              {EMOJI_GRID.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => setIcon(emoji)}
                  aria-label={t("notes.folders.iconPick", { emoji })}
                  aria-pressed={icon === emoji}
                  className={`h-7 w-7 rounded text-base leading-none inline-flex items-center justify-center transition-colors ${
                    icon === emoji ? "bg-accent ring-2 ring-primary" : "hover:bg-accent"
                  }`}
                >
                  {emoji}
                </button>
              ))}
            </div>
            <Input
              value={customValue}
              onChange={(e) => {
                const raw = e.target.value;
                // The field never holds more than one grapheme; when a
                // keystroke appends to the existing one, prefer what was just
                // typed so typing replaces the icon instead of being ignored.
                const addition =
                  customValue && raw.startsWith(customValue)
                    ? raw.slice(customValue.length)
                    : raw;
                setIcon(firstGrapheme(addition) ?? firstGrapheme(raw));
              }}
              placeholder={t("notes.folders.iconCustomPlaceholder")}
              aria-label={t("notes.folders.iconCustomPlaceholder")}
              autoComplete="off"
              className="mt-2"
            />
          </div>
          <DialogFooter className="gap-2 mt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {t("common.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
