# Drag & Drop Note Between Folders — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable users to drag notes between folders (and to/from the root section) with precise position control, an auto-expand behavior on collapsed folders, and polished visual feedback.

**Architecture:** Fuse the existing three nested `DndContext`s (folders / per-folder notes / root notes) in `NotesSidebarSection.tsx` into a single top-level `DndContext`. Each sortable carries a `data` payload identifying its type (`folder` | `note`) and containerId. During drag, a local draft state mirrors the layout optimistically; the backend is only called at `onDragEnd` via a new `moveNoteToFolderAtIndex` helper that chains the existing `move_note_to_folder` and `reorder_notes_in_folder` Tauri commands with rollback on error.

**Tech Stack:** React 19 + TypeScript, `@dnd-kit/core` + `@dnd-kit/sortable` (already in project), `react-i18next`, `sonner` (toasts), Tauri v2 backend (no Rust changes).

**Related spec:** `docs/superpowers/specs/2026-04-22-drag-drop-note-between-folders-design.md`

**Build verification:** The project has no test suite. Use `pnpm exec tsc --noEmit` to typecheck after structural changes. Do NOT run `pnpm tauri dev` yourself — ask the user to run it for manual validation at the end.

---

## File Structure

### Files modified

- `src/hooks/useSidebarCollapseState.ts` — add `expandFolder(id)` and `expandRoot()` idempotent helpers (Task 3).
- `src/hooks/useNotes.ts` — add `moveNoteToFolderAtIndex` helper (Task 4).
- `src/components/Dashboard.tsx` — wire new `moveNoteToFolderAtIndex` prop (Task 5).
- `src/components/dashboard/DashboardSidebar.tsx` — add new prop type + pass-through (Task 5).
- `src/components/notes/NotesSidebarSection.tsx` — main refactor (Tasks 5–12).
- `src/locales/en.json` — new `notes.errors.moveFailed` key (Task 1).
- `src/locales/fr.json` — same (Task 1).
- `app/globals.css` — new `.vt-folder-header--drop-active` class (Task 2).

### No new files

All logic fits into existing files. No new components, no Rust changes.

---

## Task 1: Add i18n key for move failure toast

**Files:**
- Modify: `src/locales/en.json`
- Modify: `src/locales/fr.json`

- [ ] **Step 1: Read both locale files**

Read `src/locales/en.json` and `src/locales/fr.json` to locate the `notes` section and confirm whether an `errors` sub-object already exists.

- [ ] **Step 2: Add `notes.errors.moveFailed` to `en.json`**

Inside the `notes` object, add (or extend if `errors` already exists):

```json
"errors": {
  "moveFailed": "Failed to move the note"
}
```

Place it at the same level as `folders`. Keep JSON valid (mind trailing commas).

- [ ] **Step 3: Add `notes.errors.moveFailed` to `fr.json`**

Same structure, French content:

```json
"errors": {
  "moveFailed": "Échec du déplacement de la note"
}
```

- [ ] **Step 4: Typecheck**

Run: `pnpm exec tsc --noEmit`

Expected: no new errors related to JSON imports (locale files are JSON — TypeScript will not catch key mismatches, this is just a sanity check that nothing is broken).

- [ ] **Step 5: Commit**

```bash
git add src/locales/en.json src/locales/fr.json
git commit -m "feat(notes): add i18n key for note move failure"
```

---

## Task 2: Add CSS for drop-active folder header

**Files:**
- Modify: `app/globals.css` (the `.vt-app` scoped section)

- [ ] **Step 1: Locate the `.vt-app` block**

Open `app/globals.css` and find the `.vt-app { ... }` block (around lines 400–429 per the spec, defining `--vt-accent`, `--vt-accent-soft`, etc.).

- [ ] **Step 2: Append the new class**

After the `.vt-app` token block (but still inside the scope so it can use the tokens), add:

```css
.vt-app .vt-folder-header--drop-active {
  background-color: var(--vt-accent-soft);
  outline: 1px solid var(--vt-accent);
  outline-offset: -1px;
  border-radius: 6px;
}
```

Rationale: reuses existing OKLCH tokens, outline (not border) avoids layout shift, negative offset keeps the outline inside the row bounds.

- [ ] **Step 3: Commit**

```bash
git add app/globals.css
git commit -m "feat(notes): add drop-active folder header style"
```

---

## Task 3: Add `expandFolder` and `expandRoot` to `useSidebarCollapseState`

**Files:**
- Modify: `src/hooks/useSidebarCollapseState.ts`

- [ ] **Step 1: Read the hook**

Read `src/hooks/useSidebarCollapseState.ts` in full. Confirmed semantics: in this hook, `true` = collapsed, `false` (or undefined) = expanded. `DEFAULT_STATE.root = false` and `DEFAULT_STATE.folders = {}`, so everything is expanded by default. `toggleFolder` does `!prev.folders[id]`, so it flips collapsed status.

