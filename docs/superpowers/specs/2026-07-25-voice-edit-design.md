# Voice Edit — l'IA vocale sur la sélection, partout dans Windows — Design

**Date** : 2026-07-25
**Statut** : validé (brainstorming complet avec l'utilisateur)
**Périmètre** : un raccourci global qui capture le texte sélectionné dans n'importe quelle
application, écoute une instruction dictée (ou une action rapide de la palette), et affiche
le résultat dans un overlay avec option de remplacement in-place.

## 1. Contexte et objectif

Lexena sait faire `voix → texte` : dictée, streaming, post-process, auto-paste. L'IA existe
déjà mais reste enfermée dans l'éditeur de notes (bubble menu → `useAiProcess` →
`notes_assist_cloud`).

Voice Edit ajoute `texte existant + voix → texte transformé`, disponible **hors de l'app**,
dans n'importe quelle fenêtre Windows. C'est le passage de dictaphone à copilote texte
système-wide.

**Cas d'usage dominant validé par l'utilisateur** : sélectionner un texte anglais dans un
navigateur, un PDF ou un mail, et obtenir la traduction française sans quitter le contexte.
Cas secondaire : réécrire / corriger / résumer un texte qu'on est en train d'écrire.

Conséquence structurante de ce cas dominant : **le texte traduit est le plus souvent en
lecture seule**. La sortie ne peut donc pas être « remplace la sélection » uniquement.

## 2. Décisions de cadrage (validées)

| Question | Décision |
|---|---|
| Sortie du résultat | **Overlay de preview d'abord**, bouton « Remplacer » proposé seulement si la sélection était éditable. Un seul flux couvre traduire-pour-lire et réécrire-pour-écrire. |
| Déclenchement | **Un seul hotkey global** ouvrant l'overlay avec micro déjà ouvert. Instruction dictée **ou** touche chiffrée pour une action enregistrée de la palette. |
| Fin de l'instruction dictée | **Détection automatique de silence** (~800 ms) via le `SpeechSegmenter` existant. Pas de seconde frappe. |
| Langue de traduction | **Bascule automatique** : texte en langue étrangère → langue principale ; texte déjà en langue principale → langue secondaire. Deux réglages (`fr` / `en` par défaut). |
| Détection de langue | **Par le LLM** dans le system prompt, pas de lib de détection côté client. |
| Provider IA | **Cloud uniquement** (`notes_assist_cloud`), gated sur l'éligibilité, y compris si la transcription est en local. |
| Palette par défaut | `1` Traduire · `2` Corriger · `3` Reformuler · `4` Résumer. Éditable dans les settings. |
| Sélection vide | Bascule silencieuse en dictée simple avec preview, pas d'erreur. |
| Plateforme | **Windows uniquement** (comme le reste de l'app aujourd'hui). |

**Hors périmètre (YAGNI explicite)** : historique dédié des Voice Edits, chaînage d'actions,
packs d'actions partagés, streaming du résultat, support macOS/Linux, retraitement du
texte déjà collé.

## 3. Parcours utilisateur

### 3.1 Flux nominal

1. L'utilisateur sélectionne un paragraphe dans une application tierce.
2. Il presse le hotkey Voice Edit. Lexena capture la sélection **avant** d'afficher quoi que
   ce soit, puis ouvre l'overlay avec le micro déjà ouvert.
3. Deux voies exclusives :
   - **touche `1`–`9`** → l'action correspondante de la palette part immédiatement, le micro
     est coupé sans transcription ;
   - **parole** → à la détection du silence de fin, l'instruction est transcrite puis utilisée
     comme system prompt additionnel.
4. Appel `notes_assist_cloud`. L'overlay passe en état `loading`.
5. Le résultat s'affiche. Actions : **Copier**, **Relancer**, **Remplacer** (seulement si la
   sélection était éditable), **Fermer**.
6. `Échap` à n'importe quel moment ferme sans rien modifier et sans appel réseau en cours.

### 3.2 Détermination de « la sélection était éditable »

