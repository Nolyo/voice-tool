import { RecordingCard } from "@/components/common/RecordingCard";
import { TranscriptionList } from "@/components/dashboard/transcription/TranscriptionList";
import { TranscriptionDetails } from "@/components/dashboard/transcription/TranscriptionDetails";
import type { Transcription } from "@/hooks/useTranscriptionHistory";

interface HistoriqueTabProps {
  isRecording: boolean;
  isTranscribing: boolean;
  onToggleRecording: () => void;
  hideRecordingPanel: boolean;
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
 * Dashboard "Historique" tab content — the recording card + selected
 * transcription preview + list of past transcriptions. Layout is purely
 * presentational; all state lives upstream.
 */
export function HistoriqueTab({
  isRecording,
  isTranscribing,
  onToggleRecording,
  hideRecordingPanel,
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
    <div className="space-y-4">
      {!hideRecordingPanel && (
        <RecordingCard
          isRecording={isRecording}
          isTranscribing={isTranscribing}
          onToggleRecording={onToggleRecording}
        />
      )}
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
    </div>
  );
}