- [ ] **Step 2: Add idempotent `expandFolder(id)` helper**

Inside the hook, next to `toggleFolder`:

```typescript
const expandFolder = useCallback((folderId: string) => {
  setState((prev) => {
    if (prev.folders[folderId] !== true) return prev; // already expanded
    return {
      ...prev,
      folders: { ...prev.folders, [folderId]: false },
    };
  });
}, []);
```

- [ ] **Step 3: Add idempotent `expandRoot()` helper**

```typescript
const expandRoot = useCallback(() => {
  setState((prev) => {
    if (prev.root !== true) return prev; // already expanded
    return { ...prev, root: false };
  });
}, []);
```

- [ ] **Step 4: Export the new helpers**

Update the hook's return object:

```typescript
return {
  state,
  toggleFavorites,
  toggleRecents,
  toggleRoot,
  toggleFolder,
  expandFolder,
  expandRoot,
};
```

- [ ] **Step 5: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useSidebarCollapseState.ts
git commit -m "feat(notes): add expandFolder/expandRoot helpers"
```

---

## Task 4: Add `moveNoteToFolderAtIndex` to `useNotes`

**Files:**
- Modify: `src/hooks/useNotes.ts`

- [ ] **Step 1: Read the hook**

Read `src/hooks/useNotes.ts`. Locate `moveNoteToFolder` (~line 100) and `reorderNotesInFolder` (~line 115). Note the pattern: they each `invoke` a single Tauri command and update local state optimistically, with `loadNotes()` fallback on error.

- [ ] **Step 2: Add the new helper after `reorderNotesInFolder`**

```typescript
const moveNoteToFolderAtIndex = async (
  noteId: string,
  targetFolderId: string | null,
  noteIdsInNewOrder: string[],
): Promise<void> => {
  try {
    await invoke<NoteMeta>('move_note_to_folder', { noteId, folderId: targetFolderId });
  } catch (error) {
    console.error('Failed to move note:', error);
    await loadNotes();
    throw error;
  }
  try {
    await invoke('reorder_notes_in_folder', {
      folderId: targetFolderId,
      noteIds: noteIdsInNewOrder,
    });
  } catch (error) {
    console.error('Failed to reorder notes after move:', error);
    await loadNotes();
    throw error;
  }
  // On success, refresh local state to reflect both the folderId change and the order change.
  await loadNotes();
};
```

Note: we skip optimistic local state mutation because the sidebar already maintains a draft state during drag; the final `loadNotes()` call aligns everything with the backend on success.

- [ ] **Step 3: Export the new helper**

Update the return object:

```typescript
return {
  notes,
  isLoading,
  loadNotes,
  createNote,
  readNote,
  updateNote,
  deleteNote,
  searchNotes,
  toggleFavorite,
  moveNoteToFolder,
  reorderNotesInFolder,
  moveNoteToFolderAtIndex,
  reloadNotes: loadNotes,
};
```

- [ ] **Step 4: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useNotes.ts
git commit -m "feat(notes): add moveNoteToFolderAtIndex helper"
```

---

## Task 5: Plumb `onMoveNoteToIndex` prop through the component chain

**Files:**
- Modify: `src/components/Dashboard.tsx` (around lines 71–72, 212–230)
- Modify: `src/components/dashboard/DashboardSidebar.tsx` (lines 51–53, 80–82, 150–164)
- Modify: `src/components/notes/NotesSidebarSection.tsx` (lines 38–53, and the component signature ~line 55)

This task is purely prop wiring — no behavior change yet.

- [ ] **Step 1: Destructure `moveNoteToFolderAtIndex` from `useNotes` in Dashboard**

In `Dashboard.tsx` around line 71, add to the destructure:

```typescript
const {
  // ...existing...
  moveNoteToFolder,
  reorderNotesInFolder,
  moveNoteToFolderAtIndex, // new
} = useNotes();
```

- [ ] **Step 2: Pass `onMoveNoteToIndex` to `DashboardSidebar`**

In `Dashboard.tsx` around line 212, inside the `<DashboardSidebar ... />` props:

```tsx
onMoveNoteToIndex={moveNoteToFolderAtIndex}
```

- [ ] **Step 3: Add `onMoveNoteToIndex` to `DashboardSidebarProps`**

In `DashboardSidebar.tsx` around line 51, add to the interface:

```typescript
onMoveNoteToIndex: (
  noteId: string,
  targetFolderId: string | null,
  noteIdsInNewOrder: string[],
) => Promise<void>;
```

- [ ] **Step 4: Destructure + forward the prop**

Around line 80, add to the destructured params:

