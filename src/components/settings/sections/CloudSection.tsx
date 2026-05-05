import { useTranslation } from "react-i18next";
import { useUsage } from "@/hooks/useUsage";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { SubscribeButton } from "@/components/billing/SubscribeButton";

const LEMON_SQUEEZY_PORTAL_URL =
  (import.meta.env.VITE_LEMON_SQUEEZY_PORTAL_URL as string | undefined) ??
  "https://app.lemonsqueezy.com/my-orders";

export function CloudSection() {
  const { t } = useTranslation("cloud");
  const { user } = useAuth();
  const { trial, monthly_minutes_used, plan, loading, refresh } = useUsage();

  if (!user) {
    return (
      <div id="section-cloud" className="vt-anim-fade-up space-y-5">
        <p className="text-sm text-muted-foreground">{t("settings.signin_required")}</p>
      </div>
    );
  }
  if (loading) {
    return (
      <div id="section-cloud" className="vt-anim-fade-up space-y-5">
        <p className="text-sm text-muted-foreground">{t("settings.loading")}</p>
      </div>
    );
  }

  return (
    <div id="section-cloud" className="vt-anim-fade-up space-y-5">
      <div className="vt-card-sectioned" style={{ overflow: "hidden" }}>
        <div className="vt-row flex flex-col gap-4 py-5">
          <h2 className="text-[15px] font-semibold tracking-tight">
            {t("settings.heading")}
          </h2>

          {trial.is_active && (
            <section className="space-y-2">
              <h3 className="text-[13px] font-semibold">{t("settings.trial.heading")}</h3>
              <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1 text-[12.5px]">
                <dt className="text-muted-foreground">
                  {t("settings.trial.minutes_remaining")}
                </dt>
                <dd className="vt-mono">{Math.floor(trial.minutes_remaining)}</dd>
                <dt className="text-muted-foreground">
                  {t("settings.trial.expires_at")}
                </dt>
                <dd className="vt-mono">
                  {trial.expires_at ? new Date(trial.expires_at).toLocaleString() : "-"}
                </dd>
              </dl>
            </section>
          )}

          {plan && (
            <section className="space-y-2">
              <h3 className="text-[13px] font-semibold">
                {t("settings.plan.heading", { plan: plan.plan })}
              </h3>
              <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1 text-[12.5px]">
                <dt className="text-muted-foreground">
                  {t("settings.plan.quota_minutes")}
                </dt>
                <dd className="vt-mono">{plan.quota_minutes}</dd>
                <dt className="text-muted-foreground">{t("settings.plan.minutes_used")}</dt>
                <dd className="vt-mono">{Math.floor(monthly_minutes_used)}</dd>
                <dt className="text-muted-foreground">
                  {t("settings.plan.minutes_remaining")}
                </dt>
                <dd className="vt-mono">
                  {Math.max(plan.quota_minutes - Math.floor(monthly_minutes_used), 0)}
                </dd>
              </dl>
            </section>
          )}

          {!trial.is_active && !plan && (
            <p className="text-sm text-muted-foreground">{t("settings.nothing_active")}</p>
          )}

          <section className="space-y-3 border-t pt-5">
            <h3 className="text-[13px] font-semibold">
              {t("settings.section.plan_title")}
            </h3>
            {plan ? (
              <div className="rounded-md border p-4 text-sm">
                <p>
                  {t("settings.section.current_plan", {
                    tier: plan.plan,
                    quota: plan.quota_minutes,
                  })}
                </p>
                <Button asChild variant="outline" size="sm" className="mt-3">
                  <a
                    href={LEMON_SQUEEZY_PORTAL_URL}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t("settings.section.manage_cta")}
                  </a>
                </Button>
              </div>
            ) : (
              <SubscribeButton />
            )}
          </section>

          <div>
            <button onClick={() => refresh()} className="vt-btn">
              {t("settings.refresh")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
