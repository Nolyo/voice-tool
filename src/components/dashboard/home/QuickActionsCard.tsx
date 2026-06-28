import type { ReactNode } from "react";
import { BarChart3, ChevronRight, History, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SectionLabel } from "./SectionLabel";

interface QuickActionsCardProps {
  historyCount: number;
  onCreateNote: () => void;
  onViewHistory: () => void;
  onViewStatistics: () => void;
}

/**
 * "Quick actions" section: three tiles routing to the most common destinations
 * (new note, transcription history, statistics).
 */
export function QuickActionsCard({
  historyCount,
  onCreateNote,
  onViewHistory,
  onViewStatistics,
}: QuickActionsCardProps) {
  const { t } = useTranslation();

  return (
    <section>
      <SectionLabel>{t("home.quickActions.title")}</SectionLabel>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Tile
          icon={<Plus className="w-[19px] h-[19px]" />}
          tint="var(--vt-accent)"
          title={t("home.quickActions.newNote")}
          desc={t("home.quickActions.newNoteDesc")}
          onClick={onCreateNote}
        />
        <Tile
          icon={<History className="w-[19px] h-[19px]" />}
          tint="var(--vt-violet)"
          title={t("home.quickActions.viewHistory")}
          desc={t("home.quickActions.viewHistoryDesc", { count: historyCount })}
          onClick={onViewHistory}
        />
        <Tile
          icon={<BarChart3 className="w-[19px] h-[19px]" />}
          tint="var(--vt-warn)"
          title={t("home.quickActions.statistics")}
          desc={t("home.quickActions.statisticsDesc")}
          onClick={onViewStatistics}
        />
      </div>
    </section>
  );
}

function Tile({
  icon,
  tint,
  title,
  desc,
  onClick,
}: {
  icon: ReactNode;
  tint: string;
  title: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group vt-card-elevated flex items-center gap-3.5 p-4 hover:bg-[var(--vt-surface)] transition-colors text-left cursor-pointer"
      style={{ ["--tile-tint" as string]: tint }}
    >
      <span
        className="flex items-center justify-center w-[38px] h-[38px] rounded-[11px] shrink-0"
        style={{
          color: tint,
          background: `color-mix(in oklab, ${tint} 16%, transparent)`,
        }}
      >
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-[13.5px] font-medium text-[var(--vt-fg)]">
          {title}
        </div>
        <div className="text-[11.5px] text-[var(--vt-fg-4)] mt-0.5 truncate">
          {desc}
        </div>
      </div>
      <ChevronRight className="w-4 h-4 shrink-0 text-[var(--vt-fg-4)] group-hover:text-[var(--vt-accent)] group-hover:translate-x-0.5 transition-all" />
    </button>
  );
}
