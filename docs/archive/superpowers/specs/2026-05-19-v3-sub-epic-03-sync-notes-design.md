# V3 Sub-Epic 03 — Sync Notes Design

**Date** : 2026-05-19
**Statut** : design figé, prêt à être planifié
**Sous-épique principal** : `03-sync-notes` (livraison dans une future bêta `v3.0.0-beta.X` — tout sort sur v3.0 incrémentale)
**Sous-épiques touchés** : `02-sync-settings` (extension queue + Edge Function), `01-auth` (réutilisation JWT)
**ADR créé** : [`0016-notes-sync-strategy.md`](../../../v3/decisions/0016-notes-sync-strategy.md)
**Living document** : [`docs/v3/03-sync-notes.md`](../../../v3/03-sync-notes.md)

---

## 1. Contexte et problème

Le sous-épique 02 (sync settings) est livré et stabilisé : 3 tables Supabase, RLS deny-by-default, Edge Function `sync-push`, lifecycle-based, LWW par item, soft-delete, quota 5 MB, backup local, modale migration. Le pattern est éprouvé.

Le sous-épique 03 livre la sync cloud des notes texte + dossiers. Le stub [`03-sync-notes.md`](../../../v3/03-sync-notes.md) listait 8 questions ouvertes. Cette spec figée fait écho à la décision : **aligner maximalement sur le pattern settings**, et n'introduire des écarts que là où la nature "édition continue" des notes l'exige.

### Contraintes de cadrage

