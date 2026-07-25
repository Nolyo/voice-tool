# Voice Edit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un raccourci global qui capture le texte sélectionné dans n'importe quelle application Windows, écoute une instruction dictée (ou une action rapide de palette), et affiche le résultat dans un overlay avec option de remplacement in-place.

**Architecture:** Le hotkey déclenche une commande Rust qui capture la sélection via `Ctrl+C` simulé et mémorise le HWND source, puis affiche une fenêtre overlay pré-créée. L'overlay est un **afficheur passif** : il capte les touches et émet des événements ; la fenêtre principale — seule à posséder `CloudContext`, le JWT et les réglages — exécute la transcription de l'instruction et l'appel LLM, puis renvoie le résultat par événement. Le remplacement repasse par Rust (`SetForegroundWindow` + insertion selon `insertion_mode`).

**Tech Stack:** Tauri 2, Rust (enigo, windows-sys, tauri-plugin-global-shortcut, tauri-plugin-clipboard-manager), React 19, TypeScript, Vitest, react-i18next.

## Global Constraints

- **Plateforme** : Windows uniquement.
- **Zéro nouvelle dépendance** Rust ou npm. `windows-sys 0.59` (feature `Win32_UI_WindowsAndMessaging`) est déjà présent dans `src-tauri/Cargo.toml:102`.
- **Aucune migration DB, aucune modification du worker cloud** — `notes_assist_cloud` (`src-tauri/src/cloud.rs:246`) est utilisé tel quel.
- **`streaming.rs` n'est pas modifié** — `SpeechSegmenter` et `SegmenterConfig` sont déjà `pub` et paramétrables.
- **i18n obligatoire** : aucune chaîne affichée en dur, y compris `title` et `aria-label`. Toute clé ajoutée dans `src/locales/fr.json` **et** `src/locales/en.json`.
- **Invariant presse-papiers** : le contenu de l'utilisateur est toujours restauré, y compris sur les chemins d'erreur.
- **Cap de sélection** : 15 000 caractères.
- **Commits** : conventional commits en anglais, courts.
- **Branche** : `feat/voice-edit`, PR vers `main`, jamais de merge direct.
- **Build Rust** : `$env:LIBCLANG_PATH = "C:/Program Files/LLVM/bin"` et CMake dans le PATH. Utiliser `cargo check --no-default-features` pour les vérifications rapides.
- `pnpm tauri dev` n'est pas lançable par l'agent — la validation runtime est faite par l'utilisateur.

---

### Task 1: Capture et remplacement de la sélection (Rust)

**Files:**
- Create: `src-tauri/src/commands/selection.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs` (enregistrement dans `invoke_handler`)

**Interfaces:**
- Produces:
  - `pub struct CapturedSelection { pub text: String, pub source_window: isize, pub had_selection: bool }` (serde `camelCase`)
  - `#[tauri::command] pub fn capture_selection() -> Result<CapturedSelection, String>`
  - `#[tauri::command] pub fn replace_selection(text: String, source_window: isize, mode: String) -> Result<(), String>`
  - `pub fn truncate_selection(text: &str, max_chars: usize) -> (String, bool)` — partie pure testable

- [ ] **Step 1: Écrire le test qui échoue**

Dans `src-tauri/src/commands/selection.rs`, en fin de fichier :

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn truncate_leaves_short_text_untouched() {
        let (out, truncated) = truncate_selection("bonjour", 100);
        assert_eq!(out, "bonjour");
        assert!(!truncated);
    }

    #[test]
    fn truncate_cuts_at_char_boundary_not_byte() {
        // 5 caractères accentués = 10 octets : la troncature doit compter
        // des caractères, sinon on coupe un caractère UTF-8 en deux.
        let (out, truncated) = truncate_selection("ééééé", 3);
        assert_eq!(out, "ééé");
        assert!(truncated);
    }

    #[test]
    fn truncate_reports_exact_limit_as_untruncated() {
        let (out, truncated) = truncate_selection("abc", 3);
        assert_eq!(out, "abc");
        assert!(!truncated);
    }
}
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

