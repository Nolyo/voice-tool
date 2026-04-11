import type { Editor } from "@tiptap/react";
import { Check, Copy, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { AiActionMenu } from "@/components/ai-action-menu";

interface NotesEditorFooterProps {
  editor: Editor | null;
  hasActiveNote: boolean;
  isAiLoading: boolean;
  onAiAction: (systemPrompt: string) => void;
  onCopyContent: (text: string) => void;
  onRequestDelete: () => void;
}

export function NotesEditorFooter({
  editor,
  hasActiveNote,
  isAiLoading,
  onAiAction,
  onCopyContent,
  onRequestDelete,
}: NotesEditorFooterProps) {
  const [justCopied, setJustCopied] = useState(false);
  const copyResetTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    return () => {
      clearTimeout(copyResetTimerRef.current);
    };
  }, []);

  const editorText = editor?.getText() ?? "";

  const handleCopy = async () => {
    if (!editor) return;
    try {
      const html = editor.getHTML();
      const blob = new Blob([html], { type: "text/html" });
      const textBlob = new Blob([editorText], { type: "text/plain" });
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": blob,
          "text/plain": textBlob,
        }),
      ]);
    } catch {
      onCopyContent(editorText);
    }
    setJustCopied(true);
    toast.success("Copié dans le presse-papiers");
    clearTimeout(copyResetTimerRef.current);
    copyResetTimerRef.current = setTimeout(() => setJustCopied(false), 1500);
  };

  return (
    <>
      <span className="text-xs text-foreground/50">Ctrl + F12 pour dicter</span>
      <div className="flex items-center gap-1">
        {hasActiveNote && (
          <>
            <AiActionMenu
              onAction={onAiAction}
              isLoading={isAiLoading}
              disabled={!editorText.trim()}
            />
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1 text-foreground"
              onClick={handleCopy}
            >
              {justCopied ? (
                <Check className="w-3.5 h-3.5 text-green-500" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              {justCopied ? "Copié" : "Copier"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={onRequestDelete}
              title="Supprimer la note"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </>
        )}
      </div>
    </>
  );
}
