# Re-collage de la dernière transcription — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter un raccourci clavier global (`Ctrl+F10` par défaut) qui recolle instantanément la dernière transcription à la position du curseur, sans rouvrir la fenêtre.

**Architecture:** On réutilise le pattern existant « hotkey global Rust → événement Tauri → traitement frontend » (identique à `audio-captured`). Rust enregistre le hotkey et émet `repaste-last-transcription` ; le frontend (`useRecordingWorkflow`) garde une `ref` du dernier texte inséré et le recolle via un helper presse-papiers partagé. Aucune logique d'insertion n'est dupliquée côté Rust.

**Tech Stack:** Rust (Tauri 2, `tauri-plugin-global-shortcut`, `tauri-plugin-clipboard-manager`, `enigo`), TypeScript/React 19, react-i18next, Vitest, `cargo test`.

## Global Constraints

- **Commits** : conventional commits en anglais, courts. Terminer chaque message par le trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **i18n obligatoire** : toute string affichée passe par react-i18next (fr + en). Aucun texte UI en dur.
- **Pas de dépendance cassée** : pas de `cargo update` global, pas de modif des features Cargo existants.
- **Build Rust (Windows)** : `cargo test` nécessite `LIBCLANG_PATH` + CMake dans le PATH, et `--no-default-features` pour éviter les erreurs Vulkan/cmake (MAX_PATH). Préambule PowerShell pour toute commande cargo :
  ```powershell
  $env:PATH += ";C:\Program Files\CMake\bin"
  $env:LIBCLANG_PATH = "C:/Program Files/LLVM/bin"
  ```
- **Pas de sync** du nouveau hotkey (cohérence avec `cancel_hotkey` / `post_process_toggle_hotkey`).
- **Syntaxe PowerShell** pour les commandes shell (jamais `VAR=val cmd`).
- **Branche** : `feat/repaste-last-transcription` (déjà créée). Pas de push direct sur `main` — PR à la fin.
- `pnpm tauri dev` / `pnpm tauri build` : **interdits** à l'agent — demander à l'utilisateur de lancer l'app pour le smoke test final.

## File Structure

| Fichier | Création/Modif | Responsabilité |
|---------|----------------|----------------|
| `src-tauri/src/state.rs` | Modif | Champ `repaste` dans `HotkeyConfig` |
| `src-tauri/src/hotkeys.rs` | Modif | Validation conflit + chargement défaut + enregistrement + émission événement + tests unitaires |
| `src-tauri/src/commands/settings.rs` | Modif | Paramètre `repaste_hotkey` dans `update_hotkeys` |
| `src/lib/paste.ts` | **Création** | Helper `pasteTextPreservingClipboard` (presse-papiers + Ctrl+V + restauration) |
| `src/lib/paste.test.ts` | **Création** | Tests Vitest du helper |
| `src/lib/settings.ts` | Modif | Type + valeur par défaut `repaste_hotkey` |
| `src/hooks/useHotkeyConfig.ts` | Modif | Union `HotkeyKey` + passage `repasteHotkey` + `allowEmpty` |
| `src/hooks/useRecordingWorkflow.ts` | Modif | Ref dernier texte + seed depuis historique + listener re-collage + usage du helper |
| `src/components/Dashboard.tsx` | Modif | Passe `latestHistoryText` au hook |
| `src/components/settings/sections/ShortcutsSection.tsx` | Modif | Ligne de réglage du hotkey re-collage |
| `src/locales/fr.json` + `src/locales/en.json` | Modif | Libellés du nouveau hotkey |

---

## Task 1: Backend — modèle `HotkeyConfig` + validation conflit + défaut

