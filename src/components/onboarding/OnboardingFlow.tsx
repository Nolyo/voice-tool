import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { invoke } from "@tauri-apps/api/core";
import { OnboardingWizard } from "../OnboardingWizard";
import { OnboardingProgress } from "./OnboardingProgress";
import { HeroStep } from "./steps/HeroStep";
import { CapabilitiesStep } from "./steps/CapabilitiesStep";
import { TryItStep } from "./steps/TryItStep";
import { ChoiceStep } from "./steps/ChoiceStep";
import { useAuth } from "@/hooks/useAuth";
import { useSettings } from "@/hooks/useSettings";
import { setOnboardingActive } from "./demoState";
import {
  isLocalEligible,
  type SystemInfo,
} from "@/lib/system-eligibility";

type Step = 1 | 2 | 3 | 4 | "local-wizard";

const TOTAL_STEPS = 4;

/**
 * Four-step first-run wizard: hero → capabilities → try-it → choice.
 *
 * The TryIt step is the conversion engine: brand-new users without a local
 * model or an account get a free cloud-powered transcription, then are
 * prompted to sign up for 60 free minutes (or fall back to local).
 *
 * There is intentionally no "skip" / "later" exit: a brand-new user who
 * dismisses without choosing ends up in local mode with no model AND no
 * account → app unusable. The wizard only completes once the user picks
 * Cloud signup or finishes the Local model download.
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

  // While the modal is open, suppress the global Dashboard hotkey path — a
  // brand-new user has no local model AND no cloud account, so the regular
  // transcription pipeline would always error. The TryIt step has its own
  // button-driven recording flow.
  useEffect(() => {
    setOnboardingActive(true);
    return () => setOnboardingActive(false);
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
        onBack={() => setStep(4)}
      />
    );
  }

  const handleProgressClick = (s: number) => {
    if (s === 1 || s === 2 || s === 3 || s === 4) setStep(s as Step);
  };

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

          {step === 1 && <HeroStep onContinue={() => setStep(2)} />}
          {step === 2 && (
            <CapabilitiesStep
              onContinue={() => setStep(3)}
              onBack={() => setStep(1)}
            />
          )}
          {step === 3 && (
            <TryItStep
              onBack={() => setStep(2)}
              onCloud={handleCloud}
              onLocal={handleLocal}
            />
          )}
          {step === 4 && (
            <ChoiceStep
              systemInfo={systemInfo}
              isEligible={isEligible}
              onBack={() => setStep(3)}
              onCloud={handleCloud}
              onLocal={handleLocal}
            />
          )}

          <div className="mt-8 flex justify-center">
            <OnboardingProgress
              current={typeof step === "number" ? step : 1}
              total={TOTAL_STEPS}
              onStepClick={handleProgressClick}
            />
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