```typescript
onMoveNoteToIndex,
```

Around line 150, inside the `<NotesSidebarSection ... />`:

```tsx
onMoveNoteToIndex={onMoveNoteToIndex}
```

- [ ] **Step 5: Add `onMoveNoteToIndex` to `NotesSidebarSectionProps`**

In `NotesSidebarSection.tsx` around line 38, add to the interface:

```typescript
onMoveNoteToIndex: (
  noteId: string,
  targetFolderId: string | null,
  noteIdsInNewOrder: string[],
) => Promise<void>;
```

Destructure it in the component signature alongside `onMoveNote`, `onReorderNotes`, etc.

- [ ] **Step 6: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors. TypeScript will catch any missing plumbing.

- [ ] **Step 7: Commit**

```bash
git add src/components/Dashboard.tsx src/components/dashboard/DashboardSidebar.tsx src/components/notes/NotesSidebarSection.tsx
git commit -m "feat(notes): plumb onMoveNoteToIndex prop through sidebar chain"
```

---

## Task 6: Unify DndContexts — structural refactor (behavior-preserving)

**Files:**
- Modify: `src/components/notes/NotesSidebarSection.tsx`

This is the largest task. Goal: remove the nested `DndContext` in `FolderSection` and the dedicated `DndContext` for root notes, and move everything under a single top-level `DndContext`. At the end of this task, the existing behavior (folder reorder, intra-folder note reorder, root note reorder) must be identical to before.

- [ ] **Step 1: Read the full file**

Read `src/components/notes/NotesSidebarSection.tsx` from top to bottom to fully understand the current structure.

- [ ] **Step 2: Update imports**

Add `useDroppable`, `DragOverlay`, and event types:

```typescript
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type DragCancelEvent,
} from "@dnd-kit/core";
```

- [ ] **Step 3: Define sortable `data` payload types at the top of the file**

Above the component definitions:

```typescript
type NoteDragData = {
  type: 'note';
  noteId: string;
  containerId: string; // folderId or 'root'
};

type FolderDragData = {
  type: 'folder';
  folderId: string;
};

type ContainerDroppableData = {
  type: 'container';
  containerId: string; // folderId or 'root'
};

const ROOT_CONTAINER_ID = 'root';
```

- [ ] **Step 4: Update `SortableNoteItem` to accept and attach data**

Modify the signature to accept `containerId`:

```typescript
type SortableNoteItemProps = {
  sortableId: string;
  containerId: string;
  // ...existing note/callback props
};

function SortableNoteItem({ sortableId, containerId, ...props }: SortableNoteItemProps) {
  const data: NoteDragData = { type: 'note', noteId: sortableId, containerId };
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: sortableId, data });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <NoteItem {...props} />
    </div>
  );
}
```

- [ ] **Step 5: Update `FolderSection`'s `useSortable` to attach data**

Change the `useSortable` call inside `FolderSection`:

```typescript
const data: FolderDragData = { type: 'folder', folderId: folder.id };
const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
  useSortable({ id: folder.id, data });
```

- [ ] **Step 6: Remove the nested `DndContext` + `SortableContext` from `FolderSection`**

In `FolderSection`, delete the local `noteSensors` variable and the local `handleNoteDragEnd` function. Replace the inner `<DndContext>...<SortableContext>...</SortableContext></DndContext>` wrapper with just a `<SortableContext>` (the `DndContext` moves to the parent).

The folder body should look like:

```tsx
<SortableContext
  items={notes.map((n) => n.id)}
  strategy={verticalListSortingStrategy}
>
  {notes.map((note) => (
    <SortableNoteItem
      key={note.id}
      sortableId={note.id}
      containerId={folder.id}
      note={note}
      isActive={note.id === activeNoteId}
      onOpen={onOpenNote}
      onToggleFavorite={onToggleFavorite}
      onRequestDelete={onRequestDeleteNote}
      onContextMenu={onNoteContextMenu}
      t={t}
    />
  ))}
</SortableContext>
```

Delete the `onReorderNotes` prop from `FolderSection` if no longer used internally (the handler moves up to the parent).

- [ ] **Step 7: Replace the three top-level `DndContext`s with one**

In the main component body, restructure so the JSX layout becomes:

```tsx
<DndContext
  sensors={sensors}
  collisionDetection={closestCenter}
  onDragStart={handleDragStart}
  onDragOver={handleDragOver}
  onDragEnd={handleDragEnd}
  onDragCancel={handleDragCancel}
>
  {/* Favorites section (NOT inside any SortableContext) */}
  {/* Recents section (NOT inside any SortableContext) */}

  {/* Folders list */}
  <SortableContext
    items={folders.map((f) => f.id)}
    strategy={verticalListSortingStrategy}
  >
    {folders.map((folder) => (
      <FolderSection ... />
    ))}
  </SortableContext>

  {/* Root notes */}
  <SortableContext
    items={rootNotes.map((n) => n.id)}
    strategy={verticalListSortingStrategy}
  >
    {rootNotes.map((note) => (
      <SortableNoteItem
        key={note.id}
        sortableId={note.id}
        containerId={ROOT_CONTAINER_ID}
        ...
      />
    ))}
  </SortableContext>

  {/* DragOverlay placeholder — filled in Task 10 */}
</DndContext>
```