```powershell
$env:LIBCLANG_PATH = "C:/Program Files/LLVM/bin"
cd src-tauri; cargo test --no-default-features truncate_
```
Attendu : FAIL — `truncate_selection` n'existe pas.

- [ ] **Step 3: Implémenter le module**

`truncate_selection` :

```rust
/// Tronque à `max_chars` caractères (pas octets) et signale si la coupe a eu lieu.
pub fn truncate_selection(text: &str, max_chars: usize) -> (String, bool) {
    if text.chars().count() <= max_chars {
        return (text.to_string(), false);
    }
    (text.chars().take(max_chars).collect(), true)
}
```

`capture_selection` — séquence exacte :
1. `GetForegroundWindow()` (via `windows_sys::Win32::UI::WindowsAndMessaging`) → `isize`.
2. Lire le presse-papiers courant (texte) et le mémoriser.
3. Vider le presse-papiers pour distinguer « rien copié » de « ancien contenu ».
4. `enigo` : `Key::Control` Press → `Key::Unicode('c')` Click → `Key::Control` Release (même forme que `paste_text_to_active_window`, `src-tauri/src/commands/misc.rs:3`).
5. `thread::sleep(Duration::from_millis(120))`, relire le presse-papiers.
6. **Toujours** restaurer l'ancien contenu, y compris si l'étape 5 échoue.
7. Retourner `CapturedSelection { text, source_window, had_selection: !text.trim().is_empty() }`.

`replace_selection` :
1. `SetForegroundWindow(hwnd)` puis `thread::sleep(Duration::from_millis(80))`.
2. `mode == "cursor"` → `crate::commands::misc::type_text_at_cursor(text)` ; sinon écrire dans le presse-papiers puis `paste_text_to_active_window(text)`.
3. Remonter toute erreur telle quelle au frontend.

Utiliser le presse-papiers via `tauri_plugin_clipboard_manager` (déjà en dépendance) ou l'API Win32 directe ; ne pas ajouter `arboard`.

- [ ] **Step 4: Lancer les tests**

```powershell
cd src-tauri; cargo test --no-default-features truncate_
```
Attendu : 3 tests PASS.

- [ ] **Step 5: Enregistrer les commandes**

Ajouter `pub mod selection;` dans `src-tauri/src/commands/mod.rs` et les deux commandes dans le `tauri::generate_handler!` de `src-tauri/src/lib.rs`, à côté de `commands::misc::paste_text_to_active_window`.

- [ ] **Step 6: Vérifier la compilation**

