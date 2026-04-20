import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { FileText } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNoteLinkContext } from "./NoteLinkContext";

/**
 * React NodeView for the note-link atom. Decides between valid (blue chip)
 * and broken (red strikethrough chip) rendering based on whether the
 * referenced note id currently exists. On click, either opens the note or
 * asks to recreate it — the actual dialog lives in NotesEditor.
 */
export function NoteLinkNodeView({ node, updateAttributes }: NodeViewProps) {
  const { t } = useTranslation();
  const { existingNoteIds, onOpenNote, onRequestRecreate } = useNoteLinkContext();

  const id = (node.attrs.id as string) ?? "";
  const title = (node.attrs.title as string) ?? t("notes.editor.untitled");
  const exists = existingNoteIds.has(id);

  const handleClick = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (exists) {
      onOpenNote(id);
    } else {
      onRequestRecreate({ id, title }, (newId) => {
        updateAttributes({ id: newId });
      });
    }
  };

  return (
    <NodeViewWrapper
      as="span"
      className={`note-link ${exists ? "" : "note-link--broken"}`}
      data-note-link="true"
      data-note-id={id}
      data-note-title={title}
      onClick={handleClick}
      title={exists ? title : t("notes.link.brokenTooltip")}
    >
      <FileText className="w-3 h-3 shrink-0" />
      <span>{title}</span>
    </NodeViewWrapper>
  );
}