- [ ] **Step 8: Implement a single top-level `handleDragEnd` dispatcher (preserves existing behavior)**

Inside the component body, replace the old `handleFolderDragEnd` and root-notes inline handler with a single dispatcher. For this task, only handle same-container cases (cross-container comes in Task 9):

```typescript
const handleDragStart = (_event: DragStartEvent) => {
  // Placeholder; real logic added in Task 8.
};

const handleDragOver = (_event: DragOverEvent) => {
  // Placeholder; real logic added in Task 8.
};

const handleDragCancel = (_event: DragCancelEvent) => {
  // Placeholder; real logic added in Task 10.
};

const handleDragEnd = (event: DragEndEvent) => {
  const { active, over } = event;
  if (!over || active.id === over.id) return;
  const activeData = active.data.current as NoteDragData | FolderDragData | undefined;
  if (!activeData) return;

  if (activeData.type === 'folder') {
    const oldIndex = folders.findIndex((f) => f.id === active.id);
    const newIndex = folders.findIndex((f) => f.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = [...folders];
    const [moved] = next.splice(oldIndex, 1);
    next.splice(newIndex, 0, moved);
    void onReorderFolders(next.map((f) => f.id));
    return;
  }

  if (activeData.type === 'note') {
    const overData = over.data.current as NoteDragData | ContainerDroppableData | undefined;
    // For same-container reorder only (Task 9 adds cross-container)
    if (overData?.type === 'note' && overData.containerId === activeData.containerId) {
      const containerNotes =
        activeData.containerId === ROOT_CONTAINER_ID
          ? rootNotes
          : (notesByFolder.get(activeData.containerId) ?? []);
      const oldIndex = containerNotes.findIndex((n) => n.id === active.id);
      const newIndex = containerNotes.findIndex((n) => n.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return;
      const next = [...containerNotes];
      const [moved] = next.splice(oldIndex, 1);
      next.splice(newIndex, 0, moved);
      const folderId = activeData.containerId === ROOT_CONTAINER_ID ? null : activeData.containerId;
      void onReorderNotes(folderId, next.map((n) => n.id));
    }
  }
};
```

- [ ] **Step 9: Keep sensors at the top level**

Ensure there is a single `sensors` declaration in the main component body (replacing the per-context sensors that existed before):

```typescript
const sensors = useSensors(
  useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
);
```

- [ ] **Step 10: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 11: Manual sanity check note for the reviewer/user**

Add this note in the commit body so the user can validate on their next dev run: "After this commit, existing behavior must be unchanged: reorder folders, reorder notes within a folder, reorder root notes. Cross-folder drag is NOT yet supported."

- [ ] **Step 12: Commit**

```bash
git add src/components/notes/NotesSidebarSection.tsx
git commit -m "refactor(notes): unify nested DndContexts into single context"
```

---

## Task 7: Add droppable sentinels for empty/target containers

**Files:**
- Modify: `src/components/notes/NotesSidebarSection.tsx`

The current structure relies on notes as drop targets. If a folder is empty (no notes), or if the user drops on a folder header rather than a specific note, we need explicit droppable zones.

- [ ] **Step 1: Add a `FolderBodyDroppable` wrapper component**

At the top of the file (near `SortableNoteItem`):

```typescript
type FolderBodyDroppableProps = {
  containerId: string;
  children: React.ReactNode;
};

function FolderBodyDroppable({ containerId, children }: FolderBodyDroppableProps) {
  const data: ContainerDroppableData = { type: 'container', containerId };
  const { setNodeRef, isOver } = useDroppable({ id: `container-${containerId}`, data });
  return (
    <div ref={setNodeRef} data-container-id={containerId} data-over={isOver}>
      {children}
    </div>
  );
}
```

Note: the droppable `id` is prefixed with `container-` to avoid collisions with the folder's sortable id (same folderId).

- [ ] **Step 2: Wrap the folder body inside `FolderSection`**

Inside `FolderSection`, wrap the `SortableContext` that renders the notes:

```tsx
<FolderBodyDroppable containerId={folder.id}>
  <SortableContext items={notes.map((n) => n.id)} strategy={verticalListSortingStrategy}>
    {notes.map((note) => (
      <SortableNoteItem ... />
    ))}
  </SortableContext>
</FolderBodyDroppable>
```

