import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { openCheckout } from "@/lib/billing/checkout";
import { PLANS, type PlanTier, type BillingCycle } from "@/lib/billing/plans";

export function SubscribeButton() {
  const { t } = useTranslation("billing");
  const { user } = useAuth();
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  const [loadingTier, setLoadingTier] = useState<PlanTier | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubscribe = async (tier: PlanTier) => {
    if (!user) return;
    setErrorMessage(null);
    setLoadingTier(tier);
    try {
      await openCheckout({ tier, cycle });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[billing] checkout failed:", err);
      setErrorMessage(msg);
    } finally {
      setLoadingTier(null);
    }
  };

  return (
    <div className="vt-app flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold">{t("title")}</h2>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <div className="flex justify-center gap-2">
        <button
          type="button"
          onClick={() => setCycle("monthly")}
          className={`rounded-md px-3 py-1.5 text-sm transition ${
            cycle === "monthly" ? "bg-primary text-primary-foreground" : "bg-muted"
          }`}
          aria-pressed={cycle === "monthly"}
        >
          {t("cycle.monthly")}
        </button>
        <button
          type="button"
          onClick={() => setCycle("annual")}
          className={`rounded-md px-3 py-1.5 text-sm transition ${
            cycle === "annual" ? "bg-primary text-primary-foreground" : "bg-muted"
          }`}
          aria-pressed={cycle === "annual"}
        >
          {t("cycle.annual")}
          <span className="ml-2 text-xs opacity-75">{t("cycle.annual_savings")}</span>
        </button>
      </div>

      {errorMessage && (
        <div
          role="alert"
          className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive"
        >
          <code className="break-all">{errorMessage}</code>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {(["starter", "pro"] as PlanTier[]).map((tier) => {
          const plan = PLANS[`${tier}_${cycle}`];
          const features = t(`plans.${tier}.features`, { returnObjects: true }) as string[];
          const priceLabel = cycle === "monthly"
            ? t("price_per_month", { price: plan.price_eur })
            : t("price_per_year", { price: plan.price_eur });

          return (
            <div key={tier} className="flex flex-col rounded-lg border p-6">
              <h3 className="text-lg font-semibold">{t(`plans.${tier}.name`)}</h3>
              <p className="text-sm text-muted-foreground">{t(`plans.${tier}.tagline`)}</p>
              <p className="mt-3 text-2xl font-bold">{priceLabel}</p>
              <ul className="mt-4 flex flex-1 flex-col gap-2">
                {features.map((feat) => (
                  <li key={feat} className="flex items-start gap-2 text-sm">
                    <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>
              <Button
                onClick={() => handleSubscribe(tier)}
                disabled={loadingTier !== null || !user}
                className="mt-6"
              >
                {loadingTier === tier ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    {t("redirecting")}
                  </>
                ) : (
                  t("cta")
                )}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
