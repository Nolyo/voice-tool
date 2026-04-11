import type { Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import {
  Bold as BoldIcon,
  Check,
  Heading1,
  Heading2,
  Heading3,
  Italic as ItalicIcon,
  Link2,
  Link2Off,
  List,
  ListChecks,
  ListOrdered,
  Strikethrough,
  Underline as UnderlineIcon,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLinkEditor } from "@/hooks/useLinkEditor";

interface EditorBubbleMenuProps {
  editor: Editor;
  linkEditor: ReturnType<typeof useLinkEditor>;
}

export function EditorBubbleMenu({ editor, linkEditor }: EditorBubbleMenuProps) {
  return (
    <BubbleMenu
      editor={editor}
      shouldShow={({ editor: ed, from, to }) => {
        // Keep visible while the inline link editor is open,
        // even if the selection is empty after a click-away.
        if (linkEditor.isEditing) return true;
        if (!ed.isEditable) return false;
        return from !== to;
      }}
      options={{ placement: "top", offset: 8 }}
      className="flex items-center gap-0.5 bg-popover text-popover-foreground border rounded-md shadow-md p-1 z-[9999]"
    >
      {linkEditor.isEditing ? (
        <div className="flex items-center gap-1">
          <input
            type="text"
            autoFocus
            value={linkEditor.url}
            onChange={(e) => linkEditor.setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                linkEditor.apply();
              } else if (e.key === "Escape") {
                e.preventDefault();
                linkEditor.close();
              }
            }}
            placeholder="https://..."
            className="h-7 w-48 px-2 text-xs bg-background border rounded focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={linkEditor.apply}
            title="Valider"
          >
            <Check className="w-3.5 h-3.5" />
          </Button>
          {editor.isActive("link") && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-destructive hover:text-destructive"
              onClick={linkEditor.remove}
              title="Retirer le lien"
            >
              <Link2Off className="w-3.5 h-3.5" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={linkEditor.close}
            title="Annuler"
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      ) : (
        <>
          <Button
            variant="ghost"
            size="sm"
            className={`h-7 w-7 p-0 ${editor.isActive("bold") ? "bg-accent text-accent-foreground" : ""}`}
            onClick={() => editor.chain().focus().toggleBold().run()}
            title="Gras (Ctrl+B)"
          >
            <BoldIcon className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={`h-7 w-7 p-0 ${editor.isActive("italic") ? "bg-accent text-accent-foreground" : ""}`}
            onClick={() => editor.chain().focus().toggleItalic().run()}
            title="Italique (Ctrl+I)"
          >
            <ItalicIcon className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={`h-7 w-7 p-0 ${editor.isActive("strike") ? "bg-accent text-accent-foreground" : ""}`}
            onClick={() => editor.chain().focus().toggleStrike().run()}
            title="Barré"
          >
            <Strikethrough className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={`h-7 w-7 p-0 ${editor.isActive("underline") ? "bg-accent text-accent-foreground" : ""}`}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            title="Souligné (Ctrl+U)"
          >
            <UnderlineIcon className="w-3.5 h-3.5" />
          </Button>
          <span className="w-px h-5 bg-border mx-0.5" />
          <Button
            variant="ghost"
            size="sm"
            className={`h-7 w-7 p-0 ${editor.isActive("heading", { level: 1 }) ? "bg-accent text-accent-foreground" : ""}`}
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            title="Titre 1"
          >
            <Heading1 className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={`h-7 w-7 p-0 ${editor.isActive("heading", { level: 2 }) ? "bg-accent text-accent-foreground" : ""}`}
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            title="Titre 2"
          >
            <Heading2 className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={`h-7 w-7 p-0 ${editor.isActive("heading", { level: 3 }) ? "bg-accent text-accent-foreground" : ""}`}
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            title="Titre 3"
          >
            <Heading3 className="w-3.5 h-3.5" />
          </Button>
          <span className="w-px h-5 bg-border mx-0.5" />
          <Button
            variant="ghost"
            size="sm"
            className={`h-7 w-7 p-0 ${editor.isActive("bulletList") ? "bg-accent text-accent-foreground" : ""}`}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            title="Liste à puces"
          >
            <List className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={`h-7 w-7 p-0 ${editor.isActive("orderedList") ? "bg-accent text-accent-foreground" : ""}`}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            title="Liste numérotée"
          >
            <ListOrdered className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={`h-7 w-7 p-0 ${editor.isActive("taskList") ? "bg-accent text-accent-foreground" : ""}`}
            onClick={() => editor.chain().focus().toggleTaskList().run()}
            title="Liste à cocher"
          >
            <ListChecks className="w-3.5 h-3.5" />
          </Button>
          <span className="w-px h-5 bg-border mx-0.5" />
          <Button
            variant="ghost"
            size="sm"
            className={`h-7 w-7 p-0 ${editor.isActive("link") ? "bg-accent text-accent-foreground" : ""}`}
            onClick={linkEditor.open}
            title={editor.isActive("link") ? "Modifier le lien" : "Ajouter un lien"}
          >
            <Link2 className="w-3.5 h-3.5" />
          </Button>
        </>
      )}
    </BubbleMenu>
  );
}