- [ ] **Step 3: Wrap the root notes area similarly**

In the main component body:

```tsx
<FolderBodyDroppable containerId={ROOT_CONTAINER_ID}>
  <SortableContext items={rootNotes.map((n) => n.id)} strategy={verticalListSortingStrategy}>
    {rootNotes.map((note) => (
      <SortableNoteItem ... containerId={ROOT_CONTAINER_ID} ... />
    ))}
  </SortableContext>
</FolderBodyDroppable>
```

- [ ] **Step 4: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/notes/NotesSidebarSection.tsx
git commit -m "feat(notes): add droppable sentinels for folder bodies"
```

---

## Task 8: Implement draft state + multi-container `onDragOver`

**Files:**
- Modify: `src/components/notes/NotesSidebarSection.tsx`

This is the core of the feature. During drag, a local draft mirrors the optimistic layout across containers.

- [ ] **Step 1: Add draft state**

Inside the component body, near the other `useState` calls:

```typescript
type ContainerMap = Record<string, string[]>;

const [activeId, setActiveId] = useState<string | null>(null);
const [activeType, setActiveType] = useState<'note' | 'folder' | null>(null);
const [originContainerId, setOriginContainerId] = useState<string | null>(null);
const [draftContainers, setDraftContainers] = useState<ContainerMap | null>(null);
const [overContainerId, setOverContainerId] = useState<string | null>(null);
```

- [ ] **Step 2: Derive the "live" container map from props**

Add a `useMemo` that produces the authoritative map (source of truth outside of drag):

```typescript
const liveContainers: ContainerMap = useMemo(() => {
  const map: ContainerMap = { [ROOT_CONTAINER_ID]: rootNotes.map((n) => n.id) };
  for (const folder of folders) {
    map[folder.id] = (notesByFolder.get(folder.id) ?? []).map((n) => n.id);
  }
  return map;
}, [rootNotes, folders, notesByFolder]);
```

- [ ] **Step 3: Use the draft when rendering notes during a drag**

Replace direct references to `rootNotes`/`notesByFolder` in the JSX render path with a helper that prefers the draft when active:

```typescript
const containersForRender = draftContainers ?? liveContainers;

const notesForFolder = (folderId: string): NoteMeta[] => {
  const ids = containersForRender[folderId] ?? [];
  const lookup = new Map<string, NoteMeta>();
  for (const n of notes) lookup.set(n.id, n);
  return ids.map((id) => lookup.get(id)).filter((n): n is NoteMeta => !!n);
};

const rootNotesForRender = notesForFolder(ROOT_CONTAINER_ID);
```

Note: `notes` (the flat prop list) is the source of `NoteMeta` objects. The draft only reorders IDs between containers, it does not mutate note data itself.

Pass `notesForFolder(folder.id)` to `FolderSection` instead of the previous `notesByFolder.get(folder.id) ?? []`. Use `rootNotesForRender` for the root notes render.

- [ ] **Step 4: Implement `handleDragStart`**

Replace the placeholder:

```typescript
const handleDragStart = (event: DragStartEvent) => {
  const data = event.active.data.current as NoteDragData | FolderDragData | undefined;
  if (!data) return;
  setActiveId(String(event.active.id));
  setActiveType(data.type);
  if (data.type === 'note') {
    setOriginContainerId(data.containerId);
    setDraftContainers({ ...liveContainers });
  }
};
```

- [ ] **Step 5: Helper to determine the over-container**

Add a helper near the handlers:

```typescript
const resolveOverContainerId = (over: DragEndEvent['over']): string | null => {
  if (!over) return null;
  const data = over.data.current as
    | NoteDragData
    | ContainerDroppableData
    | FolderDragData
    | undefined;
  if (!data) return null;
  if (data.type === 'note') return data.containerId;
  if (data.type === 'container') return data.containerId;
  return null; // folder drop targets don't accept notes
};
```

- [ ] **Step 6: Implement `handleDragOver` (multi-container move)**

Replace the placeholder:

```typescript
const handleDragOver = (event: DragOverEvent) => {
  const { active, over } = event;
  const activeData = active.data.current as NoteDragData | FolderDragData | undefined;
  if (!activeData || activeData.type !== 'note') {
    setOverContainerId(null);
    return;
  }

  const overId = over ? String(over.id) : null;
  const nextContainerId = resolveOverContainerId(over);
  setOverContainerId(nextContainerId);
  if (!nextContainerId || !draftContainers) return;

  const activeNoteId = activeData.noteId;
  const currentContainerId = findContainerOf(draftContainers, activeNoteId);
  if (!currentContainerId) return;

  if (currentContainerId === nextContainerId) {
    // Same-container reorder during hover — reflect over-position
    if (!overId) return;
    const items = draftContainers[currentContainerId];
    const activeIndex = items.indexOf(activeNoteId);
    const overIndex =
      over?.data.current && (over.data.current as { type: string }).type === 'note'
        ? items.indexOf(overId)
        : items.length;
    if (activeIndex === overIndex || overIndex < 0) return;
    const nextItems = [...items];
    nextItems.splice(activeIndex, 1);
    nextItems.splice(overIndex, 0, activeNoteId);
    setDraftContainers({ ...draftContainers, [currentContainerId]: nextItems });
    return;
  }

  // Cross-container move
  const fromItems = draftContainers[currentContainerId].filter((id) => id !== activeNoteId);
  const toItemsOriginal = draftContainers[nextContainerId] ?? [];
  const overIsNote =
    over?.data.current && (over.data.current as { type: string }).type === 'note';
  const insertAt = overIsNote && overId ? toItemsOriginal.indexOf(overId) : toItemsOriginal.length;
  const toItems = [...toItemsOriginal];
  toItems.splice(insertAt >= 0 ? insertAt : toItems.length, 0, activeNoteId);

  setDraftContainers({
    ...draftContainers,
    [currentContainerId]: fromItems,
    [nextContainerId]: toItems,
  });
};
```

- [ ] **Step 7: Add `findContainerOf` helper**

Near the top of the file (module scope):

```typescript
function findContainerOf(containers: ContainerMap, noteId: string): string | null {
  for (const [containerId, ids] of Object.entries(containers)) {
    if (ids.includes(noteId)) return containerId;
  }
  return null;
}
```

- [ ] **Step 8: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add src/components/notes/NotesSidebarSection.tsx
git commit -m "feat(notes): add draft state and multi-container drag-over logic"
```

