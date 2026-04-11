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
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Preview toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-primary/10 border-b">
        <span className="text-xs text-primary font-medium">Aperçu du résultat</span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs gap-1 text-primary hover:text-primary"
            onClick={onAccept}
          >
            <Check className="w-3.5 h-3.5" />
            Accepter
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs gap-1 text-muted-foreground"
            onClick={onDismiss}
          >
            <X className="w-3.5 h-3.5" />
            Annuler
          </Button>
        </div>
      </div>
      {/* Split view: original + result */}
      <div className="flex-1 flex flex-col overflow-hidden min-h-0">
        {/* Original */}
        <div className="flex-1 min-h-0 flex flex-col border-b">
          <div className="px-3 py-1 bg-muted/40 border-b">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
              Original
            </span>
          </div>
          <div className="flex-1 overflow-auto p-3 text-foreground/50 text-sm leading-relaxed whitespace-pre-wrap">
            {originalText}
          </div>
        </div>
        {/* Result */}
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="px-3 py-1 bg-primary/5 border-b">
            <span className="text-[10px] uppercase tracking-wider text-primary font-medium">
              Résultat
            </span>
          </div>
          <div className="flex-1 overflow-auto p-3 bg-primary/5 text-foreground text-sm leading-relaxed whitespace-pre-wrap">
            {result}
          </div>
        </div>
      </div>
    </div>
  );
}
