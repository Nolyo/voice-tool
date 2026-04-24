import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { LoginView } from "./LoginView";
import { SignupView } from "./SignupView";
import { ResetPasswordRequestView } from "./ResetPasswordRequestView";
import { ResetPasswordConfirmView } from "./ResetPasswordConfirmView";
import { TwoFactorChallengeView } from "./TwoFactorChallengeView";

export type AuthView =
  | "login"
  | "signup"
  | "reset-request"
  | "reset-confirm"
  | "2fa-challenge";

export function AuthModal() {
  const { t } = useTranslation();
  const { isAuthModalOpen, closeAuthModal, mfaChallenge } = useAuth();
  const [view, setView] = useState<AuthView>("login");

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

  // When the modal opens fresh (not from MFA nor recovery), default to login.
  useEffect(() => {
    if (isAuthModalOpen && !mfaChallenge && view !== "reset-confirm") {
      setView("login");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthModalOpen]);

  return (
    <Dialog open={isAuthModalOpen} onOpenChange={(open) => { if (!open) closeAuthModal(); }}>
      <DialogContent className="vt-app sm:max-w-md">
        <DialogTitle className="sr-only">{t("auth.modal.title")}</DialogTitle>
        {view === "login" && <LoginView onNavigate={setView} />}
        {view === "signup" && <SignupView onNavigate={setView} />}
        {view === "reset-request" && <ResetPasswordRequestView onNavigate={setView} />}
        {view === "reset-confirm" && <ResetPasswordConfirmView onDone={closeAuthModal} />}
        {view === "2fa-challenge" && <TwoFactorChallengeView />}
      </DialogContent>
    </Dialog>
  );
}
