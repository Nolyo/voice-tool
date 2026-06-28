# Re-collage de la dernière transcription — Design

**Date** : 2026-06-28
**Branche** : `feat/repaste-last-transcription`
**Statut** : design validé, en attente de plan d'implémentation

## Problème

Quand une transcription est insérée au mauvais endroit (curseur mal placé, mauvais
champ de saisie focus), l'utilisateur doit aujourd'hui rouvrir Lexena, retrouver la
dernière transcription dans l'historique, la copier manuellement, revenir dans
l'application cible et coller. Friction quotidienne sur une action simple.

## Objectif

Un raccourci clavier global qui **recolle instantanément la dernière transcription**
à la position courante du curseur, sans rouvrir la fenêtre.

Périmètre figé (décisions de brainstorming) :

- **Profondeur** : uniquement la *dernière* transcription (pas de ring/historique).
- **Version** : le *texte final inséré* (post-processé si le post-process était actif,
  snippet étendu inclus) — pas de variante brute.
- **Hotkey par défaut** : `Ctrl+F10` (cohérent avec `Ctrl+F11` record / `Ctrl+F12` ptt,
  aucun conflit avec les défauts existants).
- **Feedback** : petit son de confirmation (la fenêtre est souvent cachée).

## Non-objectifs (YAGNI)

- Pas de re-collage des N dernières (ring).
- Pas de variante « brute sans post-process ».
- Pas de synchronisation cloud du nouveau hotkey (voir § Sync).
- Pas de feedback visuel/toast (le son + le texte collé suffisent).

## Architecture

On réutilise tel quel le pattern existant « hotkey global Rust → événement →
traitement frontend », identique au flux du hotkey d'enregistrement
(`audio-captured`). L'insertion réelle vit déjà côté frontend
(`useRecordingWorkflow.ts`), donc la refaire en Rust dupliquerait la logique de
presse-papiers ; on garde une seule source de vérité.

```
[Ctrl+F10 global]
   → Rust apply_hotkeys: handler émet "repaste-last-transcription"
      → Frontend (useRecordingWorkflow): listener
         → si ref dernier texte non vide:
              pasteTextPreservingClipboard(texte) + playSuccess()
         → sinon: no-op + log
```

La fenêtre principale tourne toujours (cachée en tray, jamais fermée) → l'événement
est toujours reçu, exactement comme pour `audio-captured`.

### Composants Rust

**`src-tauri/src/state.rs`** — `HotkeyConfig`
- Ajouter le champ `repaste: Option<String>`.

**`src-tauri/src/hotkeys.rs`**
- `hotkeys_conflict()` : ajouter `repaste` aux vérifications de conflit (doit être
  distinct de record / ptt / open_window / cancel / post_process_toggle).
- `load_hotkey_config()` : lire `repaste_hotkey` depuis le store ; défaut `Ctrl+F10`
  si absent.
- `apply_hotkeys()` : enregistrer le hotkey `repaste` comme `open_window` (handler
  toujours actif). Sur `ShortcutState::Pressed` : `app.emit("repaste-last-transcription", ())`.

**`src-tauri/src/commands/settings.rs`** — `update_hotkeys()`
- Ajouter le paramètre `repaste_hotkey: Option<String>` et la mise à jour
  `next.repaste = normalize_hotkey_value(...)` (même schéma que les autres).

### Composants frontend

**`src/lib/settings.ts`**
- Ajouter `repaste_hotkey: string` au type des settings + valeur par défaut `"Ctrl+F10"`
  dans `mergeSettings`.

**`src/hooks/useHotkeyConfig.ts`**
- Ajouter `"repaste_hotkey"` à l'union `HotkeyKey`.
- Passer `repasteHotkey` dans l'appel `invoke("update_hotkeys", { … })`.
- Autoriser la valeur vide (`allowEmpty`) pour `repaste_hotkey` (permet de désactiver
  le raccourci), comme `post_process_toggle_hotkey`.

