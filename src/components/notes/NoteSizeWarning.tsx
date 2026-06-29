import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Editor } from "@tiptap/react";
import { NOTE_SIZE_LIMIT_BYTES, noteContentBytes } from "@/lib/sync/note-size";

interface Props {
  /** TipTap editor instance — null while a tab is still loading. */
  editor: Editor | null;
}

/**
 * Non-blocking banner shown at the top of the notes editor when the current
 * note's HTML exceeds the 3 MB sync cap. The note remains usable locally;
 * the message only warns that it won't be uploaded to the cloud.
 */
export function NoteSizeWarning({ editor }: Props) {
  const { t } = useTranslation();
  const [bytes, setBytes] = useState(0);

  useEffect(() => {
    if (!editor) {
      setBytes(0);
      return;
    }
    const recompute = () => {
      // UTF-8 byte count — matches the DB's `octet_length()` constraint
      // rather than JS string code-unit length (which would under-count
      // multi-byte characters).
      const html = editor.getHTML();
      setBytes(noteContentBytes(html));
    };
    recompute();
    editor.on("update", recompute);
    return () => {
      editor.off("update", recompute);
    };
  }, [editor]);

  if (bytes <= NOTE_SIZE_LIMIT_BYTES) return null;

  const mb = (bytes / 1024 / 1024).toFixed(2);

  return (
    <div
      role="alert"
      className="mx-6 mt-4 rounded-md p-3 text-xs"
      style={{
        background: "var(--vt-warn-soft)",
        border: "1px solid oklch(from var(--vt-warn) l c h / 0.4)",
        color: "var(--vt-fg-2)",
      }}
    >
      {t("notes.size.warning", { bytes: mb })}
    </div>
  );
}
