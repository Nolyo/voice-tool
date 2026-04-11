# Frontend Refactor Progress

Branche : `refactor/frontend-architecture`
Plan source : `.claude/plans/dreamy-crafting-sutton.md` (local, non versionné)

## Objectif

Refactoriser le frontend (React + TS) vers une architecture feature-based, avec composants < 300 lignes, hooks isolés et types centralisés. Travail exécuté en plusieurs sessions — chaque phase est atomique (build OK + commit).

## Phases

- [x] **Phase 0** — Setup branche + fichier de suivi + `src/lib/types.ts`
- [x] **Phase 1** — Split `setting-tabs.tsx` (1370 → 16 fichiers, max 240 lignes, orchestrateur 85 lignes)
- [x] **Phase 2** — Split `notes-editor.tsx` (910 → 10 fichiers, max 218 lignes, orchestrateur 218 lignes)
- [x] **Phase 3** — Split `Dashboard.tsx` (584 → 199 lignes) + `src/lib/types.ts` populé
- [x] **Phase 4** — Réorganisation feature folders (10 fichiers déplacés, 6 imports corrigés)
- [ ] **Phase 5** — Mini-window state machine + cleanup final

## Structure cible

```
src/
├── components/
│   ├── dashboard/          # recording + historique + header
│   ├── notes/              # editor + tab + AI action menu
│   ├── settings/           # tabs + sections + common
│   ├── logs/
│   ├── common/             # partagés cross-feature
│   └── ui/                 # shadcn, inchangé
├── hooks/                  # + nouveaux hooks extraits
├── contexts/
└── lib/
    ├── types.ts            # types partagés (nouveau)
    ├── settings.ts
    ├── ai-prompts.ts
    └── utils.ts
```

## Decisions / Notes

- `SettingsContext` expose `settings` comme l'objet interne flat (`AppSettings["settings"]`), pas la racine. Les sections peuvent donc utiliser `useSettings()` directement sans props drilling.
- Chaque phase = 1 commit. Le build (`pnpm build`) doit passer avant commit.
- Tests UI : l'agent ne peut pas lancer `pnpm tauri dev` — demander à l'utilisateur de valider visuellement après chaque phase.
- **Phase 1** : les sections consomment `useSettings()` directement ; pas besoin de props drilling depuis `SettingTabs`. Les hooks `useModelDownload`/`useAutostart`/`useHotkeyConfig` encapsulent les invocations Tauri et sont réutilisables hors settings si besoin.
- **Phase 2** : `useNotesEditorInstance` utilise un `handleImageFileRef` (ref mutable) pour résoudre le temporal-dead-zone entre `editorProps.handlePaste/handleDrop` (closures) et `handleImageFile` qui dépend de l'instance `editor`. Plus idiomatique qu'un `let` réassigné. Le `NotesEditor.tsx` orchestrateur garde localement le `confirmDeleteOpen` state + la policy "ferme la note si vide" car c'est une logique cross-hook qui ne mérite pas son propre hook.
- **Phase 3** : les trois hooks initialement prévus (`useRecordingState` + `useTranscriptionWorkflow` + `useNotesWorkflow`) ont été consolidés en deux : `useRecordingWorkflow` (état + listeners + transcribe + toggle, 305 lignes) et `useNotesWorkflow`. Raison : `handleToggleRecording` a besoin de `isRecording`, `setIsRecording`, `transcribeAudio` et `setIsTranscribing` — les séparer en deux hooks imposerait du prop drilling entre hooks pour zero gain. Le hook dépasse légèrement les 300 lignes mais reste mono-responsabilité (recording feature). `setSelectedTranscription` est injecté via callback `onTranscriptionAdded` pour garder l'état de sélection dans Dashboard.
- **Phase 3** : `useSoundEffects` est appelé *dans* `useRecordingWorkflow` plutôt que passé en props — c'est une feature-interne pas un paramètre de l'API publique. Dashboard reste propre.

## Phase 1 — Détail d'extraction (ordre d'exécution)

Source : `src/components/setting-tabs.tsx` (1370 lignes)