**`src/hooks/useRecordingWorkflow.ts`** (cœur du changement)
- **Refactor** : extraire la séquence « sauvegarde presse-papiers → writeText →
  paste_text_to_active_window → restauration » (branche `insertion_mode === "cursor"`,
  lignes 266-284) en helper réutilisable `pasteTextPreservingClipboard(text)`.
  L'insertion normale en mode `cursor` appelle ce helper. (Le mode `clipboard` garde
  son comportement actuel sans restauration.)
- Ajouter une `ref` `lastInsertedTextRef` :
  - **seed** depuis la dernière entrée d'historique au montage → le re-collage marche
    dès le lancement, même après redémarrage de l'app ;
  - mise à jour avec `finalText` à chaque insertion dans `handleTranscriptionFinal`.
- `useEffect` : `listen("repaste-last-transcription", …)` :
  - si `lastInsertedTextRef.current` non vide → `pasteTextPreservingClipboard(text)`
    puis `playSuccess()` ;
  - sinon → no-op + `flog` info.
  - Le re-collage utilise **toujours** `pasteTextPreservingClipboard` quel que soit
    `insertion_mode` (y compris `none`) : c'est une action explicite de l'utilisateur,
    elle doit toujours coller.

**`src/components/settings/sections/ShortcutsSection.tsx`**
- Ajouter une ligne de configuration pour le hotkey re-collage (même UI / recorder que
  les autres hotkeys), câblée sur `handleHotkeyChange("repaste_hotkey", …)`.

**i18n** (`src/locales/fr.json` + `src/locales/en.json`)
- Libellé + description du nouveau hotkey. Toute string passe par react-i18next
  (aucun texte en dur).

## Flux de données

1. Transcription terminée → `handleTranscriptionFinal` calcule `finalText`, l'insère,
   et écrit `finalText` dans `lastInsertedTextRef`.
2. Plus tard, l'utilisateur appuie sur `Ctrl+F10` (fenêtre cachée ou non).
3. Rust émet `repaste-last-transcription`.
4. Le listener frontend recolle `lastInsertedTextRef.current` via
   `pasteTextPreservingClipboard`, joue `playSuccess`.

## Cas limites

| Cas | Comportement |
|-----|--------------|
| Aucune transcription dans la session ET historique vide | no-op + log info |
| App redémarrée | ref seedée depuis l'historique → re-collage OK sur la dernière connue |
| `insertion_mode === "none"` | le re-collage colle quand même (action explicite) |
| Hotkey vidé dans les réglages | raccourci désenregistré, fonctionnalité désactivée |
| Conflit avec un autre hotkey | `update_hotkeys` rejette + rollback (logique existante) |
| Presse-papiers contient une image/fichier | `readText` échoue → on perd la restauration mais le collage réussit (comportement actuel inchangé) |

## Sync

Le nouveau hotkey **n'est pas** synchronisé, par cohérence avec `cancel_hotkey` et
`post_process_toggle_hotkey` qui ne le sont pas non plus (seuls
`record_hotkey` / `ptt_hotkey` / `open_window_hotkey` sont dans le scope sync). Périmètre
serré, aucun fichier sync touché.

## Tests

- **Rust unitaire** (`hotkeys.rs`) : `hotkeys_conflict` détecte un `repaste` en
  collision avec chacun des autres hotkeys, et l'accepte quand il est distinct.
- **Vitest** : le helper extrait / le listener de re-collage — avec `invoke` et le
  plugin clipboard mockés (pattern existant des tests stores) :
  - re-collage appelle bien `paste_text_to_active_window` avec le dernier texte ;
  - no-op quand la ref est vide.

## Fichiers touchés (récap)

Rust : `state.rs`, `hotkeys.rs`, `commands/settings.rs`
Frontend : `lib/settings.ts`, `hooks/useHotkeyConfig.ts`, `hooks/useRecordingWorkflow.ts`,
`components/settings/sections/ShortcutsSection.tsx`, `locales/fr.json`, `locales/en.json`
Tests : `hotkeys.rs` (unit), un fichier Vitest pour le helper/listener.
