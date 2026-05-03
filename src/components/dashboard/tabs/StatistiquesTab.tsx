import { useTranslation } from "react-i18next";
import {
  Activity,
  Clock,
  DollarSign,
  Mic,
  Sparkles,
  Type,
  Zap,
} from "lucide-react";
import type { Transcription } from "@/hooks/useTranscriptionHistory";
import { formatDurationCompact, useStatistics } from "@/hooks/useStatistics";
import { KpiCard } from "@/components/dashboard/statistics/KpiCard";
import { ActivityChart } from "@/components/dashboard/statistics/ActivityChart";
import { HourlyHeatmap } from "@/components/dashboard/statistics/HourlyHeatmap";
import { ProviderBreakdown } from "@/components/dashboard/statistics/ProviderBreakdown";
import { TopWords } from "@/components/dashboard/statistics/TopWords";

interface StatistiquesTabProps {
  transcriptions: Transcription[];
}

export function StatistiquesTab({ transcriptions }: StatistiquesTabProps) {
  const { t, i18n } = useTranslation();
  const stats = useStatistics(transcriptions);
  const numberLocale = i18n.language === "en" ? "en-US" : "fr-FR";

  if (transcriptions.length === 0) {
    return (
      <div className="vt-app">
        <div className="vt-card-elevated p-12 text-center max-w-xl mx-auto mt-8">
          <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-[var(--vt-accent-soft)] text-[var(--vt-accent)] mx-auto">
            <Activity className="w-6 h-6" />
          </div>
          <h2 className="mt-4 vt-display text-[18px] font-semibold text-[var(--vt-fg)]">
            {t("statistics.emptyTitle")}
          </h2>
          <p className="mt-2 text-[13px] text-[var(--vt-fg-3)] leading-relaxed">
            {t("statistics.emptySubtitle")}
          </p>
        </div>
      </div>
    );
  }

  const ppRatePct = Math.round(stats.postProcessRate * 100);
  const wpm = stats.averageWordsPerMin;

  return (
    <div className="vt-app space-y-5">
      {/* Hero section */}
      <div className="vt-anim-fade-up">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="w-4 h-4 text-[var(--vt-accent)]" />
          <span className="vt-eyebrow text-[var(--vt-accent)]">
            {t("statistics.heroEyebrow")}
          </span>
        </div>
        <h2 className="vt-display text-[22px] font-semibold tracking-tight text-[var(--vt-fg)]">
          {t("statistics.heroTitle")}
        </h2>
        <p className="text-[13.5px] text-[var(--vt-fg-3)] mt-1 max-w-2xl">
          {t("statistics.heroSubtitle", {
            count: stats.totalCount,
            duration: formatDurationCompact(stats.totalDurationSec),
          })}
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard
          icon={Mic}
          label={t("statistics.kpiTotal")}
          value={stats.totalCount.toLocaleString(numberLocale)}
          hint={t("statistics.kpiTotalHint", { count: stats.streakDays })}
          accent="default"
        />
        <KpiCard
          icon={Clock}
          label={t("statistics.kpiDuration")}
          value={formatDurationCompact(stats.totalDurationSec)}
          hint={t("statistics.kpiDurationHint", {
            avg: formatDurationCompact(stats.averageDurationSec),
          })}
          accent="violet"
        />
        <KpiCard
          icon={Type}
          label={t("statistics.kpiWords")}
          value={stats.totalWords.toLocaleString(numberLocale)}
          hint={
            wpm > 0
              ? t("statistics.kpiWordsHint", { wpm: Math.round(wpm) })
              : undefined
          }
          accent="emerald"
        />
        <KpiCard
          icon={Zap}
          label={t("statistics.kpiTimeSaved")}
          value={formatDurationCompact(stats.timeSavedSec)}
          hint={t("statistics.kpiTimeSavedHint")}
          accent="amber"
        />
        <KpiCard
          icon={Sparkles}
          label={t("statistics.kpiPostProcess")}
          value={`${ppRatePct}%`}
          hint={t("statistics.kpiPostProcessHint")}
          accent="rose"
        />
        <KpiCard
          icon={DollarSign}
          label={t("statistics.kpiCost")}
          value={
            stats.totalCost > 0
              ? `$${stats.totalCost.toFixed(2)}`
              : t("history.free")
          }
          hint={t("statistics.kpiCostHint")}
          accent="default"
        />
      </div>

      {/* Activity chart */}
      <ActivityChart buckets={stats.daily30} />

      {/* Heatmap + providers row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <HourlyHeatmap matrix={stats.weekHourMatrix} />
        <ProviderBreakdown
          providers={stats.providers}
          total={stats.totalCount}
        />
      </div>

      {/* Top words */}
      <TopWords words={stats.topWords} />
    </div>
  );
}