---

## Task 9: Implement cross-container `handleDragEnd`

**Files:**
- Modify: `src/components/notes/NotesSidebarSection.tsx`

Replace the same-container-only dispatcher from Task 6 with a full-featured one that persists cross-container moves.

- [ ] **Step 1: Replace `handleDragEnd`**

```typescript
const handleDragEnd = async (event: DragEndEvent) => {
  const { active, over } = event;
  const activeData = active.data.current as NoteDragData | FolderDragData | undefined;

  const resetDragState = () => {
    setActiveId(null);
    setActiveType(null);
    setOriginContainerId(null);
    setDraftContainers(null);
    setOverContainerId(null);
  };

  if (!activeData) {
    resetDragState();
    return;
  }

  // Folder reorder (unchanged)
  if (activeData.type === 'folder') {
    if (over && active.id !== over.id) {
      const oldIndex = folders.findIndex((f) => f.id === active.id);
      const newIndex = folders.findIndex((f) => f.id === over.id);
      if (oldIndex >= 0 && newIndex >= 0) {
        const next = [...folders];
        const [moved] = next.splice(oldIndex, 1);
        next.splice(newIndex, 0, moved);
        void onReorderFolders(next.map((f) => f.id));
      }
    }
    resetDragState();
    return;
  }

  // Note drop
  if (activeData.type === 'note' && draftContainers && originContainerId) {
    const noteId = activeData.noteId;
    const finalContainerId = findContainerOf(draftContainers, noteId);
    if (!finalContainerId) {
      resetDragState();
      return;
    }

    const finalIds = draftContainers[finalContainerId];
    const originIds = liveContainers[originContainerId] ?? [];

    // No-op detection: note stayed in origin AND order unchanged
    if (finalContainerId === originContainerId) {
      const unchanged =
        finalIds.length === originIds.length &&
        finalIds.every((id, i) => id === originIds[i]);
      if (unchanged) {
        resetDragState();
        return;
      }
      const folderId = finalContainerId === ROOT_CONTAINER_ID ? null : finalContainerId;
      try {
        await onReorderNotes(folderId, finalIds);
      } catch (error) {
        console.error('Reorder failed:', error);
        toast.error(t('notes.errors.moveFailed'));
      }
      resetDragState();
      return;
    }

    // Cross-container move
    const targetFolderId = finalContainerId === ROOT_CONTAINER_ID ? null : finalContainerId;
    try {
      await onMoveNoteToIndex(noteId, targetFolderId, finalIds);
    } catch (error) {
      console.error('Cross-container move failed:', error);
      toast.error(t('notes.errors.moveFailed'));
    }
    resetDragState();
    return;
  }

  resetDragState();
};
```

- [ ] **Step 2: Import `toast`**

At the top of the file:

```typescript
import { toast } from 'sonner';
```