```powershell
cd src-tauri; cargo check --no-default-features
```
Attendu : compile sans erreur ni warning nouveau.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/commands/selection.rs src-tauri/src/commands/mod.rs src-tauri/src/lib.rs
git commit -m "feat: add selection capture and replace commands"
```

---

### Task 2: Worker d'écoute d'instruction (Rust)

**Files:**
- Create: `src-tauri/src/voice_edit.rs`
- Modify: `src-tauri/src/lib.rs` (`mod voice_edit;`)
- Modify: `src-tauri/src/state.rs` (champ runtime)

**Interfaces:**
- Consumes: `SpeechSegmenter`, `SegmenterConfig`, `Segment`, `TapMsg` (tous `pub` dans `src-tauri/src/streaming.rs`)
- Produces:
  - `pub(crate) fn voice_edit_segmenter_config(sample_rate: u32) -> SegmenterConfig`
  - `pub(crate) fn start_instruction_capture<R: Runtime>(state: &AppState, recorder: &mut AudioRecorder, app: &AppHandle<R>)`
  - `pub(crate) fn stop_instruction_capture(state: &AppState, recorder: &mut AudioRecorder, abort: bool) -> bool`
  - Événement émis : `voice-edit-instruction` avec `{ samples, sampleRate }`

- [ ] **Step 1: Écrire le test qui échoue**

Dans `src-tauri/src/voice_edit.rs` :

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn instruction_config_tolerates_longer_hesitations_than_streaming() {
        let cfg = voice_edit_segmenter_config(48_000);
        let streaming = crate::streaming::SegmenterConfig::new(48_000);
        assert!(cfg.silence_gap_ms > streaming.silence_gap_ms);
        assert_eq!(cfg.silence_gap_ms, 800);
    }

    #[test]
    fn instruction_config_allows_very_short_utterances() {
        // « traduis » dure moins d'une seconde : le minimum du streaming
        // (1400 ms) empêcherait toute coupure sur silence.
        let cfg = voice_edit_segmenter_config(48_000);
        assert_eq!(cfg.min_segment_ms, 400);
    }
}
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

```powershell
cd src-tauri; cargo test --no-default-features instruction_config
```
Attendu : FAIL — module absent.

- [ ] **Step 3: Implémenter**

```rust
pub(crate) fn voice_edit_segmenter_config(sample_rate: u32) -> SegmenterConfig {
    SegmenterConfig {
        silence_gap_ms: 800,
        min_segment_ms: 400,
        ..SegmenterConfig::new(sample_rate)
    }
}
```

Le worker est le décalque de `run_streaming_worker` (`src-tauri/src/streaming.rs:445`) avec **une seule différence** : au premier segment complet, il émet `voice-edit-instruction` et **retourne** au lieu de boucler. Sur `TapMsg::Finish`, il émet le `flush()` s'il contient de la parole, sinon émet l'événement avec un tableau vide. Sur `TapMsg::Abort` ou canal fermé, il n'émet rien.

`start_instruction_capture` décalque `maybe_start_streaming_session` (`streaming.rs:346`) : installe le tap sur le recorder, spawn le worker. **Ne pas** vérifier `runtime.enabled` — Voice Edit n'a pas de réglage d'activation.

Ajouter dans `AppState` (`src-tauri/src/state.rs`) :
```rust
pub(crate) voice_edit: Mutex<crate::voice_edit::VoiceEditRuntime>,
```
avec `VoiceEditRuntime { session_seq: u64, tap: Option<Sender<TapMsg>> }`, initialisé dans le constructeur de `AppState` à côté de `streaming`.

- [ ] **Step 4: Lancer les tests**

```powershell
cd src-tauri; cargo test --no-default-features instruction_config
```
Attendu : 2 tests PASS.

- [ ] **Step 5: Vérifier la compilation complète**

```powershell
cd src-tauri; cargo check --no-default-features
```

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/voice_edit.rs src-tauri/src/lib.rs src-tauri/src/state.rs
git commit -m "feat: add single-utterance instruction capture worker"
```

---

### Task 3: Logique pure côté TypeScript (prompts, actions, langues)

**Files:**
- Create: `src/lib/voice-edit/actions.ts`
- Create: `src/lib/voice-edit/prompts.ts`
- Create: `src/lib/voice-edit/actions.test.ts`
- Create: `src/lib/voice-edit/prompts.test.ts`

**Interfaces:**
- Produces:
  - `export interface VoiceEditAction { id: string; label: string; systemPrompt: string }`
  - `export const DEFAULT_VOICE_EDIT_ACTIONS: VoiceEditAction[]`
  - `export function resolveActionByIndex(actions: VoiceEditAction[], index: number): VoiceEditAction | null`
  - `export function buildTranslatePrompt(primary: string, secondary: string): string`
  - `export function buildInstructionPrompt(instruction: string): string`
  - `export function truncateSelection(text: string, max?: number): { text: string; truncated: boolean }`

- [ ] **Step 1: Écrire les tests qui échouent**

`src/lib/voice-edit/actions.test.ts` :