**Files:**
- Modify: `src-tauri/src/state.rs:7-15` (struct `HotkeyConfig`)
- Modify: `src-tauri/src/hotkeys.rs` (`hotkeys_conflict`, `load_hotkey_config`, ajout d'un module `tests`)

**Interfaces:**
- Produces: champ `HotkeyConfig.repaste: Option<String>` ; `hotkeys_conflict` rejette un `repaste` en collision ; `load_hotkey_config` lit `repaste_hotkey` (défaut `Ctrl+F10` si absent, `None` si présent-mais-vide).

- [ ] **Step 1: Ajouter le champ `repaste` à la struct**

Dans `src-tauri/src/state.rs`, remplacer la struct `HotkeyConfig` :

```rust
#[derive(Clone, Default)]
pub(crate) struct HotkeyConfig {
    pub(crate) record: Option<String>,
    pub(crate) ptt: Option<String>,
    pub(crate) open_window: Option<String>,
    pub(crate) cancel: Option<String>,
    /// Only active while a recording is in progress. Toggles `post_process_enabled`.
    pub(crate) post_process_toggle: Option<String>,
    /// Re-pastes the last inserted transcription at the cursor. Empty = disabled.
    pub(crate) repaste: Option<String>,
}
```

- [ ] **Step 2: Écrire le test de conflit (échoue d'abord)**

Append à la fin de `src-tauri/src/hotkeys.rs` :

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::HotkeyConfig;

    fn base_config() -> HotkeyConfig {
        HotkeyConfig {
            record: Some("Ctrl+F11".into()),
            ptt: Some("Ctrl+F12".into()),
            open_window: Some("Ctrl+Alt+O".into()),
            cancel: Some("Escape".into()),
            post_process_toggle: None,
            repaste: Some("Ctrl+F10".into()),
        }
    }

    #[test]
    fn repaste_distinct_is_accepted() {
        assert!(hotkeys_conflict(&base_config()).is_none());
    }

    #[test]
    fn repaste_colliding_with_record_is_rejected() {
        let mut config = base_config();
        config.repaste = config.record.clone();
        assert!(hotkeys_conflict(&config).is_some());
    }

    #[test]
    fn repaste_colliding_with_cancel_is_rejected() {
        let mut config = base_config();
        config.repaste = Some("Escape".into());
        assert!(hotkeys_conflict(&config).is_some());
    }
}
```

- [ ] **Step 3: Lancer le test pour vérifier qu'il échoue**

```powershell
$env:PATH += ";C:\Program Files\CMake\bin"; $env:LIBCLANG_PATH = "C:/Program Files/LLVM/bin"; cargo test --no-default-features --manifest-path src-tauri/Cargo.toml repaste
```
Expected: `repaste_colliding_with_record_is_rejected` et `repaste_colliding_with_cancel_is_rejected` ÉCHOUENT (`hotkeys_conflict` ne vérifie pas encore `repaste`).

- [ ] **Step 4: Implémenter la validation de conflit**

Dans `src-tauri/src/hotkeys.rs`, dans `hotkeys_conflict`, juste avant `None` final (après le bloc `post_process_toggle`) :

```rust
    if equals(&config.repaste, &config.record)
        || equals(&config.repaste, &config.ptt)
        || equals(&config.repaste, &config.open_window)
        || equals(&config.repaste, &config.cancel)
        || equals(&config.repaste, &config.post_process_toggle)
    {
        return Some("Repaste shortcut must be distinct from other shortcuts.".into());
    }

    None
```
(remplace le `None` existant terminal par ce bloc + `None`.)

- [ ] **Step 5: Implémenter le chargement + défaut dans `load_hotkey_config`**

Dans `load_hotkey_config`, déclarer un flag avant le `if let Some(settings_value) = store.get("settings")` :

```rust
    let mut config = HotkeyConfig::default();
    let mut repaste_present = false;
```

Puis, dans le `if let Some(settings_obj) = ...`, après le bloc `post_process_toggle_hotkey` :

```rust
            if let Some(value) = settings_obj.get("repaste_hotkey") {
                repaste_present = true;
                config.repaste = value
                    .as_str()
                    .and_then(|s| normalize_hotkey_value(Some(s.to_string())));
            }
```

Enfin, après le bloc des défauts existants (après `if config.cancel.is_none() { ... }`), avant `config` :

```rust
    // repaste defaults to Ctrl+F10 on first run / upgrade (key absent). An
    // explicitly-empty stored value means the user disabled it — leave it None.
    if !repaste_present && config.repaste.is_none() {
        config.repaste = Some("Ctrl+F10".into());
    }
```

- [ ] **Step 6: Lancer les tests pour vérifier qu'ils passent**

```powershell
$env:PATH += ";C:\Program Files\CMake\bin"; $env:LIBCLANG_PATH = "C:/Program Files/LLVM/bin"; cargo test --no-default-features --manifest-path src-tauri/Cargo.toml repaste
```
Expected: les 3 tests `repaste_*` PASSENT.

- [ ] **Step 7: Commit**

```powershell
git add src-tauri/src/state.rs src-tauri/src/hotkeys.rs
git commit -m @'
feat(hotkeys): add repaste hotkey to config model and validation

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
'@
```

---

## Task 2: Backend — enregistrement du hotkey + émission événement + commande

**Files:**
- Modify: `src-tauri/src/hotkeys.rs` (`apply_hotkeys`)
- Modify: `src-tauri/src/commands/settings.rs` (`update_hotkeys`)

**Interfaces:**
- Consumes: `HotkeyConfig.repaste` (Task 1).
- Produces: appui sur le hotkey repaste → émission de l'événement `repaste-last-transcription` (payload vide) ; commande `update_hotkeys` accepte un paramètre `repaste_hotkey: Option<String>`.

- [ ] **Step 1: Parser le hotkey repaste dans `apply_hotkeys`**

Dans `src-tauri/src/hotkeys.rs`, fonction `apply_hotkeys`, après le bloc `let open_hotkey = ...` :

```rust
    let repaste_hotkey = config
        .repaste
        .as_ref()
        .map(|value| parse_hotkey_str(value).map(|shortcut| (value.clone(), shortcut)))
        .transpose()?;
```

- [ ] **Step 2: Enregistrer le handler qui émet l'événement**

Toujours dans `apply_hotkeys`, après le bloc `if let Some((open_label, open_shortcut)) = open_hotkey { ... }` et avant `Ok(())` :

```rust
    if let Some((repaste_label, repaste_shortcut)) = repaste_hotkey {
        let handler = move |app: &AppHandle<R>, _shortcut: &Shortcut, event: ShortcutEvent| {
            if event.state == ShortcutState::Pressed {
                let _ = app.emit("repaste-last-transcription", ());
            }
        };

        manager
            .on_shortcut(repaste_shortcut.clone(), handler)
            .map_err(|e| {
                format!(
                    "Failed to register shortcut \"{}\": {}",
                    repaste_label, e
                )
            })?;
    }
```
(`Emitter` est déjà importé en tête de `hotkeys.rs` ; aucune capability à ajouter — les permissions d'événements sont globales et déjà accordées, comme pour `audio-captured`.)

- [ ] **Step 3: Ajouter le paramètre à `update_hotkeys`**

Dans `src-tauri/src/commands/settings.rs`, signature de `update_hotkeys`, ajouter le paramètre après `post_process_toggle_hotkey` :

```rust
pub fn update_hotkeys(
    app_handle: AppHandle,
    state: State<AppState>,
    record_hotkey: Option<String>,
    ptt_hotkey: Option<String>,
    open_window_hotkey: Option<String>,
    cancel_hotkey: Option<String>,
    post_process_toggle_hotkey: Option<String>,
    repaste_hotkey: Option<String>,
) -> Result<(), String> {
```

Puis, dans le corps, après le bloc `if let Some(value) = post_process_toggle_hotkey { ... }` :

```rust
    if let Some(value) = repaste_hotkey {
        next.repaste = normalize_hotkey_value(Some(value));
    }
```

- [ ] **Step 4: Vérifier la compilation**

```powershell
$env:PATH += ";C:\Program Files\CMake\bin"; $env:LIBCLANG_PATH = "C:/Program Files/LLVM/bin"; cargo check --no-default-features --manifest-path src-tauri/Cargo.toml
```
Expected: compilation OK, aucune erreur.

- [ ] **Step 5: Commit**

```powershell
git add src-tauri/src/hotkeys.rs src-tauri/src/commands/settings.rs
git commit -m @'
feat(hotkeys): register repaste shortcut and emit repaste event

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
'@
```

---

## Task 3: Frontend — helper d'insertion réutilisable (`paste.ts`)

**Files:**
- Create: `src/lib/paste.ts`
- Test: `src/lib/paste.test.ts`

**Interfaces:**
- Produces: `pasteTextPreservingClipboard(text: string): Promise<void>` — écrit `text` dans le presse-papiers, simule Ctrl+V via `invoke("paste_text_to_active_window", { text })`, puis restaure le presse-papiers précédent.

- [ ] **Step 1: Écrire le test (échoue d'abord)**

Create `src/lib/paste.test.ts` :

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const invokeMock = vi.fn();
const readTextMock = vi.fn();
const writeTextMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));
vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({
  readText: (...args: unknown[]) => readTextMock(...args),
  writeText: (...args: unknown[]) => writeTextMock(...args),
}));

import { pasteTextPreservingClipboard } from "./paste";

describe("pasteTextPreservingClipboard", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    readTextMock.mockReset();
    writeTextMock.mockReset();
  });

  it("writes the text, pastes it, then restores the previous clipboard", async () => {
    readTextMock.mockResolvedValue("PREVIOUS");
    invokeMock.mockResolvedValue(undefined);
    writeTextMock.mockResolvedValue(undefined);

    await pasteTextPreservingClipboard("hello world");

    expect(writeTextMock).toHaveBeenNthCalledWith(1, "hello world");
    expect(invokeMock).toHaveBeenCalledWith("paste_text_to_active_window", {
      text: "hello world",
    });
    expect(writeTextMock).toHaveBeenNthCalledWith(2, "PREVIOUS");
  });

  it("still pastes when the previous clipboard can't be read", async () => {
    readTextMock.mockRejectedValue(new Error("not text"));
    invokeMock.mockResolvedValue(undefined);
    writeTextMock.mockResolvedValue(undefined);

    await pasteTextPreservingClipboard("abc");

    expect(writeTextMock).toHaveBeenCalledWith("abc");
    expect(invokeMock).toHaveBeenCalledWith("paste_text_to_active_window", {
      text: "abc",
    });
    expect(writeTextMock).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

```powershell
pnpm exec vitest run src/lib/paste.test.ts
```
Expected: ÉCHEC — `./paste` introuvable / export manquant.

- [ ] **Step 3: Implémenter le helper**

Create `src/lib/paste.ts` :

```ts
import { invoke } from "@tauri-apps/api/core";

/**
 * Paste `text` at the active window's cursor via clipboard + Ctrl+V, restoring
 * the user's previous clipboard afterwards.
 *
 * Shared by the transcription auto-insert (cursor mode) and the
 * re-paste-last-transcription hotkey, so both behave identically.
 *
 * readText() throws when the clipboard holds a non-text format (image, files);
 * we accept losing that rather than corrupting the cursor insertion.
 */
export async function pasteTextPreservingClipboard(text: string): Promise<void> {
  const { readText, writeText } = await import(
    "@tauri-apps/plugin-clipboard-manager"
  );

  let previousClipboard: string | null = null;
  try {
    previousClipboard = await readText();
  } catch {}

  await writeText(text);
  await invoke("paste_text_to_active_window", { text });
  await new Promise((r) => setTimeout(r, 200));

  if (previousClipboard !== null) {
    try {
      await writeText(previousClipboard);
    } catch {}
  }
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

```powershell
pnpm exec vitest run src/lib/paste.test.ts
```
Expected: les 2 tests PASSENT.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/paste.ts src/lib/paste.test.ts
git commit -m @'
feat(paste): extract reusable clipboard-preserving paste helper

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
'@
```

---

## Task 4: Frontend — réglage du hotkey (settings + UI + i18n)

**Files:**
- Modify: `src/lib/settings.ts:40-46` (type) et `:124-130` (défaut)
- Modify: `src/hooks/useHotkeyConfig.ts`
- Modify: `src/components/settings/sections/ShortcutsSection.tsx`
- Modify: `src/locales/fr.json` + `src/locales/en.json`

**Interfaces:**
- Consumes: commande Rust `update_hotkeys` avec param `repaste_hotkey` (Task 2).
- Produces: clé settings `repaste_hotkey` (défaut `"Ctrl+F10"`) ; `HotkeyKey` inclut `"repaste_hotkey"` ; une ligne de réglage dans la section Raccourcis.

- [ ] **Step 1: Ajouter le champ au type `AppSettings`**

Dans `src/lib/settings.ts`, dans le bloc `// Shortcuts & Recording Modes`, après `post_process_toggle_hotkey` :

```ts
    /** Re-pastes the last inserted transcription at the cursor. Empty = disabled. */
    repaste_hotkey: string;
```

- [ ] **Step 2: Ajouter la valeur par défaut**

Dans `DEFAULT_SETTINGS.settings`, dans le bloc `// Shortcuts & Recording Modes`, après `post_process_toggle_hotkey: "",` :

```ts
    repaste_hotkey: "Ctrl+F10",
```

- [ ] **Step 3: Étendre `useHotkeyConfig`**

Dans `src/hooks/useHotkeyConfig.ts`, ajouter à l'union `HotkeyKey` :

```ts
export type HotkeyKey =
  | "record_hotkey"
  | "ptt_hotkey"
  | "open_window_hotkey"
  | "cancel_hotkey"
  | "post_process_toggle_hotkey"
  | "repaste_hotkey";
```

Autoriser la valeur vide pour repaste (ligne `allowEmpty`) :

```ts
      const allowEmpty =
        key === "post_process_toggle_hotkey" || key === "repaste_hotkey";
```

Et passer le paramètre dans l'appel `invoke("update_hotkeys", { ... })`, après `postProcessToggleHotkey: ...` :

```ts
        repasteHotkey:
          key === "repaste_hotkey" ? normalized : settings.repaste_hotkey,
```

- [ ] **Step 4: Ajouter la ligne de réglage dans `ShortcutsSection`**

Dans `src/components/settings/sections/ShortcutsSection.tsx`, étendre l'union locale `HotkeyKey` (haut du fichier) :

```ts
type HotkeyKey =
  | "record_hotkey"
  | "ptt_hotkey"
  | "open_window_hotkey"
  | "cancel_hotkey"
  | "post_process_toggle_hotkey"
  | "repaste_hotkey";
```

Puis ajouter une entrée au tableau `items`, après l'objet `post_process_toggle_hotkey` :

```ts
    {
      id: "repaste_hotkey",
      label: t("settings.shortcuts.repaste"),
      sub: t("settings.shortcuts.repasteDesc"),
      defaultValue: DEFAULT_SETTINGS.settings.repaste_hotkey,
      value: settings.repaste_hotkey,
    },
```

- [ ] **Step 5: Ajouter les clés i18n**

Dans `src/locales/en.json`, bloc `settings.shortcuts`, après `"postProcessToggleDesc": ...,` :

```json
      "repaste": "Re-paste last transcription",
      "repasteDesc": "Pastes the last transcription again at the cursor",
```

Dans `src/locales/fr.json`, bloc `settings.shortcuts`, après `"postProcessToggleDesc": ...,` :

```json
      "repaste": "Recoller la dernière transcription",
      "repasteDesc": "Recolle la dernière transcription à la position du curseur",
```

(Attention : ajouter une virgule à la fin de la ligne `postProcessToggleDesc` existante dans les deux fichiers, puisqu'elle devient non-terminale.)

- [ ] **Step 6: Vérifier le typage / build frontend**

```powershell
pnpm build
```
Expected: compilation TypeScript + Vite OK, aucune erreur de type.

- [ ] **Step 7: Commit**

```powershell
git add src/lib/settings.ts src/hooks/useHotkeyConfig.ts src/components/settings/sections/ShortcutsSection.tsx src/locales/fr.json src/locales/en.json
git commit -m @'
feat(settings): add re-paste hotkey configuration row

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
'@
```

---

## Task 5: Frontend — ref du dernier texte, seed historique et listener de re-collage

**Files:**
- Modify: `src/hooks/useRecordingWorkflow.ts`
- Modify: `src/components/Dashboard.tsx:99-104`

**Interfaces:**
- Consumes: `pasteTextPreservingClipboard` (Task 3), événement `repaste-last-transcription` (Task 2), `flog` (`@/lib/flog`).
- Produces: à chaque insertion, `lastInsertedTextRef` mémorise le texte final ; l'événement déclenche le re-collage + `playSuccess`. Le hook accepte une nouvelle option `latestHistoryText?: string` pour seeder la ref au démarrage.

- [ ] **Step 1: Importer le helper et `flog`**

Dans `src/hooks/useRecordingWorkflow.ts`, ajouter aux imports (après la ligne `import { isOnboardingActive } ...`) :

```ts
import { pasteTextPreservingClipboard } from "@/lib/paste";
import { flog } from "@/lib/flog";
```

- [ ] **Step 2: Ajouter l'option `latestHistoryText`**

Dans l'interface `UseRecordingWorkflowOptions`, ajouter :

```ts
  /** Text of the most recent history entry, used to seed the re-paste buffer
   *  so the hotkey works right after launch (before any new transcription). */
  latestHistoryText?: string;
```

Et la destructurer dans la signature du hook :

```ts
export function useRecordingWorkflow({
  settings,
  addTranscription,
  onTranscriptionAdded,
  latestHistoryText,
}: UseRecordingWorkflowOptions) {
```

- [ ] **Step 3: Créer la ref et la seeder depuis l'historique**

Après la déclaration `const previousRecordingRef = useRef(isRecording);` (~ligne 162), ajouter :

```ts
  // Buffer of the last text we inserted, re-pasted by the repaste hotkey.
  const lastInsertedTextRef = useRef<string>("");

  // Seed from the latest history entry on mount (and once history finishes
  // loading) so the hotkey works after a restart. Never overwrite a value set
  // by an actual insertion this session.
  useEffect(() => {
    if (!lastInsertedTextRef.current && latestHistoryText) {
      lastInsertedTextRef.current = latestHistoryText;
    }
  }, [latestHistoryText]);
```

- [ ] **Step 4: Mémoriser le texte inséré et utiliser le helper**

Dans `handleTranscriptionFinal`, remplacer le bloc d'insertion actuel (de `if (settings.insertion_mode === "cursor") {` jusqu'à la fin du `else if (... "clipboard")` inclus, ~lignes 266-291) par :

```ts
      // Remember what we just produced so the repaste hotkey can re-insert it,
      // even in "none" mode (the user opted out of auto-paste but may still
      // want to re-paste explicitly).
      lastInsertedTextRef.current = finalText;

      if (settings.insertion_mode === "cursor") {
        await pasteTextPreservingClipboard(finalText);
      } else if (settings.insertion_mode === "clipboard") {
        const { writeText } = await import(
          "@tauri-apps/plugin-clipboard-manager"
        );
        await writeText(finalText);
        await invoke("paste_text_to_active_window", { text: finalText });
      }
```

- [ ] **Step 5: Ajouter le handler de re-collage + listener**

Après le bloc du listener `cloud-gate-blocked` (avant le `return { isRecording, ... }` final, ~ligne 660), ajouter :

```ts
  // Re-paste the last inserted transcription. Always uses the
  // clipboard-preserving paste regardless of insertion_mode — it's an explicit
  // user action, so it must paste even when auto-insert is "none".
  const doRepaste = useCallback(async () => {
    const text = lastInsertedTextRef.current;
    if (!text) {
      flog("[repaste] no last transcription available", "info");
      return;
    }
    try {
      await pasteTextPreservingClipboard(text);
      playSuccess();
    } catch (err) {
      flog(`[repaste] failed: ${String(err)}`, "error");
    }
  }, [playSuccess]);

  // Ref trampoline so the long-lived listener always reaches the latest closure
  // (playSuccess changes when enable_sounds toggles).
  const doRepasteRef = useRef(doRepaste);
  useEffect(() => {
    doRepasteRef.current = doRepaste;
  }, [doRepaste]);

  // repaste-last-transcription listener — Rust emits this on the repaste hotkey.
  useEffect(() => {
    let unlisten: UnlistenFn | null = null;
    let disposed = false;

    const setup = async () => {
      try {
        const handle = await listen("repaste-last-transcription", () => {
          void doRepasteRef.current();
        });
        if (disposed) handle();
        else unlisten = handle;
      } catch (err) {
        console.error("Failed to register repaste listener:", err);
      }
    };
    setup();

    return () => {
      disposed = true;
      if (unlisten) {
        unlisten();
        unlisten = null;
      }
    };
  }, []);
```

- [ ] **Step 6: Passer `latestHistoryText` depuis le Dashboard**

Dans `src/components/Dashboard.tsx`, l'appel `useRecordingWorkflow({ ... })` (~ligne 100) :

```tsx
  const { isRecording, isTranscribing, handleToggleRecording } =
    useRecordingWorkflow({
      settings,
      addTranscription,
      onTranscriptionAdded: setSelectedTranscription,
      latestHistoryText: transcriptions[0]?.text,
    });
```

- [ ] **Step 7: Vérifier le build + toute la suite de tests frontend**

```powershell
pnpm build
pnpm test
```
Expected: build OK ; tous les tests Vitest PASSENT (dont `src/lib/paste.test.ts`).

- [ ] **Step 8: Commit**

```powershell
git add src/hooks/useRecordingWorkflow.ts src/components/Dashboard.tsx
git commit -m @'
feat(recording): re-paste last transcription via hotkey event

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
'@
```

---

## Task 6: Vérification finale & smoke test manuel

**Files:** aucun (vérification)

- [ ] **Step 1: Suite Rust complète**

```powershell
$env:PATH += ";C:\Program Files\CMake\bin"; $env:LIBCLANG_PATH = "C:/Program Files/LLVM/bin"; cargo test --no-default-features --manifest-path src-tauri/Cargo.toml
```
Expected: tous les tests PASSENT (dont les 3 `repaste_*`).

- [ ] **Step 2: Suite frontend complète + build**

```powershell
pnpm test
pnpm build
```
Expected: tout PASSE / compile.

- [ ] **Step 3: Smoke test manuel (utilisateur)**

Demander à l'utilisateur de lancer `pnpm tauri dev` (l'agent n'a pas le droit), puis vérifier :
1. Faire une transcription (insertion normale OK).
2. Cliquer dans un autre champ, appuyer sur `Ctrl+F10` → le dernier texte est recollé + petit son joué.
3. Réglages → Raccourcis : la ligne « Recoller la dernière transcription » apparaît, modifiable, réinitialisable à `Ctrl+F10`, et le vidage la désactive.
4. Tenter d'assigner `Ctrl+F10` à un autre raccourci déjà pris → message de conflit.
5. Redémarrer l'app sans nouvelle transcription → `Ctrl+F10` recolle quand même la dernière (seed historique).

- [ ] **Step 4: Ouvrir la PR**

```powershell
git push -u origin feat/repaste-last-transcription
gh pr create --title "feat: re-paste last transcription hotkey" --body @'
Adds a global hotkey (default Ctrl+F10) that re-pastes the last inserted transcription at the cursor.

- Backend: new `repaste` hotkey in HotkeyConfig (conflict validation, default Ctrl+F10, empty = disabled), emits `repaste-last-transcription`.
- Frontend: shared `pasteTextPreservingClipboard` helper, last-inserted-text buffer seeded from history, listener that re-pastes + plays the success sound.
- Settings: configurable row in the Shortcuts section (fr + en).
- Not synced (consistent with cancel / post-process toggle hotkeys).

Spec: docs/superpowers/specs/2026-06-28-repaste-last-transcription-design.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)
'@
```

---

## Self-Review

**Spec coverage :**
- Hotkey global Ctrl+F10 → Task 1 (défaut) + Task 2 (enregistrement/émission). ✓
- Recolle le dernier texte final inséré → Task 5 (ref + seed). ✓
- Méthode presse-papiers avec restauration, quel que soit le mode → Task 3 (helper) + Task 5 (usage inconditionnel). ✓
- Seed depuis l'historique (marche après redémarrage) → Task 5 Step 3 + Step 6. ✓
- Petit son de confirmation → Task 5 (`playSuccess`). ✓
- Réglage configurable + i18n fr/en → Task 4. ✓
- Empty = désactivé → Task 1 (load), Task 4 (`allowEmpty`). ✓
- Pas de sync → aucun fichier sync touché. ✓
- Cas « aucune transcription » = no-op + log → Task 5 (`flog`). ✓
- Tests Rust conflit + Vitest helper → Task 1 + Task 3. ✓

**Placeholder scan :** aucun TBD/TODO ; chaque step de code montre le code complet. ✓

**Type consistency :** `pasteTextPreservingClipboard(text: string): Promise<void>` identique entre Task 3 (déf), Task 5 (usage) ; `repaste_hotkey` cohérent settings/useHotkeyConfig/ShortcutsSection ; `repaste` cohérent state.rs/hotkeys.rs/settings.rs ; événement `repaste-last-transcription` identique émetteur (Task 2) / écouteur (Task 5). ✓
