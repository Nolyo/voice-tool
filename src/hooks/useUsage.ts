import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useCloud } from "@/hooks/useCloud";

interface TrialStatus {
  is_active: boolean;
  minutes_remaining: number;
  expires_at: string | null;
}

interface UsageData {
  trial: TrialStatus;
  monthly_minutes_used: number;
  plan: { quota_minutes: number; plan: "starter" | "pro" } | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

function currentYearMonth(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function useUsage(): UsageData {
  const { user } = useAuth();
  const { setEligibility } = useCloud();

  const [trial, setTrial] = useState<TrialStatus>({
    is_active: false,
    minutes_remaining: 0,
    expires_at: null,
  });
  const [monthlyUsed, setMonthlyUsed] = useState<number>(0);
  const [plan, setPlan] = useState<UsageData["plan"]>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const fetchAll = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const ym = currentYearMonth();
      const [{ data: trialData }, { data: usage }, { data: sub }] = await Promise.all([
        supabase
          .from("trial_status")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase
          .from("usage_summary")
          .select("units_total")
          .eq("user_id", user.id)
          .eq("year_month", ym)
          .eq("kind", "transcription")
          .maybeSingle(),
        supabase
          .from("subscriptions")
          .select("plan, quota_minutes, status")
          .eq("user_id", user.id)
          .maybeSingle(),
      ]);

      const t: TrialStatus = {
        is_active: Boolean(trialData?.is_active),
        minutes_remaining: Number(trialData?.minutes_remaining ?? 0),
        expires_at: (trialData?.expires_at as string) ?? null,
      };
      setTrial(t);
      setMonthlyUsed(Number(usage?.units_total ?? 0));
      setPlan(
        sub && sub.status === "active"
          ? {
              quota_minutes: Number(sub.quota_minutes),
              plan: sub.plan as "starter" | "pro",
            }
          : null,
      );

      const eligible = t.is_active || sub?.status === "active";
      setEligibility(eligible);
    } finally {
      setLoading(false);
    }
  }, [user, setEligibility]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  return {
    trial,
    monthly_minutes_used: monthlyUsed,
    plan,
    loading,
    refresh: fetchAll,
  };
}
