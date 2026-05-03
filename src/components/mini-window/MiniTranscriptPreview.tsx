import { useTranslation } from "react-i18next";
import type { WindowStatus } from "@/hooks/useMiniWindowState";

interface MiniTranscriptPreviewProps {
  status: WindowStatus;
  lastTranscript: string;
}

export function MiniTranscriptPreview({
  status,
  lastTranscript,
}: MiniTranscriptPreviewProps) {
  const { t } = useTranslation();

  let content: string;
  let className = "text-xs text-vt-fg-3 truncate";

  if (status === "processing") {
    content = t("mini.sendingAudio");
    className = "text-xs text-vt-fg-2 truncate italic";
  } else if (lastTranscript) {
    content = lastTranscript;
    className = "text-xs text-vt-fg-2 truncate";
  } else {
    content = t("mini.noTranscriptYet", {
      defaultValue: "No transcription yet",
    });
    className = "text-xs text-vt-fg-4 truncate italic";
  }

  return (
    <div className="vt-anim-fade-up mt-1 w-full overflow-hidden">
      <p className={className}>{content}</p>
    </div>
  );
}
