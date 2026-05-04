import { memo } from "react";
import { useTranslation } from "react-i18next";
import { Check, Copy, Pin, PinOff, Sparkles, Trash2 } from "lucide-react";
import { type Transcription } from "@/hooks/useTranscriptionHistory";
import { useDateFormatters } from "@/lib/date-format";
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";

function durFmt(s?: number): string {
  if (!s || s <= 0) return "—";
  if (s < 60) return `${Math.round(s)}s`;
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return `${m}m ${String(r).padStart(2, "0")}s`;
}

function wordsOf(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

interface TimelineRowProps {
  item: Transcription;
  at: Date;
  isSelected: boolean;
  isFirst: boolean;
  isLast: boolean;
  onSelect: (item: Transcription) => void;
  onDelete?: (id: string) => void;
  onTogglePin?: (id: string) => void | Promise<void>;
}

function TimelineRowImpl({
  item,
  at,
  isSelected,
  isFirst,
  isLast,
  onSelect,
  onDelete,
  onTogglePin,
}: TimelineRowProps) {
  const { t } = useTranslation();
  const { copy, justCopied } = useCopyToClipboard();
  const { formatTime } = useDateFormatters();
  const words = wordsOf(item.text);
  const postProcess = Boolean(item.originalText);
  const source = item.apiCost !== undefined && item.apiCost > 0 ? "api" : "local";
  const isPinned = Boolean(item.pinnedAt);

  return (
    <div
      className={
        "hist-row group" +
        (isFirst ? " hist-rail-first" : "") +
        (isLast ? " hist-rail-last" : "")
      }
      data-selected={isSelected}
      data-postprocess={postProcess}
      data-source={source}
      data-pinned={isPinned}
      onClick={() => onSelect(item)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(item);
        }
      }}
    >
      <div className="vt-mono text-[11.5px] hist-time" style={{ color: "var(--vt-fg-3)" }}>
        {formatTime(at)}
      </div>
      <div className="hist-dot">
        <span className="hist-dot-circle" />
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          {isPinned && (
            <span
              className="inline-flex items-center gap-1 px-1.5 h-4 rounded text-[10px] font-medium vt-pin-badge"
              title={t("history.pinnedBadge")}
            >
              <Pin className="w-2.5 h-2.5" aria-hidden />
              <span>{t("history.pinnedBadge")}</span>
            </span>
          )}
          {source === "api" && item.transcriptionProvider && (
            <span
              className="inline-flex items-center px-1.5 h-4 rounded text-[10px] font-medium"
              style={{
                background: "oklch(from var(--vt-cyan) l c h / 0.16)",
                color: "var(--vt-cyan)",
              }}
              title={t("history.legendApiCloud")}
            >
              {item.transcriptionProvider}
            </span>
          )}
          {postProcess && (
            <span
              className="inline-flex items-center gap-1 px-1.5 h-4 rounded text-[10px] font-medium"
              style={{
                background: "oklch(from var(--vt-violet) l c h / 0.16)",
                color: "var(--vt-violet)",
              }}
              title={t("history.postProcessedBadge")}
            >
              <Sparkles className="w-2.5 h-2.5" aria-hidden />
              <span>IA</span>
            </span>
          )}
          <span className="text-[11px]" style={{ color: "var(--vt-fg-4)" }}>
            {item.duration !== undefined && item.duration > 0 && (
              <>
                <span className="vt-mono">{durFmt(item.duration)}</span>
                <span className="mx-1.5">·</span>
              </>
            )}
            <span className="vt-mono">
              {t("history.wordsCount", { count: words })}
            </span>
            {item.apiCost !== undefined && item.apiCost > 0 && (
              <>
                <span className="mx-1.5">·</span>
                <span className="vt-mono">${item.apiCost.toFixed(4)}</span>
              </>
            )}
          </span>
        </div>
        <div className="text-[13px] truncate" style={{ color: "var(--vt-fg)" }}>
          {item.text.split("\n")[0] || item.text}
        </div>
      </div>
      <div
        className="flex items-center gap-0.5 transition"
        style={{ opacity: isSelected ? 1 : undefined }}
      >
        {onTogglePin && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              void onTogglePin(item.id);
            }}
            className="w-7 h-7 rounded-md flex items-center justify-center vt-hover-bg vt-pin-btn"
            data-pinned={isPinned}
            style={{ color: isPinned ? "var(--vt-pin)" : "var(--vt-fg-3)" }}
            data-tip={isPinned ? t("history.unpinTooltip") : t("history.pinTooltip")}
            aria-label={isPinned ? t("history.unpin") : t("history.pin")}
            aria-pressed={isPinned}
          >
            {isPinned ? (
              <PinOff className="w-3.5 h-3.5" />
            ) : (
              <Pin className="w-3.5 h-3.5" />
            )}
          </button>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            copy(item.text);
          }}
          className="w-7 h-7 rounded-md flex items-center justify-center vt-hover-bg"
          style={{ color: justCopied ? "var(--vt-ok)" : "var(--vt-fg-3)" }}
          data-tip={justCopied ? t("common.copied") : t("transcriptionDetails.copy")}
          aria-label={t("transcriptionDetails.copy")}
        >
          {justCopied ? (
            <Check className="w-3.5 h-3.5" />
          ) : (
            <Copy className="w-3.5 h-3.5" />
          )}
        </button>
        {onDelete && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (confirm(t("history.deleteConfirm"))) {
                onDelete(item.id);
              }
            }}
            className="w-7 h-7 rounded-md flex items-center justify-center vt-hover-bg hover:text-destructive"
            style={{ color: "var(--vt-fg-3)" }}
            data-tip={t("history.deleteTooltip")}
            aria-label={t("history.deleteConfirm")}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

export const TimelineRow = memo(TimelineRowImpl, (prev, next) => {
  return (
    prev.item === next.item &&
    prev.isSelected === next.isSelected &&
    prev.isFirst === next.isFirst &&
    prev.isLast === next.isLast &&
    prev.onSelect === next.onSelect &&
    prev.onDelete === next.onDelete &&
    prev.onTogglePin === next.onTogglePin &&
    prev.at.getTime() === next.at.getTime()
  );
});