### Common components (→ `src/components/settings/common/`)

| Fichier | Lignes source | Contenu |
|---|---|---|
| `SectionCard.tsx` | 75-103 | Wrapper card avec icône + titre + subtitle |
| `Divider.tsx` | 206-208 | Simple `<div className="h-px bg-border" />` |
| `KeyBadge.tsx` | 212-218 | Badge clavier mono `<kbd>`-like |
| `HotkeyInput.tsx` | 42-71, 232-380 | Input capture raccourci + helpers `normalizeKey`, `buildShortcutFromEvent`, `MODIFIER_KEYS` |
| `SettingsNav.tsx` | 107-204 | Nav latérale + `NAV_ITEMS` + `NavItem` type |

### Hooks (→ `src/hooks/`)

| Fichier | Lignes source | Responsabilité |
|---|---|---|
| `useModelDownload.ts` | 395-463 | State + actions download/check/delete modèle local Whisper |
| `useAutostart.ts` | 392-393, 465-475, 1158-1174 | State + toggle autostart Windows |
| `useHotkeyConfig.ts` | 477-513 | `handleHotkeyChange` avec invoke `update_hotkeys` |

### Sections (→ `src/components/settings/sections/`)

| Fichier | Lignes source | Dépendances |
|---|---|---|
| `TranscriptionSection.tsx` | 554-761 | `useModelDownload`, `ApiConfigDialog` |
| `AudioSection.tsx` | 763-921 | `useAudioDevices` |
| `TextSection.tsx` | 923-1014 | — |
| `VocabularySection.tsx` | 1016-1140 | — |
| `SystemSection.tsx` | 1142-1289 | `useAutostart` |
| `ShortcutsSection.tsx` | 1291-1342 | `useHotkeyConfig`, `HotkeyInput` |
| `UpdaterSection.tsx` | 1344-1353 | `UpdaterTab` |

### Orchestrateur (→ `src/components/settings/`)

`SettingTabs.tsx` (~250 lignes) :
- Load state gate (`isLoaded`)
- `SettingsNav` + scroll container + `activeSection` tracking (lignes 515-538)
- Assemble les 7 sections via `<SectionCard id=... />` wrapping
- Bouton "Fermer complètement l'application" (lignes 1356-1365)

L'ancien fichier `src/components/setting-tabs.tsx` sera **supprimé** et l'import dans `Dashboard.tsx` mis à jour vers `./settings/SettingTabs`.

## Next session

Prochaine phase : **Phase 5 — mini-window state machine + cleanup final**

Point de départ :
1. Lire `docs/REFACTOR_FRONTEND_PROGRESS.md` + dernier commit sur la branche
2. Lire `src/mini-window.tsx` (~295 lignes)
3. Extraire `src/hooks/useMiniWindowState.ts` ← les 6 listeners Tauri + state machine (idle/recording/processing/success/error)
4. Réduire `src/mini-window.tsx` à ~150 lignes (UI pure)
5. Passe finale : vérifier qu'il ne reste plus de fichiers > 300 lignes (hors shadcn `ui/`)
6. Build + commit

### Phase 1 — Résultats

Fichier supprimé : `src/components/setting-tabs.tsx` (1370 lignes)

Fichiers créés (1505 lignes au total répartis sur 16 fichiers) :
- `src/components/settings/SettingTabs.tsx` — 85 lignes (orchestrateur)
- `src/components/settings/common/` — SectionCard (40), Divider (3), KeyBadge (7), SettingsNav (112), HotkeyInput (192)
- `src/components/settings/sections/` — Transcription (240), Audio (172), Text (99), Vocabulary (149), System (147), Shortcuts (59), Updater (17)
- `src/hooks/` — useModelDownload (90), useAutostart (38), useHotkeyConfig (55)

Le seul import externe mis à jour : `src/components/Dashboard.tsx` ligne 22.

### Phase 4 — Résultats

10 fichiers déplacés via `git mv` (le contenu est inchangé hormis les imports) :