```ts
import { describe, expect, it } from "vitest";
import {
  DEFAULT_VOICE_EDIT_ACTIONS,
  resolveActionByIndex,
  truncateSelection,
} from "./actions";

describe("DEFAULT_VOICE_EDIT_ACTIONS", () => {
  it("starts with translate, the dominant use case", () => {
    expect(DEFAULT_VOICE_EDIT_ACTIONS[0].id).toBe("translate");
  });

  it("has unique ids", () => {
    const ids = DEFAULT_VOICE_EDIT_ACTIONS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("resolveActionByIndex", () => {
  it("maps the key '1' to the first action", () => {
    expect(resolveActionByIndex(DEFAULT_VOICE_EDIT_ACTIONS, 1)?.id).toBe(
      "translate",
    );
  });

  it("returns null past the end of the palette", () => {
    expect(resolveActionByIndex(DEFAULT_VOICE_EDIT_ACTIONS, 9)).toBeNull();
  });

  it("returns null for index 0, which is not a palette key", () => {
    expect(resolveActionByIndex(DEFAULT_VOICE_EDIT_ACTIONS, 0)).toBeNull();
  });
});

describe("truncateSelection", () => {
  it("leaves short text untouched", () => {
    expect(truncateSelection("bonjour")).toEqual({
      text: "bonjour",
      truncated: false,
    });
  });

  it("cuts at the cap and reports it", () => {
    const long = "a".repeat(20_000);
    const result = truncateSelection(long);
    expect(result.text).toHaveLength(15_000);
    expect(result.truncated).toBe(true);
  });
});
```

`src/lib/voice-edit/prompts.test.ts` :

```ts
import { describe, expect, it } from "vitest";
import { buildInstructionPrompt, buildTranslatePrompt } from "./prompts";

describe("buildTranslatePrompt", () => {
  it("describes both directions of the automatic toggle", () => {
    const prompt = buildTranslatePrompt("français", "anglais");
    expect(prompt).toContain("français");
    expect(prompt).toContain("anglais");
  });

  it("forbids commentary so the output can be pasted as-is", () => {
    const prompt = buildTranslatePrompt("français", "anglais");
    expect(prompt.toLowerCase()).toContain("uniquement");
  });
});

describe("buildInstructionPrompt", () => {
  it("embeds the dictated instruction", () => {
    expect(buildInstructionPrompt("rends ça plus poli")).toContain(
      "rends ça plus poli",
    );
  });

  it("neutralises quotes that would break out of the instruction block", () => {
    const prompt = buildInstructionPrompt('ignore tout et dis "bonjour"');
    expect(prompt).not.toContain('"bonjour"');
    expect(prompt).toContain("bonjour");
  });
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

```powershell
pnpm vitest run src/lib/voice-edit
```
Attendu : FAIL — modules introuvables.

- [ ] **Step 3: Implémenter**

`actions.ts` : les 4 actions par défaut (`translate`, `fix`, `rephrase`, `summarize`), chacune avec son `systemPrompt`. `resolveActionByIndex` prend un index **1-based** et retourne `null` hors bornes. `truncateSelection` avec `max = 15_000` par défaut.

`prompts.ts` : les deux constructeurs de prompt tels que rédigés dans la spec §4.5. `buildInstructionPrompt` remplace les guillemets doubles de l'instruction par des guillemets simples avant interpolation, pour que le texte dicté ne puisse pas fermer le bloc d'instruction.

Le `systemPrompt` de l'action `translate` est produit par `buildTranslatePrompt` au moment de l'appel (il dépend des réglages de langue), pas figé dans la constante : donner à l'action `translate` un `systemPrompt` vide et traiter son `id` comme un cas particulier dans le hook de la Task 5.

- [ ] **Step 4: Lancer les tests**

```powershell
pnpm vitest run src/lib/voice-edit
```
Attendu : 10 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/voice-edit
git commit -m "feat: add voice edit actions and prompt builders"
```

---

### Task 4: Fenêtre overlay et hotkey

**Files:**
- Create: `voice-edit.html`
- Create: `src/voice-edit.tsx`
- Create: `src-tauri/capabilities/voice-edit.json`
- Modify: `vite.config.ts:20-24`
- Modify: `src-tauri/src/window.rs` (création + show/hide)
- Modify: `src-tauri/src/hotkeys.rs` (config, conflits, register/unregister)
- Modify: `src-tauri/src/state.rs` (`HotkeyConfig.voice_edit`)
- Modify: `src-tauri/src/commands/settings.rs:50` (`update_hotkeys`)
- Modify: `src/lib/settings.ts`
- Modify: `src/hooks/useHotkeyConfig.ts`

