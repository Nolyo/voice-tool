import { TranscriptionList } from "@/components/dashboard/transcription/TranscriptionList";
import { TranscriptionDetails } from "@/components/dashboard/transcription/TranscriptionDetails";
import type { Transcription } from "@/hooks/useTranscriptionHistory";

interface HistoriqueTabProps {
  transcriptions: Transcription[];
  selectedTranscription: Transcription | null;
  isSidebarOpen: boolean;
  isCompact: boolean;
  onSelectTranscription: (transcription: Transcription) => void;
  onCloseDetails: () => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
}

/**
 * "Historique" tab: timeline list of transcriptions on the left, detail
 * panel on the right (width-animated). When `isCompact` is true, the
 * details panel replaces the list instead of sitting next to it.
 */
export function HistoriqueTab({
  transcriptions,
  selectedTranscription,
  isSidebarOpen,
  isCompact,
  onSelectTranscription,
  onCloseDetails,
  onDelete,
  onClearAll,
}: HistoriqueTabProps) {
  if (isCompact && isSidebarOpen) {
    return (
      <div className="vt-app">
        <TranscriptionDetails
          transcription={selectedTranscription}
          onClose={onCloseDetails}
          onDelete={onDelete}
          compact
        />
      </div>
    );
  }

  return (
    <div className="vt-app flex gap-6 items-start">
      <div className="flex-1 min-w-0">
        <TranscriptionList
          transcriptions={transcriptions}
          selectedId={isSidebarOpen ? selectedTranscription?.id : undefined}
          onSelectTranscription={onSelectTranscription}
          onDelete={onDelete}
          onClearAll={onClearAll}
        />
      </div>
      <div
        className={`transition-all duration-300 overflow-hidden flex-shrink-0 ${
          isSidebarOpen ? "w-[440px]" : "w-0"
        }`}
      >
        <div className="w-[440px] sticky top-2">
          <TranscriptionDetails
            transcription={selectedTranscription}
            onClose={onCloseDetails}
            onDelete={onDelete}
          />
        </div>
      </div>
    </div>
  );
}
