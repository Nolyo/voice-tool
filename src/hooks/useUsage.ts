import { useContext } from "react";
import {
  CloudContext,
  type TrialStatus,
  type UsagePlan,
} from "@/contexts/CloudContext";
import type { MonthlyBreakdown } from "@/lib/usage/breakdown";

interface UsageData {
  trial: TrialStatus;
  monthly_minutes_used: number;
  monthly_minutes_breakdown: MonthlyBreakdown;
  plan: UsagePlan | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

/**
 * Thin selector over CloudContext. The actual fetch lives in CloudProvider so
 * QuotaCounter (header) and CloudSection (settings) share one set of round-trips.
 */
export function useUsage(): UsageData {
  const ctx = useContext(CloudContext);
  return {
    trial: ctx.trial,
    monthly_minutes_used: ctx.monthly_minutes_used,
    monthly_minutes_breakdown: ctx.monthly_minutes_breakdown,
    plan: ctx.plan,
    loading: ctx.usageLoading,
    refresh: ctx.refreshUsage,
  };
}