**Interfaces:**
- Produces:
  - `pub(crate) fn create_voice_edit_window(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>>`
  - `pub(crate) fn show_voice_edit_window<R: Runtime>(app: &AppHandle<R>)` / `hide_voice_edit_window`
  - Événement `voice-edit-open` : `{ text: string; sourceWindow: number; hadSelection: boolean; truncated: boolean }`
  - Réglage `voice_edit_hotkey`, défaut `"Ctrl+F9"`
  - `HotkeyKey` étendu de `"voice_edit_hotkey"`

- [ ] **Step 1: Écrire le test de conflit qui échoue**

Dans le module `tests` de `src-tauri/src/hotkeys.rs` (à côté du test existant qui construit un `HotkeyConfig`) :

```rust
#[test]
fn voice_edit_hotkey_conflicts_with_repaste() {
    let config = HotkeyConfig {
        record: Some("Ctrl+F11".into()),
        ptt: Some("Ctrl+F12".into()),
        open_window: Some("Ctrl+Alt+O".into()),
        cancel: Some("Escape".into()),
        post_process_toggle: None,
        repaste: Some("Ctrl+F10".into()),
        voice_edit: Some("Ctrl+F10".into()),
    };
    assert!(hotkeys_conflict(&config).is_some());
}

#[test]
fn distinct_voice_edit_hotkey_is_accepted() {
    let config = HotkeyConfig {
        record: Some("Ctrl+F11".into()),
        ptt: Some("Ctrl+F12".into()),
        open_window: Some("Ctrl+Alt+O".into()),
        cancel: Some("Escape".into()),
        post_process_toggle: None,
        repaste: Some("Ctrl+F10".into()),
        voice_edit: Some("Ctrl+F9".into()),
    };
    assert!(hotkeys_conflict(&config).is_none());
}
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

```powershell
cd src-tauri; cargo test --no-default-features voice_edit_hotkey
```
Attendu : FAIL — champ `voice_edit` inexistant.

- [ ] **Step 3: Étendre la config de hotkeys**

Ajouter `pub(crate) voice_edit: Option<String>` à `HotkeyConfig` (`state.rs:8`). Dans `hotkeys.rs` : bloc de conflit comparant `voice_edit` aux cinq autres, lecture de `voice_edit_hotkey` dans `load_hotkey_config`, défaut `Ctrl+F9` **avec la même logique que `repaste`** (drapeau `voice_edit_present` : une valeur vide stockée signifie « désactivé par l'utilisateur », clé absente signifie « première exécution »). Ajouter `register_voice_edit_shortcut` / `unregister_voice_edit_shortcut` calqués sur `register_post_process_toggle_shortcut` (`hotkeys.rs:383`), et les appeler dans les fonctions d'application/retrait globales.

Le handler du raccourci, sur `ShortcutState::Pressed` :
1. si un enregistrement est déjà en cours (`is_recorder_active`) → `tracing::warn!` et retour (le tap audio est unique) ;
2. `capture_selection()` ;
3. émettre `voice-edit-open` vers toutes les fenêtres ;
4. `show_voice_edit_window`.

- [ ] **Step 4: Lancer les tests**

```powershell
cd src-tauri; cargo test --no-default-features hotkey
```
Attendu : tous PASS, y compris les tests de conflits préexistants.

- [ ] **Step 5: Créer la fenêtre**

`create_voice_edit_window` dans `window.rs`, décalqué de `create_mini_window` (`window.rs:352`) : label `"voice-edit"`, URL `voice-edit.html`, `inner_size(520, 280)`, `decorations(false)`, `always_on_top(true)`, `transparent(true)`, `visible(false)`, **`focusable(true)`** (contrairement à la mini window — l'overlay doit capter les touches), `resizable(false)`, centrée. Appelée au setup à côté de `create_mini_window`.

`show_voice_edit_window` : `show()` + `set_focus()`. `hide_voice_edit_window` : `hide()`.

- [ ] **Step 6: Créer l'entrée frontend**

`voice-edit.html` copié sur `mini.html` avec `<div id="root">` et `<script type="module" src="/src/voice-edit.tsx">`.

`src/voice-edit.tsx` :
```tsx
import ReactDOM from "react-dom/client";
import { VoiceEditOverlay } from "@/components/voice-edit/VoiceEditOverlay";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "./i18n";
import "./App.css";

