# Copy Feedback Harmonization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify the user feedback on every "Copy" button in the app so every click produces a visible confirmation (toast + inline icon/label swap).

**Architecture:** Introduce a single React hook `useCopyToClipboard` that owns the clipboard write, shows a `sonner` toast, and exposes `justCopied` for inline 1.5 s feedback. Each component that has a copy button uses the hook directly; the silent `Dashboard.handleCopy` prop plumbing is removed.

**Tech Stack:** React 19, TypeScript, `sonner`, `react-i18next`, Clipboard API (`navigator.clipboard`).

---

## File Structure

**New:**
- `src/hooks/useCopyToClipboard.ts` — hook exposing `{ copy, justCopied }` with text + optional HTML payload.

**Modified:**
- `src/components/Dashboard.tsx` — remove `handleCopy` (line 160) and stop passing `onCopy` / `onCopyContent` to children.
- `src/components/dashboard/tabs/HistoriqueTab.tsx` — drop `onCopy` prop.
- `src/components/dashboard/transcription/TranscriptionDetails.tsx` — use hook for primary button, add icon+label swap, drop `onCopy` prop.
- `src/components/dashboard/transcription/TranscriptionList.tsx` — `TimelineRow` owns its copy via hook with icon swap; parent drops `onCopy` prop.
- `src/components/logs/LogsTab.tsx` — swap custom toast div for hook + icon swap on the per-row copy button.
- `src/components/notes/NotesEditor/NotesEditor.tsx` — drop `onCopyContent` prop.
- `src/components/notes/NotesEditor/NotesEditorFooter.tsx` — use hook (HTML variant), drop `onCopyContent` prop.
- `src/locales/fr.json` — add `common.copyFailed`, remove `logs.copiedToast` and `notes.editor.copiedToClipboard`.
- `src/locales/en.json` — same.

---

## Task 1: Create the `useCopyToClipboard` hook

**Files:**
- Create: `src/hooks/useCopyToClipboard.ts`

- [ ] **Step 1: Create the hook file**

Write `src/hooks/useCopyToClipboard.ts` with this exact content:

```ts
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
```

- [ ] **Step 2: Type-check the new file**

Run: `pnpm tsc --noEmit`
Expected: PASS (no new errors).

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useCopyToClipboard.ts
git commit -m "feat(copy): add useCopyToClipboard hook with sonner feedback"
```

---

## Task 2: Add `common.copyFailed` i18n key

**Files:**
- Modify: `src/locales/fr.json`
- Modify: `src/locales/en.json`

- [ ] **Step 1: FR — add key in `common` block**

In `src/locales/fr.json`, inside the `"common"` object, after the line `"copied": "Copié",` add:

```json
    "copyFailed": "Impossible de copier",
