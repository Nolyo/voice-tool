# ADR 0017 — Clôture sub-épique 03 sync-notes

- **Statut** : Accepté
- **Date** : 2026-05-19
- **Sous-épique** : 03 — Sync notes
- **Supersedes** : —
- **Lien plan** : [`docs/superpowers/plans/2026-05-19-v3-sub-epic-03-sync-notes.md`](../../superpowers/plans/2026-05-19-v3-sub-epic-03-sync-notes.md)
- **Lien design** : [`docs/superpowers/specs/2026-05-19-v3-sub-epic-03-sync-notes-design.md`](../../superpowers/specs/2026-05-19-v3-sub-epic-03-sync-notes-design.md)
- **Lien spec figée** : [`docs/v3/03-sync-notes.md`](../03-sync-notes.md)
- **ADR principal** : [`0016-notes-sync-strategy.md`](./0016-notes-sync-strategy.md)

## Contexte

Sub-épique 03 livre la sync cloud des notes texte + dossiers : 2 nouvelles tables Supabase (`user_notes`, `user_folders`), Edge Functions étendues (`sync-push` v2 avec 4 nouvelles operations + per-plan quota, `account-export` v2, `purge-account-deletions` étendu), backend Rust avec soft-delete LWW, frontend sync engine (queue + merge + stores + hooks debouncés 2s), UX (banner >1 MB + carte plan + compteurs).

Tout sort sur une future bêta `v3.0.0-beta.X` (cf. `project_v3_no_subversions`).

## Ajustements vs plan initial

| # | Ajustement | Raison |
|---|---|---|
| A1 | `LocalBackup` n'est PAS dans `src-tauri/src/sync.rs` — l'archi backup est **frontend-driven** (`src/lib/sync/backups.ts`). | Plan basé sur une struct Rust hypothétique qui n'existait pas. L'extension a été faite côté TS (BackupPayload v2) + 2 nouvelles commandes Rust `import_note_for_backup` / `import_folders_for_backup` pour restore. |
| A2 | Pas de `mergeNotes` bulk : la merge est **per-item** (`mergeNoteLWW`). | Cohérence avec le pattern existant `mergeSnippetLWW`. Le caller (notes-store.applyRemoteNote) appelle item-par-item. |
| A3 | `SyncedDataOverview.tsx` n'existe pas en tant que composant standalone — la grille de compteurs vit dans `AccountSection.tsx::SyncedInventoryGrid`. | Architecture héritée sub-epic 02. Modification inline plutôt que création d'un fichier orphelin. |
| A4 | Upsell free → **carte passive** au lieu de gating "à 80% du quota". | Spec recommandait de skipper la version live-usage pour v3.0 (RPC supplémentaire complexe). La carte passive informe sans bruit. |
| A5 | Pre-existing `5_242_880` / `5 * 1024 * 1024` à éradiquer : **aucun trouvé** dans `src/`. | Le code client n'avait pas encore d'usage hardcodé du quota. `quota.ts` est la première source de vérité côté front. Côté serveur, `QUOTA_BYTES` (5 MB) a été remplacé par `QUOTA_BY_PLAN` dans `sync-push/schema.ts` lors de Task 5. |
| A6 | `applyRemoteNote` + `applyRemoteFolder` ont une **garde tombstone-only** : un remote tombstone pour une note locale absente est un no-op. | Évite la création-puis-purge immédiate d'un dossier de note vide. Réduit l'I/O sur premier pull. |
| A7 | Purge post-pull = passage **des IDs serveur-tombstoned** à `purge_soft_deleted_*_post_pull`, pas un sweep local par âge 30j. | Le serveur est autoritatif sur les tombstones (cron purge >30j). Le client purge à la réception. Évite la coordination temporelle locale. |
| A8 | `reorder_folders` bump `updated_at` uniquement sur les folders **présents dans le payload `ids`**, pas sur les trailing kept stable. | Plan permettait le simpler "bump all" mais le diff explicite est sémantiquement plus précis (les folders trailing ne sont pas réellement déplacés). |
| A9 | Read-merge-write du fichier `folders.json` entier à chaque `applyRemoteFolder`. | Trade-off perf accepté : à >100 folders/user (rare en v3.0) on optimisera. Le pattern actuel garde la cohérence transactionnelle de `folders.json`. |
| A10 | `welcome.note` (first launch) passe par `createNoteSynced` → enqueue. | Si l'user active la sync plus tard, la welcome note devient sa première note synchronisée naturellement (pas de cas spécial). |
| A11 | Debounce registry `updateNoteDebounceMap` **dans `notes-store.ts`**, pas dans le hook. | Importable depuis `SyncContext` pour flush au logout (Task 19) sans circular dep hook → context. |

## Follow-ups (non bloquants pour la livraison sub-epic 03)