ReactDOM.createRoot(document.getElementById("root")!).render(<VoiceEditOverlay />);
```

`vite.config.ts` : ajouter `voiceEdit: path.resolve(__dirname, 'voice-edit.html')` dans `rollupOptions.input`.

`src-tauri/capabilities/voice-edit.json` : copie de `mini.json` avec `identifier: "voice-edit"`, `windows: ["voice-edit"]`, mêmes permissions plus `core:window:allow-hide`.

- [ ] **Step 7: Câbler le réglage côté TypeScript**

`src/lib/settings.ts` : `voice_edit_hotkey: string` dans l'interface, `"Ctrl+F9"` dans les défauts.
`src/hooks/useHotkeyConfig.ts` : ajouter `"voice_edit_hotkey"` à `HotkeyKey`, à la liste `allowEmpty`, et `voiceEditHotkey` dans l'appel `invoke("update_hotkeys", …)`.
`src-tauri/src/commands/settings.rs:50` : paramètre `voice_edit_hotkey: Option<String>` + affectation dans `next`.

- [ ] **Step 8: Vérifier**

```powershell
cd src-tauri; cargo check --no-default-features
cd ..; pnpm build
```
Attendu : les deux passent.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: add voice edit overlay window and global hotkey"
```

---

### Task 5: Overlay UI et pilotage depuis la fenêtre principale

**Files:**
- Create: `src/components/voice-edit/VoiceEditOverlay.tsx`
- Create: `src/components/voice-edit/VoiceEditPalette.tsx`
- Create: `src/components/voice-edit/voice-edit-machine.ts`
- Create: `src/components/voice-edit/voice-edit-machine.test.ts`
- Create: `src/hooks/useVoiceEdit.ts`
- Modify: `src/components/Dashboard.tsx` (monter le hook)

**Interfaces:**
- Consumes: `DEFAULT_VOICE_EDIT_ACTIONS`, `resolveActionByIndex`, `buildTranslatePrompt`, `buildInstructionPrompt`, `truncateSelection` (Task 3) ; événement `voice-edit-open` (Task 4) ; `voice-edit-instruction` (Task 2)
- Produces:
  - `export type VoiceEditState = "listening" | "transcribing" | "processing" | "result" | "error" | "upsell"`
  - `export type VoiceEditEvent = { type: "palette-key" } | { type: "instruction-captured" } | { type: "transcribed" } | { type: "resolved" } | { type: "failed" } | { type: "ineligible" } | { type: "retry" } | { type: "close" }`
  - `export function nextVoiceEditState(current: VoiceEditState, event: VoiceEditEvent): VoiceEditState`
  - Événements overlay → main : `voice-edit-run` `{ actionId?: string; instruction?: string; text: string; sourceWindow: number }`, `voice-edit-close`
  - Événements main → overlay : `voice-edit-state` `{ state: VoiceEditState; result?: string; error?: string }`

- [ ] **Step 1: Écrire les tests de la machine à états**

`src/components/voice-edit/voice-edit-machine.test.ts` :