```

Resulting block start (for reference):
```json
  "common": {
    "cancel": "Annuler",
    "save": "Enregistrer",
    "delete": "Supprimer",
    "copy": "Copier",
    "copied": "Copié",
    "copyFailed": "Impossible de copier",
    "close": "Fermer",
```

- [ ] **Step 2: EN — same key**

In `src/locales/en.json`, same spot:

```json
    "copyFailed": "Copy failed",
```

Resulting block:
```json
  "common": {
    "cancel": "Cancel",
    "save": "Save",
    "delete": "Delete",
    "copy": "Copy",
    "copied": "Copied",
    "copyFailed": "Copy failed",
    "close": "Close",
```

- [ ] **Step 3: Verify JSON stays valid**

Run: `node -e "JSON.parse(require('fs').readFileSync('src/locales/fr.json')); JSON.parse(require('fs').readFileSync('src/locales/en.json')); console.log('ok')"`
Expected: prints `ok`.

- [ ] **Step 4: Commit**

```bash
git add src/locales/fr.json src/locales/en.json
git commit -m "feat(i18n): add common.copyFailed"
```

---

## Task 3: Migrate `NotesEditorFooter` to the hook

**Files:**
- Modify: `src/components/notes/NotesEditor/NotesEditorFooter.tsx`

This component already has the target UX (icon + label swap). We replace its inline copy logic with the hook and drop the `onCopyContent` prop.

- [ ] **Step 1: Remove `onCopyContent` from props and internals**

In `src/components/notes/NotesEditor/NotesEditorFooter.tsx`:

Replace the imports block (lines 1–6) with:

```tsx
import { useTranslation } from "react-i18next";
import type { Editor } from "@tiptap/react";
import { Check, Copy, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AiActionMenu } from "@/components/notes/AiActionMenu";
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";
```

(We drop the `sonner` import and add the hook.)

Replace the `NotesEditorFooterProps` interface (lines 13–25) with:

```tsx
interface NotesEditorFooterProps {
  editor: Editor | null;
  hasActiveNote: boolean;
  /** Id of the note TipTap is currently displaying. */
  loadedNoteId: string | null;
  /** Id of the note the user selected (may trail `loadedNoteId` during a
   *  tab switch while `readNote()` resolves). */
  activeNoteId: string | null;
  isAiLoading: boolean;
  onAiAction: (systemPrompt: string) => void;
  onRequestDelete: () => void;
}
```

Replace the function parameter list (lines 27–36) with:

```tsx
export function NotesEditorFooter({
  editor,
  hasActiveNote,
  loadedNoteId,
  activeNoteId,
  isAiLoading,
  onAiAction,
  onRequestDelete,
}: NotesEditorFooterProps) {
```

- [ ] **Step 2: Replace the local copy machinery with the hook**

Just after `const { t } = useTranslation();` (line 37), replace:

```tsx
  const [justCopied, setJustCopied] = useState(false);
  const [wordCount, setWordCount] = useState(0);
  const [showSaveBadge, setShowSaveBadge] = useState(false);
  const copyResetTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
```

with:

```tsx
  const { copy, justCopied } = useCopyToClipboard();
  const [wordCount, setWordCount] = useState(0);
  const [showSaveBadge, setShowSaveBadge] = useState(false);
```

Remove the `useEffect` that cleared `copyResetTimerRef` (lines 45–49):

```tsx
  useEffect(() => {
    return () => {
      clearTimeout(copyResetTimerRef.current);
    };
  }, []);
```

Delete this entire block.

- [ ] **Step 3: Simplify `handleCopy`**

Replace the current `handleCopy` body (lines 106–125) with:

```tsx
  const handleCopy = async () => {
    if (!editor) return;
    await copy(editorText, { html: editor.getHTML() });
  };
```

- [ ] **Step 4: Verify unused imports are removed**

Ensure `useRef` is removed from the `react` import only if no other `useRef` exists in the file. Search the file: `grep -n "useRef" src/components/notes/NotesEditor/NotesEditorFooter.tsx`

If the only remaining match is the import line, change:

```tsx
import { useEffect, useRef, useState } from "react";
```

to:

```tsx
import { useEffect, useState } from "react";
```

If `useRef` is used elsewhere, leave the import as-is.

- [ ] **Step 5: Type-check**

Run: `pnpm tsc --noEmit`
Expected: no new errors in `NotesEditorFooter.tsx`. (There will be an error in `NotesEditor.tsx` because it still passes `onCopyContent` — that is fixed in Task 4.)

- [ ] **Step 6: Commit**

```bash
git add src/components/notes/NotesEditor/NotesEditorFooter.tsx
git commit -m "refactor(notes): migrate footer copy to useCopyToClipboard"
```

---

## Task 4: Drop `onCopyContent` from `NotesEditor`

**Files:**
- Modify: `src/components/notes/NotesEditor/NotesEditor.tsx`

- [ ] **Step 1: Remove prop from interface**

In `src/components/notes/NotesEditor/NotesEditor.tsx`, delete line 30:

```tsx
  onCopyContent: (text: string) => void;
```

- [ ] **Step 2: Remove prop from function signature**

Delete line 55 (`onCopyContent,`) inside the destructured parameter list of `export function NotesEditor({`.

- [ ] **Step 3: Remove prop forwarding to the footer**

In the `<NotesEditorFooter` JSX (line 214 area), delete the line:

```tsx
          onCopyContent={onCopyContent}
```

- [ ] **Step 4: Type-check**

Run: `pnpm tsc --noEmit`
Expected: still fails at `Dashboard.tsx` because it passes `onCopyContent`. This is fixed in Task 8.

- [ ] **Step 5: Commit**

```bash
git add src/components/notes/NotesEditor/NotesEditor.tsx
git commit -m "refactor(notes): drop onCopyContent prop plumbing"
```

---

## Task 5: Migrate `TranscriptionDetails` primary button

**Files:**
- Modify: `src/components/dashboard/transcription/TranscriptionDetails.tsx`

- [ ] **Step 1: Imports**

In `src/components/dashboard/transcription/TranscriptionDetails.tsx`, update the `lucide-react` import (lines 5–17) to include `Check`:

```tsx
import {
  Mic,
  Check,
  Copy,
  Play,
  Pause,
  X,
  ArrowLeft,
  Sparkles,
  Download,
  Trash2,
  Loader2,
  ChevronRight,
} from "lucide-react";
```

Add the hook import under the existing imports (right after the `useDateFormatters` import on line 21):

```tsx
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";
```

- [ ] **Step 2: Drop `onCopy` from props**

Replace the `TranscriptionDetailsProps` interface (lines 23–29) with:

```tsx
interface TranscriptionDetailsProps {
  transcription: Transcription | null;
  onClose: () => void;
  onDelete?: (id: string) => void;
  compact?: boolean;
}
```

Replace the function signature destructure (lines 86–92) with:

```tsx
export function TranscriptionDetails({
  transcription,
  onClose,
  onDelete,
  compact = false,
}: TranscriptionDetailsProps) {
```

- [ ] **Step 3: Add hook call**

Right after `const { t } = useTranslation();` (line 93), add:

```tsx
  const { copy, justCopied } = useCopyToClipboard();
```

- [ ] **Step 4: Update the primary "Copier" button**

Find the primary copy button (around lines 565–573):

```tsx
        <button
          type="button"
          className="vt-btn-primary"
          onClick={() => onCopy(transcription.text)}
        >
          <Copy className="w-3.5 h-3.5" />
          {t("transcriptionDetails.copy")}
        </button>
```

Replace it with:

```tsx
        <button
          type="button"
          className="vt-btn-primary"
          onClick={() => copy(transcription.text)}
        >
          {justCopied ? (
            <Check
              className="w-3.5 h-3.5"
              style={{ color: "var(--vt-ok)" }}
            />
          ) : (
            <Copy className="w-3.5 h-3.5" />
          )}
          {justCopied ? t("common.copied") : t("transcriptionDetails.copy")}
        </button>
```

- [ ] **Step 5: Type-check**

Run: `pnpm tsc --noEmit`
Expected: errors remain in `HistoriqueTab.tsx` (still passes `onCopy`) — fixed in Task 7.

- [ ] **Step 6: Commit**

```bash
git add src/components/dashboard/transcription/TranscriptionDetails.tsx
git commit -m "feat(transcription): add feedback on details copy button"
```

---

## Task 6: Migrate `TranscriptionList` timeline row

**Files:**
- Modify: `src/components/dashboard/transcription/TranscriptionList.tsx`

- [ ] **Step 1: Imports**

Update the `lucide-react` import on line 5:

```tsx
import { Search, Check, Copy, Trash2, Sparkles, Download, Filter } from "lucide-react";
```

Add the hook import after the existing imports (after line 7):

```tsx
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";
```

- [ ] **Step 2: Drop `onCopy` from the list props**

Replace the `TranscriptionListProps` interface (lines 9–16) with:

```tsx
interface TranscriptionListProps {
  transcriptions: Transcription[];
  selectedId?: string;
  onSelectTranscription: (transcription: Transcription) => void;
  onDelete?: (id: string) => void;
  onClearAll?: () => void;
}
```

Replace the main function destructure (lines 291–298) with:

```tsx
export function TranscriptionList({
  transcriptions,
  selectedId,
  onSelectTranscription,
  onDelete,
  onClearAll,
}: TranscriptionListProps) {
```

- [ ] **Step 3: Change `RowProps` to take `text` directly**

The row no longer needs an `onCopy` callback — it owns the copy via the hook. Replace the `RowProps` interface (lines 44–53) with:

```tsx
interface RowProps {
  item: Transcription;
  at: Date;
  isSelected: boolean;
  isFirst: boolean;
  isLast: boolean;
  onSelect: () => void;
  onDelete?: () => void;
}
```

Replace the `TimelineRow` signature (line 55) with:

```tsx
function TimelineRow({ item, at, isSelected, isFirst, isLast, onSelect, onDelete }: RowProps) {
```

- [ ] **Step 4: Call the hook inside the row and update the icon button**

Just after `const { t } = useTranslation();` inside `TimelineRow` (line 56), add:

```tsx
  const { copy, justCopied } = useCopyToClipboard();
```

Replace the copy button (lines 141–153):

```tsx
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onCopy();
          }}
          className="w-7 h-7 rounded-md flex items-center justify-center vt-hover-bg"
          style={{ color: "var(--vt-fg-3)" }}
          data-tip={t("transcriptionDetails.copy")}
          aria-label={t("transcriptionDetails.copy")}
        >
          <Copy className="w-3.5 h-3.5" />
        </button>
```

with:

```tsx
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            copy(item.text);
          }}
          className="w-7 h-7 rounded-md flex items-center justify-center vt-hover-bg"
          style={{ color: justCopied ? "var(--vt-ok)" : "var(--vt-fg-3)" }}
          data-tip={justCopied ? t("common.copied") : t("transcriptionDetails.copy")}
          aria-label={justCopied ? t("common.copied") : t("transcriptionDetails.copy")}
        >
          {justCopied ? (
            <Check className="w-3.5 h-3.5" />
          ) : (
            <Copy className="w-3.5 h-3.5" />
          )}
        </button>
```

- [ ] **Step 5: Remove `onCopy` at the row call-site**

Find the `<TimelineRow` usage (around line 507) and delete the line:

```tsx
                      onCopy={() => onCopy(item.text)}
```

The remaining props (`key`, `item`, `at`, `isSelected`, `isFirst`, `isLast`, `onSelect`, `onDelete`) stay.

- [ ] **Step 6: Type-check**

Run: `pnpm tsc --noEmit`
Expected: only `HistoriqueTab.tsx` error for `onCopy` on `<TranscriptionList>` remains — fixed next.

- [ ] **Step 7: Commit**

```bash
git add src/components/dashboard/transcription/TranscriptionList.tsx
git commit -m "feat(transcription): add feedback on timeline row copy"
```

---

## Task 7: Drop `onCopy` from `HistoriqueTab`

**Files:**
- Modify: `src/components/dashboard/tabs/HistoriqueTab.tsx`

- [ ] **Step 1: Remove the prop**

In `src/components/dashboard/tabs/HistoriqueTab.tsx`:

- Delete line 12 (`onCopy: (text: string) => void;`) from `HistoriqueTabProps`.
- Delete line 29 (`onCopy,`) from the destructured parameter list.
- Delete line 38 (`onCopy={onCopy}`) inside the first `<TranscriptionDetails>` (compact branch).
- Delete line 54 (`onCopy={onCopy}`) inside the `<TranscriptionList>` usage.
- Delete line 67 (`onCopy={onCopy}`) inside the second `<TranscriptionDetails>`.

Resulting file (reference):

```tsx
import { TranscriptionList } from "@/components/dashboard/transcription/TranscriptionList";
import { TranscriptionDetails } from "@/components/dashboard/transcription/TranscriptionDetails";
import type { Transcription } from "@/hooks/useTranscriptionHistory";

interface HistoriqueTabProps {
  transcriptions: Transcription[];
  selectedTranscription: Transcription | null;
  isSidebarOpen: boolean;
  isCompact: boolean;
  onSelectTranscription: (transcription: Transcription) => void;
  onCloseDetails: () => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
}

export function HistoriqueTab({
  transcriptions,
  selectedTranscription,
  isSidebarOpen,
  isCompact,
  onSelectTranscription,
  onCloseDetails,
  onDelete,
  onClearAll,
}: HistoriqueTabProps) {
  if (isCompact && isSidebarOpen) {
    return (
      <div className="vt-app">
        <TranscriptionDetails
          transcription={selectedTranscription}
          onClose={onCloseDetails}
          onDelete={onDelete}
          compact
        />
      </div>
    );
  }

  return (
    <div className="vt-app flex gap-6 items-start">
      <div className="flex-1 min-w-0">
        <TranscriptionList
          transcriptions={transcriptions}
          selectedId={isSidebarOpen ? selectedTranscription?.id : undefined}
          onSelectTranscription={onSelectTranscription}
          onDelete={onDelete}
          onClearAll={onClearAll}
        />
      </div>
      <div
        className={`transition-all duration-300 overflow-hidden flex-shrink-0 ${
          isSidebarOpen ? "w-[440px]" : "w-0"
        }`}
      >
        <div className="w-[440px] sticky top-2">
          <TranscriptionDetails
            transcription={selectedTranscription}
            onClose={onCloseDetails}
            onDelete={onDelete}
          />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm tsc --noEmit`
Expected: only `Dashboard.tsx` error remains (still passes `onCopy` + `onCopyContent`) — fixed in Task 8.

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/tabs/HistoriqueTab.tsx
git commit -m "refactor(dashboard): drop onCopy prop from HistoriqueTab"
```

---

## Task 8: Remove `handleCopy` from `Dashboard`

**Files:**
- Modify: `src/components/Dashboard.tsx`

- [ ] **Step 1: Delete the handler**

In `src/components/Dashboard.tsx`, delete lines 160–162:

```tsx
  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
  };
```

- [ ] **Step 2: Remove `onCopyContent={handleCopy}` from `<NotesEditor>`**

Delete line 279 (`onCopyContent={handleCopy}`).

- [ ] **Step 3: Remove `onCopy={handleCopy}` from `<HistoriqueTab>`**

Delete line 311 (`onCopy={handleCopy}`).

- [ ] **Step 4: Type-check**

Run: `pnpm tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/Dashboard.tsx
git commit -m "refactor(dashboard): remove silent handleCopy"
```

---

## Task 9: Migrate `LogsTab` to the hook

**Files:**
- Modify: `src/components/logs/LogsTab.tsx`

The custom fixed-bottom toast (`div` with `vt-fade-up`) is replaced by the sonner toast from the hook; the per-row button gains an icon swap.

- [ ] **Step 1: Import the hook**

In `src/components/logs/LogsTab.tsx`, add after line 18 (`import type { AppLog } from "@/hooks/useAppLogs";`):

```tsx
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";
```

- [ ] **Step 2: Replace local copy state with the hook**

Find the line `const [copied, setCopied] = useState(false);` (line 177). Replace it with:

```tsx
  const { copy, justCopied } = useCopyToClipboard();
```

Then find `handleCopy` (lines 229–233):

```tsx
  const handleCopy = useCallback((text: string) => {
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }, []);
```

Replace with:

```tsx
  const handleCopy = useCallback(
    (text: string) => {
      void copy(text);
    },
    [copy],
  );
```

- [ ] **Step 3: Add icon swap on the per-row button**

Find the copy button (lines 518–530). Replace:

```tsx
                      <button
                        type="button"
                        className="log-row-copy"
                        onClick={() =>
                          handleCopy(
                            `[${fmtTime(at)}] [${l.level.toUpperCase()}] ${l.message}`,
                          )
                        }
                        title={t("logs.copyLine")}
                        aria-label={t("logs.copyLine")}
                      >
                        <Copy className="w-3 h-3" />
                      </button>
```

with:

```tsx
                      <button
                        type="button"
                        className="log-row-copy"
                        onClick={() =>
                          handleCopy(
                            `[${fmtTime(at)}] [${l.level.toUpperCase()}] ${l.message}`,
                          )
                        }
                        title={justCopied ? t("common.copied") : t("logs.copyLine")}
                        aria-label={justCopied ? t("common.copied") : t("logs.copyLine")}
                      >
                        {justCopied ? (
                          <Check
                            className="w-3 h-3"
                            style={{ color: "var(--vt-ok)" }}
                          />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
```

- [ ] **Step 4: Delete the custom fixed-bottom toast div**

Find the `{/* Toast */}` block (lines 542–562):

```tsx
      {/* Toast */}
      {copied && (
        <div
          className="fixed bottom-5 left-1/2 -translate-x-1/2 px-3.5 py-2 rounded-lg text-[12.5px] font-medium flex items-center gap-2 vt-fade-up"
          style={{
            background: "var(--vt-tooltip-bg)",
            border: "1px solid var(--vt-border)",
            color: "var(--vt-tooltip-fg)",
            zIndex: 50,
            boxShadow: "0 10px 40px -10px rgba(0,0,0,.6)",
          }}
        >
          <span
            className="w-4 h-4 rounded-full flex items-center justify-center"
            style={{ background: "var(--vt-ok-soft)", color: "var(--vt-ok)" }}
          >
            <Check className="w-2.5 h-2.5" />
          </span>
          {t("logs.copiedToast")}
        </div>
      )}
```

Delete this entire block (the comment included).

- [ ] **Step 5: Clean up unused `useState` if applicable**

After the edits, verify `useState` is still used in the file (it is — several other `useState` calls exist in the component). No import change needed.

- [ ] **Step 6: Type-check**

Run: `pnpm tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/logs/LogsTab.tsx
git commit -m "refactor(logs): use useCopyToClipboard for row copy"
```

---

## Task 10: Remove obsolete i18n keys

**Files:**
- Modify: `src/locales/fr.json`
- Modify: `src/locales/en.json`

- [ ] **Step 1: FR — remove `logs.copiedToast`**

In `src/locales/fr.json`, inside `"logs"` block, delete the line:

```json
    "copiedToast": "Copié",
```

(Mind the trailing comma on the previous line — ensure the JSON stays valid.)

- [ ] **Step 2: FR — remove `notes.editor.copiedToClipboard`**

In `src/locales/fr.json`, inside `"notes"` → `"editor"`, delete the line:

```json
      "copiedToClipboard": "Copié dans le presse-papiers",
```

- [ ] **Step 3: EN — same two removals**

In `src/locales/en.json`, delete:

```json
    "copiedToast": "Copied",
```

and:

```json
      "copiedToClipboard": "Copied to clipboard",
```

- [ ] **Step 4: Verify JSON validity + verify no remaining references**

Run these three commands:

```bash
node -e "JSON.parse(require('fs').readFileSync('src/locales/fr.json')); JSON.parse(require('fs').readFileSync('src/locales/en.json')); console.log('ok')"
```
Expected: prints `ok`.

```bash
grep -rn "copiedToast\|copiedToClipboard" src/
```
Expected: no output (no remaining references anywhere in source).

- [ ] **Step 5: Commit**

```bash
git add src/locales/fr.json src/locales/en.json
git commit -m "chore(i18n): remove obsolete copy toast keys"
```

---

## Task 11: End-to-end verification

**Files:** (none — runtime check)

- [ ] **Step 1: TypeScript full pass**

Run: `pnpm tsc --noEmit`
Expected: PASS with zero errors.

- [ ] **Step 2: Frontend build**

Run: `pnpm build`
Expected: Vite build succeeds; no warnings about unused translation keys or missing imports.

- [ ] **Step 3: Ask the user to run the app**

Per `voice-tool/CLAUDE.md`, the assistant is **not allowed** to run `pnpm tauri dev`. Ask the user to start the app and walk through this checklist:

1. Open the **Historique** tab, select a transcription, click the primary **"Copier"** in the details → toast "Copié" appears bottom-right **and** the button shows a green check + label "Copié" for ~1.5 s.
2. On the timeline list, hover any row, click the Copy icon → toast + icon turns green for ~1.5 s, no full-row selection triggered.
3. Open **Settings → Logs**, click the copy icon on any log line → toast "Copié" (no more centered custom toast) + icon turns green for ~1.5 s.
4. Open a **Note**, click the footer **Copier** button → toast + label swap as before ; paste in a rich-text target to confirm HTML formatting is preserved.
5. Temporarily deny clipboard access in dev-tools (Application → Permissions), click any copy button → toast "Impossible de copier" appears; no crash.

- [ ] **Step 4: No final commit** (verification only)

If everything passes, nothing to commit. Otherwise, iterate and open targeted follow-up commits.

---

## Self-review notes

- **Spec coverage:** Hook (Task 1) · i18n add/remove (Tasks 2, 10) · TranscriptionDetails (Task 5) · TranscriptionList (Task 6) · LogsTab (Task 9) · NotesEditorFooter (Task 3) · prop plumbing cleanup (Tasks 4, 7, 8) · tests (Task 11). All spec bullets covered.
- **Placeholders:** none.
- **Type consistency:** hook API `{ copy, justCopied }` is used identically in Tasks 3, 5, 6, 9. `copy(text, { html })` signature stable. i18n keys `common.copy`, `common.copied`, `common.copyFailed` used consistently.
