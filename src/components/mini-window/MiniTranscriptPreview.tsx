import { useTranslation } from "react-i18next";
import type { WindowStatus } from "@/hooks/useMiniWindowState";

interface MiniTranscriptPreviewProps {
  status: WindowStatus;
  lastTranscript: string;
  recordingTime: number;
}

function formatTime(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, "0")}:${secs
    .toString()
    .padStart(2, "0")}`;
}

export function MiniTranscriptPreview({
  status,
  lastTranscript,
  recordingTime,
}: MiniTranscriptPreviewProps) {
  const { t } = useTranslation();

  let content: string;
  let className = "text-xs text-slate-400 truncate";

  if (status === "recording") {
    content = `${t("mini.recordingHint", { defaultValue: "Recording…" })} ${formatTime(recordingTime)}`;
  } else if (status === "processing") {
    content = t("mini.sendingAudio");
    className = "text-xs text-slate-300 truncate italic";
  } else if (lastTranscript) {
    content = lastTranscript;
    className = "text-xs text-slate-200 truncate";
  } else {
    content = t("mini.noTranscriptYet", {
      defaultValue: "No transcription yet",
    });
    className = "text-xs text-slate-500 truncate italic";
  }

  return (
    <div className="mt-1 w-full overflow-hidden">
      <p className={className}>{content}</p>
    </div>
  );
}
