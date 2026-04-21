import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

interface CopyOptions {
  /** Optional HTML payload for rich-text targets (notes editor). When present,
   *  both text/plain and text/html clipboard items are written. */
  html?: string;
}

/**
 * Copy helper used by every "Copier" button in the app.
 *
 * Behaviour:
 *  - writes to the system clipboard (plain text, or text+html if `opts.html`),
 *  - shows a sonner success toast `t("common.copied")`,
 *  - flips `justCopied` to `true` for 1.5 s so callers can swap an icon/label.
 *
 * On failure, shows a sonner error toast `t("common.copyFailed")` and returns
 * `false` without flipping `justCopied`.
 */
export function useCopyToClipboard() {
  const { t } = useTranslation();
  const [justCopied, setJustCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const copy = useCallback(
    async (text: string, opts?: CopyOptions): Promise<boolean> => {
      try {
        if (opts?.html) {
          await navigator.clipboard.write([
            new ClipboardItem({
              "text/html": new Blob([opts.html], { type: "text/html" }),
              "text/plain": new Blob([text], { type: "text/plain" }),
            }),
          ]);
        } else {
          await navigator.clipboard.writeText(text);
        }
        toast.success(t("common.copied"));
        setJustCopied(true);
        clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setJustCopied(false), 1500);
        return true;
      } catch {
        toast.error(t("common.copyFailed"));
        return false;
      }
    },
    [t],
  );

  return { copy, justCopied };
}
