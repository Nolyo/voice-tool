# Detachable Note Windows — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detach a note into its own native OS window (edit it there, pin it always-on-top, re-attach it as a tab), with several detached notes side by side — per the approved spec `docs/superpowers/specs/2026-07-24-detachable-notes-design.md`.

**Architecture:** Approach A from the spec — a lean dedicated Vite entry (`note.html` → `src/note-window.tsx`) with NO provider stack, windows created/closed by Rust commands (`open_note_window` / `close_note_window`, label `note-<uuid>`), and window-close-as-reattach-signal lifecycle. The detached window writes notes to disk directly (`update_note`) and broadcasts events; the main window keeps sole ownership of the cloud sync queue.

**Tech Stack:** Tauri v2 (Rust), React 19 + TypeScript, TipTap v3, Tauri Store plugin, Vitest, react-i18next, lucide-react.

## Global Constraints

- **Branch**: work on `feat/detachable-notes` (already exists, contains the spec). NEVER commit to `main` — final delivery is a PR per lot (PR 1 = Tasks 1–11, PR 2 = Tasks 12–14).
- **Commits**: conventional commits, English, short (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`).
- **i18n**: ZERO hard-coded UI strings (including `title` / `aria-label`). Every new string goes through react-i18next in BOTH `src/locales/fr.json` and `src/locales/en.json`.
- **`pnpm tauri dev` is forbidden for the agent** — ask the user to run it for smoke tests.
- **Rust commands** (PowerShell 7 syntax, from repo root):
  ```powershell
  $env:LIBCLANG_PATH = "C:/Program Files/LLVM/bin"; $env:Path += ";C:\Program Files\CMake\bin"
  cd src-tauri; cargo test --no-default-features <filter>; cd ..
  ```
  Always `--no-default-features` (skips Vulkan). First compile is slow (whisper.cpp) — that is normal.
- **Frontend commands**: `pnpm vitest run <path>` for tests, `pnpm build` for the TypeScript + Vite check.
- **Never touch** `tauri.conf.json` signing/public key, existing plugin features, or dependency versions.
- **Tauri v2 arg naming**: Rust command args are snake_case (`note_id`), invoked from JS with camelCase (`noteId`).

## File Structure (what gets created/modified)

| File | Role |
|---|---|
| `src-tauri/src/notes.rs` (modify) | `is_valid_note_id` + `note_exists` helpers + tests |
| `src-tauri/src/window.rs` (modify) | `note_window_label`, `open_note_window`, `position_note_window` + test |
| `src-tauri/src/commands/window.rs` (modify) | `open_note_window` / `close_note_window` / `show_main_window` commands + `close_all_note_windows` |
| `src-tauri/src/commands/profiles.rs` (modify) | close note windows on `switch_profile` |
| `src-tauri/src/lib.rs` (modify) | register the 3 new commands |
| `src-tauri/capabilities/note.json` (create) | capability for `note-*` windows |
| `note.html` (create), `vite.config.ts` (modify) | third Vite entry |
| `src/note-window.tsx` (create) | entry point of the detached window |
| `src/lib/window-bootstrap.ts` (create) | shared theme/language bootstrap (extracted from `useMiniWindowState`) |
| `src/hooks/useMiniWindowState.ts` (modify) | use the shared bootstrap |
| `src/lib/notes-window/tab-transitions.ts` (create) | pure tab-state transitions (tested) |
| `src/hooks/useNotesWorkflow.ts` (modify) | detached registry + handlers |
| `src/lib/sync/notes-store.ts` (modify) | `scheduleNoteUpdatePushFromDisk`, `note-remote-updated` emission |
| `src/hooks/useNotes.ts` (modify) | `applyExternalNoteMeta` |
| `src/components/notes/NotesEditor/NotesEditorContent.tsx`, `NotesEditorHeader.tsx`, `NotesEditorFooter.tsx` (modify) | optional AI/share flags |
| `src/hooks/useDetachedNote.ts` (create) | detached-window data layer |
| `src/components/note-window/DetachedNoteShell.tsx` (create) | detached-window UI composition |
| `src/hooks/useDetachedNotesBridge.ts` (create) | main-window event router (tested) |
| `src/components/Dashboard.tsx` (modify) | wiring |
| `src/components/notes/NotesEditor/NotesEditor.tsx` + `NotesEditorTitleBar.tsx` (modify) | detach icon on active tab |
| `src/components/dashboard/DashboardSidebar.tsx` + `src/components/notes/NotesSidebarSection.tsx` (modify) | detached indicator |
| `src/locales/fr.json` + `src/locales/en.json` (modify) | i18n keys |
| `docs/detachable-notes-e2e-checklist.md` (create) | manual E2E checklist |
| `src/lib/notes-window/drag-out.ts` (create, PR 2) | pure drag helpers (tested) |
| `src/hooks/useTabDragOut.ts` (create, PR 2) | drag-out gesture |

## Event contract (single source of truth for names/payloads)

| Event | Emitter → Listener | Payload |
|---|---|---|
| `note-window-closed` | Rust (window Destroyed) → main | `{ noteId: string }` |
| `note-reattach-request` | detached → main | `{ id: string }` |
| `note-detached-updated` | detached → broadcast | `{ id, title, updatedAt }` |
| `note-detached-delete-request` | detached → main | `{ id: string }` |
| `note-open-request` | detached → main | `{ id: string }` |
| `note-toggle-local-only-request` | detached → main | `{ id: string }` |
| `note-meta-updated` | main → broadcast | `{ meta: NoteMeta }` |
| `note-remote-updated` | main (sync pull) → broadcast | `{ id, updatedAt }` |
| `theme-changed`, `language-changed` | main → broadcast (existing) | unchanged |

---

# PR 1 — Fondation

### Task 1: Rust note-id validation helpers

**Files:**
- Modify: `src-tauri/src/notes.rs`
- Test: same file, `#[cfg(test)]` module

**Interfaces:**
- Produces: `pub(crate) fn is_valid_note_id(id: &str) -> bool` and `pub(crate) fn note_exists(app_handle: &AppHandle, id: &str) -> bool` in module `crate::notes` (used by Task 2's commands).

- [ ] **Step 1: Write the failing tests**

At the bottom of `src-tauri/src/notes.rs` (append; if a `#[cfg(test)] mod tests` already exists, add these tests inside it instead):

```rust
#[cfg(test)]
mod note_id_tests {
    use super::is_valid_note_id;

    #[test]
    fn accepts_canonical_uuid() {
        assert!(is_valid_note_id("0f8fad5b-d9cb-469f-a165-70867728950e"));
    }

    #[test]
    fn rejects_empty_and_traversal() {
        assert!(!is_valid_note_id(""));
        assert!(!is_valid_note_id("../../etc/passwd"));
    }

    #[test]
    fn rejects_wrong_shape() {
        // no dashes
        assert!(!is_valid_note_id("0f8fad5bd9cb469fa16570867728950e0000"));
        // non-hex char at the end
        assert!(!is_valid_note_id("0f8fad5b-d9cb-469f-a165-70867728950g"));
        // dash at wrong index
        assert!(!is_valid_note_id("0f8fad5bd-9cb-469f-a165-70867728950e"));
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

```powershell
$env:LIBCLANG_PATH = "C:/Program Files/LLVM/bin"; $env:Path += ";C:\Program Files\CMake\bin"
cd src-tauri; cargo test --no-default-features note_id_tests; cd ..
```
Expected: COMPILE ERROR — `cannot find function is_valid_note_id`.

- [ ] **Step 3: Implement the helpers**

In `src-tauri/src/notes.rs`, right after `get_notes_dir` (line ~60):

```rust
/// Canonical UUID shape (8-4-4-4-12 hex groups). Note ids become window
/// labels (`note-<id>`), which only accept [a-zA-Z0-9\-/:_] — rejecting
/// anything else up front prevents label injection and builder panics.
pub(crate) fn is_valid_note_id(id: &str) -> bool {
    id.len() == 36
        && id.bytes().enumerate().all(|(i, b)| match i {
            8 | 13 | 18 | 23 => b == b'-',
            _ => b.is_ascii_hexdigit(),
        })
}

/// True when the note exists on disk for the active profile.
pub(crate) fn note_exists(app_handle: &AppHandle, id: &str) -> bool {
    match get_notes_dir(app_handle) {
        Ok(dir) => dir.join(id).join("note.json").exists(),
        Err(_) => false,
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Same command as Step 2. Expected: `test result: ok. 3 passed`.

- [ ] **Step 5: Commit**

```powershell
git add src-tauri/src/notes.rs
git commit -m "feat: add note id validation helpers for detached windows"
```

---

### Task 2: Rust note-window commands + lifecycle events

**Files:**
- Modify: `src-tauri/src/window.rs` (append after `create_mini_window`, ~line 387)
- Modify: `src-tauri/src/commands/window.rs` (append)
- Modify: `src-tauri/src/lib.rs:105` (register commands)
- Modify: `src-tauri/src/commands/profiles.rs:161-168` (`switch_profile`)

**Interfaces:**
- Consumes: `crate::notes::is_valid_note_id`, `crate::notes::note_exists` (Task 1).
- Produces:
  - Tauri commands `open_note_window(note_id: String, at_cursor: Option<bool>)`, `close_note_window(note_id: String)`, `show_main_window()` — invoked from JS as `invoke("open_note_window", { noteId, atCursor })` etc.
  - `pub(crate) fn note_window_label(note_id: &str) -> String` in `crate::window`.
  - Rust emits `note-window-closed { noteId }` on window Destroyed.

- [ ] **Step 1: Write the failing label test**

At the bottom of `src-tauri/src/window.rs`:

```rust
#[cfg(test)]
mod note_window_tests {
    use super::note_window_label;

    #[test]
    fn label_prefixes_note_id() {
        assert_eq!(
            note_window_label("0f8fad5b-d9cb-469f-a165-70867728950e"),
            "note-0f8fad5b-d9cb-469f-a165-70867728950e"
        );
    }
}
```

- [ ] **Step 2: Run to verify it fails**

```powershell
cd src-tauri; cargo test --no-default-features note_window_tests; cd ..
```
Expected: COMPILE ERROR — `cannot find function note_window_label`.

- [ ] **Step 3: Implement window creation in `src-tauri/src/window.rs`**

Append after `create_mini_window` (uses the `AppHandle`, `Manager`, `PhysicalPosition`, `PhysicalSize`, `Position`, `WindowEvent` imports already at the top of the file):

```rust
pub(crate) const DEFAULT_NOTE_WIDTH: f64 = 520.0;
pub(crate) const DEFAULT_NOTE_HEIGHT: f64 = 640.0;
const NOTE_CASCADE_OFFSET_PX: i32 = 32;

pub(crate) fn note_window_label(note_id: &str) -> String {
    format!("note-{note_id}")
}

/// Position a freshly-created (still hidden) note window: at the OS cursor
/// (drag-out drop) or centered on the main window with a cascade offset so
/// several detached notes don't stack exactly on top of each other.
/// All coordinates are physical pixels — no DPI math in JS.
fn position_note_window(
    app: &tauri::AppHandle,
    window: &WebviewWindow,
    at_cursor: bool,
    existing_note_windows: usize,
) {
    if at_cursor {
        if let Ok(cursor) = app.cursor_position() {
            let _ = window.set_position(Position::Physical(PhysicalPosition {
                x: (cursor.x as i32 - 60).max(0),
                y: (cursor.y as i32 - 20).max(0),
            }));
            return;
        }
    }
    let size = window
        .outer_size()
        .ok()
        .unwrap_or_else(|| PhysicalSize::new(DEFAULT_NOTE_WIDTH as u32, DEFAULT_NOTE_HEIGHT as u32));
    let Some(main) = app.get_webview_window("main") else {
        return;
    };
    let (Ok(pos), Ok(main_size)) = (main.outer_position(), main.outer_size()) else {
        return;
    };
    let offset = NOTE_CASCADE_OFFSET_PX * existing_note_windows as i32;
    let x = pos.x + (main_size.width as i32 - size.width as i32) / 2 + offset;
    let y = pos.y + (main_size.height as i32 - size.height as i32) / 2 + offset;
    let _ = window.set_position(Position::Physical(PhysicalPosition {
        x: x.max(0),
        y: y.max(0),
    }));
}

/// Create the detached window for a note, or focus it if it already exists.
pub(crate) fn open_note_window(
    app: &tauri::AppHandle,
    note_id: &str,
    at_cursor: bool,
) -> Result<(), String> {
    use tauri::{Emitter, WebviewUrl, WebviewWindowBuilder};

    let label = note_window_label(note_id);

    if let Some(existing) = app.get_webview_window(&label) {
        let _ = existing.show();
        let _ = existing.unminimize();
        let _ = existing.set_focus();
        return Ok(());
    }

    let existing_note_windows = app
        .webview_windows()
        .keys()
        .filter(|l| l.starts_with("note-"))
        .count();

    let window = WebviewWindowBuilder::new(
        app,
        &label,
        WebviewUrl::App(format!("note.html?noteId={note_id}").into()),
    )
    .title("Lexena")
    .inner_size(DEFAULT_NOTE_WIDTH, DEFAULT_NOTE_HEIGHT)
    .min_inner_size(320.0, 240.0)
    .resizable(true)
    .visible(false)
    .build()
    .map_err(|e| format!("Failed to create note window: {e}"))?;

    position_note_window(app, &window, at_cursor, existing_note_windows);

    // Closing the window IS the reattach signal (spec §4): the main window
    // restores the tab silently. Flows that must NOT restore it (delete,
    // explicit reattach) remove the id from `detachedNoteIds` BEFORE closing,
    // and the main-window handler ignores ids absent from the registry.
    let app_handle = app.clone();
    let closed_note_id = note_id.to_string();
    window.on_window_event(move |event| {
        if matches!(event, WindowEvent::Destroyed) {
            let _ = app_handle.emit(
                "note-window-closed",
                serde_json::json!({ "noteId": closed_note_id }),
            );
        }
    });

    let _ = window.show();
    let _ = window.set_focus();

    Ok(())
}
```

Note: `position_note_window` and `open_note_window` here are NOT generic over `R: Runtime` (unlike the mini helpers) because `cursor_position()` and `serde_json` payload emission are only needed on the concrete `tauri::AppHandle`. If the compiler complains about `WebviewWindow` needing a type parameter, use `WebviewWindow<tauri::Wry>`.

- [ ] **Step 4: Implement the commands in `src-tauri/src/commands/window.rs`**

Append at the end of the file:

```rust
/// Open (or focus) the detached window for a note. `at_cursor: true` places
/// the window at the OS cursor position (drag-out drop).
#[tauri::command]
pub fn open_note_window(
    app_handle: AppHandle,
    note_id: String,
    at_cursor: Option<bool>,
) -> Result<(), String> {
    if !crate::notes::is_valid_note_id(&note_id) {
        return Err("Invalid note id".to_string());
    }
    if !crate::notes::note_exists(&app_handle, &note_id) {
        return Err("Note not found".to_string());
    }
    crate::window::open_note_window(&app_handle, &note_id, at_cursor.unwrap_or(false))?;
    tracing::info!("Note window opened for {}", note_id);
    Ok(())
}

/// Close the detached window for a note (delete flow, explicit reattach).
#[tauri::command]
pub fn close_note_window(app_handle: AppHandle, note_id: String) -> Result<(), String> {
    let label = crate::window::note_window_label(&note_id);
    if let Some(window) = app_handle.get_webview_window(&label) {
        window
            .close()
            .map_err(|e| format!("Failed to close note window: {e}"))?;
    }
    Ok(())
}

/// Show + focus the main window (explicit reattach, wiki-link opened from a
/// detached window).
#[tauri::command]
pub fn show_main_window(app_handle: AppHandle) {
    if let Some(main) = app_handle.get_webview_window("main") {
        let _ = main.show();
        let _ = main.unminimize();
        let _ = main.set_focus();
    }
}

/// Close every detached note window (profile switch).
pub(crate) fn close_all_note_windows(app_handle: &AppHandle) {
    for (label, window) in app_handle.webview_windows() {
        if label.starts_with("note-") {
            let _ = window.close();
        }
    }
}
```

- [ ] **Step 5: Register commands in `src-tauri/src/lib.rs`**

After line 105 (`commands::window::recenter_mini_window,`) add:

```rust
            commands::window::open_note_window,
            commands::window::close_note_window,
            commands::window::show_main_window,
```

- [ ] **Step 6: Close note windows on profile switch**

In `src-tauri/src/commands/profiles.rs`, inside `switch_profile` (line ~161), right after the profile-exists check (after the `return Err(...)` block ending line ~168):

```rust
    // Detached note windows belong to the outgoing profile — close them all
    // before any path swaps so they can't write into the new profile.
    crate::commands::window::close_all_note_windows(&app);
```

- [ ] **Step 7: Run tests + full check**

```powershell
cd src-tauri; cargo test --no-default-features note_window_tests; cargo check --no-default-features; cd ..
```
Expected: `test result: ok. 1 passed` and a clean `cargo check`.

- [ ] **Step 8: Commit**

```powershell
git add src-tauri/src/window.rs src-tauri/src/commands/window.rs src-tauri/src/lib.rs src-tauri/src/commands/profiles.rs
git commit -m "feat: add note window open/close/show commands with close-as-reattach signal"
```

---

### Task 3: Capability, Vite entry, placeholder shell

**Files:**
- Create: `src-tauri/capabilities/note.json`
- Create: `note.html` (repo root, next to `mini.html`)
- Create: `src/note-window.tsx` (placeholder — completed in Task 9)
- Modify: `vite.config.ts:20-23`

**Interfaces:**
- Produces: window label pattern `note-*` granted `core:default` + events + store + opener + set-always-on-top/set-title/close; `note.html?noteId=<uuid>` URL contract (consumed by Task 2's Rust and Task 9's entry).

- [ ] **Step 1: Create `src-tauri/capabilities/note.json`**

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "note",
  "description": "Capability for detached note windows",
  "windows": ["note-*"],
  "permissions": [
    "core:default",
    "core:event:allow-listen",
    "core:event:allow-emit",
    "core:window:allow-close",
    "core:window:allow-set-always-on-top",
    "core:window:allow-set-title",
    "store:default",
    "opener:default"
  ]
}
```

Verify `src-tauri/tauri.conf.json` has NO `app.security.capabilities` allowlist (capabilities auto-load from the directory — `mini.json` works this way). If one exists, append `"note"` to it.

- [ ] **Step 2: Create `note.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Lexena - Note</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/note-window.tsx"></script>
  </body>
</html>
```

- [ ] **Step 3: Add the Vite input in `vite.config.ts`**

```ts
      input: {
        main: path.resolve(__dirname, 'index.html'),
        mini: path.resolve(__dirname, 'mini.html'),
        note: path.resolve(__dirname, 'note.html'),
      },
```

- [ ] **Step 4: Create the placeholder `src/note-window.tsx`**

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "./i18n";
import "./App.css";

// Design-system scope (same as main.tsx) — the detached window is a normal
// opaque native window, so the opaque `.vt-app` background is correct here.
document.body.classList.add("vt-app");

const params = new URLSearchParams(window.location.search);
const noteId = params.get("noteId");

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <div style={{ padding: 16 }}>{noteId}</div>
  </React.StrictMode>,
);
```

- [ ] **Step 5: Verify the build**

Run: `pnpm build`
Expected: PASS (three entries bundled — check `dist/note.html` exists).

- [ ] **Step 6: Commit**

```powershell
git add src-tauri/capabilities/note.json note.html src/note-window.tsx vite.config.ts
git commit -m "feat: add note window entry point and capability"
```

**Checkpoint (user):** ask the user to run `pnpm tauri dev`, open DevTools console in the main window and run:
`window.__TAURI__ === undefined ? "no api" : "ok"` — then from the console: nothing yet to click; instead ask them to test the command directly once a note exists: `await window.__TAURI_INTERNALS__.invoke("open_note_window", { noteId: "<id d'une note existante>" })`. Expected: a native window opens showing the note id; closing it is fine. (If `__TAURI_INTERNALS__` is unavailable, skip — Task 10's UI button will exercise this path.)

---

### Task 4: Shared secondary-window bootstrap (extract from mini)

**Files:**
- Create: `src/lib/window-bootstrap.ts`
- Modify: `src/hooks/useMiniWindowState.ts:112-190, 315-333`

**Interfaces:**
- Produces: `bootstrapSecondaryWindow(): Promise<{ settings: AppSettings["settings"] | null; unlisten: () => void }>` — loads profile settings once, applies theme, subscribes to `theme-changed` + `language-changed`. Consumed by the mini (here) and the detached shell (Task 9).

- [ ] **Step 1: Create `src/lib/window-bootstrap.ts`**

```ts
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { Store } from "@tauri-apps/plugin-store";
import i18n from "@/i18n";
import { DEFAULT_SETTINGS, type AppSettings } from "@/lib/settings";
import { applyTheme, type Theme } from "@/lib/theme";

/**
 * Imperative bootstrap shared by secondary windows (mini visualizer and
 * detached note windows): reads the active-profile settings store once to
 * apply the theme, then keeps theme and i18n language in sync with the main
 * window via the existing `theme-changed` / `language-changed` broadcasts.
 *
 * Returns the loaded settings snapshot (or null when unreadable) so callers
 * can pick window-specific values, and an `unlisten` cleanup.
 */
export async function bootstrapSecondaryWindow(): Promise<{
  settings: AppSettings["settings"] | null;
  unlisten: () => void;
}> {
  let settings: AppSettings["settings"] | null = null;
  try {
    const storePath = await invoke<string>("get_active_profile_settings_path");
    const store = await Store.load(storePath);
    const saved = await store.get<AppSettings>("settings");
    settings = saved?.settings ?? null;
  } catch (e) {
    console.log("[window-bootstrap] could not load settings from store", e);
  }

  const theme =
    settings?.theme === "light" || settings?.theme === "dark"
      ? settings.theme
      : DEFAULT_SETTINGS.settings.theme;
  applyTheme(theme);

  const unlistenTheme = await listen<Theme>("theme-changed", (event) => {
    if (event.payload === "light" || event.payload === "dark") {
      applyTheme(event.payload);
    }
  });
  const unlistenLanguage = await listen<string>("language-changed", (event) => {
    i18n.changeLanguage(event.payload);
  });

  return {
    settings,
    unlisten: () => {
      unlistenTheme();
      unlistenLanguage();
    },
  };
}
```

- [ ] **Step 2: Refactor `useMiniWindowState.ts` to use it**

1. Add import: `import { bootstrapSecondaryWindow } from "@/lib/window-bootstrap";`. Remove the now-unused imports `Store` (from `@tauri-apps/plugin-store`) and `applyTheme, type Theme` (keep `DEFAULT_SETTINGS, type AppSettings` — still used for defaults; remove `AppSettings` too if unused after the edit).
2. Add a listener slot at the top of the listeners effect (line ~95, alongside the other `let unlisten...` declarations): `let unlistenBootstrapFn: (() => void) | null = null;`
3. Replace the whole settings-load `try { const storePath = ... } catch (e) {...}` block (lines 116-148) with:

```ts
        const bootstrap = await bootstrapSecondaryWindow();
        unlistenBootstrapFn = bootstrap.unlisten;
        const s = bootstrap.settings;
        if (s) {
          setTranslateMode(Boolean(s.translate_mode));
          setPostProcessEnabled(Boolean(s.post_process_enabled));
          if (s.mini_visualizer_mode) setVisualizerMode(s.mini_visualizer_mode);
          if (typeof s.mini_window_waveform_samples === "number") {
            setWaveformCapacity(s.mini_window_waveform_samples);
          }
          if (typeof s.show_transcription_in_mini_window === "boolean") {
            setShowTranscriptPreview(s.show_transcription_in_mini_window);
          }
          if (s.language) setLanguage(s.language);
          if (
            s.transcription_provider === "Local" ||
            s.transcription_provider === "LexenaCloud"
          ) {
            setProvider(s.transcription_provider);
          }
        }
```

4. Delete the `unlistenLanguageChangedFn = await listen<string>("language-changed", ...)` block (lines ~165-170) and the `unlistenThemeChangedFn = await listen<Theme>("theme-changed", ...)` block (lines ~181-188), plus their `let` declarations and their two lines in the cleanup function.
5. Add to the cleanup function: `if (unlistenBootstrapFn) unlistenBootstrapFn();`

- [ ] **Step 3: Verify**

Run: `pnpm build`
Expected: PASS (type-checks; unused-import errors would fail here).

**Checkpoint (user):** ask the user to run `pnpm tauri dev`, toggle recording (Ctrl+F11) to show the mini window, and confirm: theme correct, live theme switch from settings works, language switch works.

- [ ] **Step 4: Commit**

```powershell
git add src/lib/window-bootstrap.ts src/hooks/useMiniWindowState.ts
git commit -m "refactor: extract shared secondary-window theme/language bootstrap"
```

---

### Task 5: Pure tab-state transitions (TDD)

**Files:**
- Create: `src/lib/notes-window/tab-transitions.ts`
- Test: `src/lib/notes-window/tab-transitions.test.ts`

**Interfaces:**
- Produces (consumed by Task 6):

```ts
export interface NotesTabsState {
  openNoteIds: string[];
  activeNoteId: string | null;
  detachedNoteIds: string[];
}
export function detachNote(state: NotesTabsState, id: string): NotesTabsState;
export function reattachNote(state: NotesTabsState, id: string, opts: { activate: boolean }): NotesTabsState;
export function forgetNote(state: NotesTabsState, id: string): NotesTabsState;
export function mergeDetachedAtLoad(
  persisted: { openNoteIds: string[]; activeNoteId: string | null; detachedNoteIds?: string[] },
  validIds: Set<string>,
): NotesTabsState;
```

- [ ] **Step 1: Write the failing tests** — `src/lib/notes-window/tab-transitions.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  detachNote,
  forgetNote,
  mergeDetachedAtLoad,
  reattachNote,
  type NotesTabsState,
} from "./tab-transitions";

const base: NotesTabsState = {
  openNoteIds: ["a", "b", "c"],
  activeNoteId: "b",
  detachedNoteIds: [],
};

describe("detachNote", () => {
  it("removes the tab and registers the note as detached", () => {
    const next = detachNote(base, "b");
    expect(next.openNoteIds).toEqual(["a", "c"]);
    expect(next.detachedNoteIds).toEqual(["b"]);
  });

  it("moves the active tab to the last remaining tab", () => {
    expect(detachNote(base, "b").activeNoteId).toBe("c");
  });

  it("keeps the active tab when detaching an inactive one", () => {
    expect(detachNote(base, "a").activeNoteId).toBe("b");
  });

  it("detaching the only tab leaves no active note", () => {
    const solo: NotesTabsState = { openNoteIds: ["a"], activeNoteId: "a", detachedNoteIds: [] };
    const next = detachNote(solo, "a");
    expect(next.openNoteIds).toEqual([]);
    expect(next.activeNoteId).toBeNull();
  });

  it("is idempotent on the detached registry", () => {
    const once = detachNote(base, "b");
    const twice = detachNote(once, "b");
    expect(twice.detachedNoteIds).toEqual(["b"]);
  });
});

describe("reattachNote", () => {
  const detached: NotesTabsState = {
    openNoteIds: ["a"],
    activeNoteId: "a",
    detachedNoteIds: ["b"],
  };

  it("silently restores the tab without changing the active note", () => {
    const next = reattachNote(detached, "b", { activate: false });
    expect(next.openNoteIds).toEqual(["a", "b"]);
    expect(next.activeNoteId).toBe("a");
    expect(next.detachedNoteIds).toEqual([]);
  });

  it("activates the restored tab when asked (explicit reattach)", () => {
    expect(reattachNote(detached, "b", { activate: true }).activeNoteId).toBe("b");
  });

  it("ignores ids absent from the registry (delete/explicit flows removed them first)", () => {
    expect(reattachNote(detached, "zz", { activate: false })).toBe(detached);
  });
});

describe("forgetNote", () => {
  it("removes the note from tabs and registry (delete flow)", () => {
    const s: NotesTabsState = { openNoteIds: ["a", "b"], activeNoteId: "b", detachedNoteIds: ["c"] };
    const next = forgetNote(s, "c");
    expect(next.detachedNoteIds).toEqual([]);
    const next2 = forgetNote(s, "b");
    expect(next2.openNoteIds).toEqual(["a"]);
    expect(next2.activeNoteId).toBe("a");
  });
});

describe("mergeDetachedAtLoad", () => {
  const valid = new Set(["a", "b", "c"]);

  it("brings detached notes back as tabs and clears the registry", () => {
    const next = mergeDetachedAtLoad(
      { openNoteIds: ["a"], activeNoteId: "a", detachedNoteIds: ["b", "c"] },
      valid,
    );
    expect(next.openNoteIds).toEqual(["a", "b", "c"]);
    expect(next.detachedNoteIds).toEqual([]);
    expect(next.activeNoteId).toBe("a");
  });

  it("drops invalid ids and duplicates", () => {
    const next = mergeDetachedAtLoad(
      { openNoteIds: ["a", "gone"], activeNoteId: "gone", detachedNoteIds: ["a", "b"] },
      valid,
    );
    expect(next.openNoteIds).toEqual(["a", "b"]);
    expect(next.activeNoteId).toBe("b");
  });

  it("tolerates stores written before the feature (no detachedNoteIds)", () => {
    const next = mergeDetachedAtLoad({ openNoteIds: ["a"], activeNoteId: "a" }, valid);
    expect(next).toEqual({ openNoteIds: ["a"], activeNoteId: "a", detachedNoteIds: [] });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/lib/notes-window/tab-transitions.test.ts`
Expected: FAIL — cannot resolve `./tab-transitions`.

- [ ] **Step 3: Implement** — `src/lib/notes-window/tab-transitions.ts`:

```ts
/**
 * Pure transitions for the notes tab strip + detached-windows registry.
 * Extracted from useNotesWorkflow so the detach/reattach lifecycle
 * (spec §4, docs/superpowers/specs/2026-07-24-detachable-notes-design.md)
 * is unit-testable without React.
 */

export interface NotesTabsState {
  openNoteIds: string[];
  activeNoteId: string | null;
  detachedNoteIds: string[];
}

/** Tab list after removing `id`, active falling back to the last remaining
 *  tab (same behavior as the historical handleCloseNoteTab). */
function closeTab(
  state: NotesTabsState,
  id: string,
): Pick<NotesTabsState, "openNoteIds" | "activeNoteId"> {
  const openNoteIds = state.openNoteIds.filter((nid) => nid !== id);
  const activeNoteId =
    state.activeNoteId === id
      ? openNoteIds.length > 0
        ? openNoteIds[openNoteIds.length - 1]
        : null
      : state.activeNoteId;
  return { openNoteIds, activeNoteId };
}

/** Detach: the note leaves the tab strip and joins the detached registry. */
export function detachNote(state: NotesTabsState, id: string): NotesTabsState {
  const { openNoteIds, activeNoteId } = closeTab(state, id);
  const detachedNoteIds = state.detachedNoteIds.includes(id)
    ? state.detachedNoteIds
    : [...state.detachedNoteIds, id];
  return { openNoteIds, activeNoteId, detachedNoteIds };
}

/** Reattach: only acts when the id is actually in the registry — the guard
 *  that makes `note-window-closed` safe for the delete and explicit-reattach
 *  flows, which remove the id from the registry before closing the window. */
export function reattachNote(
  state: NotesTabsState,
  id: string,
  opts: { activate: boolean },
): NotesTabsState {
  if (!state.detachedNoteIds.includes(id)) return state;
  const detachedNoteIds = state.detachedNoteIds.filter((nid) => nid !== id);
  const openNoteIds = state.openNoteIds.includes(id)
    ? state.openNoteIds
    : [...state.openNoteIds, id];
  return {
    openNoteIds,
    activeNoteId: opts.activate ? id : state.activeNoteId,
    detachedNoteIds,
  };
}

/** Remove the note everywhere (delete flow). */
export function forgetNote(state: NotesTabsState, id: string): NotesTabsState {
  const { openNoteIds, activeNoteId } = closeTab(state, id);
  return {
    openNoteIds,
    activeNoteId,
    detachedNoteIds: state.detachedNoteIds.filter((nid) => nid !== id),
  };
}

/** Startup state: detached notes come back as tabs (spec §2 « redémarrage »),
 *  invalid ids dropped, duplicates removed, registry cleared. Idempotent —
 *  covers clean restart, tray quit and crash alike. */
export function mergeDetachedAtLoad(
  persisted: {
    openNoteIds: string[];
    activeNoteId: string | null;
    detachedNoteIds?: string[];
  },
  validIds: Set<string>,
): NotesTabsState {
  const merged: string[] = [];
  for (const id of [...persisted.openNoteIds, ...(persisted.detachedNoteIds ?? [])]) {
    if (validIds.has(id) && !merged.includes(id)) merged.push(id);
  }
  const activeNoteId =
    persisted.activeNoteId && merged.includes(persisted.activeNoteId)
      ? persisted.activeNoteId
      : merged.length > 0
        ? merged[merged.length - 1]
        : null;
  return { openNoteIds: merged, activeNoteId, detachedNoteIds: [] };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run src/lib/notes-window/tab-transitions.test.ts`
Expected: PASS — 12 tests.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/notes-window/
git commit -m "feat: add pure tab-state transitions for detached note windows"
```

---

### Task 6: Extend useNotesWorkflow with the detached registry

**Files:**
- Modify: `src/hooks/useNotesWorkflow.ts` (full rewrite below)

**Interfaces:**
- Consumes: Task 5 transitions; Rust commands `open_note_window` / `close_note_window` (Task 2).
- Produces (consumed by Task 10's Dashboard wiring): the hook now also returns `detachedNoteIds: string[]`, `handleDetachNote(id: string, atCursor?: boolean): Promise<void>`, `handleNoteWindowClosed(id: string): void`, `handleReattachNote(id: string): void`. `handleDeleteNote` transparently closes a detached window.

- [ ] **Step 1: Replace the body of `src/hooks/useNotesWorkflow.ts`**

Keep the file header (imports/`getTabStore`) shape but the full new content is:

```ts
import { useCallback, useEffect, useRef, useState } from "react";
import { Store } from "@tauri-apps/plugin-store";
import { invoke } from "@tauri-apps/api/core";
import type { NoteMeta } from "@/hooks/useNotes";
import {
  detachNote,
  forgetNote,
  mergeDetachedAtLoad,
  reattachNote,
  type NotesTabsState,
} from "@/lib/notes-window/tab-transitions";

interface UseNotesWorkflowOptions {
  createNote: (folderId?: string | null) => Promise<NoteMeta>;
  deleteNote: (id: string) => Promise<void>;
  notes: NoteMeta[];
  notesLoaded: boolean;
}

interface PersistedTabState {
  openNoteIds: string[];
  activeNoteId: string | null;
  /** Notes currently open in their own detached window. Optional so tab
   *  stores written before this feature keep loading. */
  detachedNoteIds?: string[];
}

const STORE_KEY = "tabs";
const SAVE_DEBOUNCE_MS = 300;

let tabStore: Store | null = null;
async function getTabStore(): Promise<Store> {
  if (!tabStore) {
    const path = await invoke<string>("get_active_profile_notes_tabs_path");
    tabStore = await Store.load(path);
  }
  return tabStore;
}

/**
 * Manages the open-tabs state for the docked notes editor — which notes are
 * open as tabs, which one is active — plus the registry of notes detached
 * into their own OS window (spec 2026-07-24-detachable-notes-design §4).
 *
 * The whole state is persisted per profile; at load, detached notes come
 * back as tabs (the windows themselves are never restored across restarts).
 */
export function useNotesWorkflow({
  createNote,
  deleteNote,
  notes,
  notesLoaded,
}: UseNotesWorkflowOptions) {
  const [openNoteIds, setOpenNoteIds] = useState<string[]>([]);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [detachedNoteIds, setDetachedNoteIds] = useState<string[]>([]);
  const hasLoadedRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applyState = useCallback((next: NotesTabsState) => {
    setOpenNoteIds(next.openNoteIds);
    setActiveNoteId(next.activeNoteId);
    setDetachedNoteIds(next.detachedNoteIds);
  }, []);

  // Load persisted tabs once the notes list is available. Detached notes are
  // merged back into the tab strip (idempotent — covers restart and crash).
  useEffect(() => {
    if (!notesLoaded || hasLoadedRef.current) return;
    let cancelled = false;
    (async () => {
      try {
        const store = await getTabStore();
        const persisted = await store.get<PersistedTabState>(STORE_KEY);
        if (cancelled) return;
        if (persisted) {
          const validIds = new Set(notes.map((n) => n.id));
          applyState(mergeDetachedAtLoad(persisted, validIds));
        }
      } catch (error) {
        console.error("Failed to load persisted note tabs:", error);
      } finally {
        if (!cancelled) hasLoadedRef.current = true;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [notesLoaded, notes, applyState]);

  // Persist tab state on every change, debounced.
  useEffect(() => {
    if (!hasLoadedRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        const store = await getTabStore();
        await store.set(STORE_KEY, { openNoteIds, activeNoteId, detachedNoteIds });
        await store.save();
      } catch (error) {
        console.error("Failed to persist note tabs:", error);
      }
    }, SAVE_DEBOUNCE_MS);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [openNoteIds, activeNoteId, detachedNoteIds]);

  const handleCreateNote = useCallback(async (folderId: string | null = null) => {
    const note = await createNote(folderId);
    setOpenNoteIds((prev) => [...prev, note.id]);
    setActiveNoteId(note.id);
  }, [createNote]);

  const handleOpenNote = useCallback((note: NoteMeta) => {
    setOpenNoteIds((prev) =>
      prev.includes(note.id) ? prev : [...prev, note.id],
    );
    setActiveNoteId(note.id);
  }, []);

  const handleCloseNoteTab = useCallback(
    (id: string) => {
      setOpenNoteIds((prev) => {
        const next = prev.filter((nid) => nid !== id);
        if (activeNoteId === id) {
          setActiveNoteId(next.length > 0 ? next[next.length - 1] : null);
        }
        return next;
      });
    },
    [activeNoteId],
  );

  /** Detach: create/focus the OS window first; only update the tab state
   *  when the window actually opened. */
  const handleDetachNote = useCallback(
    async (id: string, atCursor = false) => {
      try {
        await invoke("open_note_window", { noteId: id, atCursor });
      } catch (error) {
        console.error("Failed to open note window:", error);
        return;
      }
      applyState(detachNote({ openNoteIds, activeNoteId, detachedNoteIds }, id));
    },
    [openNoteIds, activeNoteId, detachedNoteIds, applyState],
  );

  /** Rust `note-window-closed` (native X or any window death): restore the
   *  tab silently — the main window is NOT shown. No-op when the id isn't in
   *  the registry (delete / explicit reattach removed it first). */
  const handleNoteWindowClosed = useCallback(
    (id: string) => {
      applyState(
        reattachNote({ openNoteIds, activeNoteId, detachedNoteIds }, id, {
          activate: false,
        }),
      );
    },
    [openNoteIds, activeNoteId, detachedNoteIds, applyState],
  );

  /** Explicit « réattacher » button: restore + activate the tab. The caller
   *  (bridge) also shows the main window and closes the note window. */
  const handleReattachNote = useCallback(
    (id: string) => {
      applyState(
        reattachNote({ openNoteIds, activeNoteId, detachedNoteIds }, id, {
          activate: true,
        }),
      );
    },
    [openNoteIds, activeNoteId, detachedNoteIds, applyState],
  );

  const handleDeleteNote = useCallback(
    async (id: string) => {
      if (detachedNoteIds.includes(id)) {
        // Remove from the registry BEFORE closing so the note-window-closed
        // handler can't resurrect the tab (spec §4).
        applyState(forgetNote({ openNoteIds, activeNoteId, detachedNoteIds }, id));
        try {
          await invoke("close_note_window", { noteId: id });
        } catch (error) {
          console.error("Failed to close note window:", error);
        }
      } else {
        handleCloseNoteTab(id);
      }
      await deleteNote(id);
    },
    [
      openNoteIds,
      activeNoteId,
      detachedNoteIds,
      applyState,
      handleCloseNoteTab,
      deleteNote,
    ],
  );

  return {
    openNoteIds,
    activeNoteId,
    detachedNoteIds,
    setActiveNoteId,
    handleCreateNote,
    handleOpenNote,
    handleCloseNoteTab,
    handleDeleteNote,
    handleDetachNote,
    handleNoteWindowClosed,
    handleReattachNote,
  };
}
```

- [ ] **Step 2: Verify**

Run: `pnpm build` then `pnpm vitest run src/lib/notes-window/tab-transitions.test.ts`
Expected: both PASS.

- [ ] **Step 3: Commit**

```powershell
git add src/hooks/useNotesWorkflow.ts
git commit -m "feat: track detached note windows in the notes tab workflow"
```

---

### Task 7: Sync plumbing — push-from-disk + remote-update event + external meta

**Files:**
- Modify: `src/lib/sync/notes-store.ts`
- Modify: `src/hooks/useNotes.ts`
- Test: `src/lib/sync/notes-store-detached.test.ts` (create)

**Interfaces:**
- Produces:
  - `export const UPDATE_NOTE_PUSH_DEBOUNCE_MS = 2_000;` and `export function scheduleNoteUpdatePushFromDisk(id: string, delayMs: number): void` in `notes-store.ts` (consumed by Task 10's bridge wiring). Shares the existing `updateNoteDebounceMap`, so `cancelNoteUpdatePush` and `flushPendingNoteUpdates` keep working.
  - `applyRemoteNote` now emits `note-remote-updated { id, updatedAt }` after writing a remote note to disk (consumed by Task 9's detached window).
  - `useNotes()` additionally returns `applyExternalNoteMeta(id: string, title: string, updatedAt: string): void`.

- [ ] **Step 1: Write the failing tests** — `src/lib/sync/notes-store-detached.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));
vi.mock("@tauri-apps/api/event", () => ({ emit: vi.fn() }));

import {
  cancelNoteUpdatePush,
  scheduleNoteUpdatePushFromDisk,
} from "./notes-store";

describe("scheduleNoteUpdatePushFromDisk", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    invokeMock.mockReset();
    invokeMock.mockResolvedValue({
      meta: { id: "n1", title: "T", updatedAt: "2026-07-24T00:00:00Z" },
      content: "<p>x</p>",
    });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("reads the note from disk only when the debounce fires", async () => {
    scheduleNoteUpdatePushFromDisk("n1", 2000);
    expect(invokeMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2000);
    expect(invokeMock).toHaveBeenCalledWith("read_note", { id: "n1" });
  });

  it("coalesces rapid re-schedules into a single read", async () => {
    scheduleNoteUpdatePushFromDisk("n1", 2000);
    await vi.advanceTimersByTimeAsync(1000);
    scheduleNoteUpdatePushFromDisk("n1", 2000);
    await vi.advanceTimersByTimeAsync(2000);
    expect(invokeMock).toHaveBeenCalledTimes(1);
  });

  it("cancelNoteUpdatePush drops the pending push", async () => {
    scheduleNoteUpdatePushFromDisk("n1", 2000);
    cancelNoteUpdatePush("n1");
    await vi.advanceTimersByTimeAsync(3000);
    expect(invokeMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/lib/sync/notes-store-detached.test.ts`
Expected: FAIL — `scheduleNoteUpdatePushFromDisk` is not exported.

- [ ] **Step 3: Implement in `src/lib/sync/notes-store.ts`**

1. Add `import { emit } from "@tauri-apps/api/event";` after the first import line.
2. Below the `const updateNoteDebounceMap = ...` line (~142), add:

```ts
/** Debounce window for the disk → cloud push of a note update. Shared by the
 *  docked editor (useNotes.updateNote) and the detached-window bridge. */
export const UPDATE_NOTE_PUSH_DEBOUNCE_MS = 2_000;

/**
 * Like `scheduleNoteUpdatePush`, but reads meta + content from disk when the
 * debounce fires instead of capturing them at schedule time. Used by the main
 * window when a DETACHED window saved a note: the detached window wrote the
 * disk, the main window owns the sync queue (spec §5) and only knows the id.
 * Shares `updateNoteDebounceMap`, so cancel/flush keep working.
 */
export function scheduleNoteUpdatePushFromDisk(id: string, delayMs: number): void {
  const existing = updateNoteDebounceMap.get(id);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(() => {
    updateNoteDebounceMap.delete(id);
    void (async () => {
      try {
        const { meta, content } = await invoke<{
          meta: LocalNoteMeta;
          content: string;
        }>("read_note", { id });
        await pushNoteUpdate(meta, content);
      } catch (e) {
        console.warn("[notes-store] push-from-disk failed for note", id, e);
      }
    })();
  }, delayMs);
  updateNoteDebounceMap.set(id, timer);
}
```

3. In `useNotes.ts`: delete the local `const UPDATE_NOTE_DEBOUNCE_MS = 2_000;` (line 17), add `UPDATE_NOTE_PUSH_DEBOUNCE_MS` to the existing `@/lib/sync/notes-store` import, and use it in `updateNote` (line 119): `scheduleNoteUpdatePush(id, updated, content, UPDATE_NOTE_PUSH_DEBOUNCE_MS);`
4. In `applyRemoteNote` (notes-store.ts, end of the function), after the `await invoke<void>("import_note_for_backup", ...)` call:

```ts
  // Tell open editors (detached note windows today, docked editor in a
  // follow-up) that this note changed on disk behind their back.
  try {
    await emit("note-remote-updated", {
      id: merged.meta.id,
      updatedAt: merged.meta.updatedAt,
    });
  } catch (e) {
    console.warn("[notes-store] emit note-remote-updated failed", e);
  }
```

5. In `useNotes.ts`, add inside `useNotes()` (after `updateNote`) and expose in the return object:

```ts
  /** Apply title/updatedAt coming from a detached window's save event —
   *  keeps the sidebar fresh without re-reading every note from disk. */
  const applyExternalNoteMeta = useCallback(
    (id: string, title: string, updatedAt: string) => {
      setNotes(prev =>
        prev.map(n => (n.id === id ? { ...n, title, updatedAt } : n)),
      );
    },
    [],
  );
```

(`useNotes.ts` already imports `useCallback`.) Add `applyExternalNoteMeta,` to the returned object.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run src/lib/sync/notes-store-detached.test.ts` then the full suite `pnpm vitest run` (existing notes-store consumers must stay green) and `pnpm build`.
Expected: all PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/sync/notes-store.ts src/lib/sync/notes-store-detached.test.ts src/hooks/useNotes.ts
git commit -m "feat: add disk-based note push scheduling and remote-update event"
```

---

### Task 8: Optional AI/share flags on the editor components

**Files:**
- Modify: `src/components/notes/NotesEditor/NotesEditorContent.tsx`
- Modify: `src/components/notes/NotesEditor/NotesEditorHeader.tsx`
- Modify: `src/components/notes/NotesEditor/NotesEditorFooter.tsx`

**Interfaces:**
- Produces: `NotesEditorContent` accepts `ai?: ReturnType<typeof useAiAssistant>` (optional) and `showShare?: boolean` (default `true`); `NotesEditorHeader` accepts `showShare?: boolean`; `NotesEditorFooter` accepts `isAiLoading?`, `isAiEligible?`, `onAiAction?`, `showAiAction?: boolean` (default `true`). The docked `NotesEditor` keeps passing everything → zero behavior change there.

- [ ] **Step 1: `NotesEditorContent.tsx`**

- Change the props: `ai: ReturnType<typeof useAiAssistant>;` → `ai?: ReturnType<typeof useAiAssistant>;` and add `showShare?: boolean;`.
- Destructure with `showShare = true`.
- Change `if (ai.state === "preview")` → `if (ai && ai.state === "preview")`.
- Change `{ai.state === "loading" && (` → `{ai && ai.state === "loading" && (`.
- Pass the flag to the header: `<NotesEditorHeader ... showShare={showShare} />`.

- [ ] **Step 2: `NotesEditorHeader.tsx`**

- Add `showShare?: boolean;` to the props, destructure with `showShare = true`.
- Change `<ShareNoteButton note={note} />` → `{showShare && <ShareNoteButton note={note} />}`.

- [ ] **Step 3: `NotesEditorFooter.tsx`**

- Change the props: `isAiLoading: boolean;` → `isAiLoading?: boolean;`, `isAiEligible: boolean;` → `isAiEligible?: boolean;`, `onAiAction: (systemPrompt: string) => void;` → `onAiAction?: (systemPrompt: string) => void;`, and add `showAiAction?: boolean;`.
- Destructure with `isAiLoading = false, isAiEligible = false, showAiAction = true`.
- Wrap the AI menu:

```tsx
            {showAiAction && onAiAction && (
              <AiActionMenu
                onAction={onAiAction}
                isLoading={isAiLoading}
                disabled={!editorText.trim() || !isAiEligible}
                disabledReason={
                  !isAiEligible
                    ? t("ai.cloudUpsellTooltip")
                    : undefined
                }
              />
            )}
```

- [ ] **Step 4: Verify**

Run: `pnpm build` and `pnpm vitest run`
Expected: PASS (the docked NotesEditor still passes all props explicitly).

- [ ] **Step 5: Commit**

```powershell
git add src/components/notes/NotesEditor/NotesEditorContent.tsx src/components/notes/NotesEditor/NotesEditorHeader.tsx src/components/notes/NotesEditor/NotesEditorFooter.tsx
git commit -m "refactor: make AI and share affordances optional in notes editor chrome"
```

---

### Task 9: The detached window (hook + shell + real entry + i18n)

**Files:**
- Create: `src/hooks/useDetachedNote.ts`
- Create: `src/components/note-window/DetachedNoteShell.tsx`
- Modify: `src/note-window.tsx` (replace the Task 3 placeholder)
- Modify: `src/locales/fr.json` + `src/locales/en.json`

**Interfaces:**
- Consumes: `bootstrapSecondaryWindow` (Task 4), the editor flags (Task 8), Rust commands (Task 2), event names from the contract table.
- Produces: the full detached-window UI. Emits `note-detached-updated`, `note-reattach-request`, `note-detached-delete-request`, `note-open-request`, `note-toggle-local-only-request`; listens to `note-remote-updated`, `note-meta-updated`.

- [ ] **Step 1: Add the i18n keys**

In `src/locales/fr.json`, inside the `"notes"` object (sibling of `"newNote"` at line ~696):

```json
    "detach": {
      "tooltip": "Ouvrir dans une fenêtre séparée",
      "indicator": "Ouverte dans une fenêtre séparée",
      "reattach": "Réattacher à la fenêtre principale",
      "pin": "Épingler au premier plan",
      "unpin": "Ne plus épingler",
      "loadError": "Impossible de charger cette note"
    },
```

In `src/locales/en.json`, same location in its `"notes"` object:

```json
    "detach": {
      "tooltip": "Open in a separate window",
      "indicator": "Open in its own window",
      "reattach": "Reattach to the main window",
      "pin": "Pin on top",
      "unpin": "Unpin",
      "loadError": "Could not load this note"
    },
```

- [ ] **Step 2: Create `src/hooks/useDetachedNote.ts`**

```ts
import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { type NoteData, type NoteMeta } from "@/hooks/useNotes";
import { type FolderMeta } from "@/hooks/useFolders";

/** A remote (sync pull) content reload is skipped when the user typed in this
 *  window recently — local edits win and the next save resolves via LWW. */
const REMOTE_RELOAD_QUIET_MS = 3_000;

/**
 * Data layer of a detached note window (spec §5): loads the note + the
 * notes/folders lists (for wiki-links and the breadcrumb), saves to disk
 * directly via `update_note`, and talks to the main window through events.
 * NO sync state lives here — the main window owns the queue.
 */
export function useDetachedNote(noteId: string) {
  const [meta, setMeta] = useState<NoteMeta | null>(null);
  const [notes, setNotes] = useState<NoteMeta[]>([]);
  const [folders, setFolders] = useState<FolderMeta[]>([]);
  const [loadFailed, setLoadFailed] = useState(false);
  const lastLocalEditRef = useRef(0);

  const refreshLists = useCallback(async () => {
    try {
      const [allNotes, allFolders] = await Promise.all([
        invoke<NoteMeta[]>("list_notes"),
        invoke<FolderMeta[]>("list_folders"),
      ]);
      setNotes(allNotes);
      setFolders(allFolders);
      const fresh = allNotes.find((n) => n.id === noteId);
      if (fresh) {
        setMeta(fresh);
      } else if (!allNotes.some((n) => n.id === noteId)) {
        setLoadFailed(true);
      }
    } catch (e) {
      console.error("[note-window] failed to refresh lists:", e);
      setLoadFailed(true);
    }
  }, [noteId]);

  // Initial load + refresh on window focus (picks up folder moves, favorite
  // toggles and renames done in the main window while we were unfocused).
  useEffect(() => {
    void refreshLists();
    const win = getCurrentWindow();
    const unlistenPromise = win.onFocusChanged(({ payload: focused }) => {
      if (focused) void refreshLists();
    });
    return () => {
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, [refreshLists]);

  // Keep the OS window title in sync with the note title.
  useEffect(() => {
    const title = meta?.title?.trim();
    void getCurrentWindow().setTitle(title ? `${title} — Lexena` : "Lexena");
  }, [meta?.title]);

  // Meta pushed back by the main window (local-only toggle round-trip).
  useEffect(() => {
    const unlistenPromise = listen<{ meta: NoteMeta }>(
      "note-meta-updated",
      (event) => {
        if (event.payload.meta.id === noteId) setMeta(event.payload.meta);
      },
    );
    return () => {
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, [noteId]);

  const readNote = useCallback(
    (id: string) => invoke<NoteData>("read_note", { id }),
    [],
  );

  /** Immediate disk write + broadcast: the (possibly hidden) main window
   *  refreshes its sidebar metadata and schedules the cloud push. */
  const handleUpdateNote = useCallback(
    async (id: string, content: string, title: string) => {
      lastLocalEditRef.current = Date.now();
      try {
        const updated = await invoke<NoteMeta>("update_note", {
          id,
          content,
          title,
        });
        setMeta(updated);
        setNotes((prev) => prev.map((n) => (n.id === id ? updated : n)));
        await emit("note-detached-updated", {
          id,
          title: updated.title,
          updatedAt: updated.updatedAt,
        });
      } catch (e) {
        console.error("[note-window] failed to save note:", e);
      }
    },
    [],
  );

  const markLocalEdit = useCallback(() => {
    lastLocalEditRef.current = Date.now();
  }, []);

  const isQuiescent = useCallback(
    () => Date.now() - lastLocalEditRef.current > REMOTE_RELOAD_QUIET_MS,
    [],
  );

  /** Re-read the note from disk (remote-update reload). Updates meta and
   *  returns the fresh data so the caller can feed the editor. */
  const reloadFromDisk = useCallback(async (): Promise<NoteData | null> => {
    try {
      const data = await invoke<NoteData>("read_note", { id: noteId });
      setMeta(data.meta);
      return data;
    } catch (e) {
      console.error("[note-window] failed to reload note:", e);
      return null;
    }
  }, [noteId]);

  const requestReattach = useCallback(() => {
    void emit("note-reattach-request", { id: noteId });
  }, [noteId]);

  const requestDelete = useCallback(() => {
    void emit("note-detached-delete-request", { id: noteId });
  }, [noteId]);

  const requestToggleLocalOnly = useCallback(() => {
    void emit("note-toggle-local-only-request", { id: noteId });
  }, [noteId]);

  const openNoteInMain = useCallback((id: string) => {
    void emit("note-open-request", { id });
  }, []);

  return {
    meta,
    notes,
    folders,
    loadFailed,
    readNote,
    handleUpdateNote,
    markLocalEdit,
    isQuiescent,
    reloadFromDisk,
    requestReattach,
    requestDelete,
    requestToggleLocalOnly,
    openNoteInMain,
  };
}
```

- [ ] **Step 3: Create `src/components/note-window/DetachedNoteShell.tsx`**

```tsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Toaster } from "sonner";
import { ArrowLeftToLine, Pin, PinOff } from "lucide-react";
import { bootstrapSecondaryWindow } from "@/lib/window-bootstrap";
import { useDetachedNote } from "@/hooks/useDetachedNote";
import { useNotesEditorInstance } from "@/hooks/useNotesEditorInstance";
import { useLinkEditor } from "@/hooks/useLinkEditor";
import { createNoteSynced } from "@/lib/sync/notes-store";
import { type NoteMeta } from "@/hooks/useNotes";
import { type Theme, DEFAULT_THEME } from "@/lib/theme";
import { NoteLinkProvider } from "@/components/notes/NotesEditor/NoteLinkContext";
import { NotesEditorContent } from "@/components/notes/NotesEditor/NotesEditorContent";
import { NotesEditorFooter } from "@/components/notes/NotesEditor/NotesEditorFooter";
import { ConfirmDeleteDialog } from "@/components/notes/ConfirmDeleteDialog";
import { BrokenNoteLinkDialog } from "@/components/notes/NotesEditor/BrokenNoteLinkDialog";

/**
 * Detached note window: native title bar, a thin toolbar (pin + reattach),
 * the full TipTap editor, and the standard footer without AI/share
 * (spec §7). One window = one note; the tab lives here, not in the main
 * window, until the window closes (close = reattach).
 */
export function DetachedNoteShell({ noteId }: { noteId: string }) {
  const { t } = useTranslation();
  const [pinned, setPinned] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>(DEFAULT_THEME);
  const [brokenDialog, setBrokenDialog] = useState<{
    title: string;
    onResolved: (newId: string) => void;
  } | null>(null);

  const {
    meta,
    notes,
    folders,
    loadFailed,
    readNote,
    handleUpdateNote,
    markLocalEdit,
    isQuiescent,
    reloadFromDisk,
    requestReattach,
    requestDelete,
    requestToggleLocalOnly,
    openNoteInMain,
  } = useDetachedNote(noteId);

  // Theme + language bootstrap (shared with the mini window). The local
  // `theme` state only feeds the Toaster — applyTheme handles the DOM.
  useEffect(() => {
    let cleanup: (() => void) | null = null;
    let unlistenTheme: (() => void) | null = null;
    void (async () => {
      const bootstrap = await bootstrapSecondaryWindow();
      cleanup = bootstrap.unlisten;
      if (bootstrap.settings?.theme === "light" || bootstrap.settings?.theme === "dark") {
        setTheme(bootstrap.settings.theme);
      }
      unlistenTheme = await listen<Theme>("theme-changed", (event) => {
        if (event.payload === "light" || event.payload === "dark") {
          setTheme(event.payload);
        }
      });
    })();
    return () => {
      cleanup?.();
      unlistenTheme?.();
    };
  }, []);

  const openNotes = useMemo(() => (meta ? [meta] : []), [meta]);

  const linkRefsRef = useRef({ notes, activeNoteId: noteId });
  linkRefsRef.current = { notes, activeNoteId: noteId };
  const getNoteLinkRefs = useRef(() => linkRefsRef.current).current;

  const { editor, isLoadingContent, loadedNoteId, flushSave } =
    useNotesEditorInstance({
      openNotes,
      activeNoteId: meta ? noteId : null,
      readNote,
      onUpdateNote: handleUpdateNote,
      getNoteLinkRefs,
    });

  const linkEditor = useLinkEditor(editor);

  // Track local typing so a remote reload never clobbers in-flight edits.
  useEffect(() => {
    if (!editor) return;
    editor.on("update", markLocalEdit);
    return () => {
      editor.off("update", markLocalEdit);
    };
  }, [editor, markLocalEdit]);

  // A sync pull rewrote this note on disk: reload when quiescent, otherwise
  // keep local edits (next save wins via LWW — spec §5).
  useEffect(() => {
    const unlistenPromise = listen<{ id: string }>(
      "note-remote-updated",
      async (event) => {
        if (event.payload.id !== noteId || !editor) return;
        if (!isQuiescent()) return;
        const data = await reloadFromDisk();
        if (data) {
          editor.commands.setContent(data.content, { emitUpdate: false });
        }
      },
    );
    return () => {
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, [noteId, editor, isQuiescent, reloadFromDisk]);

  const togglePin = useCallback(async () => {
    const next = !pinned;
    try {
      await getCurrentWindow().setAlwaysOnTop(next);
      setPinned(next);
    } catch (e) {
      console.error("[note-window] failed to toggle pin:", e);
    }
  }, [pinned]);

  const existingNoteIds = useMemo(
    () => new Set(notes.map((n) => n.id)),
    [notes],
  );

  const linkContextValue = useMemo(
    () => ({
      notes,
      existingNoteIds,
      activeNoteId: noteId,
      // Clicking a [[link]] in a detached window opens the target in the
      // MAIN window (spec §5) — unless the target is itself detached, which
      // the main-window bridge resolves by focusing that window.
      onOpenNote: openNoteInMain,
      onRequestRecreate: (
        attrs: { id: string; title: string },
        onResolved: (newId: string) => void,
      ) => {
        setBrokenDialog({ title: attrs.title, onResolved });
      },
    }),
    [notes, existingNoteIds, noteId, openNoteInMain],
  );

  const handleRecreateConfirm = useCallback(async () => {
    if (!brokenDialog) return;
    const { title, onResolved } = brokenDialog;
    setBrokenDialog(null);
    try {
      const created = await createNoteSynced(null);
      const safeTitle = title
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      const seeded = await invoke<NoteMeta>("update_note", {
        id: created.id,
        content: `<h1>${safeTitle}</h1><p></p>`,
        title: title || created.title,
      });
      await emit("note-detached-updated", {
        id: seeded.id,
        title: seeded.title,
        updatedAt: seeded.updatedAt,
      });
      onResolved(created.id);
      flushSave();
      openNoteInMain(created.id);
    } catch (e) {
      console.error("[note-window] failed to recreate linked note:", e);
    }
  }, [brokenDialog, flushSave, openNoteInMain]);

  const activeFolder = meta?.folderId
    ? folders.find((f) => f.id === meta.folderId) ?? null
    : null;

  if (loadFailed) {
    return (
      <div
        className="vt-app notes-shell flex items-center justify-center h-screen text-sm"
        style={{ background: "var(--vt-bg)", color: "var(--vt-fg-3)" }}
      >
        {t("notes.detach.loadError")}
      </div>
    );
  }

  return (
    <NoteLinkProvider value={linkContextValue}>
      <div
        className="vt-app notes-shell flex flex-col h-screen overflow-hidden"
        style={{ background: "var(--vt-bg)" }}
      >
        <div
          className="flex items-center justify-end gap-1 px-2 py-1 shrink-0 select-none"
          style={{
            borderBottom: "1px solid var(--vt-border)",
            background: "var(--vt-panel)",
          }}
        >
          <button
            type="button"
            className="footer-action"
            style={pinned ? { color: "var(--vt-accent)" } : undefined}
            onClick={() => void togglePin()}
            title={pinned ? t("notes.detach.unpin") : t("notes.detach.pin")}
            aria-label={pinned ? t("notes.detach.unpin") : t("notes.detach.pin")}
          >
            {pinned ? (
              <PinOff className="w-3.5 h-3.5" />
            ) : (
              <Pin className="w-3.5 h-3.5" />
            )}
          </button>
          <button
            type="button"
            className="footer-action"
            onClick={requestReattach}
            title={t("notes.detach.reattach")}
            aria-label={t("notes.detach.reattach")}
          >
            <ArrowLeftToLine className="w-3.5 h-3.5" />
          </button>
        </div>

        <NotesEditorContent
          editor={editor}
          hasActiveNote={meta !== null}
          isLoadingContent={isLoadingContent}
          loadedNoteId={loadedNoteId}
          activeNote={meta}
          activeFolder={activeFolder}
          linkEditor={linkEditor}
          onToggleLocalOnly={requestToggleLocalOnly}
          showShare={false}
        />

        <NotesEditorFooter
          editor={editor}
          hasActiveNote={meta !== null}
          loadedNoteId={loadedNoteId}
          activeNoteId={meta ? noteId : null}
          showAiAction={false}
          onRequestDelete={() => setConfirmDeleteOpen(true)}
        />

        <ConfirmDeleteDialog
          open={confirmDeleteOpen}
          title={t("notes.editor.deleteConfirmTitle")}
          description={t("notes.editor.deleteConfirmDesc")}
          onOpenChange={setConfirmDeleteOpen}
          onConfirm={() => {
            setConfirmDeleteOpen(false);
            requestDelete();
          }}
        />

        <BrokenNoteLinkDialog
          open={brokenDialog !== null}
          title={brokenDialog?.title ?? ""}
          onOpenChange={(open) => {
            if (!open) setBrokenDialog(null);
          }}
          onConfirm={() => void handleRecreateConfirm()}
        />

        <Toaster position="bottom-right" theme={theme} />
      </div>
    </NoteLinkProvider>
  );
}
```

- [ ] **Step 4: Replace `src/note-window.tsx` with the real entry**

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "./i18n";
import "./App.css";
import { DetachedNoteShell } from "@/components/note-window/DetachedNoteShell";

// Design-system scope (same as main.tsx) — the detached window is a normal
// opaque native window, so the opaque `.vt-app` background is correct here.
document.body.classList.add("vt-app");

const params = new URLSearchParams(window.location.search);
const noteId = params.get("noteId");

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {noteId ? <DetachedNoteShell noteId={noteId} /> : null}
  </React.StrictMode>,
);
```

- [ ] **Step 5: Verify**

Run: `pnpm build` and `pnpm vitest run`
Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/hooks/useDetachedNote.ts src/components/note-window/ src/note-window.tsx src/locales/fr.json src/locales/en.json
git commit -m "feat: implement detached note window shell with pin and reattach"
```

---

### Task 10: Main-window bridge + detach icon + sidebar indicator + wiring

**Files:**
- Create: `src/hooks/useDetachedNotesBridge.ts`
- Test: `src/hooks/useDetachedNotesBridge.test.ts`
- Modify: `src/components/Dashboard.tsx`
- Modify: `src/components/notes/NotesEditor/NotesEditor.tsx` + `NotesEditorTitleBar.tsx`
- Modify: `src/components/dashboard/DashboardSidebar.tsx` + `src/components/notes/NotesSidebarSection.tsx`
- Modify: `docs/superpowers/specs/2026-07-24-detachable-notes-design.md` (event table)

**Interfaces:**
- Consumes: Task 6 workflow handlers, Task 7 `applyExternalNoteMeta` + `scheduleNoteUpdatePushFromDisk` + `UPDATE_NOTE_PUSH_DEBOUNCE_MS`, Rust commands.
- Produces: `useDetachedNotesBridge(handlers: DetachedNotesBridgeHandlers): void` — the single place the main window subscribes to detached-window events.

- [ ] **Step 1: Write the failing bridge test** — `src/hooks/useDetachedNotesBridge.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

type Handler = (event: { payload: unknown }) => void;
const listeners = vi.hoisted(() => new Map<string, Handler>());
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async (name: string, handler: Handler) => {
    listeners.set(name, handler);
    return () => listeners.delete(name);
  }),
}));

import { useDetachedNotesBridge } from "./useDetachedNotesBridge";

function makeHandlers() {
  return {
    onWindowClosed: vi.fn(),
    onReattachRequest: vi.fn(),
    onOpenRequest: vi.fn(),
    onDeleteRequest: vi.fn(),
    onDetachedUpdated: vi.fn(),
    onToggleLocalOnlyRequest: vi.fn(),
  };
}

describe("useDetachedNotesBridge", () => {
  it("routes each event to its handler with the note id", async () => {
    const handlers = makeHandlers();
    renderHook(() => useDetachedNotesBridge(handlers));
    // listen() registrations are async — flush microtasks.
    await Promise.resolve();

    listeners.get("note-window-closed")!({ payload: { noteId: "n1" } });
    expect(handlers.onWindowClosed).toHaveBeenCalledWith("n1");

    listeners.get("note-reattach-request")!({ payload: { id: "n2" } });
    expect(handlers.onReattachRequest).toHaveBeenCalledWith("n2");

    listeners.get("note-open-request")!({ payload: { id: "n3" } });
    expect(handlers.onOpenRequest).toHaveBeenCalledWith("n3");

    listeners.get("note-detached-delete-request")!({ payload: { id: "n4" } });
    expect(handlers.onDeleteRequest).toHaveBeenCalledWith("n4");

    const updatePayload = { id: "n5", title: "T", updatedAt: "2026-07-24" };
    listeners.get("note-detached-updated")!({ payload: updatePayload });
    expect(handlers.onDetachedUpdated).toHaveBeenCalledWith(updatePayload);

    listeners.get("note-toggle-local-only-request")!({ payload: { id: "n6" } });
    expect(handlers.onToggleLocalOnlyRequest).toHaveBeenCalledWith("n6");
  });

  it("uses the LATEST handlers (ref pattern), not the mount-time ones", async () => {
    const first = makeHandlers();
    const { rerender } = renderHook(
      ({ h }) => useDetachedNotesBridge(h),
      { initialProps: { h: first } },
    );
    await Promise.resolve();
    const second = makeHandlers();
    rerender({ h: second });
    listeners.get("note-window-closed")!({ payload: { noteId: "n1" } });
    expect(first.onWindowClosed).not.toHaveBeenCalled();
    expect(second.onWindowClosed).toHaveBeenCalledWith("n1");
  });
});
```

(If `@testing-library/react` is not already a devDependency, check `package.json`; the project's existing component tests — e.g. `ShareNoteButton.test.tsx` — already use it.)

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/hooks/useDetachedNotesBridge.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/hooks/useDetachedNotesBridge.ts`**

```ts
import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";

export interface DetachedNotesBridgeHandlers {
  /** Rust `note-window-closed` — silent tab restore (native X). */
  onWindowClosed: (id: string) => void;
  /** « Réattacher » button — restore + activate + show main. */
  onReattachRequest: (id: string) => void;
  /** Wiki-link clicked in a detached window. */
  onOpenRequest: (id: string) => void;
  /** Delete confirmed in a detached window — canonical delete flow. */
  onDeleteRequest: (id: string) => void;
  /** A detached window saved the note to disk. */
  onDetachedUpdated: (payload: { id: string; title: string; updatedAt: string }) => void;
  /** Local-only toggle clicked in a detached window. */
  onToggleLocalOnlyRequest: (id: string) => void;
}

/**
 * Main-window side of the detached note windows (spec §5): subscribes once to
 * every event a detached window (or Rust) can emit and routes it to the
 * workflow. Handlers live in a ref so the listeners registered at mount
 * always call the freshest closures.
 */
export function useDetachedNotesBridge(handlers: DetachedNotesBridgeHandlers) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const unlistenPromises = [
      listen<{ noteId: string }>("note-window-closed", (e) =>
        handlersRef.current.onWindowClosed(e.payload.noteId),
      ),
      listen<{ id: string }>("note-reattach-request", (e) =>
        handlersRef.current.onReattachRequest(e.payload.id),
      ),
      listen<{ id: string }>("note-open-request", (e) =>
        handlersRef.current.onOpenRequest(e.payload.id),
      ),
      listen<{ id: string }>("note-detached-delete-request", (e) =>
        handlersRef.current.onDeleteRequest(e.payload.id),
      ),
      listen<{ id: string; title: string; updatedAt: string }>(
        "note-detached-updated",
        (e) => handlersRef.current.onDetachedUpdated(e.payload),
      ),
      listen<{ id: string }>("note-toggle-local-only-request", (e) =>
        handlersRef.current.onToggleLocalOnlyRequest(e.payload.id),
      ),
    ];
    return () => {
      for (const p of unlistenPromises) void p.then((unlisten) => unlisten());
    };
  }, []);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run src/hooks/useDetachedNotesBridge.test.ts`
Expected: PASS — 2 tests.

- [ ] **Step 5: Wire the bridge in `src/components/Dashboard.tsx`**

1. Add imports:

```ts
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { useDetachedNotesBridge } from "@/hooks/useDetachedNotesBridge";
import {
  scheduleNoteUpdatePushFromDisk,
  UPDATE_NOTE_PUSH_DEBOUNCE_MS,
} from "@/lib/sync/notes-store";
```

2. Destructure the new fields from `useNotes()` (line ~79-92): add `applyExternalNoteMeta,` — and from `useNotesWorkflow` (line ~115-128): add `detachedNoteIds, handleDetachNote, handleNoteWindowClosed, handleReattachNote,`.
3. Replace `handleOpenNoteFromSidebar` (line ~130-136) with:

```ts
  const handleOpenNoteFromSidebar = useCallback(
    (note: NoteMeta) => {
      if (detachedNoteIds.includes(note.id)) {
        // Already detached — focus its window instead of opening a tab.
        void invoke("open_note_window", { noteId: note.id }).catch((e) =>
          console.error("Failed to focus note window:", e),
        );
        return;
      }
      handleOpenNote(note);
      setActiveTab("notes");
    },
    [detachedNoteIds, handleOpenNote],
  );
```

4. After `handleOpenNoteInTabById` (line ~182), add the bridge handlers + hook call:

```ts
  const handleReattachRequestFromDetached = useCallback(
    async (id: string) => {
      handleReattachNote(id);
      setActiveTab("notes");
      try {
        await invoke("show_main_window");
      } catch (e) {
        console.error("Failed to show main window:", e);
      }
      try {
        await invoke("close_note_window", { noteId: id });
      } catch (e) {
        console.error("Failed to close note window:", e);
      }
    },
    [handleReattachNote],
  );

  const handleOpenRequestFromDetached = useCallback(
    async (id: string) => {
      if (detachedNoteIds.includes(id)) {
        try {
          await invoke("open_note_window", { noteId: id });
        } catch (e) {
          console.error("Failed to focus note window:", e);
        }
        return;
      }
      // The target may be brand new (recreated broken link) — refresh first.
      await reloadNotes();
      handleOpenNoteInTabById(id);
      setActiveTab("notes");
      try {
        await invoke("show_main_window");
      } catch (e) {
        console.error("Failed to show main window:", e);
      }
    },
    [detachedNoteIds, reloadNotes, handleOpenNoteInTabById],
  );

  const handleDetachedUpdated = useCallback(
    (payload: { id: string; title: string; updatedAt: string }) => {
      applyExternalNoteMeta(payload.id, payload.title, payload.updatedAt);
      // The detached window wrote the disk; the main window owns the sync
      // queue and ships the coalesced state after the debounce window.
      scheduleNoteUpdatePushFromDisk(payload.id, UPDATE_NOTE_PUSH_DEBOUNCE_MS);
    },
    [applyExternalNoteMeta],
  );

  const handleToggleLocalOnlyFromDetached = useCallback(
    async (id: string) => {
      try {
        await toggleLocalOnly(id);
        const data = await readNote(id);
        await emit("note-meta-updated", { meta: data.meta });
      } catch (e) {
        console.error("Failed to toggle local-only from detached window:", e);
      }
    },
    [toggleLocalOnly, readNote],
  );

  useDetachedNotesBridge({
    onWindowClosed: handleNoteWindowClosed,
    onReattachRequest: (id) => void handleReattachRequestFromDetached(id),
    onOpenRequest: (id) => void handleOpenRequestFromDetached(id),
    onDeleteRequest: (id) => void handleDeleteNote(id),
    onDetachedUpdated: handleDetachedUpdated,
    onToggleLocalOnlyRequest: (id) => void handleToggleLocalOnlyFromDetached(id),
  });
```

5. Pass the detach handler to the editor: in the `<NotesEditor ...>` JSX (line ~346), add `onDetachNote={(id) => void handleDetachNote(id)}`.
6. Pass the registry to the sidebar: find the `<DashboardSidebar ...>` JSX and add `detachedNoteIds={detachedNoteIds}`.

- [ ] **Step 6: Detach icon on the active tab**

`src/components/notes/NotesEditor/NotesEditor.tsx`:
- Add to `NotesEditorProps`: `onDetachNote: (id: string) => void;`, destructure it, and pass `onDetachNote={onDetachNote}` to `<NotesEditorTitleBar ...>`.

`src/components/notes/NotesEditor/NotesEditorTitleBar.tsx`:
- Add `AppWindow` to the lucide-react import.
- Add to `NotesEditorTitleBarProps`: `onDetachNote: (id: string) => void;` and destructure it.
- In the tab JSX, between `<span className="notes-tab-title">…</span>` and the close `<span>`, insert:

```tsx
              {isActive && (
                <span
                  className="notes-tab-close"
                  title={t("notes.detach.tooltip")}
                  aria-label={t("notes.detach.tooltip")}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDetachNote(note.id);
                  }}
                >
                  <AppWindow className="w-3 h-3" />
                </span>
              )}
```

- [ ] **Step 7: Sidebar indicator**

`src/components/dashboard/DashboardSidebar.tsx`: add `detachedNoteIds: string[];` to the props interface (near `onOpenNote`, line ~86), destructure it (line ~126), and pass `detachedNoteIds={detachedNoteIds}` to `<NotesSidebarSection ...>` (line ~238).

`src/components/notes/NotesSidebarSection.tsx`:
- Add `AppWindow` to the lucide-react import.
- Add `detachedNoteIds: string[];` to the section's props type and destructure it.
- Add `isDetached?: boolean;` to `NoteItemProps`.
- In `NoteItem`, right after the `note.localOnly && (...)` indicator block (line ~205-214), insert:

```tsx
      {isDetached && (
        <span
          className="shrink-0"
          style={{ color: "var(--vt-fg-4)" }}
          title={t('notes.detach.indicator')}
          aria-label={t('notes.detach.indicator')}
        >
          <AppWindow className="w-3 h-3" />
        </span>
      )}
```

- Grep the file for every `<SortableNoteItem` and `<NoteItem` call site (they spread shared props) and add `isDetached={detachedNoteIds.includes(note.id)}` at each one.

- [ ] **Step 8: Update the spec's event table**

In `docs/superpowers/specs/2026-07-24-detachable-notes-design.md` §5 « Récapitulatif des événements », add two rows (implementation refinement discovered during planning — the local-only toggle must round-trip through the main window because the sync gate lives there):

```markdown
| `note-toggle-local-only-request` | fenêtre note → main | `{ id }` |
| `note-meta-updated` | main → broadcast | `{ meta: NoteMeta }` |
```

- [ ] **Step 9: Verify**

Run: `pnpm build` and `pnpm vitest run`
Expected: PASS.

- [ ] **Step 10: Commit**

```powershell
git add src/hooks/useDetachedNotesBridge.ts src/hooks/useDetachedNotesBridge.test.ts src/components/Dashboard.tsx src/components/notes/NotesEditor/NotesEditor.tsx src/components/notes/NotesEditor/NotesEditorTitleBar.tsx src/components/dashboard/DashboardSidebar.tsx src/components/notes/NotesSidebarSection.tsx docs/superpowers/specs/2026-07-24-detachable-notes-design.md
git commit -m "feat: wire detached note windows into the main dashboard"
```

---

### Task 11: E2E checklist, full verification, PR 1

**Files:**
- Create: `docs/detachable-notes-e2e-checklist.md`

- [ ] **Step 1: Create `docs/detachable-notes-e2e-checklist.md`**

```markdown
# Fenêtres de notes détachables — Checklist E2E manuelle

Spec : `docs/superpowers/specs/2026-07-24-detachable-notes-design.md`.
À dérouler sur un build dev (`pnpm tauri dev`) avant merge, puis sur le build
packagé avant release.

## PR 1 — Fondation

- [ ] Détacher via l'icône de l'onglet actif → fenêtre native ouverte, note
      éditable, onglet disparu du main.
- [ ] Titre de la fenêtre = titre de la note, mis à jour pendant la frappe.
- [ ] Éditer dans la fenêtre détachée → titre + date se rafraîchissent dans
      la sidebar du main ; contenu retrouvé après réattachement.
- [ ] Deux notes détachées côte à côte, édition des deux.
- [ ] Détacher une note déjà détachée (icône ou clic sidebar) → focus de la
      fenêtre existante, pas de doublon.
- [ ] X natif : onglet restauré dans le main SANS que le main s'affiche
      (tester main visible ET main dans le tray).
- [ ] Bouton « réattacher » : onglet restauré + main affiché/focus, onglet
      Notes actif, note active.
- [ ] Épingle : always-on-top on/off, état visuel du bouton.
- [ ] Suppression depuis la fenêtre détachée (footer) → confirmation → note
      supprimée, fenêtre fermée, pas d'onglet fantôme.
- [ ] Suppression depuis la sidebar du main d'une note détachée → fenêtre
      fermée, pas d'onglet fantôme.
- [ ] Fermer le main (tray) avec des notes détachées → elles restent
      ouvertes et éditables ; sauvegarde OK.
- [ ] Quitter l'app (tray → Quitter) avec des notes détachées → au
      redémarrage, elles reviennent en onglets dans le main.
- [ ] Tuer le process (crash simulé) → même résultat au redémarrage.
- [ ] Changement de profil → toutes les fenêtres notes se ferment.
- [ ] Thème light/dark switché dans le main → appliqué en direct dans les
      fenêtres détachées. Langue idem.
- [ ] Wiki-link `[[note]]` cliqué dans une fenêtre détachée → la cible
      s'ouvre en onglet dans le main (ou focus sa fenêtre si détachée).
- [ ] Toggle « local uniquement » dans la fenêtre détachée → icône mise à
      jour, état reflété dans le main.
- [ ] (Sync active) Éditer une note détachée → push cloud visible après ~2 s
      (vérifier `user_notes.updated_at` ou les logs sync du main).
- [ ] Mode compact / petite fenêtre note (320×240) → toolbar + footer
      utilisables.

## PR 2 — Drag-out

- [ ] Glisser un onglet hors de la fenêtre principale → fantôme pendant le
      drag, fenêtre créée au point de lâcher.
- [ ] Lâcher DANS la fenêtre principale → annulation, rien ne se passe,
      le clic simple active toujours l'onglet.
- [ ] Échap pendant le drag → annulation.
- [ ] Drag vers un second écran (DPI différent si possible) → la fenêtre
      apparaît près du curseur.
- [ ] Clic molette sur un onglet ferme toujours l'onglet (régression).
```

- [ ] **Step 2: Full verification**

```powershell
pnpm vitest run
pnpm build
$env:LIBCLANG_PATH = "C:/Program Files/LLVM/bin"; $env:Path += ";C:\Program Files\CMake\bin"
cd src-tauri; cargo test --no-default-features; cargo check --no-default-features; cd ..
```
Expected: everything green.

- [ ] **Step 3: Ask the user to run the PR 1 section of the checklist** on `pnpm tauri dev`. Fix anything that fails before opening the PR (use superpowers:systematic-debugging for failures).

- [ ] **Step 4: Push and open PR 1**

```powershell
git add docs/detachable-notes-e2e-checklist.md
git commit -m "docs: add detachable note windows e2e checklist"
git push -u origin feat/detachable-notes
gh pr create --title "feat: detachable note windows (foundation)" --body "Implements the foundation of detachable note windows per docs/superpowers/specs/2026-07-24-detachable-notes-design.md: Rust open/close/show commands with close-as-reattach lifecycle, dedicated note.html entry + capability, detached editor shell (pin, reattach, full TipTap without AI/share), main-window bridge (sidebar refresh + single-owner cloud push), detach icon + sidebar indicator, restart merge-back. E2E checklist: docs/detachable-notes-e2e-checklist.md (PR 1 section done on dev build).

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

---

# PR 2 — Drag-out (après merge de la PR 1, rebaser la branche ou en créer une nouvelle `feat/detachable-notes-dragout`)

### Task 12: Pure drag helpers (TDD)

**Files:**
- Create: `src/lib/notes-window/drag-out.ts`
- Test: `src/lib/notes-window/drag-out.test.ts`

**Interfaces:**
- Produces (consumed by Task 13):

```ts
export const DRAG_START_THRESHOLD_PX = 6;
export function exceedsDragThreshold(startX: number, startY: number, x: number, y: number): boolean;
export function isOutsideViewport(clientX: number, clientY: number, width: number, height: number): boolean;
```

- [ ] **Step 1: Write the failing tests** — `src/lib/notes-window/drag-out.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  DRAG_START_THRESHOLD_PX,
  exceedsDragThreshold,
  isOutsideViewport,
} from "./drag-out";

describe("exceedsDragThreshold", () => {
  it("is false below the threshold", () => {
    expect(exceedsDragThreshold(10, 10, 12, 12)).toBe(false);
  });
  it("is true at or beyond the threshold in any direction", () => {
    expect(exceedsDragThreshold(10, 10, 10 + DRAG_START_THRESHOLD_PX, 10)).toBe(true);
    expect(exceedsDragThreshold(10, 10, 10, 10 - DRAG_START_THRESHOLD_PX)).toBe(true);
    expect(exceedsDragThreshold(10, 10, 15, 15)).toBe(true); // hypot ≈ 7.07
  });
});

describe("isOutsideViewport", () => {
  it("is false inside", () => {
    expect(isOutsideViewport(100, 100, 800, 600)).toBe(false);
    expect(isOutsideViewport(0, 0, 800, 600)).toBe(false);
    expect(isOutsideViewport(800, 600, 800, 600)).toBe(false);
  });
  it("is true outside any edge", () => {
    expect(isOutsideViewport(-1, 100, 800, 600)).toBe(true);
    expect(isOutsideViewport(100, -1, 800, 600)).toBe(true);
    expect(isOutsideViewport(801, 100, 800, 600)).toBe(true);
    expect(isOutsideViewport(100, 601, 800, 600)).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run src/lib/notes-window/drag-out.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** — `src/lib/notes-window/drag-out.ts`:

```ts
/** Pointer must travel this far (px) from pointerdown before a tab drag
 *  starts — below it, the gesture stays a plain click. */
export const DRAG_START_THRESHOLD_PX = 6;

export function exceedsDragThreshold(
  startX: number,
  startY: number,
  x: number,
  y: number,
): boolean {
  return Math.hypot(x - startX, y - startY) >= DRAG_START_THRESHOLD_PX;
}

/** Client coordinates are viewport-relative and DPI-free: outside the
 *  viewport ⇒ outside the OS window ⇒ this is a detach drop. The final
 *  window position is resolved by Rust from the OS cursor (`at_cursor`),
 *  so no CSS→physical conversion happens in JS (spec §6). */
export function isOutsideViewport(
  clientX: number,
  clientY: number,
  viewportWidth: number,
  viewportHeight: number,
): boolean {
  return (
    clientX < 0 ||
    clientY < 0 ||
    clientX > viewportWidth ||
    clientY > viewportHeight
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run src/lib/notes-window/drag-out.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/notes-window/drag-out.ts src/lib/notes-window/drag-out.test.ts
git commit -m "feat: add pure drag-out threshold helpers"
```

---

### Task 13: Drag-out gesture on the tab strip

**Files:**
- Create: `src/hooks/useTabDragOut.ts`
- Modify: `src/components/notes/NotesEditor/NotesEditorTitleBar.tsx`
- Modify: `src/components/notes/NotesEditor/NotesEditor.tsx` (thread `onDetachNoteAtCursor`)
- Modify: `src/components/Dashboard.tsx` (pass `atCursor` variant)

**Interfaces:**
- Consumes: Task 12 helpers; `handleDetachNote(id, atCursor)` from Task 6.
- Produces:

```ts
export interface TabDragState { id: string; title: string; x: number; y: number }
export function useTabDragOut(options: { onDetachAtCursor: (id: string) => void }): {
  drag: TabDragState | null;
  handleTabPointerDown: (e: React.PointerEvent, id: string, title: string) => void;
  suppressNextClick: React.MutableRefObject<boolean>;
};
```

- [ ] **Step 1: Create `src/hooks/useTabDragOut.ts`**

```ts
import { useCallback, useEffect, useRef, useState } from "react";
import {
  exceedsDragThreshold,
  isOutsideViewport,
} from "@/lib/notes-window/drag-out";

export interface TabDragState {
  id: string;
  title: string;
  x: number;
  y: number;
}

/**
 * Drag-out gesture for the notes tab strip (spec §6, level 1 « au lâcher »):
 * pointerdown on a tab arms the gesture; once the pointer travels beyond the
 * threshold a ghost follows the cursor; releasing OUTSIDE the viewport
 * detaches the note at the OS cursor position (Rust resolves the physical
 * coordinates — no DPI math here). Releasing inside, or pressing Escape,
 * cancels. A completed drag suppresses the click that follows it so the tab
 * doesn't also activate.
 */
export function useTabDragOut({
  onDetachAtCursor,
}: {
  onDetachAtCursor: (id: string) => void;
}) {
  const [drag, setDrag] = useState<TabDragState | null>(null);
  const armedRef = useRef<TabDragState | null>(null);
  const draggingRef = useRef(false);
  const suppressNextClick = useRef(false);

  const reset = useCallback(() => {
    armedRef.current = null;
    draggingRef.current = false;
    setDrag(null);
  }, []);

  const handleTabPointerDown = useCallback(
    (e: React.PointerEvent, id: string, title: string) => {
      if (e.button !== 0) return; // left button only — middle-click closes
      armedRef.current = { id, title, x: e.clientX, y: e.clientY };
      draggingRef.current = false;
    },
    [],
  );

  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      const armed = armedRef.current;
      if (!armed) return;
      if (
        !draggingRef.current &&
        exceedsDragThreshold(armed.x, armed.y, e.clientX, e.clientY)
      ) {
        draggingRef.current = true;
      }
      if (draggingRef.current) {
        setDrag({ ...armed, x: e.clientX, y: e.clientY });
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      const armed = armedRef.current;
      if (!armed) return;
      const wasDragging = draggingRef.current;
      const outside = isOutsideViewport(
        e.clientX,
        e.clientY,
        window.innerWidth,
        window.innerHeight,
      );
      reset();
      if (wasDragging) {
        suppressNextClick.current = true;
        if (outside) onDetachAtCursor(armed.id);
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && armedRef.current) {
        reset();
        suppressNextClick.current = true;
      }
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onDetachAtCursor, reset]);

  return { drag, handleTabPointerDown, suppressNextClick };
}
```

- [ ] **Step 2: Integrate in `NotesEditorTitleBar.tsx`**

1. Add prop `onDetachNoteAtCursor: (id: string) => void;` to `NotesEditorTitleBarProps` and destructure it.
2. Import and call the hook at the top of the component:

```tsx
import { useTabDragOut } from "@/hooks/useTabDragOut";
// …
  const { drag, handleTabPointerDown, suppressNextClick } = useTabDragOut({
    onDetachAtCursor: onDetachNoteAtCursor,
  });
```

3. On each tab `<div className="notes-tab" ...>`:
   - extend the existing `onMouseDown` (keep the middle-click close) — no change needed there;
   - add `onPointerDown={(e) => handleTabPointerDown(e, note.id, displayTitle)}`;
   - wrap the existing `onClick`: 

```tsx
              onClick={() => {
                if (suppressNextClick.current) {
                  suppressNextClick.current = false;
                  return;
                }
                onActivateNote(note.id);
              }}
```

4. Render the ghost just before the closing `</div>` of the root `notes-tabbar` element:

```tsx
      {drag && (
        <div
          className="fixed z-50 pointer-events-none px-3 py-1.5 rounded-md shadow-lg text-sm max-w-[240px] truncate"
          style={{
            left: drag.x + 8,
            top: drag.y + 8,
            background: "var(--vt-panel-2)",
            border: "1px solid var(--vt-border)",
            color: "var(--vt-fg)",
          }}
        >
          {drag.title}
        </div>
      )}
```

- [ ] **Step 3: Thread the atCursor variant**

- `NotesEditor.tsx`: add prop `onDetachNoteAtCursor: (id: string) => void;`, pass to `<NotesEditorTitleBar onDetachNoteAtCursor={onDetachNoteAtCursor} ...>`.
- `Dashboard.tsx`: on `<NotesEditor ...>` add `onDetachNoteAtCursor={(id) => void handleDetachNote(id, true)}`.

- [ ] **Step 4: Verify**

Run: `pnpm build` and `pnpm vitest run`
Expected: PASS.

**Checkpoint (user):** run `pnpm tauri dev` and walk the « PR 2 — Drag-out » section of `docs/detachable-notes-e2e-checklist.md`.

- [ ] **Step 5: Commit**

```powershell
git add src/hooks/useTabDragOut.ts src/components/notes/NotesEditor/NotesEditorTitleBar.tsx src/components/notes/NotesEditor/NotesEditor.tsx src/components/Dashboard.tsx
git commit -m "feat: drag a note tab out of the window to detach it"
```

---

### Task 14: PR 2

- [ ] **Step 1: Full verification**

```powershell
pnpm vitest run
pnpm build
cd src-tauri; cargo check --no-default-features; cd ..
```
Expected: everything green. User has validated the drag-out checklist section.

- [ ] **Step 2: Push and open PR 2**

```powershell
git push
gh pr create --title "feat: drag note tabs out to detach them" --body "Level-1 drag-out (VS Code style) for detachable note windows: pointer-capture gesture with ghost preview, drop outside the main window creates the note window at the OS cursor (Rust resolves physical coordinates — no DPI math in JS). Escape cancels; click/middle-click behavior preserved. Spec §6 of docs/superpowers/specs/2026-07-24-detachable-notes-design.md.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```
