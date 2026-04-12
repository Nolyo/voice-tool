import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
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

const TEXT_COLOR_VALUES = [
  { labelKey: "notes.colors.default", value: null },
  { labelKey: "notes.colors.white", value: "#ffffff" },
  { labelKey: "notes.colors.red", value: "#ef4444" },
  { labelKey: "notes.colors.orange", value: "#f97316" },
  { labelKey: "notes.colors.yellow", value: "#eab308" },
  { labelKey: "notes.colors.green", value: "#22c55e" },
  { labelKey: "notes.colors.blue", value: "#3b82f6" },
  { labelKey: "notes.colors.purple", value: "#8b5cf6" },
  { labelKey: "notes.colors.pink", value: "#ec4899" },
  { labelKey: "notes.colors.gray", value: "#6b7280" },
];

const HIGHLIGHT_COLOR_VALUES = [
  { labelKey: "notes.colors.none", value: null },
  { labelKey: "notes.colors.yellow", value: "#facc15" },
  { labelKey: "notes.colors.green", value: "#22c55e" },
  { labelKey: "notes.colors.blue", value: "#3b82f6" },
  { labelKey: "notes.colors.pink", value: "#ec4899" },
  { labelKey: "notes.colors.purple", value: "#8b5cf6" },
  { labelKey: "notes.colors.orange", value: "#f97316" },
  { labelKey: "notes.colors.red", value: "#ef4444" },
  { labelKey: "notes.colors.gray", value: "#6b7280" },
];

interface EditorBubbleMenuProps {
  editor: Editor;
  linkEditor: ReturnType<typeof useLinkEditor>;
}

type BubbleMode = "default" | "text-color" | "highlight";

export function EditorBubbleMenu({ editor, linkEditor }: EditorBubbleMenuProps) {
  const { t } = useTranslation();
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
            title={t('notes.bubbleMenu.confirm')}
          >
            <Check className="w-3.5 h-3.5" />
          </Button>
          {editor.isActive("link") && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-destructive hover:text-destructive"
              onClick={linkEditor.remove}
              title={t('notes.bubbleMenu.removeLink')}
            >
              <Link2Off className="w-3.5 h-3.5" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={linkEditor.close}
            title={t('common.cancel')}
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
            title={t('notes.bubbleMenu.back')}
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </Button>
          <span className="text-xs text-muted-foreground pr-0.5">{t('notes.bubbleMenu.text')}</span>
          {TEXT_COLOR_VALUES.map(({ labelKey, value }) => (
            <button
              key={labelKey}
              title={t(labelKey)}
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
            title={t('notes.bubbleMenu.back')}
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </Button>
          <span className="text-xs text-muted-foreground pr-0.5">{t('notes.bubbleMenu.background')}</span>
          {HIGHLIGHT_COLOR_VALUES.map(({ labelKey, value }) => (
            <button
              key={labelKey}
              title={t(labelKey)}
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
            title={t('notes.bubbleMenu.bold')}
          >
            <BoldIcon className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={`h-7 w-7 p-0 ${editor.isActive("italic") ? "bg-accent text-accent-foreground" : ""}`}
            onClick={() => editor.chain().focus().toggleItalic().run()}
            title={t('notes.bubbleMenu.italic')}
          >
            <ItalicIcon className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={`h-7 w-7 p-0 ${editor.isActive("strike") ? "bg-accent text-accent-foreground" : ""}`}
            onClick={() => editor.chain().focus().toggleStrike().run()}
            title={t('notes.bubbleMenu.strikethrough')}
          >
            <Strikethrough className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={`h-7 w-7 p-0 ${editor.isActive("underline") ? "bg-accent text-accent-foreground" : ""}`}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            title={t('notes.bubbleMenu.underline')}
          >
            <UnderlineIcon className="w-3.5 h-3.5" />
          </Button>
          <span className="w-px h-5 bg-border mx-0.5" />
          <Button
            variant="ghost"
            size="sm"
            className={`h-7 w-7 p-0 ${editor.isActive("heading", { level: 1 }) ? "bg-accent text-accent-foreground" : ""}`}
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            title={t('notes.bubbleMenu.heading1')}
          >
            <Heading1 className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={`h-7 w-7 p-0 ${editor.isActive("heading", { level: 2 }) ? "bg-accent text-accent-foreground" : ""}`}
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            title={t('notes.bubbleMenu.heading2')}
          >
            <Heading2 className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={`h-7 w-7 p-0 ${editor.isActive("heading", { level: 3 }) ? "bg-accent text-accent-foreground" : ""}`}
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            title={t('notes.bubbleMenu.heading3')}
          >
            <Heading3 className="w-3.5 h-3.5" />
          </Button>
          <span className="w-px h-5 bg-border mx-0.5" />
          <Button
            variant="ghost"
            size="sm"
            className={`h-7 w-7 p-0 ${editor.isActive("bulletList") ? "bg-accent text-accent-foreground" : ""}`}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            title={t('notes.bubbleMenu.bulletList')}
          >
            <List className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={`h-7 w-7 p-0 ${editor.isActive("orderedList") ? "bg-accent text-accent-foreground" : ""}`}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            title={t('notes.bubbleMenu.orderedList')}
          >
            <ListOrdered className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={`h-7 w-7 p-0 ${editor.isActive("taskList") ? "bg-accent text-accent-foreground" : ""}`}
            onClick={() => editor.chain().focus().toggleTaskList().run()}
            title={t('notes.bubbleMenu.taskList')}
          >
            <ListChecks className="w-3.5 h-3.5" />
          </Button>
          <span className="w-px h-5 bg-border mx-0.5" />
          <Button
            variant="ghost"
            size="sm"
            className={`h-7 w-7 p-0 ${editor.isActive("code") ? "bg-accent text-accent-foreground" : ""}`}
            onClick={() => editor.chain().focus().toggleCode().run()}
            title={t('notes.bubbleMenu.inlineCode')}
          >
            <Code className="w-3.5 h-3.5" />
          </Button>
          <span className="w-px h-5 bg-border mx-0.5" />
          {/* Text color */}
          <button
            onClick={() => setMode("text-color")}
            title={t('notes.bubbleMenu.textColor')}
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
            title={t('notes.bubbleMenu.highlightColor')}
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
            title={editor.isActive("link") ? t('notes.bubbleMenu.editLink') : t('notes.bubbleMenu.addLink')}
          >
            <Link2 className="w-3.5 h-3.5" />
          </Button>
        </>
      )}
    </BubbleMenu>
  );
}
