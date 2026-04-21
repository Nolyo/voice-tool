import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { Transcription } from "@/hooks/useTranscriptionHistory";
import { isToday } from "@/lib/date-format";

interface HistoriqueSidebarSectionProps {
  transcriptions: Transcription[];
}

function parseAt(t: Transcription): Date {
  const iso = `${t.date}T${t.time}`;
  const d = new Date(iso);
  if (!Number.isNaN(d.getTime())) return d;
  return new Date(`${t.date} ${t.time}`);
}

function wordsOf(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
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
        className={`text-[12px] font-medium font-mono ${accent ? "text-primary" : "text-foreground"}`}
      >
        {value}
      </span>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="w-2 h-2 rounded-full" style={{ background: color }} />
      <span className="text-[11.5px] text-muted-foreground">{label}</span>
    </div>
  );
}

/**
 * Sub-content for the Historique tab: live overview stats and timeline
 * legend. Rendered below the main nav when the Historique tab is active
 * and the sidebar is expanded.
 */
export function HistoriqueSidebarSection({
  transcriptions,
}: HistoriqueSidebarSectionProps) {
  const { t, i18n } = useTranslation();
  const stats = useMemo(() => {
    let today = 0;
    let words = 0;
    let cost = 0;
    const firstDay = new Date();
    firstDay.setDate(firstDay.getDate() - 30);
    firstDay.setHours(0, 0, 0, 0);

    for (const tr of transcriptions) {
      const at = parseAt(tr);
      if (isToday(at)) today++;
      words += wordsOf(tr.text);

      if (at >= firstDay) {
        cost += (tr.apiCost ?? 0) + (tr.postProcessCost ?? 0);
      }
    }

    return {
      total: transcriptions.length,
      today,
      words,
      cost,
    };
  }, [transcriptions]);

  const numberLocale = i18n.language === "en" ? "en-US" : "fr-FR";

  return (
    <div className="flex-1 overflow-y-auto px-2 pb-3 min-h-0">
      <SectionTitle>{t("history.overview")}</SectionTitle>
      <div className="space-y-1.5">
        <StatRow label={t("history.total")} value={String(stats.total)} />
        <StatRow
          label={t("common.today")}
          value={String(stats.today)}
          accent={stats.today > 0}
        />
        <StatRow
          label={t("history.wordsTranscribed")}
          value={stats.words.toLocaleString(numberLocale)}
        />
        <StatRow
          label={t("history.cost30d")}
          value={stats.cost > 0 ? `$${stats.cost.toFixed(3)}` : t("history.free")}
        />
      </div>

      <SectionTitle>{t("history.legend")}</SectionTitle>
      <div className="px-1 space-y-1.5">
        <LegendDot
          color="oklch(0.72 0.14 205)"
          label={t("history.legendApiCloud")}
        />
        <LegendDot
          color="oklch(0.74 0.14 150)"
          label={t("history.legendLocal")}
        />
      </div>
    </div>
  );
}
