import { useEffect, useState } from "react";
import type { Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import {
  Bold as BoldIcon,
  Check,
  ChevronLeft,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Highlighter,
  Italic as ItalicIcon,
  Link2,
  Link2Off,
  List,
  ListChecks,
  ListOrdered,
  Strikethrough,
  Type,
  Underline as UnderlineIcon,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLinkEditor } from "@/hooks/useLinkEditor";

const TEXT_COLORS = [
  { label: "Par défaut", value: null },
  { label: "Blanc", value: "#ffffff" },
  { label: "Rouge", value: "#ef4444" },
  { label: "Orange", value: "#f97316" },
  { label: "Jaune", value: "#eab308" },
  { label: "Vert", value: "#22c55e" },
  { label: "Bleu", value: "#3b82f6" },
  { label: "Violet", value: "#8b5cf6" },
  { label: "Rose", value: "#ec4899" },
  { label: "Gris", value: "#6b7280" },
];

const HIGHLIGHT_COLORS = [
  { label: "Aucun", value: null },
  { label: "Jaune", value: "#facc15" },
  { label: "Vert", value: "#22c55e" },
  { label: "Bleu", value: "#3b82f6" },
  { label: "Rose", value: "#ec4899" },
  { label: "Violet", value: "#8b5cf6" },
  { label: "Orange", value: "#f97316" },
  { label: "Rouge", value: "#ef4444" },
  { label: "Gris", value: "#6b7280" },
];

interface EditorBubbleMenuProps {
  editor: Editor;
  linkEditor: ReturnType<typeof useLinkEditor>;
}

type BubbleMode = "default" | "text-color" | "highlight";

export function EditorBubbleMenu({ editor, linkEditor }: EditorBubbleMenuProps) {
  const [mode, setMode] = useState<BubbleMode>("default");

  // Reset color mode when selection collapses (bubble menu hides)
  useEffect(() => {
    const handler = () => {
      const { from, to } = editor.state.selection;
      if (from === to) setMode("default");
    };
    editor.on("selectionUpdate", handler);
    return () => { editor.off("selectionUpdate", handler); };
  }, [editor]);

  const currentTextColor: string =
    (editor.getAttributes("textStyle").color as string) ?? "";
  const currentHighlight: string =
    (editor.getAttributes("highlight").color as string) ?? "";

  const handleTextColor = (color: string | null) => {
    if (color === null) {
      editor.chain().focus().unsetColor().run();
    } else {
      editor.chain().focus().setColor(color).run();
    }
    setMode("default");
  };

  const handleHighlight = (color: string | null) => {
    if (color === null) {
      editor.chain().focus().unsetHighlight().run();
    } else {
      editor.chain().focus().setHighlight({ color }).run();
    }
    setMode("default");
  };

  return (
    <BubbleMenu
      editor={editor}
      shouldShow={({ editor: ed, from, to }) => {
        if (linkEditor.isEditing) return true;
        if (!ed.isEditable) return false;
        return from !== to;
      }}
      options={{ placement: "top", offset: 8 }}
      className="flex items-center gap-0.5 bg-popover text-popover-foreground border rounded-md shadow-md p-1 z-[9999]"
    >
      {/* Link editor mode */}
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
      ) : mode === "text-color" ? (
        /* Text color picker */
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => setMode("default")}
            title="Retour"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </Button>
          <span className="text-xs text-muted-foreground pr-0.5">Texte</span>
          {TEXT_COLORS.map(({ label, value }) => (
            <button
              key={label}
              title={label}
              onClick={() => handleTextColor(value)}
              className="w-5 h-5 rounded-sm border border-border/60 flex items-center justify-center transition-transform hover:scale-110 focus:outline-none focus:ring-1 focus:ring-ring"
              style={{ backgroundColor: value ?? "transparent" }}
            >
              {value === null && (
                <span className="text-[9px] text-muted-foreground font-bold leading-none">
                  ∅
                </span>
              )}
              {value !== null && value === currentTextColor && (
                <Check
                  className="w-2.5 h-2.5 drop-shadow"
                  style={{ color: value === "#ffffff" ? "#000000" : "#ffffff" }}
                />
              )}
            </button>
          ))}
        </div>
      ) : mode === "highlight" ? (
        /* Highlight picker */
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => setMode("default")}
            title="Retour"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </Button>
          <span className="text-xs text-muted-foreground pr-0.5">Fond</span>
          {HIGHLIGHT_COLORS.map(({ label, value }) => (
            <button
              key={label}
              title={label}
              onClick={() => handleHighlight(value)}
              className="w-5 h-5 rounded-sm border border-border/60 flex items-center justify-center transition-transform hover:scale-110 focus:outline-none focus:ring-1 focus:ring-ring"
              style={{ backgroundColor: value ?? "transparent" }}
            >
              {value === null && (
                <span className="text-[9px] text-muted-foreground font-bold leading-none">
                  ∅
                </span>
              )}
              {value !== null && value === currentHighlight && (
                <Check className="w-2.5 h-2.5 text-foreground/70 drop-shadow" />
              )}
            </button>
          ))}
        </div>
      ) : (
        /* Default toolbar */
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
            className={`h-7 w-7 p-0 ${editor.isActive("code") ? "bg-accent text-accent-foreground" : ""}`}
            onClick={() => editor.chain().focus().toggleCode().run()}
            title="Code inline"
          >
            <Code className="w-3.5 h-3.5" />
          </Button>
          <span className="w-px h-5 bg-border mx-0.5" />
          {/* Text color */}
          <button
            onClick={() => setMode("text-color")}
            title="Couleur du texte"
            className="h-7 w-7 flex flex-col items-center justify-center rounded-sm hover:bg-accent transition-colors"
          >
            <Type className="w-3.5 h-3.5" />
            <span
              className="h-0.5 w-4 rounded-full mt-0.5"
              style={{ backgroundColor: currentTextColor || "transparent", border: currentTextColor ? "none" : "1px solid currentColor" }}
            />
          </button>
          {/* Highlight color */}
          <button
            onClick={() => setMode("highlight")}
            title="Couleur de fond"
            className="h-7 w-7 flex items-center justify-center rounded-sm hover:bg-accent transition-colors"
            style={currentHighlight ? { backgroundColor: currentHighlight + "55" } : {}}
          >
            <Highlighter className="w-3.5 h-3.5" />
          </button>
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
