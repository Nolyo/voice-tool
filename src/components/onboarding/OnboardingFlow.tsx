import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { invoke } from "@tauri-apps/api/core";
import { OnboardingWizard } from "../OnboardingWizard";
import { OnboardingProgress } from "./OnboardingProgress";
import { HeroStep } from "./steps/HeroStep";
import { CapabilitiesStep } from "./steps/CapabilitiesStep";
import { ChoiceStep } from "./steps/ChoiceStep";
import { useAuth } from "@/hooks/useAuth";
import { useSettings } from "@/hooks/useSettings";
import {
  isLocalEligible,
  type SystemInfo,
} from "@/lib/system-eligibility";

type Step = 1 | 2 | 3 | "local-wizard";

/**
 * Three-step first-run wizard. Goal: tell the Lexena story (hero → capabilities
 * → choice) before asking the user to commit, biasing the choice toward Cloud
 * because that path exposes the trial-driven post-process IA experience.
 *
 * The wizard is gated by `settings.onboarding_completed`. Completion is recorded
 * when the user either picks a path (cloud signup, local download finished) or
 * dismisses with "Later" on the choice step.
 */
export function OnboardingFlow({ onComplete }: { onComplete: () => void }) {
  const { t } = useTranslation("billing");
  const { openAuthModal } = useAuth();
  const { updateSetting } = useSettings();
  const [step, setStep] = useState<Step>(1);
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);

  // Detect hardware on mount so the choice step can soft-block Local for
  // machines that can't realistically run large-v3-turbo.
  useEffect(() => {
    let cancelled = false;
    invoke<SystemInfo>("get_system_info")
      .then((info) => {
        if (!cancelled) setSystemInfo(info);
      })
      .catch((e) => {
        console.error("System detection failed in OnboardingFlow:", e);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const isEligible = systemInfo ? isLocalEligible(systemInfo) : true;

  const markComplete = () => {
    void updateSetting("onboarding_completed", true);
  };

  const handleCloud = () => {
    markComplete();
    openAuthModal();
    onComplete();
  };

  const handleLocal = () => {
    setStep("local-wizard");
  };

  const handleLater = () => {
    markComplete();
    onComplete();
  };

  const handleLocalWizardComplete = () => {
    markComplete();
    onComplete();
  };

  // Local wizard is a sibling route — when reached, fully replaces the
  // current dialog (it has its own DialogPrimitive structure).
  if (step === "local-wizard") {
    return (
      <OnboardingWizard
        systemInfo={systemInfo}
        isEligible={isEligible}
        onComplete={handleLocalWizardComplete}
        onBack={() => setStep(3)}
      />
    );
  }

  return (
    <DialogPrimitive.Root open>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="vt-app fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className="vt-app fixed left-1/2 top-1/2 z-50 w-full max-w-3xl -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-background p-8 shadow-2xl"
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogPrimitive.Title className="sr-only">
            {t("welcome.title")}
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            {t("welcome.subtitle")}
          </DialogPrimitive.Description>

          {step === 1 && (
            <HeroStep
              onContinue={() => setStep(2)}
              onSkip={() => setStep(3)}
            />
          )}
          {step === 2 && (
            <CapabilitiesStep
              onContinue={() => setStep(3)}
              onBack={() => setStep(1)}
            />
          )}
          {step === 3 && (
            <ChoiceStep
              systemInfo={systemInfo}
              isEligible={isEligible}
              onBack={() => setStep(2)}
              onCloud={handleCloud}
              onLocal={handleLocal}
              onLater={handleLater}
            />
          )}

          <div className="mt-8 flex justify-center">
            <OnboardingProgress
              current={step}
              total={3}
              onStepClick={(s) => setStep(s as Step)}
            />
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