- **F1** : Bumping quotas data-driven post-traction. Les seuils 10/100/500 MB sont figés v3.0 ; à réévaluer après >50 sync users actifs.
- **F2** : Restore depuis corbeille UI — différé. Le revival d'une note soft-deleted via `update_note` (qui ne reset pas `deleted_at`) est partiellement supporté ; un mutateur dédié `restore_note` est à concevoir si la demande remonte.
- **F3** : Pastille sync par note (vert/orange/gris) — différé. La banner globale `quota-exceeded` couvre le cas pathologique.
- **F4** : FTS Postgres serveur — différé. Search reste local pour v3.0.
- **F5** : Realtime via Supabase Channels — différé. Pull periodic + manuel suffisent pour 1-3 devices/user en v3.0.
- **F6** : CRDT sur `content_html` — différé. LWW silent overwrite acceptable pour les cas concurrents rares (1 user, plusieurs devices).
- **F7** : Pagination liste notes — différé jusqu'à un user atteint >1000 notes.
- **F8** : Compression gzip payloads sync-push — différé. Les payloads notes (1 MB cap) restent dans le budget HTTP/2 raisonnable.
- **F9** : Le pre-existing `TryItStep onboarding` test était flaky en début de sub-epic ; il s'est restabilisé en fin de cycle. À surveiller post-merge.
- **F10** : `toggleNoteFavoriteSynced` et `moveNoteToFolderSynced` font un `read_note` supplémentaire pour shipper le content. Optimisation possible si la queue/cloud row sépare meta de content (refacto plus invasif).

## Décisions opérationnelles consolidées

| # | Décision | Origine |
|---|---|---|
| 1 | Tables séparées `user_notes` + `user_folders` avec FK `folder_id ON DELETE SET NULL` | ADR 0016 |
| 2 | LWW par item (timestamp `updated_at` comparé via `>=` pour tied→remote wins) | ADR 0016 |
| 3 | Soft-delete via `deleted_at` ; purge serveur cron 30j ; purge client post-pull à réception | ADR 0016 + A6 + A7 |
| 4 | Hard cap 1 MB par note via Zod `max(1_048_576)` côté Edge + check constraint Postgres `octet_length(content_html) <= 1048576` | ADR 0016 |
| 5 | Quota par plan : Free 10 MB / Starter 100 MB / Pro 500 MB. Lecture via `subscriptions(plan, status)`. `on_trial` + `active` comptent comme actifs ; tout autre statut ou absence de row = free. | ADR 0016 |
| 6 | Debounce 2s sur `updateNote` push (coalesce keystrokes). Mutex local mode (notes/folders) géré côté Rust + queue mutex côté frontend. | Spec |
| 7 | Server force `deleted_at: null` sur upsert (server-authoritative). Client ne peut pas tombstoner via upsert ; toujours via `note-delete` op. | Code review Task 5 |
| 8 | Backup local format v2 inclut notes + folders. Rétro-compat avec backups v1 (notes/folders absents → restore stores uniquement). | A1 |
| 9 | Compteurs UI (modale activation + grille account) basés sur listNotes/listFolders qui filtrent déjà les tombstones côté Rust. | Task 20+21 |

## Vérification

- ✅ Migrations 20260601000800-001000 appliquées localement (à confirmer en distant lors du déploiement bêta).
- ✅ pgtap RLS cross-tenant + size constraint : 3 fichiers de tests (5+6+2 assertions).
- ✅ Tests Deno sync-push : 28 passing (10 nouveaux : 4 ops + 5 quotas + on_trial).
- ✅ Tests Deno account-export : 12 passing (4 nouveaux : v2 + notes + folders).
- ✅ Tests Deno purge-account-deletions : 10 passing (3 nouveaux : sync purge counts + error isolation).
- ✅ Tests Rust unit : 6 notes + 9 folders = 15 verts (round-trips serde + helpers purs).
- ✅ Tests Vitest : 266/266 verts (incluant nouveaux dans `mapping.test.ts`, `client.test.ts`, `merge.test.ts`, `notes-store.test.ts`, `folders-store.test.ts`, `quota.test.ts`, `backups.test.ts`).
- ✅ `pnpm exec tsc -p tsconfig.json --noEmit` clean.
- ✅ `cargo check` clean (avec `LIBCLANG_PATH` + CMake en PATH).
- ⏳ Checklist E2E manuelle (12 cas) — à dérouler avant le tag bêta de livraison (cf. `docs/v3/03-sync-notes-e2e-checklist.md`).
- ⏳ Déploiement Edge Functions : `sync-push`, `account-export`, `purge-account-deletions` — action utilisateur via `pnpm exec supabase functions deploy ...`.

## Liens

- ADR 0016 (figé) : [`0016-notes-sync-strategy.md`](./0016-notes-sync-strategy.md)
- Spec figée : [`../03-sync-notes.md`](../03-sync-notes.md)
- Plan : [`../../superpowers/plans/2026-05-19-v3-sub-epic-03-sync-notes.md`](../../superpowers/plans/2026-05-19-v3-sub-epic-03-sync-notes.md)
- Design : [`../../superpowers/specs/2026-05-19-v3-sub-epic-03-sync-notes-design.md`](../../superpowers/specs/2026-05-19-v3-sub-epic-03-sync-notes-design.md)
- Checklist E2E : [`../03-sync-notes-e2e-checklist.md`](../03-sync-notes-e2e-checklist.md)
- Runbook purge : [`../runbooks/account-deletion-purge.md`](../runbooks/account-deletion-purge.md)
