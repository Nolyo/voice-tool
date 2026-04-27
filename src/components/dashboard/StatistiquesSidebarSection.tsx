import { useTranslation } from "react-i18next";
import type { Transcription } from "@/hooks/useTranscriptionHistory";
import { useStatistics, formatDurationCompact } from "@/hooks/useStatistics";

interface StatistiquesSidebarSectionProps {
  transcriptions: Transcription[];
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-1 mt-4 mb-2 text-[10.5px] font-semibold tracking-[0.1em] uppercase text-muted-foreground/80">
      {children}
    </div>
  );
}

function StatRow({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center justify-between px-2.5 py-1.5 rounded-md bg-foreground/[0.03]">
      <span className="text-[12px] text-muted-foreground">{label}</span>
      <span
        className={`text-[12px] font-medium font-mono ${
          accent ? "text-primary" : "text-foreground"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

export function StatistiquesSidebarSection({
  transcriptions,
}: StatistiquesSidebarSectionProps) {
  const { t, i18n } = useTranslation();
  const stats = useStatistics(transcriptions);
  const numberLocale = i18n.language === "en" ? "en-US" : "fr-FR";

  return (
    <div className="flex-1 overflow-y-auto px-2 pb-3 min-h-0">
      <SectionTitle>{t("statistics.sidebarOverview")}</SectionTitle>
      <div className="space-y-1.5">
        <StatRow
          label={t("statistics.kpiTotal")}
          value={stats.totalCount.toLocaleString(numberLocale)}
        />
        <StatRow
          label={t("statistics.kpiDuration")}
          value={formatDurationCompact(stats.totalDurationSec)}
        />
        <StatRow
          label={t("statistics.kpiWords")}
          value={stats.totalWords.toLocaleString(numberLocale)}
        />
        <StatRow
          label={t("statistics.kpiCost")}
          value={
            stats.totalCost > 0
              ? `$${stats.totalCost.toFixed(3)}`
              : t("history.free")
          }
        />
      </div>

      <SectionTitle>{t("statistics.sidebarStreak")}</SectionTitle>
      <div className="space-y-1.5">
        <StatRow
          label={t("statistics.streakCurrent")}
          value={
            stats.streakDays > 0
              ? t("statistics.daysCount", { count: stats.streakDays })
              : t("statistics.streakNone")
          }
          accent={stats.streakDays > 0}
        />
        <StatRow
          label={t("statistics.streakBest")}
          value={t("statistics.daysCount", { count: stats.longestStreakDays })}
        />
        <StatRow
          label={t("statistics.bestHour")}
          value={
            stats.topHour !== null
              ? `${String(stats.topHour).padStart(2, "0")}h`
              : "—"
          }
        />
      </div>
    </div>
  );
}
