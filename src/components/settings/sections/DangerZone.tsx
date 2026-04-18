import { useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const RESET_CONFIRMATION_PHRASE = "EFFACER TOUTES MES DONNÉES";

export function DangerZone() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [isResetting, setIsResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleOpenChange = (next: boolean) => {
    if (isResetting) return;
    setOpen(next);
    if (!next) {
      setConfirmation("");
      setError(null);
    }
  };

  const handleReset = async () => {
    if (confirmation !== RESET_CONFIRMATION_PHRASE) return;
    setIsResetting(true);
    setError(null);
    try {
      await invoke("reset_app_data", { confirmation });
    } catch (e) {
      console.error("Failed to reset app data:", e);
      setError(typeof e === "string" ? e : t("settings.system.danger.error"));
      setIsResetting(false);
    }
  };

  const isPhraseValid = confirmation === RESET_CONFIRMATION_PHRASE;

  return (
    <div className="rounded-xl border border-destructive/50 bg-destructive/5 p-4 space-y-3">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-destructive/10 flex items-center justify-center shrink-0">
          <AlertTriangle className="w-4 h-4 text-destructive" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-destructive leading-tight">
            {t("settings.system.danger.title")}
          </h4>
          <p className="text-xs text-muted-foreground mt-1">
            {t("settings.system.danger.subtitle")}
          </p>
        </div>
      </div>

      <Button
        variant="destructive"
        className="w-full h-9 font-medium"
        onClick={() => setOpen(true)}
      >
        {t("settings.system.danger.resetButton")}
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              {t("settings.system.danger.dialogTitle")}
            </DialogTitle>
            <DialogDescription className="space-y-2 pt-2">
              <span className="block">
                {t("settings.system.danger.dialogWarning")}
              </span>
              <span className="block font-medium text-foreground">
                {t("settings.system.danger.dialogConfirmInstruction")}
              </span>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="rounded-md bg-muted/50 border border-border p-3">
              <code className="text-sm font-mono select-all">
                {RESET_CONFIRMATION_PHRASE}
              </code>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="reset-confirmation" className="text-xs">
                {t("settings.system.danger.confirmationLabel")}
              </Label>
              <Input
                id="reset-confirmation"
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                placeholder={RESET_CONFIRMATION_PHRASE}
                disabled={isResetting}
                autoComplete="off"
                spellCheck={false}
                className="font-mono"
              />
            </div>

            {error && (
              <p className="text-xs text-destructive">{error}</p>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isResetting}
            >
              {t("settings.system.danger.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={handleReset}
              disabled={!isPhraseValid || isResetting}
            >
              {isResetting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {t("settings.system.danger.confirmReset")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