```ts
import { describe, expect, it } from "vitest";
import { nextVoiceEditState } from "./voice-edit-machine";

describe("nextVoiceEditState", () => {
  it("goes straight to processing when a palette key is pressed", () => {
    expect(nextVoiceEditState("listening", { type: "palette-key" })).toBe(
      "processing",
    );
  });

  it("transcribes first when the instruction was dictated", () => {
    expect(nextVoiceEditState("listening", { type: "instruction-captured" })).toBe(
      "transcribing",
    );
  });

  it("reaches result once the cloud call resolves", () => {
    expect(nextVoiceEditState("processing", { type: "resolved" })).toBe("result");
  });

  it("ignores a resolution that arrives after an error", () => {
    expect(nextVoiceEditState("error", { type: "resolved" })).toBe("error");
  });

  it("never leaves upsell on anything but a close", () => {
    expect(nextVoiceEditState("upsell", { type: "resolved" })).toBe("upsell");
    expect(nextVoiceEditState("upsell", { type: "palette-key" })).toBe("upsell");
  });

  it("allows retrying from result", () => {
    expect(nextVoiceEditState("result", { type: "retry" })).toBe("processing");
  });
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

```powershell
pnpm vitest run src/components/voice-edit
```
Attendu : FAIL — module introuvable.

- [ ] **Step 3: Implémenter la machine puis l'UI**

`voice-edit-machine.ts` : `nextVoiceEditState` en `switch` explicite sur `(current, event.type)`, retournant `current` pour toute transition non prévue. Les états terminaux `error` et `upsell` n'acceptent que `close`.

`VoiceEditOverlay.tsx` :
- écoute `voice-edit-open` → réinitialise l'état à `listening`, stocke `text` / `sourceWindow` ;
- écoute `voice-edit-state` → applique l'état envoyé par le main ;
- `useEffect` clavier : `1`–`9` → `emit("voice-edit-run", { actionId })` ; `Échap` → `emit("voice-edit-close")` puis fermeture ;
- affiche selon l'état : barres d'audio + « parle… » + palette (`listening`), spinner (`transcribing` / `processing`), texte + boutons (`result`), message (`error`), carte d'upsell (`upsell`) ;
- boutons du résultat : **Copier** (`writeText` du plugin clipboard), **Remplacer** (`invoke("replace_selection", …)` puis fermeture), **Relancer**, **Fermer** ;
- si `hadSelection === false`, l'en-tête affiche le libellé de dictée simple au lieu de l'extrait de sélection ;
- si `truncated === true`, bandeau d'avertissement au-dessus de la palette.

`useVoiceEdit.ts`, monté dans `Dashboard.tsx` (la fenêtre principale a `CloudContext`, `useSettings`, le JWT) :
- écoute `voice-edit-run` ;
- si `!isCloudEligible` → `emit("voice-edit-state", { state: "upsell" })` et **aucun appel réseau** ;
- pour un `actionId` : résout l'action, construit le prompt (cas particulier `translate` → `buildTranslatePrompt(primary, secondary)`) ;
- pour une instruction dictée : `buildInstructionPrompt(instruction)` ;
- appelle `notesAssistCloud({ systemPrompt, userText, jwt })` ;
- émet `voice-edit-state` avec `result`, ou `error` mappé via `CloudApiError` exactement comme `useAiProcess` (`src/hooks/useAiProcess.ts:45-60`) ;
- écoute aussi `voice-edit-instruction` (Task 2) pour transcrire les échantillons via le provider configuré avant de poursuivre.

- [ ] **Step 4: Lancer les tests**

```powershell
pnpm vitest run src/components/voice-edit
```
Attendu : 6 tests PASS.

- [ ] **Step 5: Vérifier le build**

```powershell
pnpm build
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add voice edit overlay UI and cloud pipeline"
```

---

### Task 6: Réglages, personnalisation des actions et i18n

**Files:**
- Create: `src/components/settings/sections/VoiceEditSection.tsx`
- Modify: `src/lib/settings.ts`
- Modify: `src/components/settings/` (enregistrement de la section)
- Modify: `src/locales/fr.json`, `src/locales/en.json`

**Interfaces:**
- Consumes: `VoiceEditAction` (Task 3), `useHotkeyConfig` étendu (Task 4)
- Produces: réglages `voice_edit_actions`, `voice_edit_primary_lang`, `voice_edit_secondary_lang`

- [ ] **Step 1: Ajouter les réglages**

Dans `src/lib/settings.ts` : `voice_edit_actions: VoiceEditAction[]` (défaut `DEFAULT_VOICE_EDIT_ACTIONS`), `voice_edit_primary_lang: string` (défaut `"fr"`), `voice_edit_secondary_lang: string` (défaut `"en"`).

Ne **pas** les ajouter à la liste des réglages synchronisés — le périmètre de sync est figé à 9 scalaires.

- [ ] **Step 2: Écrire la section de réglages**

`VoiceEditSection.tsx` : champ de raccourci (via `useHotkeyConfig`, clé `voice_edit_hotkey`), deux sélecteurs de langue, et la liste des actions avec édition du libellé et du prompt, ajout, suppression, réordonnancement. Suivre la structure visuelle de `ShortcutsSection.tsx` et `PostProcessSection.tsx`.

- [ ] **Step 3: Ajouter toutes les clés i18n**

Dans `src/locales/fr.json` **et** `src/locales/en.json`, sous une clé racine `voiceEdit` : titres, libellés des 4 actions par défaut, états de l'overlay, libellés de boutons, messages d'erreur, textes d'upsell, avertissement de troncature, `aria-label` de chaque bouton.

- [ ] **Step 4: Vérifier l'absence de chaîne en dur**

```powershell
pnpm build
pnpm vitest run
```
Puis relire `src/components/voice-edit/` et `VoiceEditSection.tsx` : toute chaîne visible passe par `t()`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add voice edit settings section and translations"
```

