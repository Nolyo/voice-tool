import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useSettings } from "@/hooks/useSettings";

export type CloudMode = "local" | "cloud" | "uninitialized";

export interface TrialStatus {
  is_active: boolean;
  minutes_remaining: number;
  expires_at: string | null;
}

export interface UsagePlan {
  quota_minutes: number;
  plan: "starter" | "pro";
}

export interface CloudContextValue {
  /**
   * Effective routing for the next transcription / post-process call.
   * "cloud" requires: signed-in user, server-side eligibility (active trial
   * or active subscription), AND the user explicitly picked "LexenaCloud" as
   * their transcription provider in settings. Anything else falls back to
   * "local" — meaning the local Whisper / user's API key path.
   */
  mode: CloudMode;
  isCloudEligible: boolean;
  hasCloudSelected: boolean;

  // Usage data, hoisted here so QuotaCounter and CloudSection share a single
  // fetch instead of each mounting their own copy of useUsage.
  trial: TrialStatus;
  monthly_minutes_used: number;
  plan: UsagePlan | null;
  usageLoading: boolean;
  refreshUsage: () => Promise<void>;
}

const DEFAULT_TRIAL: TrialStatus = {
  is_active: false,
  minutes_remaining: 0,
  expires_at: null,
};

export const CloudContext = createContext<CloudContextValue>({
  mode: "uninitialized",
  isCloudEligible: false,
  hasCloudSelected: false,
  trial: DEFAULT_TRIAL,
  monthly_minutes_used: 0,
  plan: null,
  usageLoading: true,
  refreshUsage: async () => {},
});

function currentYearMonth(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function CloudProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { settings: { transcription_provider } } = useSettings();

  const [eligible, setEligible] = useState(false);
  const [trial, setTrial] = useState<TrialStatus>(DEFAULT_TRIAL);
  const [monthlyUsed, setMonthlyUsed] = useState(0);
  const [plan, setPlan] = useState<UsagePlan | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);

  const hasCloudSelected = transcription_provider === "LexenaCloud";

  const refreshUsage = useCallback(async () => {
    if (!user) {
      setTrial(DEFAULT_TRIAL);
      setMonthlyUsed(0);
      setPlan(null);
      setEligible(false);
      setUsageLoading(false);
      return;
    }
    setUsageLoading(true);
    try {
      const ym = currentYearMonth();
      const [{ data: trialData }, { data: usage }, { data: sub }] = await Promise.all([
        supabase.from("trial_status").select("*").eq("user_id", user.id).maybeSingle(),
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
          ? { quota_minutes: Number(sub.quota_minutes), plan: sub.plan as "starter" | "pro" }
          : null,
      );
      setEligible(t.is_active || sub?.status === "active");
    } finally {
      setUsageLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refreshUsage();
  }, [refreshUsage]);

  const mode: CloudMode = useMemo(() => {
    if (!user) return "local";
    if (!hasCloudSelected) return "local";
    return eligible ? "cloud" : "local";
  }, [user, eligible, hasCloudSelected]);

  const value = useMemo<CloudContextValue>(
    () => ({
      mode,
      isCloudEligible: eligible,
      hasCloudSelected,
      trial,
      monthly_minutes_used: monthlyUsed,
      plan,
      usageLoading,
      refreshUsage,
    }),
    [mode, eligible, hasCloudSelected, trial, monthlyUsed, plan, usageLoading, refreshUsage],
  );
  return <CloudContext.Provider value={value}>{children}</CloudContext.Provider>;
}
