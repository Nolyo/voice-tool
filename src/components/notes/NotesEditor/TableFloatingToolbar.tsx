import { useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Editor } from "@tiptap/react";
import {
  ArrowDownToLine,
  ArrowUpToLine,
  ArrowLeftToLine,
  ArrowRightToLine,
  Columns,
  Rows,
  Trash2,
  Heading,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface TableFloatingToolbarProps {
  editor: Editor;
}

/**
 * Floats above the currently-active table. Position is recomputed on every
 * TipTap transaction so it tracks cell selection, scrolling inside the
 * editor, and row/column add/delete.
 */
export function TableFloatingToolbar({ editor }: TableFloatingToolbarProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(
    null,
  );

  useLayoutEffect(() => {
    const compute = () => {
      const isInTable = editor.isActive("table");
      if (!isInTable) {
        setVisible(false);
        return;
      }

      const { from } = editor.state.selection;
      const resolved = editor.view.domAtPos(from);
      const startEl =
        resolved.node.nodeType === 1
          ? (resolved.node as HTMLElement)
          : resolved.node.parentElement;
      const tableEl = startEl?.closest("table");
      if (!tableEl) {
        setVisible(false);
        return;
      }

      const rect = tableEl.getBoundingClientRect();
      setCoords({
        top: rect.top + window.scrollY - 38,
        left: rect.left + window.scrollX,
      });
      setVisible(true);
    };

    compute();
    editor.on("selectionUpdate", compute);
    editor.on("transaction", compute);
    window.addEventListener("scroll", compute, true);
    window.addEventListener("resize", compute);

    return () => {
      editor.off("selectionUpdate", compute);
      editor.off("transaction", compute);
      window.removeEventListener("scroll", compute, true);
      window.removeEventListener("resize", compute);
    };
  }, [editor]);

  if (!visible || !coords) return null;

  const btn = (
    label: string,
    Icon: React.ComponentType<{ className?: string }>,
    onClick: () => void,
  ) => (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 w-7 p-0"
      title={label}
      onMouseDown={(e) => {
        // Prevent the focus from leaving ProseMirror; otherwise the cell
        // selection is cleared before the command runs.
        e.preventDefault();
      }}
      onClick={onClick}
    >
      <Icon className="w-3.5 h-3.5" />
    </Button>
  );

  return (
    <div
      ref={containerRef}
      className="vt-app vt-table-toolbar flex items-center gap-0.5 bg-popover text-popover-foreground border rounded-md shadow-md p-1 z-[9998] absolute"
      style={{ top: coords.top, left: coords.left }}
    >
      {btn(t("notes.table.addRowAbove"), ArrowUpToLine, () =>
        editor.chain().focus().addRowBefore().run(),
      )}
      {btn(t("notes.table.addRowBelow"), ArrowDownToLine, () =>
        editor.chain().focus().addRowAfter().run(),
      )}
      {btn(t("notes.table.deleteRow"), Rows, () =>
        editor.chain().focus().deleteRow().run(),
      )}
      <span className="w-px h-5 bg-border mx-0.5" />
      {btn(t("notes.table.addColumnLeft"), ArrowLeftToLine, () =>
        editor.chain().focus().addColumnBefore().run(),
      )}
      {btn(t("notes.table.addColumnRight"), ArrowRightToLine, () =>
        editor.chain().focus().addColumnAfter().run(),
      )}
      {btn(t("notes.table.deleteColumn"), Columns, () =>
        editor.chain().focus().deleteColumn().run(),
      )}
      <span className="w-px h-5 bg-border mx-0.5" />
      {btn(t("notes.table.toggleHeader"), Heading, () =>
        editor.chain().focus().toggleHeaderRow().run(),
      )}
      {btn(t("notes.table.deleteTable"), Trash2, () =>
        editor.chain().focus().deleteTable().run(),
      )}
    </div>
  );
}
