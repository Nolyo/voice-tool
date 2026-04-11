# Frontend Refactor Progress

Branche : `refactor/frontend-architecture`
Plan source : `.claude/plans/dreamy-crafting-sutton.md` (local, non versionné)

## Objectif

Refactoriser le frontend (React + TS) vers une architecture feature-based, avec composants < 300 lignes, hooks isolés et types centralisés. Travail exécuté en plusieurs sessions — chaque phase est atomique (build OK + commit).

## Phases

- [x] **Phase 0** — Setup branche + fichier de suivi + `src/lib/types.ts`
- [ ] **Phase 1** — Split `setting-tabs.tsx` (1370 → ~300 lignes)
- [ ] **Phase 2** — Split `notes-editor.tsx` (910 → ~250 lignes)
- [ ] **Phase 3** — Split `Dashboard.tsx` (584 → ~250 lignes) + types centralisés
- [ ] **Phase 4** — Réorganisation feature folders (dashboard/, notes/, common/, logs/)
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

Prochaine phase : **Phase 2 — notes-editor.tsx split**
Point de départ : lire `src/components/notes-editor.tsx` complet, créer `src/hooks/useNotesWindow.ts` en premier (logique drag/resize/maximize, lignes ~258-346).
