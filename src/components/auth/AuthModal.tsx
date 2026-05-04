import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { SignInPanel } from "./SignInPanel";
import { ResetPasswordRequestView } from "./ResetPasswordRequestView";
import { ResetPasswordConfirmView } from "./ResetPasswordConfirmView";
import { TwoFactorChallengeView } from "./TwoFactorChallengeView";

export type AuthView =
  | "signin"
  | "reset-request"
  | "reset-confirm"
  | "2fa-challenge";

export function AuthModal() {
  const { t } = useTranslation();
  const {
    isAuthModalOpen,
    closeAuthModal,
    mfaChallenge,
    initialAuthMode,
    deepLinkError,
    clearDeepLinkError,
  } = useAuth();
  const [view, setView] = useState<AuthView>("signin");

  // MFA challenge intercepts any other view.
  useEffect(() => {
    if (mfaChallenge) setView("2fa-challenge");
  }, [mfaChallenge]);

  // Recovery deep-link opens the modal on the confirm screen.
  useEffect(() => {
    const onRecovery = () => setView("reset-confirm");
    window.addEventListener("auth:recovery-mode", onRecovery);
    return () => window.removeEventListener("auth:recovery-mode", onRecovery);
  }, []);

  // When the modal opens fresh (not from MFA nor recovery), default to sign-in.
  useEffect(() => {
    if (isAuthModalOpen && !mfaChallenge && view !== "reset-confirm") {
      setView("signin");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthModalOpen]);

  return (
    <Dialog
      open={isAuthModalOpen}
      onOpenChange={(open) => {
        if (!open) closeAuthModal();
      }}
    >
      <DialogContent
        className="vt-app sm:max-w-[420px] p-0 gap-0 border-[var(--vt-border-strong)] bg-[var(--vt-panel-2)] overflow-hidden"
      >
        <DialogTitle className="sr-only">{t("auth.modal.title")}</DialogTitle>
        {deepLinkError && (
          <div
            role="alert"
            className="mx-5 mt-4 rounded-md p-3 text-[12px] flex items-start gap-2 vt-anim-fade-up"
            style={{
              background: "var(--vt-danger-soft)",
              border: "1px solid oklch(from var(--vt-danger) l c h / 0.35)",
              color: "var(--vt-danger)",
            }}
          >
            <span className="font-semibold shrink-0">
              {t("auth.modal.deepLinkErrorTitle", {
                defaultValue: "Échec de la connexion",
              })}
            </span>
            <span className="vt-mono break-all min-w-0" style={{ color: "var(--vt-fg-2)" }}>
              {deepLinkError}
            </span>
            <button
              type="button"
              onClick={clearDeepLinkError}
              className="ml-auto shrink-0 underline"
              style={{ color: "var(--vt-fg-3)" }}
            >
              {t("common.dismiss", { defaultValue: "Fermer" })}
            </button>
          </div>
        )}
        {view === "signin" && (
          <SignInPanel onNavigate={setView} initialMode={initialAuthMode} />
        )}
        {view === "reset-request" && (
          <div className="p-5">
            <ResetPasswordRequestView onNavigate={setView} />
          </div>
        )}
        {view === "reset-confirm" && (
          <div className="p-5">
            <ResetPasswordConfirmView onDone={closeAuthModal} />
          </div>
        )}
        {view === "2fa-challenge" && (
          <div className="p-5">
            <TwoFactorChallengeView />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