| Ancien path | Nouveau path |
|---|---|
| `components/recording-card.tsx` | `components/common/RecordingCard.tsx` |
| `components/audio-visualizer.tsx` | `components/common/AudioVisualizer.tsx` |
| `components/api-config-dialog.tsx` | `components/common/ApiConfigDialog.tsx` |
| `components/update-modal.tsx` | `components/common/UpdateModal.tsx` |
| `components/transcription-list.tsx` | `components/dashboard/transcription/TranscriptionList.tsx` |
| `components/transcription-details.tsx` | `components/dashboard/transcription/TranscriptionDetails.tsx` |
| `components/notes-tab.tsx` | `components/notes/NotesTab.tsx` |
| `components/ai-action-menu.tsx` | `components/notes/AiActionMenu.tsx` |
| `components/logs-tab.tsx` | `components/logs/LogsTab.tsx` |
| `components/updater-tab.tsx` | `components/settings/UpdaterTab.tsx` |

Imports corrigés dans 6 fichiers : `Dashboard.tsx`, `HistoriqueTab.tsx`, `NotesEditorFooter.tsx`, `TranscriptionSection.tsx`, `UpdaterSection.tsx`, `RecordingCard.tsx`. Les fichiers `UpdateModal.tsx` et `UpdaterTab.tsx` avaient des imports relatifs `./ui/` cassés par le déplacement — corrigés en `@/components/ui/`.

### Phase 3 — Résultats

`Dashboard.tsx` : **584 → 199 lignes** (orchestrateur pur : layout + routing tabs + sélection transcription).

Fichier déplacé : `src/components/dashboard-header.tsx` → `src/components/common/DashboardHeader.tsx` (46 lignes, inchangé).

Fichiers créés (814 lignes au total répartis sur 6 fichiers + Dashboard) :
- `src/lib/types.ts` — 21 lignes (`TranscriptionInvokeResult`, `RecordingResult`)
- `src/hooks/useRecordingWorkflow.ts` — 305 lignes (isRecording/isTranscribing + listeners audio-captured/recording-state/recording-cancelled + sons + transcribeAudio + handleToggleRecording)
- `src/hooks/useNotesWorkflow.ts` — 83 lignes (onglets notes + editorOpen + activeNoteId + create/open/close/delete handlers)
- `src/components/dashboard/DashboardSidebar.tsx` — 99 lignes (exporte `DASHBOARD_NAV_ITEMS` et `DashboardTabId`)
- `src/components/dashboard/tabs/HistoriqueTab.tsx` — 61 lignes (recording card + details + list)

Aucun import externe cassé — Dashboard était le seul consommateur de `dashboard-header.tsx`.

### Phase 2 — Résultats

Fichier supprimé : `src/components/notes-editor.tsx` (910 lignes)

Fichiers créés (1268 lignes au total répartis sur 10 fichiers) :
- `src/components/notes/NotesEditor/NotesEditor.tsx` — 218 lignes (orchestrateur)
- `src/components/notes/NotesEditor/NotesEditorTitleBar.tsx` — 126 lignes (close + tabs + maximize/half-screen)
- `src/components/notes/NotesEditor/NotesEditorContent.tsx` — 71 lignes (dispatcher empty/preview/loading/editor)
- `src/components/notes/NotesEditor/NotesEditorAiPreview.tsx` — 70 lignes (split view Original + Résultat)
- `src/components/notes/NotesEditor/NotesEditorFooter.tsx` — 95 lignes (AI menu + copy + delete, owns `justCopied`)
- `src/components/notes/NotesEditor/EditorBubbleMenu.tsx` — 198 lignes (formatting buttons + inline link editor)
- `src/hooks/useNotesWindow.ts` — 170 lignes (drag/resize/maximize/half-screen)
- `src/hooks/useNotesEditorInstance.ts` — 192 lignes (TipTap config + content loading + debounced save)
- `src/hooks/useAiAssistant.ts` — 69 lignes (wraps `useAiProcess`, plugs editor read/write)
- `src/hooks/useLinkEditor.ts` — 59 lignes (inline link state, auto-https normalization)

Le seul import externe mis à jour : `src/components/Dashboard.tsx` ligne 34.