- [ ] **Step 3: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/notes/NotesSidebarSection.tsx
git commit -m "feat(notes): support cross-folder drag-and-drop for notes"
```

---

## Task 10: Implement `handleDragCancel` + `DragOverlay`

**Files:**
- Modify: `src/components/notes/NotesSidebarSection.tsx`

- [ ] **Step 1: Implement `handleDragCancel`**

Replace the placeholder:

```typescript
const handleDragCancel = (_event: DragCancelEvent) => {
  setActiveId(null);
  setActiveType(null);
  setOriginContainerId(null);
  setDraftContainers(null);
  setOverContainerId(null);
  // Auto-expand timer clear is handled in Task 11
};
```

- [ ] **Step 2: Add `DragOverlay` with a mini-card for the active note**

Inside the top-level `<DndContext>`, after all the sortable contexts:

```tsx
<DragOverlay dropAnimation={null}>
  {activeId && activeType === 'note' ? (
    <DragOverlayNoteCard
      note={notes.find((n) => n.id === activeId) ?? null}
    />
  ) : null}
</DragOverlay>
```

- [ ] **Step 3: Define `DragOverlayNoteCard` above the component**

```typescript
type DragOverlayNoteCardProps = { note: NoteMeta | null };

function DragOverlayNoteCard({ note }: DragOverlayNoteCardProps) {
  if (!note) return null;
  return (
    <div className="vt-app flex items-center gap-2 px-3 py-1.5 rounded-md bg-background border shadow-lg text-sm max-w-[240px]">
      <FileText className="w-3.5 h-3.5 shrink-0 opacity-70" />
      <span className="truncate flex-1">{note.title || 'Untitled'}</span>
      {note.favorite ? <Star className="w-3 h-3 fill-current text-yellow-500" /> : null}
    </div>
  );
}
```

(The `"Untitled"` fallback is intentionally non-translated here — this is the overlay's last-resort label matching existing patterns; if the project has a translated fallback elsewhere, use that instead.)

- [ ] **Step 4: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/notes/NotesSidebarSection.tsx
git commit -m "feat(notes): add drag overlay card and cancel handler"
```

---

## Task 11: Implement auto-expand on hover (600ms)

**Files:**
- Modify: `src/components/notes/NotesSidebarSection.tsx`

- [ ] **Step 1: Import `useEffect` and `useRef` if not already**

They are already imported per the file's existing imports. Verify.

- [ ] **Step 2: Destructure the new helpers from `useSidebarCollapseState`**

Where the hook is currently used (around line 280 per the original file):

```typescript
const {
  state: collapseState,
  toggleFolder: toggleFolderCollapsed,
  toggleRoot: toggleRootCollapsed,
  expandFolder,
  expandRoot,
} = useSidebarCollapseState();
```

- [ ] **Step 3: Add the auto-expand timer state**

```typescript
const expandTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
const pendingExpandTargetRef = useRef<string | null>(null);
```

- [ ] **Step 4: Add a helper `schedulePossibleExpand` and wire it from `handleDragOver`**

Add this function in the component body:

```typescript
const AUTO_EXPAND_DELAY_MS = 600;

const clearExpandTimer = () => {
  if (expandTimerRef.current) {
    clearTimeout(expandTimerRef.current);
    expandTimerRef.current = null;
  }
  pendingExpandTargetRef.current = null;
};

const schedulePossibleExpand = (containerId: string | null) => {
  if (!containerId) {
    clearExpandTimer();
    return;
  }
  // Already collapsed? Only then we schedule.
  const isCollapsed =
    containerId === ROOT_CONTAINER_ID
      ? collapseState.root === true
      : collapseState.folders[containerId] === true;
  if (!isCollapsed) {
    clearExpandTimer();
    return;
  }
  // Same target already pending → do nothing.
  if (pendingExpandTargetRef.current === containerId) return;
  clearExpandTimer();
  pendingExpandTargetRef.current = containerId;
  expandTimerRef.current = setTimeout(() => {
    if (pendingExpandTargetRef.current !== containerId) return;
    if (containerId === ROOT_CONTAINER_ID) {
      expandRoot();
    } else {
      expandFolder(containerId);
    }
    clearExpandTimer();
  }, AUTO_EXPAND_DELAY_MS);
};
```

- [ ] **Step 5: Call `schedulePossibleExpand` at the top of `handleDragOver`**

At the very beginning of `handleDragOver`:

```typescript
const nextContainerId = resolveOverContainerId(event.over);
schedulePossibleExpand(nextContainerId);
```

(Note: you already compute `nextContainerId` lower in the handler — move that computation up and reuse the value to avoid computing twice.)

- [ ] **Step 6: Clear the timer in `handleDragEnd` and `handleDragCancel`**

Inside both `resetDragState()` (or at the start of `handleDragCancel`), call:

```typescript
clearExpandTimer();
```

Update `resetDragState` accordingly.

- [ ] **Step 7: Clear on unmount**