Windows ne fournit pas de réponse fiable et bon marché à cette question sans passer par
UI Automation, qui est notoirement non fiable dans les navigateurs et les applications
Electron.

**Décision** : on ne tente pas de le deviner. Le bouton **Remplacer** est **toujours affiché**
quand une sélection non vide a été capturée. Si le remplacement échoue (zone en lecture
seule), le texte a de toute façon été placé dans le presse-papiers au préalable et l'overlay
affiche un message expliquant que la zone n'a pas accepté l'insertion. Cette approche est
plus honnête que de masquer un bouton sur la foi d'une heuristique fausse une fois sur trois.

### 3.3 États de l'overlay

```
idle ──(hotkey)──> capturing ──> listening ──(silence | touche 1-9)──> transcribing
                                                                            │
                                    ┌───────────────────────────────────────┘
                                    ▼
                                processing ──> result ──(Remplacer)──> replacing ──> closed
                                    │                                       │
                                    └──(erreur)──> error                    └──(échec)──> result + note
```

## 4. Architecture

### 4.1 Ce qui est réutilisé tel quel

| Brique existante | Emplacement | Usage dans Voice Edit |
|---|---|---|
| `notes_assist_cloud` | `src-tauri/src/cloud.rs:246` | Appel LLM — signature déjà idéale (`system_prompt` + `user_text`) |
| `type_text_at_cursor` | `src-tauri/src/commands/misc.rs:35` | Remplacement sans toucher au presse-papiers |
| `paste_text_to_active_window` | `src-tauri/src/commands/misc.rs:3` | Remplacement en mode presse-papiers |
| `SpeechSegmenter` | `src-tauri/src/streaming.rs` | Détection de fin d'instruction |
| Validation de conflits de hotkeys | `src-tauri/src/hotkeys.rs:20-40` | Le nouveau hotkey y est ajouté |
| `insertion_mode` | `src/lib/settings.ts:33` | Choix du mécanisme de remplacement |
| `CloudApiError` | `src/lib/cloud/errors.ts` | Mapping des erreurs quota / auth / réseau |
| `windows-sys` 0.59 `Win32_UI_WindowsAndMessaging` | `src-tauri/Cargo.toml:102` | `GetForegroundWindow` / `SetForegroundWindow` |
| Pattern multi-fenêtres | `mini.html`, `note.html` | Modèle de la fenêtre overlay |

**Aucune nouvelle dépendance Rust ou npm. Aucune migration de base de données. Aucune
modification du worker cloud.**

### 4.2 Nouvelles commandes Rust — `src-tauri/src/commands/selection.rs`

```rust
pub struct CapturedSelection {
    pub text: String,
    pub source_window: isize,   // HWND sérialisé pour le frontend
    pub had_selection: bool,
}

#[tauri::command]
pub fn capture_selection() -> Result<CapturedSelection, String>
```

Séquence :

1. `GetForegroundWindow()` → mémorise le HWND source.
2. Lit et sauvegarde le contenu texte courant du presse-papiers.
3. Vide le presse-papiers (permet de distinguer « rien copié » de « ancien contenu »).
4. `enigo` : `Ctrl` press → `c` click → `Ctrl` release.
5. Attente de ~120 ms, puis relecture du presse-papiers.
6. Restauration de l'ancien contenu.
7. Retourne le texte capturé (`had_selection = false` si vide).

```rust
#[tauri::command]
pub fn replace_selection(text: String, source_window: isize, mode: String) -> Result<(), String>
```

Séquence :

1. `SetForegroundWindow(HWND)` + délai de stabilisation (~80 ms).
2. Selon `mode` : délègue à `type_text_at_cursor` (mode `cursor`) ou écrit dans le
   presse-papiers puis `paste_text_to_active_window` (mode `clipboard`).
3. Toute erreur remonte au frontend, qui laisse l'overlay ouvert avec le texte.