- **Le pattern settings est figé** — on ne re-discute pas LWW vs CRDT, lifecycle vs Realtime, schéma blob vs tables séparées : les décisions sont prises.
- **Notes ≠ settings** sur deux axes : volumétrie (jusqu'à 1 MB/note vs <2 KB/blob settings) et fréquence d'édition (continue vs ponctuelle). Ces axes justifient deux ajustements : debounce 2s vs 500ms, quota freemium hybride (10/100/500 MB selon plan) vs quota fixe 5 MB.
- **Backlinks restent local** — pas de table serveur dédiée, recalculés post-pull. KISS.
- **Posture launch free-tier** — pas de dépendance Supabase Pro, pas de Cloudflare Worker dédié, pas de service externe.

---

## 2. Décisions de design

| # | Sujet | Décision | Référence ADR |
|---|---|---|---|
| Q1 | Schéma DB | **2 tables séparées** (`user_notes`, `user_folders`) avec UUID client-side, LWW par item, soft-delete | 0016 §2 |
| Q2 | Format contenu | **`content_html text`** (TipTap HTML brut tel quel), le serveur ne touche pas au contenu | 0016 §9 |
| Q3 | Conflict resolution | **LWW par row complet** via `updated_at` serveur, soft-delete via `deleted_at` | 0016 §5 |
| Q4 | Sync engine | **Lifecycle-based** (extend pattern sub-epic 02), pas de Realtime | 0016 §3 |
| Q5 | Debounce push | **2s par note** sur `update_note` (frappe continue), immédiat pour create/move/delete/rename | 0016 §4 |
| Q6 | Quota | **Freemium hybride** : Free 10 MB / Starter 100 MB / Pro 500 MB + **1 MB hard cap par note** identique tous plans | 0016 §7 |
| Q7 | Migration locale | **Modale first-login étendue** (sub-epic 02), backup JSON étendu (sections notes + folders) | 0016 §8 |
| Q8 | Backlinks | **Local-only**, recalculés post-pull via `get_backlinks` Rust existant | 0016 §12 |
| Q9 | Realtime | **Reporté ultérieurement** si use case collab émerge | 0016 §3 |
| Q10 | FK folders | **`ON DELETE SET NULL`** (cohérent `orphan_notes_in_folder` local) | 0016 §2 |

---

## 3. Architecture

### 3.1 Vue d'ensemble

```
┌──────────────────┐                         ┌──────────────────────────────┐
│  Lexena Tauri    │  push debounced 2s     │ Supabase Edge Function       │
│  Desktop App     │ ─────────────────────► │   /sync/push  (Zod + quota)  │
│                  │  upsert/delete batch   │   → user_notes + user_folders│
│ ┌──────────────┐ │                         └──────────────────────────────┘
│ │TipTap editor │ │                                          │
│ │content.html  │ │  pull direct supabase-js                 │
│ │note.json     │ │ ◄──────── RLS-gated ────────────────────┘
│ │folders.json  │ │
│ └──────────────┘ │
│                  │
│ sync-queue.json  │  reused from sub-epic 02
│ sync-meta.json   │
└──────────────────┘
```

Aucun nouveau composant infra. La sync notes **extend** :
- la **queue offline** existante (nouveaux types `user_notes` et `user_folders`),
- l'**Edge Function `sync-push`** existante (nouveaux schémas Zod),
- l'**Edge Function `account-export`** existante (nouvelles sections JSON),
- la **modale first-login** existante (nouveaux compteurs).

### 3.2 Mapping local ↔ cloud

| Local | Cloud | Notes |
|---|---|---|
| `profiles/<id>/notes/<note-id>/note.json` | `user_notes` row | Champs identiques + `deleted_at` ajouté |
| `profiles/<id>/notes/<note-id>/content.html` | `user_notes.content_html` | Texte HTML brut, jamais transformé |
| `profiles/<id>/notes/folders.json` (array) | `user_folders` rows | 1 row par folder, `updated_at` ajouté |

### 3.3 Backend Rust — changements

| Fichier | Changement | Pourquoi |
|---|---|---|
| `src-tauri/src/notes.rs` | Ajouter `deleted_at: Option<String>` à `NoteMeta`. Soft-delete dans `delete_note`. Filtrer `deleted_at.is_none()` dans `list_notes`, `search_notes`, `get_backlinks`, `orphan_notes_in_folder`. Ajouter `purge_soft_deleted_notes_post_pull`. | Sync requires tombstones. |
| `src-tauri/src/folders.rs` | Ajouter `updated_at: String` + `deleted_at: Option<String>` à `FolderMeta`. Migration au mount (`updated_at` défaut = `created_at`). Soft-delete dans `delete_folder`. | LWW requires updated_at. |
| `src-tauri/src/sync.rs` | Ajouter sections `notes` + `folders` au backup JSON étendu. Ajouter restore depuis ces sections. | Backup pre-sync extended. |

### 3.4 Frontend sync engine — changements

| Fichier | Changement |
|---|---|
| `src/lib/sync/types.ts` | Ajouter `NotePayload`, `FolderPayload`, `NoteQueueEntry`, `FolderQueueEntry` types. |
| `src/lib/sync/schemas.ts` | Ajouter Zod schemas `CloudUserNoteRowSchema`, `CloudUserFolderRowSchema`. |
| `src/lib/sync/mapping.ts` | Ajouter `mapNoteToCloud`, `mapNoteFromCloud`, `mapFolderToCloud`, `mapFolderFromCloud`. |
| `src/lib/sync/client.ts` | Ajouter `pullNotes`, `pullFolders` (direct supabase-js + safeParse). Push reste via Edge. |
| `src/lib/sync/merge.ts` | Ajouter `mergeNotes` (LWW par item, soft-delete propagation). Idem `mergeFolders`. |
| `src/lib/sync/notes-store.ts` (NOUVEAU) | Wrapper invoke Tauri commands `list_notes`, `read_note`, `update_note`, `delete_note`. Push-on-mutate vers la queue. |
| `src/lib/sync/folders-store.ts` (NOUVEAU) | Wrapper Tauri Store JSON + push-on-mutate. |
| `src/hooks/useNotes.ts` | Câbler les mutations sur la queue sync (push debounced 2s sur update_note, immédiat sur les autres). |
| `src/hooks/useFolders.ts` | Idem (push immédiat). |
| `src/contexts/SyncContext.tsx` | Ajouter `pullNotes`, `pullFolders` aux lifecycle hooks. Trigger purge locale post-pull. |

### 3.5 Supabase — migrations

| Migration | Contenu |
|---|---|
| `20260601000800_user_folders.sql` | Table `user_folders` + RLS + trigger `updated_at` + index partiel. |
| `20260601000900_user_notes.sql` | Table `user_notes` + RLS + trigger + index partiels + check constraint 1 MB. |
| `20260601001000_compute_user_sync_size_v2.sql` | Extension fonction quota pour inclure notes + folders. |

### 3.6 Edge Functions — changements

| Edge | Changement |
|---|---|
| `sync-push` | Étend schéma Zod pour accepter `note`/`folder` items. Hard cap 1 MB par `content_html`. Quota post-apply réutilisé. |
| `account-export` | Ajoute sections `notes: [...]` + `folders: [...]` au JSON exporté. |
| `purge-soft-deleted-notes` (NOUVEAU, ou extension `purge-account-deletions`) | Cron 30j hard-delete des rows tombstoned. Choix impl reporté au sprint. |

---

## 4. Alternatives considérées

### A1. Blob unique `user_notes_blob` vs tables séparées

**Rejeté.** Une note peut peser 100 KB. Un blob jsonb regroupant 50 notes = 5 MB ré-écrit à chaque keystroke debounced. Scale-killer. Tables séparées permettent push par item avec LWW natif.

### A2. CRDT (Yjs/Automerge) sur `content_html`

**Rejeté.** Coût d'intégration énorme (format binaire, migration TipTap HTML actuel, debug complexe). Use case mono-user multi-device, pas collaboratif. LWW + backup local + export GDPR couvrent les cas non-pathologiques. Réversible : un futur ADR peut introduire CRDT sur le seul champ `content_html` si LWW silent overwrite devient un problème remonté.

### A3. Realtime via Supabase Channels

**Rejeté.** Coût infra (WebSocket permanent par client × user × device). Bénéfice nul pour mono-user. Lifecycle-based suffit.

### A4. Hard delete immédiat (pas de soft-delete)

**Rejeté.** Sans tombstone, on ne peut pas propager une suppression : Device A delete, Device B ne sait pas si la note "manquante côté serveur" est une suppression ou un row jamais sync. Soft-delete + `deleted_at` propage explicitement.

### A5. FTS Postgres serveur

**Reporté ultérieurement.** Le `search_notes` Rust client suffit largement pour un corpus mono-user. FTS serveur introduit complexité indexation, coût stockage, latence réseau pour aucun gain perçu.

### A6. Table `user_note_links` serveur pour backlinks

**Rejeté.** Recalcul client post-pull suffit (`get_backlinks` Rust existant cherche `data-note-id="..."` dans tous les `content.html`). Pas de complexité serveur. `BrokenNoteLinkDialog` gère déjà les cas de note manquante.

### A7. Toggle séparé "Sync notes"

**Rejeté.** Le toggle global "Synchronisation cloud" couvre tout. Granularité supplémentaire = UX confuse, peu de demande user, surcoût impl.

### A8. Pastille sync par note (vert/orange/gris)

**Reporté ultérieurement.** Status global header suffit. Pastille par note demande de maintenir un état "sync pending" par item dans le store local, ce qui complexifie sans débloquer un use case majeur.

### A9. Format backup en ZIP (arbre fichiers)

**Rejeté.** JSON unique étendu cohérent avec sub-epic 02. ZIP introduit dépendance Rust (`zip` crate) et complexité restore. Bumpable ultérieurement si volumétrie pose problème.

### A10. Chiffrement E2E

**Hors scope.** Cf. [ADR 0002 server-side encryption](../../../v3/decisions/0002-server-side-encryption.md). Posture style Notion : encryption at rest Postgres + TLS in transit, pas d'E2E. Réversible long terme si position prend.

### A11. Pagination liste notes

**Reporté ultérieurement.** Le client charge déjà la liste complète aujourd'hui, ça scale jusqu'à ~1000 notes. À reconsidérer si un user atteint ce seuil.

---

## 5. Risques & mitigations

| Risque | Probabilité | Sévérité | Mitigation |
|---|---|---|---|
| LWW silent overwrite (édition concurrente 2 devices) | Faible | Moyenne | Backup local pré-sync, export GDPR, logs sync côté client |
| User colle une image 5 MB base64 | Moyenne | Faible | Hard cap 1 MB par note + message UI clair (sync de cette note bloquée, autres continuent) |
| User free dépasse quota free 10 MB | Modérée | Faible | Warning à 80% quota, rejection au plafond, message UI vers upsell Starter/Pro. |
| Migration `updated_at` folders cassant déserialisation | Faible | Élevée | `#[serde(default)]` + valeur défaut = `created_at` si manquant. Tests Rust unitaires. |
| Soft-delete locale = empreinte disque temporaire | Moyenne | Très faible | Purge post-pull élimine les dossiers locaux tombstoned. Purge serveur 30j élimine côté DB. |
| Backlinks cassés post-pull (note référencée supprimée cross-device) | Moyenne | Très faible | `BrokenNoteLinkDialog` gère déjà gracieusement. |
| Note >1 MB jamais syncée → user perd cette note s'il change de device | Faible | Élevée | Banner UI explicite + export GDPR contient la note. |
| Bug client push spam saturant le quota | Faible | Moyenne | Quota post-apply rejette le batch, rate limiting `/sync/push` (existant sub-epic 02). |
| Edge Function `sync-push` régression (cassage schémas existants) | Faible | Élevée | Tests Vitest étendus, smoke test cross-tenant pgtap obligatoire. |
| RLS cross-tenant fuite | Très faible | Critique | Tests pgtap automatisés sur 8 policies notes + folders. **Bloquant release.** |

---

## 6. Open questions reportées au sprint

| # | Question | Décision attendue |
|---|---|---|
| O1 | Edge purge cron 30j : nouvelle Edge dédiée vs extension `purge-account-deletions` | Au démarrage de la Task purge |
| O2 | Migration `updated_at` folders : au mount vs au premier `list_folders` | À l'écriture du code Rust (préférable mount pour ne pas burst push) |
| O3 | Backup format pre-sync (JSON unique étendu vs ZIP) | JSON tranché, ZIP reconsidéré si volumétrie problématique |
| O4 | Bumping quotas freemium au-delà des seuils figés | Data-driven post-traction (>X users payants se cognant au plafond) |
| O5 | Restore depuis corbeille UI | Reporté ultérieurement si demande user |

---

## 7. Hypothèses figées avant rédaction du plan

- **H1** Le pattern sync settings est immutable. Pas de re-design des couches communes (queue, mutex, retry, backup root).
- **H2** Le format TipTap HTML reste tel quel. Pas de conversion serveur ni de schema versioning du contenu.
- **H3** Backlinks 100% client. Pas de table dédiée serveur.
- **H4** Soft-delete + purge 30j (côté serveur via cron, côté client via post-pull purge).
- **H5** Edge Function `sync-push` étendue plutôt que nouvelle `notes-push` (cohérence quota global + factorisation auth).
- **H6** Quotas freemium hybride : Free 10 MB / Starter 100 MB / Pro 500 MB. Hard cap par note 1 MB identique tous plans. Lecture du plan via la table `subscriptions` (sub-epic 04 livré).
- **H7** Backup pre-sync étendu (JSON unique avec nouvelles sections), pas un fichier séparé.

---

## 8. Suite

- Plan d'implémentation : [`docs/superpowers/plans/2026-05-19-v3-sub-epic-03-sync-notes.md`](../plans/2026-05-19-v3-sub-epic-03-sync-notes.md)
- Living document spec : [`docs/v3/03-sync-notes.md`](../../../v3/03-sync-notes.md)
- ADR : [`docs/v3/decisions/0016-notes-sync-strategy.md`](../../../v3/decisions/0016-notes-sync-strategy.md)
