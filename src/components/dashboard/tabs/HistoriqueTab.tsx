import { TranscriptionList } from "@/components/dashboard/transcription/TranscriptionList";
import { TranscriptionDetails } from "@/components/dashboard/transcription/TranscriptionDetails";
import type { Transcription } from "@/hooks/useTranscriptionHistory";

interface HistoriqueTabProps {
  transcriptions: Transcription[];
  selectedTranscription: Transcription | null;
  isSidebarOpen: boolean;
  onSelectTranscription: (transcription: Transcription) => void;
  onCloseDetails: () => void;
  onCopy: (text: string) => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
}

/**
 * Dashboard "Historique" tab content — selected transcription preview + list
 * of past transcriptions. Recording controls live in the DashboardHeader so
 * they remain accessible from every tab.
 */
export function HistoriqueTab({
  transcriptions,
  selectedTranscription,
  isSidebarOpen,
  onSelectTranscription,
  onCloseDetails,
  onCopy,
  onDelete,
  onClearAll,
}: HistoriqueTabProps) {
  return (
    <div className="flex gap-4 items-start">
      <div className="flex-1 min-w-0">
        <TranscriptionList
          transcriptions={transcriptions}
          selectedId={isSidebarOpen ? selectedTranscription?.id : undefined}
          onSelectTranscription={onSelectTranscription}
          onCopy={onCopy}
          onDelete={onDelete}
          onClearAll={onClearAll}
        />
      </div>
      <div
        className={`transition-all duration-300 overflow-hidden flex-shrink-0 ${
          isSidebarOpen ? "w-96" : "w-0"
        }`}
      >
        <div className="w-96">
          <TranscriptionDetails
            transcription={selectedTranscription}
            onCopy={onCopy}
            onClose={onCloseDetails}
          />
        </div>
      </div>
    </div>
  );
}
