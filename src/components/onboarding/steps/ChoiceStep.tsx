import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Cloud,
  HardDrive,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SystemInfo } from "@/lib/system-eligibility";

interface ChoiceStepProps {
  systemInfo: SystemInfo | null;
  isEligible: boolean;
  onBack: () => void;
  onCloud: () => void;
  onLocal: () => void;
  onLater: () => void;
}

export function ChoiceStep({
  systemInfo,
  isEligible,
  onBack,
  onCloud,
  onLocal,
  onLater,
}: ChoiceStepProps) {
  const { t } = useTranslation("billing");
  const cloudFeatures = t("welcome.branch_a.features", {
    returnObjects: true,
  }) as string[];
  const localFeatures = t("welcome.branch_b.features", {
    returnObjects: true,
  }) as string[];
  const showNotEligibleBadge = systemInfo !== null && !isEligible;

  return (
    <div className="vt-anim-fade-up flex flex-col gap-6">
      <div className="space-y-2">
        <h2
          className="vt-display text-2xl md:text-3xl font-semibold tracking-tight"
          style={{ color: "var(--vt-fg)" }}
        >
          {t("welcome.choice.title")}
        </h2>
        <p className="text-sm" style={{ color: "var(--vt-fg-2)" }}>
          {t("welcome.choice.subtitle")}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
        {/* Cloud — featured (3/5 width on desktop) */}
        <article
          className="relative md:col-span-3 flex flex-col rounded-xl border-2 p-6"
          style={{
            background:
              "linear-gradient(135deg, oklch(from var(--vt-violet) l c h / 0.16), oklch(from var(--vt-accent) l c h / 0.08))",
            borderColor: "oklch(from var(--vt-violet) l c h / 0.55)",
            boxShadow:
              "0 10px 30px -10px oklch(from var(--vt-violet) l c h / 0.35)",
          }}
        >
          <span
            className="vt-anim-pulse-dot absolute -top-3 left-6 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide"
            style={{
              background: "var(--vt-violet)",
              color: "white",
            }}
          >
            {t("welcome.choice.cloud_banner")}
          </span>
          <div className="flex items-start justify-between">
            <div
              className="flex h-11 w-11 items-center justify-center rounded-lg"
              style={{
                background: "oklch(from var(--vt-violet) l c h / 0.2)",
                color: "var(--vt-violet)",
              }}
            >
              <Cloud className="h-5 w-5" />
            </div>
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
              style={{
                background: "oklch(from var(--vt-violet) l c h / 0.18)",
                color: "var(--vt-violet)",
              }}
            >
              <Sparkles className="h-3 w-3" />
              {t("welcome.branch_a.badge")}
            </span>
          </div>
          <h3
            className="mt-4 text-xl font-semibold"
            style={{ color: "var(--vt-fg)" }}
          >
            {t("welcome.branch_a.title")}
          </h3>
          <p
            className="mt-1 text-sm"
            style={{ color: "var(--vt-fg-2)" }}
          >
            {t("welcome.choice.cloud_tagline")}
          </p>
          <ul className="mt-5 flex flex-1 flex-col gap-2.5">
            {cloudFeatures.map((feat) => (
              <li key={feat} className="flex items-start gap-2 text-sm">
                <Check
                  className="mt-0.5 size-4 shrink-0"
                  style={{ color: "var(--vt-violet)" }}
                />
                <span style={{ color: "var(--vt-fg)" }}>{feat}</span>
              </li>
            ))}
          </ul>
          <Button
            onClick={onCloud}
            size="lg"
            className="mt-6"
            style={{
              background: "var(--vt-violet)",
              color: "white",
            }}
          >
            {t("welcome.branch_a.cta")}
          </Button>
        </article>

        {/* Local — sober (2/5 width) */}
        <article
          className="relative md:col-span-2 flex flex-col rounded-xl border p-6"
          style={{
            background: "var(--vt-panel-2)",
            borderColor: "var(--vt-border)",
          }}
        >
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
          <div
            className="flex h-11 w-11 items-center justify-center rounded-lg"
            style={{
              background: "var(--vt-panel)",
              color: "var(--vt-fg-3)",
            }}
          >
            <HardDrive className="h-5 w-5" />
          </div>
          <h3
            className="mt-4 text-lg font-semibold"
            style={{ color: "var(--vt-fg)" }}
          >
            {t("welcome.branch_b.title")}
          </h3>
          <p
            className="mt-1 text-xs"
            style={{ color: "var(--vt-fg-3)" }}
          >
            {t("welcome.choice.local_tagline")}
          </p>
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
            {localFeatures.map((feat) => (
              <li key={feat} className="flex items-start gap-2 text-xs">
                <span
                  className="mt-0.5 size-3.5 shrink-0 rounded-full border"
                  style={{ borderColor: "var(--vt-fg-3)" }}
                  aria-hidden
                />
                <span style={{ color: "var(--vt-fg-2)" }}>{feat}</span>
              </li>
            ))}
          </ul>
          <Button variant="outline" onClick={onLocal} className="mt-5">
            {t("welcome.branch_b.cta")}
          </Button>
        </article>
      </div>

      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" onClick={onBack} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          {t("welcome.capabilities.cta_back")}
        </Button>
        <button
          type="button"
          onClick={onLater}
          className="text-sm underline-offset-4 hover:underline"
          style={{ color: "var(--vt-fg-3)" }}
        >
          {t("welcome.choice.later")}
        </button>
      </div>
    </div>
  );
}
