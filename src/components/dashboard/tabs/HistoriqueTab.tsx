import { RecordingCard } from "@/components/recording-card";
import { TranscriptionList } from "@/components/transcription-list";
import { TranscriptionDetails } from "@/components/transcription-details";
import type { Transcription } from "@/hooks/useTranscriptionHistory";

interface HistoriqueTabProps {
  isRecording: boolean;
  isTranscribing: boolean;
  onToggleRecording: () => void;
  hideRecordingPanel: boolean;
  transcriptions: Transcription[];
  selectedTranscription: Transcription | null;
  onSelectTranscription: (transcription: Transcription) => void;
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
  onSelectTranscription,
  onCopy,
  onDelete,
  onClearAll,
}: HistoriqueTabProps) {
  return (
    <div className="space-y-6">
      {!hideRecordingPanel && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <RecordingCard
            isRecording={isRecording}
            isTranscribing={isTranscribing}
            onToggleRecording={onToggleRecording}
          />
          <TranscriptionDetails
            transcription={selectedTranscription}
            onCopy={onCopy}
          />
        </div>
      )}
      <TranscriptionList
        transcriptions={transcriptions}
        selectedId={selectedTranscription?.id}
        onSelectTranscription={onSelectTranscription}
        onCopy={onCopy}
        onDelete={onDelete}
        onClearAll={onClearAll}
      />
    </div>
  );
}