```typescript
useEffect(() => () => clearExpandTimer(), []);
```

- [ ] **Step 8: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add src/components/notes/NotesSidebarSection.tsx
git commit -m "feat(notes): auto-expand collapsed folders when hovered during drag"
```

---

## Task 12: Apply `drop-active` CSS class to hovered folder header

**Files:**
- Modify: `src/components/notes/NotesSidebarSection.tsx`

- [ ] **Step 1: Pass `isDropActive` flag to `FolderSection`**

Add a prop `isDropActive: boolean` to `FolderSection`'s props interface.

In the main component JSX:

```tsx
{folders.map((folder) => (
  <FolderSection
    key={folder.id}
    folder={folder}
    // ...existing props...
    isDropActive={activeType === 'note' && overContainerId === folder.id && originContainerId !== folder.id}
  />
))}
```

(We exclude `originContainerId === folder.id` so the origin folder doesn't highlight while you're just hovering your own folder.)

- [ ] **Step 2: Apply the class on the folder header in `FolderSection`**

Find the folder header `<div>` (currently around line 183 with class `group flex items-center gap-1.5 px-3 py-1 hover:bg-accent/30 transition-colors`) and conditionally append the new class:

```tsx
<div
  className={`group flex items-center gap-1.5 px-3 py-1 hover:bg-accent/30 transition-colors${isDropActive ? ' vt-folder-header--drop-active' : ''}`}
>
```

- [ ] **Step 3: Apply a similar class to the root section header**

Find the root/Unfiled section header and apply the same class when `activeType === 'note' && overContainerId === ROOT_CONTAINER_ID && originContainerId !== ROOT_CONTAINER_ID`:

```tsx
<div
  className={`group flex items-center gap-1.5 px-3 py-1 hover:bg-accent/30 transition-colors${
    activeType === 'note' && overContainerId === ROOT_CONTAINER_ID && originContainerId !== ROOT_CONTAINER_ID
      ? ' vt-folder-header--drop-active'
      : ''
  }`}
>
```

- [ ] **Step 4: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/notes/NotesSidebarSection.tsx
git commit -m "feat(notes): highlight drop-target folder header during drag"
```

---

## Task 13: Full build verification

**Files:** none modified

- [ ] **Step 1: Run the full build**

Run: `pnpm build`

Expected: clean TypeScript compilation and successful Vite build. Zero errors, zero new warnings attributable to our changes.

- [ ] **Step 2: If errors appear**

Fix them inline. Do not commit half-done state. Re-run until clean.

- [ ] **Step 3: Commit any fixes if necessary**

```bash
git add <fixed files>
git commit -m "fix(notes): resolve build errors from drag-drop refactor"
```

If no fixes were needed, skip this commit.

---

## Task 14: Manual validation handoff

**Files:** none modified

- [ ] **Step 1: Ask the user to run `pnpm tauri dev` and validate**

Present this checklist to the user:

1. **Intra-folder reorder (non-regression)** — drag a note within the same folder, verify order persists on reload.
2. **Folder reorder (non-regression)** — drag a folder, verify order persists.
3. **Root notes reorder (non-regression)** — drag notes in the root section.
4. **Cross-folder drag — precise position** — drag a note from folder A into the middle of folder B's list, verify it lands exactly where dropped and persists on reload.
5. **Drag to root** — drag a note from a folder to the root section.
6. **Drag from root to folder** — drag a root note into a folder.
7. **Auto-expand** — drag a note, hover over a collapsed folder header for ~600ms, confirm it expands. Move away before 600ms → should not expand.
8. **ESC cancel** — start a cross-container drag, press ESC, confirm no change persists.
9. **Empty folder drop** — drag a note into a folder that has zero notes, confirm it lands there.
10. **Drop-active highlight** — during drag, target folder header shows the accent outline.
11. **DragOverlay** — the note's title follows the cursor as a floating pill during drag.
12. **Context menu "Move to…" (non-regression)** — right-click a note, use the existing Move menu.
13. **Favorites / Recents** — confirm notes there are NOT draggable and those sections are NOT drop targets.

- [ ] **Step 2: Report outcomes back to the plan reviewer**

Any failed check → file an issue or add a follow-up task. All checks passing → the feature is complete.

---

## Post-implementation notes

- **Rollback strategy:** if a backend call fails during cross-container move, `moveNoteToFolderAtIndex` calls `loadNotes()` which refetches authoritative state. The toast surfaces the error. Local draft is already reset by `resetDragState`.
- **Performance:** `draftContainers` is a shallow `Record<string, string[]>`; React's reconciliation is cheap because only the affected `SortableContext`'s `items` array identity changes.
- **No Rust changes:** all backend commands (`move_note_to_folder`, `reorder_notes_in_folder`) already exist and are re-used unchanged.
