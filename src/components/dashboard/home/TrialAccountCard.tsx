import { ArrowRight, BadgeCheck, Clock, Sparkles, UserPlus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useUsage } from "@/hooks/useUsage";
import { useDateFormatters } from "@/lib/date-format";

interface TrialAccountCardProps {
  onOpenAccountPage: () => void;
}

/**
 * Adaptive account/trial card for the home screen. Renders one of four states:
 * signed-out (create-account CTA), active subscription (plan + monthly usage),
 * active trial (minutes left + expiry), or signed-in without an active plan
 * (manage-account CTA). Branches on useAuth + useUsage.
 */
export function TrialAccountCard({ onOpenAccountPage }: TrialAccountCardProps) {
  const { t } = useTranslation();
  const { status, openAuthModal } = useAuth();
  const { trial, plan, monthly_minutes_used, loading } = useUsage();
  const { formatLongDate } = useDateFormatters();

  const tint = "var(--vt-accent)";
  const tintSoft = `oklch(from ${tint} l c h / 0.18)`;
  const tintBg = `oklch(from ${tint} l c h / 0.14)`;

  // --- Signed-out: invite to create an account ----------------------------
  if (status === "signed-out") {
    return (
      <Shell tintSoft={tintSoft}>
        <Head
          icon={<UserPlus className="w-4 h-4" />}
          tint={tint}
          tintBg={tintBg}
          eyebrow={t("home.account.eyebrowSignedOut")}
        />
        <h3 className="mt-3 vt-display text-[17px] font-semibold text-[var(--vt-fg)]">
          {t("home.account.titleSignedOut")}
        </h3>
        <p className="mt-1.5 text-[13px] text-[var(--vt-fg-3)] leading-relaxed">
          {t("home.account.descSignedOut")}
        </p>
        <Button className="mt-4" size="sm" onClick={openAuthModal}>
          {t("home.account.ctaSignedOut")}
          <ArrowRight className="w-4 h-4" />
        </Button>
      </Shell>
    );
  }

  // While loading usage for a signed-in user, show a light skeleton.
  if (loading && !plan && !trial.is_active) {
    return (
      <Shell tintSoft={tintSoft}>
        <Head
          icon={<BadgeCheck className="w-4 h-4" />}
          tint={tint}
          tintBg={tintBg}
          eyebrow={t("home.account.eyebrowPlan")}
        />
        <div className="mt-4 h-7 w-32 rounded-md bg-foreground/[0.06] animate-pulse" />
        <div className="mt-2 h-4 w-44 rounded-md bg-foreground/[0.04] animate-pulse" />
      </Shell>
    );
  }

  // --- Active subscription -------------------------------------------------
  if (plan) {
    const planLabel = t(`home.account.plan_${plan.plan}`);
    return (
      <Shell tintSoft={tintSoft}>
        <Head
          icon={<BadgeCheck className="w-4 h-4" />}
          tint={tint}
          tintBg={tintBg}
          eyebrow={t("home.account.eyebrowPlan")}
        />
        <div className="mt-3 flex items-baseline gap-2">
          <span className="vt-display text-[22px] font-semibold text-[var(--vt-fg)]">
            {planLabel}
          </span>
        </div>
        <p className="mt-1.5 text-[13px] text-[var(--vt-fg-3)]">
          {t("home.account.minutesUsed", {
            used: Math.round(monthly_minutes_used),
            quota: plan.quota_minutes,
          })}
        </p>
        <button
          type="button"
          onClick={onOpenAccountPage}
          className="mt-3 inline-flex items-center gap-1 text-[12.5px] font-medium text-[var(--vt-accent)] hover:underline cursor-pointer"
        >
          {t("home.account.manage")}
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </Shell>
    );
  }

  // --- Active trial --------------------------------------------------------
  if (trial.is_active) {
    const minutesLeft = Math.max(0, Math.round(trial.minutes_remaining));
    return (
      <Shell tintSoft={tintSoft}>
        <Head
          icon={<Sparkles className="w-4 h-4" />}
          tint={tint}
          tintBg={tintBg}
          eyebrow={t("home.account.eyebrowTrial")}
        />
        <div className="mt-3 flex items-baseline gap-1.5">
          <span className="vt-display text-[28px] leading-none font-semibold text-[var(--vt-fg)] vt-mono">
            {minutesLeft}
          </span>
          <span className="text-[13px] text-[var(--vt-fg-3)]">
            {t("home.account.minutesUnit")}
          </span>
        </div>
        {trial.expires_at && (
          <p className="mt-2 flex items-center gap-1.5 text-[12.5px] text-[var(--vt-fg-3)]">
            <Clock className="w-3.5 h-3.5" />
            {t("home.account.trialExpires", {
              date: formatLongDate(new Date(trial.expires_at)),
            })}
          </p>
        )}
        <button
          type="button"
          onClick={onOpenAccountPage}
          className="mt-3 inline-flex items-center gap-1 text-[12.5px] font-medium text-[var(--vt-accent)] hover:underline cursor-pointer"
        >
          {t("home.account.manage")}
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </Shell>
    );
  }

  // --- Signed-in, no active plan or trial ---------------------------------
  return (
    <Shell tintSoft={tintSoft}>
      <Head
        icon={<Sparkles className="w-4 h-4" />}
        tint={tint}
        tintBg={tintBg}
        eyebrow={t("home.account.eyebrowInactive")}
      />
      <h3 className="mt-3 vt-display text-[17px] font-semibold text-[var(--vt-fg)]">
        {t("home.account.titleInactive")}
      </h3>
      <p className="mt-1.5 text-[13px] text-[var(--vt-fg-3)] leading-relaxed">
        {t("home.account.descInactive")}
      </p>
      <Button className="mt-4" size="sm" onClick={onOpenAccountPage}>
        {t("home.account.ctaInactive")}
        <ArrowRight className="w-4 h-4" />
      </Button>
    </Shell>
  );
}

function Shell({
  tintSoft,
  children,
}: {
  tintSoft: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="vt-card-elevated relative overflow-hidden p-5 h-full"
      style={{
        background: `
          radial-gradient(circle at 100% 0%, ${tintSoft} 0, transparent 55%),
          var(--vt-panel-2)
        `,
      }}
    >
      {children}
    </div>
  );
}

function Head({
  icon,
  tint,
  tintBg,
  eyebrow,
}: {
  icon: React.ReactNode;
  tint: string;
  tintBg: string;
  eyebrow: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="vt-eyebrow">{eyebrow}</span>
      <div
        className="flex items-center justify-center w-8 h-8 rounded-lg shrink-0"
        style={{ background: tintBg, color: tint }}
      >
        {icon}
      </div>
    </div>
  );
}
