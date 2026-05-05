import { useState } from "react";
import { useTranslation } from "react-i18next";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Check, Cloud, HardDrive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OnboardingWizard } from "../OnboardingWizard";
import { useAuth } from "@/hooks/useAuth";

type Mode = "choose" | "local-wizard";

/**
 * First-run welcome screen presenting the cloud-vs-local choice.
 *
 * Branch A (recommended): create a free Lexena Cloud account → opens AuthModal
 *   in signup mode. We mark first-run as complete immediately so the screen
 *   doesn't reappear once the modal closes.
 *
 * Branch B: continue with local Whisper only → swaps in the existing
 *   `OnboardingWizard` (now reduced to a local-only sub-flow). The wizard
 *   reports completion via `onComplete` once the model is downloaded.
 *
 * Phase 3 of sub-epic 04 billing (replaces the old internal-choice step that
 * lived inside `OnboardingWizard`).
 */
export function WelcomeScreen({ onComplete }: { onComplete: () => void }) {
  const { t } = useTranslation("billing");
  const { openAuthModal } = useAuth();
  const [mode, setMode] = useState<Mode>("choose");

  if (mode === "local-wizard") {
    return <OnboardingWizard onComplete={onComplete} onBack={() => setMode("choose")} />;
  }

  const branchAFeatures = t("welcome.branch_a.features", {
    returnObjects: true,
  }) as string[];
  const branchBFeatures = t("welcome.branch_b.features", {
    returnObjects: true,
  }) as string[];

  const handleBranchA = () => {
    openAuthModal("signup");
    // Once the auth modal is open, the user will either sign up (and become
    // signed-in), or close the modal and re-trigger first-run. Either way,
    // we close this dialog so the user can interact with the AuthModal.
    onComplete();
  };

  const handleBranchB = () => {
    setMode("local-wizard");
  };

  return (
    <DialogPrimitive.Root open>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="vt-app fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <DialogPrimitive.Content
          className="vt-app fixed left-1/2 top-1/2 z-50 w-full max-w-3xl -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-background p-8 shadow-lg"
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogPrimitive.Title className="text-2xl font-semibold">
            {t("welcome.title")}
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="mt-2 text-sm text-muted-foreground">
            {t("welcome.subtitle")}
          </DialogPrimitive.Description>

          <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="relative flex flex-col rounded-lg border-2 border-primary p-6">
              <span className="absolute -top-3 right-4 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
                {t("welcome.branch_a.badge")}
              </span>
              <Cloud className="size-8 text-primary" aria-hidden />
              <h3 className="mt-3 text-lg font-semibold">
                {t("welcome.branch_a.title")}
              </h3>
              <ul className="mt-4 flex flex-1 flex-col gap-2">
                {branchAFeatures.map((feat) => (
                  <li key={feat} className="flex items-start gap-2 text-sm">
                    <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>
              <Button className="mt-6" onClick={handleBranchA}>
                {t("welcome.branch_a.cta")}
              </Button>
            </div>

            <div className="flex flex-col rounded-lg border p-6">
              <HardDrive className="size-8 text-muted-foreground" aria-hidden />
              <h3 className="mt-3 text-lg font-semibold">
                {t("welcome.branch_b.title")}
              </h3>
              <ul className="mt-4 flex flex-1 flex-col gap-2">
                {branchBFeatures.map((feat) => (
                  <li key={feat} className="flex items-start gap-2 text-sm">
                    <span
                      className="mt-0.5 size-4 shrink-0 rounded-full border"
                      aria-hidden
                    />
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>
              <Button variant="outline" className="mt-6" onClick={handleBranchB}>
                {t("welcome.branch_b.cta")}
              </Button>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
