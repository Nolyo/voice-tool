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
 * "Historique" tab: timeline list of transcriptions on the left, detail
 * panel on the right (width-animated).
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
    <div className="vt-app flex gap-6 items-start">
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
          isSidebarOpen ? "w-[440px]" : "w-0"
        }`}
      >
        <div className="w-[440px] sticky top-2">
          <TranscriptionDetails
            transcription={selectedTranscription}
            onCopy={onCopy}
            onClose={onCloseDetails}
            onDelete={onDelete}
          />
        </div>
      </div>
    </div>
  );
}
