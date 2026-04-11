import { useCallback, useState } from "react";
import type { Editor } from "@tiptap/react";

/**
 * Inline link editor state for the bubble menu.
 *
 * - `open` pre-fills the input with the existing href if the cursor is
 *   already inside a link.
 * - `apply` normalizes bare domains by prepending `https://`; an empty URL
 *   removes the link.
 * - `remove` unsets the link mark without closing the editor, useful for the
 *   dedicated trash button.
 */
export function useLinkEditor(editor: Editor | null) {
  const [isEditing, setIsEditing] = useState(false);
  const [url, setUrl] = useState("");

  const open = useCallback(() => {
    if (!editor) return;
    const existing = editor.getAttributes("link").href as string | undefined;
    setUrl(existing ?? "");
    setIsEditing(true);
  }, [editor]);

  const close = useCallback(() => {
    setIsEditing(false);
    setUrl("");
  }, []);

  const apply = useCallback(() => {
    if (!editor) return;
    const raw = url.trim();
    if (raw === "") {
      // Empty URL means remove the link.
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
    } else {
      // Auto-prepend https:// if the user typed a bare domain.
      const href = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
      editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    }
    close();
  }, [editor, url, close]);

  const remove = useCallback(() => {
    if (!editor) return;
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
    close();
  }, [editor, close]);

  return {
    isEditing,
    url,
    setUrl,
    open,
    close,
    apply,
    remove,
  };
}
