import { Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { useSync } from "@/hooks/useSync";
import type { NoteMeta } from "@/hooks/useNotes";
import { TrialAccountCard } from "@/components/dashboard/home/TrialAccountCard";
import { SyncReminderCard } from "@/components/dashboard/home/SyncReminderCard";
import { RecentNotesCard } from "@/components/dashboard/home/RecentNotesCard";
import { QuickActionsCard } from "@/components/dashboard/home/QuickActionsCard";

interface AccueilTabProps {
  notes: NoteMeta[];
  onOpenNote: (note: NoteMeta) => void;
  onCreateNote: () => void;
  onViewHistory: () => void;
  onViewNotes: () => void;
  onOpenAccountPage: () => void;
}

/**
 * Home screen: the default landing tab. Assembles autonomous cards (account /
 * trial, sync reminder, recent notes, quick actions). The sync reminder only
 * appears when signed in with sync disabled for the current profile — the
 * layout adapts so the account card spans the row when it is hidden.
 */
export function AccueilTab({
  notes,
  onOpenNote,
  onCreateNote,
  onViewHistory,
  onViewNotes,
  onOpenAccountPage,
}: AccueilTabProps) {
  const { t } = useTranslation();
  const { status } = useAuth();
  const { enabled: syncEnabled } = useSync();

  const showSyncReminder = status === "signed-in" && !syncEnabled;

  return (
    <div className="vt-app space-y-5 max-w-5xl mx-auto">
      {/* Hero */}
      <div className="vt-anim-fade-up">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="w-4 h-4 text-[var(--vt-accent)]" />
          <span className="vt-eyebrow text-[var(--vt-accent)]">
            {t("home.heroEyebrow")}
          </span>
        </div>
        <h2 className="vt-display text-[22px] font-semibold tracking-tight text-[var(--vt-fg)]">
          {t("home.heroTitle")}
        </h2>
        <p className="text-[13.5px] text-[var(--vt-fg-3)] mt-1 max-w-2xl">
          {t("home.heroSubtitle")}
        </p>
      </div>

      {/* Account + sync row */}
      <div
        className={
          showSyncReminder ? "grid grid-cols-1 lg:grid-cols-2 gap-4" : ""
        }
      >
        <TrialAccountCard onOpenAccountPage={onOpenAccountPage} />
        {showSyncReminder && (
          <SyncReminderCard onOpenAccountPage={onOpenAccountPage} />
        )}
      </div>

      {/* Recent notes */}
      <RecentNotesCard
        notes={notes}
        onOpenNote={onOpenNote}
        onCreateNote={onCreateNote}
        onViewAllNotes={onViewNotes}
      />

      {/* Quick actions */}
      <QuickActionsCard
        onCreateNote={onCreateNote}
        onViewHistory={onViewHistory}
      />
    </div>
  );
}
