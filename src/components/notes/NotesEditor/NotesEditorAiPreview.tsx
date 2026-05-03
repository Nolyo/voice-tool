import { useTranslation } from "react-i18next";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface NotesEditorAiPreviewProps {
  originalText: string;
  result: string;
  onAccept: () => void;
  onDismiss: () => void;
}

export function NotesEditorAiPreview({
  originalText,
  result,
  onAccept,
  onDismiss,
}: NotesEditorAiPreviewProps) {
  const { t } = useTranslation();

  return (
    <div className="flex-1 flex flex-col overflow-hidden vt-anim-fade-up">
      {/* Preview toolbar */}
      <div
        className="flex items-center justify-between px-3 py-1.5"
        style={{
          background: "var(--vt-accent-soft)",
          borderBottom: "1px solid var(--vt-border)",
        }}
      >
        <span
          className="vt-eyebrow"
          style={{ color: "var(--vt-accent-2)" }}
        >
          {t('notes.editor.aiPreview.title')}
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs gap-1"
            style={{ color: "var(--vt-accent-2)" }}
            onClick={onAccept}
          >
            <Check className="w-3.5 h-3.5" />
            {t('notes.editor.aiPreview.accept')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs gap-1"
            style={{ color: "var(--vt-fg-3)" }}
            onClick={onDismiss}
          >
            <X className="w-3.5 h-3.5" />
            {t('notes.editor.aiPreview.cancel')}
          </Button>
        </div>
      </div>
      {/* Split view: original + result */}
      <div className="flex-1 flex flex-col overflow-hidden min-h-0">
        {/* Original */}
        <div
          className="flex-1 min-h-0 flex flex-col"
          style={{ borderBottom: "1px solid var(--vt-border)" }}
        >
          <div
            className="px-3 py-1"
            style={{
              background: "var(--vt-panel-2)",
              borderBottom: "1px solid var(--vt-border)",
            }}
          >
            <span className="vt-eyebrow">
              {t('notes.editor.aiPreview.original')}
            </span>
          </div>
          <div
            className="flex-1 overflow-auto p-3 text-sm leading-relaxed whitespace-pre-wrap"
            style={{ color: "var(--vt-fg-3)" }}
          >
            {originalText}
          </div>
        </div>
        {/* Result */}
        <div className="flex-1 min-h-0 flex flex-col">
          <div
            className="px-3 py-1"
            style={{
              background: "var(--vt-accent-soft)",
              borderBottom: "1px solid var(--vt-border)",
            }}
          >
            <span
              className="vt-eyebrow"
              style={{ color: "var(--vt-accent-2)" }}
            >
              {t('notes.editor.aiPreview.result')}
            </span>
          </div>
          <div
            className="flex-1 overflow-auto p-3 text-sm leading-relaxed whitespace-pre-wrap"
            style={{
              background: "var(--vt-accent-soft)",
              color: "var(--vt-fg)",
            }}
          >
            {result}
          </div>
        </div>
      </div>
    </div>
  );
}