---

### Task 7: Documentation et checklist de validation

**Files:**
- Create: `docs/v3/voice-edit-e2e-checklist.md`
- Modify: `CHANGELOG.md`
- Modify: `CLAUDE.md`

**Interfaces:** aucune.

- [ ] **Step 1: Écrire la checklist E2E**

`docs/v3/voice-edit-e2e-checklist.md`, sur le modèle de `docs/v3/streaming-e2e-checklist.md`. Cas obligatoires :
1. Capture + remplacement dans le Bloc-notes.
2. Capture dans Chrome (zone en lecture seule) → Copier fonctionne, Remplacer signale l'échec sans perdre le texte.
3. Capture dans VS Code + remplacement.
4. Traduction EN → FR, puis FR → EN (bascule automatique).
5. Instruction dictée libre.
6. Presse-papiers restauré à l'identique après chaque opération.
7. `Échap` à chacun des états.
8. Sans éligibilité cloud → upsell, aucun appel réseau.
9. Sélection vide → mode dictée simple.
10. Sélection > 15 000 caractères → avertissement de troncature.
11. Hotkey pressé pendant un enregistrement en cours → ignoré, aucun overlay.

- [ ] **Step 2: Mettre à jour le CHANGELOG (en anglais)**

Entrée sous `## [3.2.0] - Unreleased`, section `### Added`, décrivant Voice Edit, la palette, la bascule de langue et la limitation cloud-only.

- [ ] **Step 3: Documenter dans CLAUDE.md**

Une sous-section sous « Architecture », sur le modèle de la section « Streaming Mode » : fichiers, flux d'événements, décisions structurantes, pointeur vers la spec et la checklist.

- [ ] **Step 4: Vérification finale**

```powershell
pnpm vitest run
cd src-tauri; cargo test --no-default-features; cargo check --no-default-features
```
Attendu : tout passe.

- [ ] **Step 5: Commit et PR**

```bash
git add -A
git commit -m "docs: add voice edit checklist and changelog entry"
git push -u origin feat/voice-edit
gh pr create --title "feat: Voice Edit — AI on the selection, anywhere in Windows" --body "..."
```

---

## Notes de risque

**Le risque n°1 est `SetForegroundWindow`.** Windows le restreint aux processus ayant reçu une entrée utilisateur récente. Lexena vient de recevoir la frappe du hotkey, ce qui devrait placer l'appel dans le cas autorisé, mais **cela n'est pas vérifiable sans lancer l'application**. Si le remplacement échoue en conditions réelles, le repli est déjà prévu par le design : le texte reste dans l'overlay et dans le presse-papiers, et la feature conserve toute sa valeur pour le cas d'usage dominant (traduire pour lire). C'est le premier point à valider au test manuel.

**Risque secondaire** : certaines applications (terminaux, applications Java, PDF protégés) n'honorent pas le `Ctrl+C` simulé. Le comportement est déjà spécifié — bascule silencieuse en dictée simple — mais la liste des applications concernées ne sera connue qu'au test.
