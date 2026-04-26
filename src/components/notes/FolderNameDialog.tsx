import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

interface FolderNameDialogProps {
  open: boolean;
  mode: "create" | "rename";
  initialValue?: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (name: string) => void;
}

export function FolderNameDialog({
  open,
  mode,
  initialValue = "",
  onOpenChange,
  onSubmit,
}: FolderNameDialogProps) {
  const { t } = useTranslation();
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setValue(initialValue);
      const id = window.setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 0);
      return () => window.clearTimeout(id);
    }
  }, [open, initialValue]);

  const trimmed = value.trim();
  const unchanged = mode === "rename" && trimmed === initialValue.trim();
  const canSubmit = trimmed.length > 0 && !unchanged;

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit(trimmed);
    onOpenChange(false);
  };

  const title =
    mode === "create"
      ? t("notes.folders.newFolder")
      : t("notes.folders.rename");

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
