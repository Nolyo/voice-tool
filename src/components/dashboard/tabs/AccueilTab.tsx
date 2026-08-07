import { useTranslation } from "react-i18next";
import type { NoteData, NoteMeta } from "@/hooks/useNotes";
import { GreetingHeader } from "@/components/dashboard/home/GreetingHeader";
import { SectionLabel } from "@/components/dashboard/home/SectionLabel";
import { HeroDictationCard } from "@/components/dashboard/home/HeroDictationCard";
import { SubscriptionCard } from "@/components/dashboard/home/SubscriptionCard";
import { SyncStatusCard } from "@/components/dashboard/home/SyncStatusCard";
import { RecentNotesCard } from "@/components/dashboard/home/RecentNotesCard";
import { QuickActionsCard } from "@/components/dashboard/home/QuickActionsCard";

interface AccueilTabProps {
  notes: NoteMeta[];
  readNote: (id: string) => Promise<NoteData>;
  historyCount: number;
  isRecording: boolean;
  isTranscribing: boolean;
  /** Assembled live transcript of the active streaming session ("" if none). */
  liveTranscript?: string;
  onToggleRecording: () => void;
  onOpenNote: (note: NoteMeta) => void;
  onCreateNote: () => void;
  onViewHistory: () => void;
  onViewNotes: () => void;
  onViewStatistics: () => void;
  onOpenAccountPage: () => void;
  onOpenAboutPage: () => void;
}

/**
 * Home screen — the default landing tab. A time-aware greeting, then three
 * sections: "Dictate" (hero recording affordance + adaptive subscription &
 * sync cards), recently edited notes, and quick actions. The shared sidebar /
 * header live in Dashboard, so this only renders the page body.
 */
export function AccueilTab({
  notes,
  readNote,
  historyCount,
  isRecording,
  isTranscribing,
  liveTranscript,
  onToggleRecording,
  onOpenNote,
  onCreateNote,
  onViewHistory,
  onViewNotes,
  onViewStatistics,
  onOpenAccountPage,
  onOpenAboutPage,
}: AccueilTabProps) {
  const { t } = useTranslation();

  return (
    <div className="vt-app max-w-[1200px] mx-auto space-y-7">
      <GreetingHeader onOpenAboutPage={onOpenAboutPage} />

      {/* Dictate */}
      <section>
        <SectionLabel>{t("home.sections.dictate")}</SectionLabel>
        <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-4 items-stretch">
          <HeroDictationCard
            isRecording={isRecording}
            isTranscribing={isTranscribing}
            liveTranscript={liveTranscript}
            onToggleRecording={onToggleRecording}
          />
          <div className="grid grid-rows-[auto_1fr] gap-4 min-w-0">
            <SubscriptionCard onOpenAccountPage={onOpenAccountPage} />
            <SyncStatusCard
              notesCount={notes.length}
              onOpenAccountPage={onOpenAccountPage}
            />
          </div>
        </div>
      </section>

      {/* Recent notes */}
      <RecentNotesCard
        notes={notes}
        readNote={readNote}
        onOpenNote={onOpenNote}
        onCreateNote={onCreateNote}
        onViewAllNotes={onViewNotes}
      />

      {/* Quick actions */}
      <QuickActionsCard
        historyCount={historyCount}
        onCreateNote={onCreateNote}
        onViewHistory={onViewHistory}
        onViewStatistics={onViewStatistics}
      />
    </div>
  );
}
