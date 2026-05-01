import { useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { Loader2 } from "lucide-react";
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
import { VtIcon } from "../vt";

export function DangerZone() {
  const { t } = useTranslation();
  const resetConfirmationPhrase = t("settings.system.danger.confirmPhrase");
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
    if (confirmation !== resetConfirmationPhrase) return;
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

  const handleQuit = async () => {
    try {
      await invoke("exit_app");
    } catch (e) {
      console.error("Failed to exit app:", e);
    }
  };

  const isPhraseValid = confirmation === resetConfirmationPhrase;

  const dangerRowStyle = {
    borderColor: "oklch(from var(--vt-danger) l c h / 0.25)",
  } as const;

  return (
    <div
      className="vt-card-sectioned"
      style={{
        overflow: "hidden",
        borderColor: "oklch(from var(--vt-danger) l c h / 0.35)",
      }}
    >
      <div
        className="px-5 py-4 flex items-center gap-3"
        style={{ borderBottom: "1px solid oklch(from var(--vt-danger) l c h / 0.25)" }}
      >
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{
            background: "oklch(from var(--vt-danger) l c h / 0.15)",
            color: "var(--vt-danger)",
          }}
        >
          <VtIcon.alert />
        </div>
        <div>
          <h3 className="text-[14px] font-semibold" style={{ color: "var(--vt-danger)" }}>
            {t("settings.system.danger.title")}
          </h3>
          <p className="text-[12px]" style={{ color: "var(--vt-fg-3)" }}>
            {t("settings.system.danger.subtitle")}
          </p>
        </div>
      </div>

      <div
        className="vt-row flex items-center justify-between"
        style={dangerRowStyle}
      >
        <div>
          <div className="text-[13px] font-medium">
            {t("settings.system.danger.resetButton")}
          </div>
          <div className="text-[12px]" style={{ color: "var(--vt-fg-3)" }}>
            {t("settings.system.danger.resetDescription", {
              defaultValue: "Efface toutes les transcriptions et réinitialise les paramètres.",
            })}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="vt-btn"
          style={{
            color: "var(--vt-danger)",
            borderColor: "oklch(from var(--vt-danger) l c h / 0.4)",
          }}
        >
          {t("settings.system.danger.resetButton")}
        </button>
      </div>

      <div
        className="vt-row flex items-center justify-between"
        style={dangerRowStyle}
      >
        <div>
          <div className="text-[13px] font-medium">{t("settings.quitApp")}</div>
          <div className="text-[12px]" style={{ color: "var(--vt-fg-3)" }}>
            {t("settings.system.quitDescription", {
              defaultValue: "Ferme Lexena complètement (pas juste la fenêtre).",
            })}
          </div>
        </div>
        <button
          type="button"
          onClick={handleQuit}
          className="vt-btn-primary"
          style={{ background: "var(--vt-danger)" }}
        >
          {t("settings.quitApp")}
        </button>
      </div>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
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
                {resetConfirmationPhrase}
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
                placeholder={t("settings.system.danger.confirmPlaceholder")}
                disabled={isResetting}
                autoComplete="off"
                spellCheck={false}
                className="font-mono"
              />
            </div>

            {error && <p className="text-xs text-destructive">{error}</p>}
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