**Risque technique identifié** : Windows restreint `SetForegroundWindow` aux processus ayant
reçu une entrée utilisateur récente. Lexena vient de recevoir la frappe du hotkey, ce qui
place l'appel dans le cas autorisé, mais ce comportement doit être **validé par un test réel
avant de construire le reste** (voir §7).

### 4.3 Fenêtre overlay

Décalque du pattern mini window :

- `voice-edit.html` à la racine + entrée dans `vite.config.ts` (`rollupOptions.input`)
- `src/voice-edit.tsx` → `src/components/voice-edit/VoiceEditOverlay.tsx`
- `src-tauri/capabilities/voice-edit.json` — permissions minimales
- Création dans `src-tauri/src/window.rs` : **pré-créée au démarrage et cachée**, comme la
  mini window (le CLAUDE.md documente que la création à la demande produit un lag visible)
- Transparente, sans décorations, always-on-top, centrée sur le moniteur courant

L'overlay **prend le focus** — c'est ce qui permet de capter les touches `1`–`9` et `Échap`
sans enregistrer de raccourcis globaux supplémentaires. Le HWND source est mémorisé avant
l'ouverture, donc la perte de focus de la fenêtre d'origine est sans conséquence.

### 4.4 Écoute de l'instruction

`SegmenterConfig` est déjà entièrement paramétrable et `SpeechSegmenter` est `pub` :
**`streaming.rs` n'a pas besoin d'être modifié**. Voice Edit ajoute son propre worker dans
`src-tauri/src/voice_edit.rs`, décalqué de `run_streaming_worker`, qui s'arrête au **premier
segment complet** au lieu d'en streamer une suite.

