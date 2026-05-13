import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { invoke } from "@tauri-apps/api/core";
import { AlertTriangle, Check, Cloud, HardDrive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OnboardingWizard } from "../OnboardingWizard";
import { useAuth } from "@/hooks/useAuth";
import {
  isLocalEligible,
  type SystemInfo,
} from "@/lib/system-eligibility";

type Mode = "choose" | "local-wizard";

/**
 * First-run welcome screen presenting the cloud-vs-local choice.
 *
 * Auto-detects the user's system (RAM + discrete GPU) on mount. If the machine
 * can't comfortably run `large-v3-turbo` (no GPU and < 32 GB RAM), the Local
 * card is soft-blocked: still clickable, but marked "not recommended on your
 * machine" so non-tech users default to Cloud where the experience is reliable.
 */
export function WelcomeScreen({ onComplete }: { onComplete: () => void }) {
  const { t } = useTranslation("billing");
  const { openAuthModal } = useAuth();
  const [mode, setMode] = useState<Mode>("choose");
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    invoke<SystemInfo>("get_system_info")
      .then((info) => {
        if (!cancelled) setSystemInfo(info);
      })
      .catch((e) => {
        console.error("System detection failed in WelcomeScreen:", e);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Default to "eligible" while detection runs (or if it fails): never block
  // the Local branch on a transient failure — the wizard will still display
  // the warning if !isEligible once info is available.
  const isEligible = systemInfo ? isLocalEligible(systemInfo) : true;

  if (mode === "local-wizard") {
    return (
      <OnboardingWizard
        systemInfo={systemInfo}
        isEligible={isEligible}
        onComplete={onComplete}
        onBack={() => setMode("choose")}
      />
    );
  }

  const branchAFeatures = t("welcome.branch_a.features", {
    returnObjects: true,
  }) as string[];
  const branchBFeatures = t("welcome.branch_b.features", {
    returnObjects: true,
  }) as string[];

  const handleBranchA = () => {
    openAuthModal();
    onComplete();
  };

  const handleBranchB = () => {
    setMode("local-wizard");
  };

  const showNotEligibleBadge = systemInfo !== null && !isEligible;

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

            <div className="relative flex flex-col rounded-lg border p-6">
              {showNotEligibleBadge && (
                <span
                  className="absolute -top-3 right-4 inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold"
                  style={{
                    background: "oklch(from var(--vt-warn) l c h / 0.15)",
                    color: "var(--vt-warn)",
                    border: "1px solid oklch(from var(--vt-warn) l c h / 0.4)",
                  }}
                >
                  <AlertTriangle className="size-3" />
                  {t("welcome.branch_b.not_eligible_badge")}
                </span>
              )}
              <HardDrive className="size-8 text-muted-foreground" aria-hidden />
              <h3 className="mt-3 text-lg font-semibold">
                {t("welcome.branch_b.title")}
              </h3>
              {showNotEligibleBadge && systemInfo && (
                <p
                  className="mt-2 text-xs"
                  style={{ color: "var(--vt-warn)" }}
                >
                  {t("welcome.branch_b.not_eligible_reason", {
                    ram: systemInfo.total_ram_gb.toFixed(0),
                  })}
                </p>
              )}
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
