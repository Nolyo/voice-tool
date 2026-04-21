import { useMemo } from "react";
import type { Transcription } from "@/hooks/useTranscriptionHistory";

interface HistoriqueSidebarSectionProps {
  transcriptions: Transcription[];
}

const DAY_NAMES = [
  "Dimanche",
  "Lundi",
  "Mardi",
  "Mercredi",
  "Jeudi",
  "Vendredi",
  "Samedi",
];
const MONTHS = [
  "janv.",
  "févr.",
  "mars",
  "avr.",
  "mai",
  "juin",
  "juil.",
  "août",
  "sept.",
  "oct.",
  "nov.",
  "déc.",
];

function parseAt(t: Transcription): Date {
  const iso = `${t.date}T${t.time}`;
  const d = new Date(iso);
  if (!Number.isNaN(d.getTime())) return d;
  return new Date(`${t.date} ${t.time}`);
}

function dayLabel(d: Date): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dd = new Date(d);
  dd.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - dd.getTime()) / 86400000);
  if (diff === 0) return "Aujourd'hui";
  if (diff === 1) return "Hier";
  if (diff < 7 && diff > 0) return DAY_NAMES[dd.getDay()];
  return `${dd.getDate()} ${MONTHS[dd.getMonth()]}`;
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
  const stats = useMemo(() => {
    let today = 0;
    let words = 0;
    let cost = 0;
    const firstDay = new Date();
    firstDay.setDate(firstDay.getDate() - 30);
    firstDay.setHours(0, 0, 0, 0);

    for (const t of transcriptions) {
      if (dayLabel(parseAt(t)) === "Aujourd'hui") today++;
      words += wordsOf(t.text);

      const at = parseAt(t);
      if (at >= firstDay) {
        cost += (t.apiCost ?? 0) + (t.postProcessCost ?? 0);
      }
    }

    return {
      total: transcriptions.length,
      today,
      words,
      cost,
    };
  }, [transcriptions]);

  return (
    <div className="flex-1 overflow-y-auto px-2 pb-3 min-h-0">
      <SectionTitle>Vue d'ensemble</SectionTitle>
      <div className="space-y-1.5">
        <StatRow label="Total" value={String(stats.total)} />
        <StatRow
          label="Aujourd'hui"
          value={String(stats.today)}
          accent={stats.today > 0}
        />
        <StatRow
          label="Mots transcrits"
          value={stats.words.toLocaleString("fr")}
        />
        <StatRow
          label="Coût (30 j)"
          value={stats.cost > 0 ? `$${stats.cost.toFixed(3)}` : "Gratuit"}
        />
      </div>

      <SectionTitle>Légende</SectionTitle>
      <div className="px-1 space-y-1.5">
        <LegendDot
          color="oklch(0.72 0.14 205)"
          label="API (cloud)"
        />
        <LegendDot
          color="oklch(0.74 0.14 150)"
          label="Local"
        />
        <LegendDot
          color="oklch(0.72 0.17 295)"
          label="Post-traitée IA"
        />
      </div>
    </div>
  );
}