Config dédiée : `silence_gap_ms: 800` (contre 600 en streaming, pour tolérer une hésitation
en milieu d'instruction), `min_segment_ms: 400` (une instruction est courte), le reste
identique.

Le tap audio (`recorder.set_chunk_tap`) est unique. Voice Edit et le streaming ne peuvent
donc pas coexister : **si un enregistrement est déjà en cours, le hotkey Voice Edit est
ignoré** (log `warn`, aucun overlay).

La transcription de l'instruction passe par le provider configuré (cloud ou local) — c'est
une phrase de 2 à 3 secondes, le coût est négligeable dans les deux cas.

### 4.5 Construction du prompt

L'appel `notes_assist_cloud` reçoit :

- `user_text` : le texte capturé, tronqué à 15 000 caractères
- `system_prompt` : le prompt de l'action de palette choisie, ou un prompt générique
  encadrant l'instruction dictée

Prompt de l'action « Traduire » (bascule automatique) :

```
Tu es un traducteur. Détecte la langue du texte fourni.
Si elle est différente de {primary}, traduis vers {primary}.
Si elle est {primary}, traduis vers {secondary}.
Rends uniquement la traduction, sans commentaire, sans guillemets,
en préservant la mise en forme, les sauts de ligne et la ponctuation.
```

Prompt pour une instruction dictée :

```
Applique l'instruction suivante au texte fourni :
« {instruction} »
Rends uniquement le texte résultant, sans commentaire ni préambule.
```

### 4.6 Nouveaux réglages — `src/lib/settings.ts`

| Clé | Type | Défaut |
|---|---|---|
| `voice_edit_hotkey` | `string` | `""` (à configurer, comme `post_process_toggle_hotkey`) |
| `voice_edit_actions` | `VoiceEditAction[]` | 4 actions par défaut |
| `voice_edit_primary_lang` | `string` | langue de l'UI |
| `voice_edit_secondary_lang` | `string` | `"en"` |

```ts
type VoiceEditAction = { id: string; label: string; systemPrompt: string };
```

Ces clés ne sont **pas** ajoutées à la liste des settings synchronisés (9 scalaires figés,
cf. ADR sync) : `voice_edit_actions` est un tableau, et l'ajouter demanderait de toucher le
mapping de sync. Hors périmètre.

## 5. Gating et modèle économique

L'étape LLM n'existe qu'en cloud. Voice Edit est donc **entièrement cloud-gated**, même
lorsque la transcription tourne en local.

L'overlay s'ouvre pour tout le monde ; si l'utilisateur n'est pas éligible, il affiche un état
d'upsell **avant tout appel réseau**, sur le modèle du bubble menu des notes qui se gate sur
`isCloudEligible`.

Cela donne à l'abonnement un usage quotidien concret et tangible, plutôt qu'un quota de
minutes abstrait.

## 6. Gestion d'erreurs

| Situation | Comportement |
|---|---|
| `Ctrl+C` ne rend rien | Bascule en dictée simple avec preview, pas de message d'erreur |
| Remplacement refusé par la zone cible | Texte conservé dans l'overlay et dans le presse-papiers, message explicite |
| `SetForegroundWindow` échoue | Idem — le texte n'est jamais perdu |
| Non éligible cloud | État upsell, aucun appel réseau |
| Quota dépassé / auth expirée | `CloudApiError` mappée comme dans `useAiProcess` |
| Réseau indisponible | Message + bouton Relancer |
| Sélection > 15 000 caractères | Troncature avec avertissement affiché avant l'appel |
| Échec d'init `enigo` | Erreur remontée, overlay fermé |

**Invariant** : le presse-papiers de l'utilisateur est toujours restauré, y compris sur les
chemins d'erreur (restauration dans un `Drop` ou un bloc de nettoyage systématique).

## 7. Ordre d'implémentation

Le risque technique est concentré sur un seul point. Il est traité en premier.

1. **Spike `SetForegroundWindow` + `Ctrl+C` simulé** — commandes Rust nues, testées depuis un
   bouton temporaire. Résultat attendu : capture et remplacement fonctionnels dans le
   Bloc-notes, un navigateur et VS Code. **Si ce spike échoue, le design de la sortie doit
   être revu (overlay seul) avant d'aller plus loin.**
2. Commandes `capture_selection` / `replace_selection` propres, avec restauration du
   presse-papiers et tests unitaires Rust sur les parties pures.
3. Fenêtre overlay + hotkey + palette, sans micro : les actions de palette fonctionnent de
   bout en bout.
4. Écoute vocale de l'instruction via `SpeechSegmenter`.
5. Réglages et onglet de personnalisation des actions.
6. i18n complète (fr + en), aucune chaîne en dur.

## 8. Tests

**Rust unitaires** : construction des prompts, troncature à 15 000 caractères, sélection de
langue de la bascule automatique, parsing des réglages.

**Vitest** : machine à états de l'overlay (transitions et transitions interdites), mapping des
erreurs cloud, résolution action de palette → system prompt, bascule de langue.

**Manuel** (checklist à écrire dans `docs/v3/voice-edit-e2e-checklist.md`) : capture et
remplacement dans le Bloc-notes, Chrome, VS Code, Word et un PDF en lecture seule ;
restauration du presse-papiers ; `Échap` à chaque état ; comportement hors éligibilité ;
sélection vide ; sélection très longue.

`pnpm tauri dev` n'étant pas lançable par l'agent, la validation runtime est faite par
l'utilisateur.

## 9. Fichiers touchés

**Nouveaux**
- `src-tauri/src/commands/selection.rs`
- `src-tauri/src/voice_edit.rs`
- `voice-edit.html`
- `src/voice-edit.tsx`
- `src/components/voice-edit/` (overlay, palette, états)
- `src/hooks/useVoiceEdit.ts`
- `src/lib/voice-edit/` (prompts, actions par défaut, machine à états)
- `src-tauri/capabilities/voice-edit.json`

**Modifiés**
- `src-tauri/src/commands/mod.rs`, `lib.rs` (enregistrement des commandes)
- `src-tauri/src/hotkeys.rs` (hotkey + validation de conflits)
- `src-tauri/src/window.rs` (création de la fenêtre)
- `vite.config.ts` (entrée multi-page)
- `src/lib/settings.ts` (4 clés)
- `src/components/settings/sections/` (personnalisation des actions)
- `src/locales/*` (fr + en)
- `CHANGELOG.md`
