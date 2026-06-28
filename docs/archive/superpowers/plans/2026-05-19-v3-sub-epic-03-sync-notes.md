# V3 Sub-Epic 03 — Sync Notes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Livrer la sync cloud des notes texte et dossiers de Lexena dans une future bêta `v3.0.0-beta.X` (tout sort sur v3.0 incrémentale, bêtas progressives). 2 tables Supabase, soft-delete, LWW par item, hard cap 1 MB par note, quota freemium hybride (Free 10 MB / Starter 100 MB / Pro 500 MB), modale migration first-login étendue, backup local étendu, backlinks restant local, **réutilisation maximale du sync engine livré en sub-épique 02**.

**Architecture :** 5 chantiers articulés :
1. **Supabase DB** — 2 nouvelles tables (`user_folders`, `user_notes`) avec RLS deny-by-default, triggers `updated_at`, check constraint 1 MB, FK `ON DELETE SET NULL` pour folder_id, FK `ON DELETE CASCADE` pour user_id, extension `compute_user_sync_size` pour inclure les nouvelles tables.
2. **Edge Functions** — extension de `sync-push` (schémas Zod notes/folders + hard cap 1 MB), extension de `account-export` (sections notes + folders), nouvelle Edge ou extension `purge-account-deletions` pour cron purge tombstones 30j.
3. **Backend Rust** — `deleted_at` sur `NoteMeta`, `updated_at` + `deleted_at` sur `FolderMeta`, soft-delete dans `delete_note`/`delete_folder`, filtre tombstones dans `list_notes`/`search_notes`/`get_backlinks`/`orphan_notes_in_folder`/`list_folders`, nouvelle commande `purge_soft_deleted_notes_post_pull`, extension backup/restore JSON.
4. **Frontend sync engine** — extension types + schemas Zod + mapping + client + merge + queue. Nouveau `notes-store.ts` + `folders-store.ts`. Hooks `useNotes` + `useFolders` câblés sur la queue (push debounced 2s sur `update_note`, push immédiat sur les autres mutations).
5. **UX** — extension modale first-login (compteurs notes/folders), page transparence "Voir ce qui est synchronisé" mise à jour, banner "note >1 MB non syncée", quota display dynamique selon plan (Free 10 MB / Starter 100 MB / Pro 500 MB) avec message d'upsell ciblé pour les users free, i18n FR/EN.

**Tech Stack :** identique sub-épique 02. `@supabase/supabase-js`, Supabase Edge Functions Deno + TypeScript, `zod`, Tauri Store plugin v2, React 19 + Context, Tailwind 4, i18next. **Pas de nouvelle dépendance front/back.**

**Related design :** [`docs/superpowers/specs/2026-05-19-v3-sub-epic-03-sync-notes-design.md`](../specs/2026-05-19-v3-sub-epic-03-sync-notes-design.md), [`docs/v3/03-sync-notes.md`](../../../v3/03-sync-notes.md), [`docs/v3/decisions/0016-notes-sync-strategy.md`](../../../v3/decisions/0016-notes-sync-strategy.md).

**Build verification :**
- Rust : `LIBCLANG_PATH="C:/Program Files/LLVM/bin" PATH="$PATH:/c/Program Files/CMake/bin" cargo check` dans `src-tauri/` (cf. `memory/MEMORY.md`).
- Frontend : `pnpm build` (TypeScript strict + Vite).
- Tests automatisés : Vitest (queue/merge/mapping notes) + pgtap (RLS cross-tenant nouvelles tables).
- Checklist manuelle E2E en Task 25.

**Scope exclu** (reporté ou hors du présent sous-épique) :
- Restore depuis corbeille UI — ultérieurement.
- Pastille sync par note (vert/orange/gris) — ultérieurement.
- FTS Postgres serveur — ultérieurement.
- Pagination liste notes — ultérieurement si user atteint >1000 notes.
- Realtime via Supabase Channels — ultérieurement si use case collab émerge.
- CRDT sur `content_html` — ultérieurement si LWW silent overwrite remonté.
- Compression gzip payloads — ultérieurement.
- Chiffrement E2E — pas planifié (cf. ADR 0002).
- Bumping quotas freemium au-delà des seuils figés — data-driven post-traction.

**Hypothèses figées avant rédaction** (cf. design §7) :
- **H1** Pattern sync settings immutable.
- **H2** Format TipTap HTML brut, pas de schema versioning serveur.
- **H3** Backlinks 100% client.
- **H4** Soft-delete + purge 30j.
- **H5** Edge Function `sync-push` étendue, pas nouvelle Edge.
- **H6** Quota freemium hybride : Free 10 MB / Starter 100 MB / Pro 500 MB. Hard cap par note 1 MB identique tous plans. Lecture plan via table `subscriptions` sub-epic 04.
- **H7** Backup JSON étendu, pas ZIP séparé.

---

## File Structure

### Files created

**Supabase migrations** (`supabase/migrations/`)
- `supabase/migrations/20260601000800_user_folders.sql` — table + RLS + trigger + index partiel
- `supabase/migrations/20260601000900_user_notes.sql` — table + RLS + trigger + index partiels + check constraint 1 MB + FK folder_id ON DELETE SET NULL
- `supabase/migrations/20260601001000_compute_user_sync_size_v2.sql` — extension fonction quota notes + folders

**Supabase tests** (`supabase/tests/`)
- `supabase/tests/rls_user_folders.sql` — pgtap cross-tenant
- `supabase/tests/rls_user_notes.sql` — pgtap cross-tenant + check FK folder_id behavior
- `supabase/tests/notes_content_size_constraint.sql` — pgtap hard cap 1 MB

**Edge Functions** (modifications uniquement) — pas de nouveau dossier sauf si on choisit l'Edge dédiée pour purge :
- `supabase/functions/purge-soft-deleted-notes/index.ts` (optionnel selon choix O1)
- `supabase/functions/purge-soft-deleted-notes/deno.json` (idem)

**Frontend — sync engine extensions** (`src/lib/sync/`)
- `src/lib/sync/notes-store.ts` — wrapper invoke Tauri commands notes + push-on-mutate
- `src/lib/sync/notes-store.test.ts` — Vitest
- `src/lib/sync/folders-store.ts` — wrapper Tauri Store folders.json + push-on-mutate
- `src/lib/sync/folders-store.test.ts` — Vitest

**Frontend — composants**
- `src/components/notes/NoteSizeWarning.tsx` — banner "note >1 MB non syncée"

### Files modified

**Supabase**
- (aucun, on ajoute des migrations sans toucher aux existantes)

**Edge Functions**
- `supabase/functions/sync-push/schema.ts` — ajout `NotePayloadSchema`, `FolderPayloadSchema`, update `PushBatchSchema`
- `supabase/functions/sync-push/index.ts` — handle nouveaux item types + hard cap 1 MB validation
- `supabase/functions/account-export/index.ts` — ajout sections `notes` + `folders` au JSON
- `supabase/functions/purge-account-deletions/index.ts` (si choix O1 = extension) — handle notes + folders tombstoned

**Backend Rust**
- `src-tauri/src/notes.rs` — ajout `deleted_at`, soft-delete, filtres
- `src-tauri/src/folders.rs` — ajout `updated_at` + `deleted_at`, migration mount, soft-delete
- `src-tauri/src/sync.rs` — extension backup JSON + restore (sections notes + folders)
- `src-tauri/src/lib.rs` — registrer commande `purge_soft_deleted_notes_post_pull`

**Frontend sync engine**
- `src/lib/sync/types.ts` — ajout `NotePayload`, `FolderPayload`, `NoteQueueEntry`, `FolderQueueEntry`
- `src/lib/sync/schemas.ts` — ajout `CloudUserNoteRowSchema`, `CloudUserFolderRowSchema`
- `src/lib/sync/mapping.ts` — ajout `mapNoteToCloud`, `mapNoteFromCloud`, `mapFolderToCloud`, `mapFolderFromCloud`
- `src/lib/sync/mapping.test.ts` — ajout tests notes + folders
- `src/lib/sync/client.ts` — ajout `pullNotes`, `pullFolders`
- `src/lib/sync/client.test.ts` — ajout tests
- `src/lib/sync/merge.ts` — ajout `mergeNotes`, `mergeFolders`
- `src/lib/sync/merge.test.ts` — ajout tests
- `src/lib/sync/queue.ts` — étendre payload types
- `src/lib/sync/apply-batch-results.ts` — handle nouveaux types
- `src/lib/sync/backups.ts` — extension format JSON (sections notes + folders)
- `src/lib/sync/local-purge.ts` — purge post-pull pour notes (réutilise pattern dico)

**Frontend hooks + contexts**
- `src/hooks/useNotes.ts` — câbler mutations sur la queue (push debounced 2s update_note, push immédiat autres)
- `src/hooks/useFolders.ts` — câbler mutations sur la queue (push immédiat)
- `src/contexts/SyncContext.tsx` — pull lifecycle pour notes + folders, purge post-pull

**Frontend composants**
- `src/components/settings/sections/SyncActivationModal.tsx` — compteurs notes + folders dans la modale
- `src/components/settings/sections/SyncedDataOverview.tsx` — sections notes + folders
- `src/components/notes/NotesEditor/NotesEditor.tsx` — afficher `NoteSizeWarning` si content >1 MB
- `src/locales/fr.json` + `src/locales/en.json` — namespaces `sync.notes.*`, `notes.size.*`

**Docs**
- `docs/v3/EPIC.md` — mise à jour statut sub-epic 03 → "en cours"
- `docs/v3/decisions/adr-implementation-matrix.md` — ajout ligne ADR 0016
- `CLAUDE.md` — section "V3 Sync notes (livré sous-épique 03)" en fin de cycle
- `memory/MEMORY.md` — ajout `project_v3_sync_notes.md`

---

## Préflight

### 0.1 Vérifier état repository

- [ ] **Step 1: Vérifier branche de travail**

```bash
git status
git branch --show-current
```
Expected: branche dédiée `feat/v3-sync-notes` (à créer si besoin via `git checkout -b feat/v3-sync-notes`). Pas sur `main` (cf. `feedback_branch_protection.md`).

- [ ] **Step 2: Vérifier que sub-epic 02 est livré et clean**

```bash
ls supabase/migrations/ | grep -E "(user_settings|user_dictionary|user_snippets|sync_quota)"
ls supabase/functions/ | grep -E "(sync-push|account-export)"
ls src/lib/sync/
```
Expected: migrations 20260525* présentes, Edge Functions présentes, `src/lib/sync/` contient queue/merge/mapping/etc.

- [ ] **Step 3: Vérifier projet Supabase linké**

```bash
pnpm exec supabase projects list
```
Expected: projet Lexena `● LINKED`.

- [ ] **Step 4: Vérifier que les tests existants passent**

```bash
pnpm test
LIBCLANG_PATH="C:/Program Files/LLVM/bin" PATH="$PATH:/c/Program Files/CMake/bin" cargo --manifest-path src-tauri/Cargo.toml test
```
Expected: 0 régression.

### 0.2 Lire les références obligatoires

- [ ] **Step 5: Lire la spec figée**

Fichier : [`docs/v3/03-sync-notes.md`](../../../v3/03-sync-notes.md). Repérer le schéma DB, le sync engine, la conflict resolution, et la migration.

- [ ] **Step 6: Lire l'ADR 0016**

Fichier : [`docs/v3/decisions/0016-notes-sync-strategy.md`](../../../v3/decisions/0016-notes-sync-strategy.md). Les 13 décisions sont **figées** — ne pas re-débattre en cours d'impl.

- [ ] **Step 7: Lire le design doc**

Fichier : [`docs/superpowers/specs/2026-05-19-v3-sub-epic-03-sync-notes-design.md`](../specs/2026-05-19-v3-sub-epic-03-sync-notes-design.md). Les 11 alternatives rejetées sont là pour éviter les questions "et si on faisait plutôt...".

---

## Phase A — Supabase DB + Edge Functions

### Task 1 — Migration `user_folders`

- [ ] **Step 1.1: Créer migration table**

Fichier : `supabase/migrations/20260601000800_user_folders.sql`

Contenu (cf. spec §Schéma DB) :

```sql
create table user_folders (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  "order" int not null default 0,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create index on user_folders (user_id) where deleted_at is null;

alter table user_folders enable row level security;

create policy "own_folders_select" on user_folders for select using (auth.uid() = user_id);
create policy "own_folders_insert" on user_folders for insert with check (auth.uid() = user_id);
create policy "own_folders_update" on user_folders for update using (auth.uid() = user_id);
create policy "own_folders_delete" on user_folders for delete using (auth.uid() = user_id);

create trigger user_folders_updated_at before update on user_folders
  for each row execute function update_updated_at();
```

- [ ] **Step 1.2: Appliquer en local (si Docker dispo) ou pousser sur staging**

```bash
pnpm exec supabase db push
```

- [ ] **Step 1.3: Commit**

```bash
git add supabase/migrations/20260601000800_user_folders.sql
git commit -m "feat(sync-notes): add user_folders table with RLS"
```

### Task 2 — Migration `user_notes`

- [ ] **Step 2.1: Créer migration table**

Fichier : `supabase/migrations/20260601000900_user_notes.sql`

```sql
create table user_notes (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default '',
  content_html text not null default '',
  folder_id uuid references user_folders(id) on delete set null,
  favorite boolean not null default false,
  "order" int not null default 0,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  constraint user_notes_content_size_check check (octet_length(content_html) <= 1048576)
);

create index on user_notes (user_id) where deleted_at is null;
create index on user_notes (user_id, folder_id) where deleted_at is null;

alter table user_notes enable row level security;

create policy "own_notes_select" on user_notes for select using (auth.uid() = user_id);
create policy "own_notes_insert" on user_notes for insert with check (auth.uid() = user_id);
create policy "own_notes_update" on user_notes for update using (auth.uid() = user_id);
create policy "own_notes_delete" on user_notes for delete using (auth.uid() = user_id);

create trigger user_notes_updated_at before update on user_notes
  for each row execute function update_updated_at();
```

- [ ] **Step 2.2: Appliquer + commit**

### Task 3 — Extension fonction quota

- [ ] **Step 3.1: Créer migration**

Fichier : `supabase/migrations/20260601001000_compute_user_sync_size_v2.sql`

```sql
create or replace function compute_user_sync_size(p_user_id uuid)
returns bigint
language sql
stable
as $$
  select
    coalesce((select pg_column_size(data) from user_settings where user_id = p_user_id), 0)
    + coalesce((select sum(pg_column_size(word)) from user_dictionary_words where user_id = p_user_id and deleted_at is null), 0)
    + coalesce((select sum(pg_column_size(label) + pg_column_size(content) + coalesce(pg_column_size(shortcut), 0)) from user_snippets where user_id = p_user_id and deleted_at is null), 0)
    + coalesce((select sum(pg_column_size(title) + pg_column_size(content_html)) from user_notes where user_id = p_user_id and deleted_at is null), 0)
    + coalesce((select sum(pg_column_size(name)) from user_folders where user_id = p_user_id and deleted_at is null), 0);
$$;
```

- [ ] **Step 3.2: Appliquer + commit**

### Task 4 — Tests pgtap RLS cross-tenant

- [ ] **Step 4.1: Créer `supabase/tests/rls_user_folders.sql`**

Calquer sur `supabase/tests/rls_user_snippets.sql` (livré sub-epic 02). Pattern :
- BEGIN, plan(8) ou plus
- Créer 2 users (A et B)
- Insérer un folder pour A
- Setter session as A → SELECT/UPDATE/DELETE/INSERT marche
- Setter session as B → SELECT/UPDATE/DELETE retournent 0 row, INSERT cross-user échoue
- ROLLBACK

- [ ] **Step 4.2: Créer `supabase/tests/rls_user_notes.sql`**

Idem + test FK behavior : créer folder pour A, insérer note avec folder_id, supprimer folder, vérifier que note a folder_id NULL (cascade SET NULL).

- [ ] **Step 4.3: Créer `supabase/tests/notes_content_size_constraint.sql`**

Tester que `octet_length(content_html) > 1048576` rejette l'insert avec contrainte CHECK.

- [ ] **Step 4.4: Lancer**

```bash
pnpm exec supabase test db
```
Expected: tous les tests passent.

- [ ] **Step 4.5: Commit**

### Task 5 — Extension Edge Function `sync-push`

- [ ] **Step 5.1: Étendre `supabase/functions/sync-push/schema.ts`**

Ajouter :
```ts
export const NotePayloadSchema = z.object({
  id: z.string().uuid(),
  title: z.string().max(500),
  content_html: z.string().max(1_048_576),
  folder_id: z.string().uuid().nullable(),
  favorite: z.boolean(),
  order: z.number().int(),
  updated_at: z.string().datetime(),
  deleted_at: z.string().datetime().nullable(),
});

export const FolderPayloadSchema = z.object({
  id: z.string().uuid(),
  name: z.string().max(200),
  order: z.number().int(),
  updated_at: z.string().datetime(),
  deleted_at: z.string().datetime().nullable(),
});
```

Étendre `PushBatchSchema` pour accepter `note` et `folder` types.

- [ ] **Step 5.2: Étendre `supabase/functions/sync-push/index.ts`**

- Handle `note` items : `upsert` ou `delete` (soft) selon `operation`. Avant insert, vérifier `octet_length(content_html) <= 1_048_576` côté Deno aussi (réponse HTTP 413 clair AVANT le rejet Postgres).
- Handle `folder` items : `upsert` ou `delete`.
- **Quota par plan** : lire le plan courant via la table `subscriptions` (sub-epic 04). Mapper plan → quota :
  ```ts
  const QUOTA_BY_PLAN = {
    free: 10 * 1024 * 1024,      // 10 MB
    starter: 100 * 1024 * 1024,  // 100 MB
    pro: 500 * 1024 * 1024,      // 500 MB
  } as const;

  async function getUserQuota(supabase, user_id) {
    const { data } = await supabase
      .from('subscriptions')
      .select('plan, status')
      .eq('user_id', user_id)
      .maybeSingle();
    if (!data || data.status !== 'active') return QUOTA_BY_PLAN.free;
    return QUOTA_BY_PLAN[data.plan] ?? QUOTA_BY_PLAN.free;
  }
  ```
- Vérifier `compute_user_sync_size(user_id) <= quota` post-apply. Si dépassement, **rollback du batch** + HTTP 413 avec body `{ error: "quota_exceeded", plan, used, limit }`.
- ⚠️ Vérifier le nom exact de la table `subscriptions` et le format du champ `plan` côté sub-epic 04 livré (peut être `subscription`, `user_subscriptions`, etc. — adapter à la livraison réelle).

- [ ] **Step 5.3: Déployer (à demander à l'user)**

```bash
pnpm exec supabase functions deploy sync-push
```

⚠️ L'user doit autoriser le déploiement (cf. ADR 0010 follow-ups).

- [ ] **Step 5.4: Tests Deno (à ajouter)**

Fichier : `supabase/functions/sync-push/test.ts` (créer si absent, étendre sinon).
- Cas valid note batch user free dans son quota 10 MB → 200
- Cas note >1 MB → 413 avec `error: "note_too_large"`
- Cas user free pousse à 11 MB → 413 avec `error: "quota_exceeded", plan: "free", limit: 10_485_760`
- Cas user starter pousse à 50 MB → 200 (sous le quota 100 MB)
- Cas user starter pousse à 110 MB → 413
- Cas user pro pousse à 400 MB → 200
- Cas user avec subscription `status: cancelled` → fallback `free`
- Cas note avec folder_id pointant vers folder soft-deleted → succès (la DB gère via SET NULL au prochain access côté serveur)

- [ ] **Step 5.5: Commit**

### Task 6 — Extension Edge Function `account-export`

- [ ] **Step 6.1: Étendre `supabase/functions/account-export/index.ts`**

Ajouter au JSON exporté :
```ts
{
  // existants
  user_settings: {...},
  user_dictionary_words: [...],
  user_snippets: [...],

  // nouveaux
  user_notes: [
    {
      id, title, content_html, folder_id, favorite,
      "order", created_at, updated_at, deleted_at
    },
    ...
  ],
  user_folders: [
    { id, name, "order", created_at, updated_at, deleted_at },
    ...
  ]
}
```

Inclure soft-deleted (champ `deleted_at` non null) pour transparence GDPR — déjà la convention sub-epic 02.

- [ ] **Step 6.2: Déployer + commit**

### Task 7 — Edge purge cron 30j tombstones

- [ ] **Step 7.1: Trancher O1 (cf. design §6)**

Option A : nouvelle Edge `purge-soft-deleted-notes` cron 30j.
Option B : étendre `purge-account-deletions` pour traiter aussi notes + folders tombstoned.

**Recommandation : option B** (extension), car plus simple à exploiter et le runbook `account-deletion-purge.md` existe déjà. Si l'extension casse la sémantique de cette Edge, fallback option A.

- [ ] **Step 7.2: Implémenter**

Pour option B, ajouter au début de `purge-account-deletions/index.ts` :
```sql
delete from user_notes where deleted_at < now() - interval '30 days';
delete from user_folders where deleted_at < now() - interval '30 days';
```

Pour option A, calquer sur `purge-account-deletions` (cron pg_cron, Edge GET endpoint).

- [ ] **Step 7.3: Mettre à jour runbook**

Fichier : `docs/v3/runbooks/account-deletion-purge.md` (ou nouveau runbook `notes-purge.md`).

- [ ] **Step 7.4: Commit**

---

## Phase B — Backend Rust

### Task 8 — Ajout `deleted_at` à `NoteMeta` + soft-delete

- [ ] **Step 8.1: Modifier `src-tauri/src/notes.rs`**

```rust
pub struct NoteMeta {
    // existants...
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub deleted_at: Option<String>,
}
```

- [ ] **Step 8.2: Refactor `delete_note` en soft-delete**

```rust
#[tauri::command]
pub async fn delete_note(app_handle: AppHandle, id: String) -> Result<(), String> {
    let notes_dir = get_notes_dir(&app_handle).map_err(|e| e.to_string())?;
    let note_dir = notes_dir.join(&id);
    if !note_dir.exists() {
        return Ok(()); // idempotent
    }
    let mut meta = read_note_meta(&note_dir).map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().to_rfc3339();
    meta.deleted_at = Some(now.clone());
    meta.updated_at = now;
    let meta_json = serde_json::to_string_pretty(&meta).map_err(|e| e.to_string())?;
    fs::write(note_dir.join("note.json"), meta_json).map_err(|e| e.to_string())?;
    Ok(())
}
```

- [ ] **Step 8.3: Filtrer `deleted_at.is_none()` dans :**
  - `list_notes` (ligne 175-194)
  - `search_notes` (ligne 427-466)
  - `get_backlinks` (ligne 386-423)
  - `orphan_notes_in_folder` (ligne 359-381)

- [ ] **Step 8.4: Tests Rust unitaires**

Ajouter dans `src-tauri/src/notes.rs` (#[cfg(test)] mod tests) :
- Soft-delete : `delete_note` set `deleted_at`, n'efface pas le fichier
- `list_notes` ignore les notes soft-deleted
- `get_backlinks` ignore les notes soft-deleted

- [ ] **Step 8.5: `cargo check`**

```bash
LIBCLANG_PATH="C:/Program Files/LLVM/bin" PATH="$PATH:/c/Program Files/CMake/bin" cargo --manifest-path src-tauri/Cargo.toml check
```

- [ ] **Step 8.6: Commit**

### Task 9 — Ajout `updated_at` + `deleted_at` à `FolderMeta`

- [ ] **Step 9.1: Modifier `src-tauri/src/folders.rs`**

```rust
pub struct FolderMeta {
    pub id: String,
    pub name: String,
    pub created_at: String,
    #[serde(default = "default_updated_at_from_created")]
    pub updated_at: String,
    #[serde(default)]
    pub order: i32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub deleted_at: Option<String>,
}

fn default_updated_at_from_created() -> String {
    // Sera remplacé par created_at via migration au mount
    chrono::Utc::now().to_rfc3339()
}
```

⚠️ **Subtilité** : `#[serde(default)]` ne peut pas référencer une autre field. Approche pragmatique :
- Au `read_folders` initial, si `updated_at` manque, le défaut générique est appliqué.
- Une migration explicite `migrate_folder_updated_at_if_needed` (cf. pattern `migrate_folder_orders_if_needed` existant) re-set `updated_at = created_at` pour les rows défaut-générées.

- [ ] **Step 9.2: Ajouter `migrate_folder_updated_at_if_needed`**

```rust
fn migrate_folder_updated_at_if_needed(folders: &mut Vec<FolderMeta>) -> bool {
    let mut migrated = false;
    for folder in folders.iter_mut() {
        // Heuristique : si updated_at == "" ou parse en future date, force created_at
        if folder.updated_at.is_empty() {
            folder.updated_at = folder.created_at.clone();
            migrated = true;
        }
    }
    migrated
}
```

Appelée dans `list_folders` après `migrate_folder_orders_if_needed`.

- [ ] **Step 9.3: Mettre à jour `updated_at` dans toutes les mutations**

- `create_folder` : set `updated_at = now`.
- `reorder_folders` : update `updated_at` sur chaque row modifiée.
- `rename_folder` : set `updated_at = now`.

- [ ] **Step 9.4: Refactor `delete_folder` en soft-delete**

```rust
#[tauri::command]
pub async fn delete_folder(app_handle: AppHandle, id: String) -> Result<(), String> {
    let mut folders = read_folders(&app_handle).map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().to_rfc3339();
    let mut found = false;
    for folder in folders.iter_mut() {
        if folder.id == id {
            folder.deleted_at = Some(now.clone());
            folder.updated_at = now.clone();
            found = true;
            break;
        }
    }
    if !found {
        return Ok(());
    }
    write_folders(&app_handle, &folders).map_err(|e| e.to_string())?;
    crate::notes::orphan_notes_in_folder(&app_handle, &id).map_err(|e| e.to_string())?;
    Ok(())
}
```

- [ ] **Step 9.5: Filtrer `deleted_at.is_none()` dans `list_folders`**

- [ ] **Step 9.6: Tests Rust unitaires**

- [ ] **Step 9.7: `cargo check` + commit**

### Task 10 — Commande `purge_soft_deleted_notes_post_pull`

- [ ] **Step 10.1: Ajouter dans `src-tauri/src/notes.rs`**

```rust
#[tauri::command]
pub async fn purge_soft_deleted_notes_post_pull(
    app_handle: AppHandle,
    note_ids: Vec<String>,
) -> Result<u32, String> {
    let notes_dir = get_notes_dir(&app_handle).map_err(|e| e.to_string())?;
    let mut purged = 0u32;
    for note_id in note_ids {
        let note_dir = notes_dir.join(&note_id);
        if note_dir.exists() {
            if let Ok(meta) = read_note_meta(&note_dir) {
                if meta.deleted_at.is_some() {
                    fs::remove_dir_all(&note_dir).map_err(|e| e.to_string())?;
                    purged += 1;
                }
            }
        }
    }
    Ok(purged)
}
```

Idem pour `purge_soft_deleted_folders_post_pull` dans `folders.rs`.

- [ ] **Step 10.2: Registrer dans `src-tauri/src/lib.rs`**

- [ ] **Step 10.3: `cargo check` + commit**

### Task 11 — Extension backup JSON + restore

- [ ] **Step 11.1: Modifier `src-tauri/src/sync.rs`**

Étendre la struct `LocalBackup` (ou équivalent) pour inclure :
```rust
pub struct LocalBackup {
    pub settings: serde_json::Value,
    pub snippets: Vec<SnippetEntry>,
    pub dictionary: Vec<String>,
    #[serde(default)]
    pub notes: Vec<NoteWithContent>,
    #[serde(default)]
    pub folders: Vec<FolderMeta>,
}

pub struct NoteWithContent {
    pub meta: NoteMeta,
    pub content: String,
}
```

Read all notes : pour chaque dossier `notes/<id>/`, lire `note.json` + `content.html` et regrouper.

Read folders : `folders.json` direct.

- [ ] **Step 11.2: Étendre `restore_local_backup`**

Pour chaque note du backup : recréer le dossier + write meta + content.
Pour chaque folder : merger dans `folders.json` (ne pas écraser, append-or-update).

- [ ] **Step 11.3: Tests Rust**

- [ ] **Step 11.4: `cargo check` + commit**

---

## Phase C — Frontend sync engine

### Task 12 — Types + Zod schemas notes/folders

- [ ] **Step 12.1: Étendre `src/lib/sync/types.ts`**

```ts
export interface NotePayload {
  id: string;
  title: string;
  content_html: string;
  folder_id: string | null;
  favorite: boolean;
  order: number;
  updated_at: string;
  deleted_at: string | null;
}

export interface FolderPayload {
  id: string;
  name: string;
  order: number;
  updated_at: string;
  deleted_at: string | null;
}

export interface NoteQueueEntry {
  id: string;
  table: 'user_notes';
  operation: 'upsert' | 'delete';
  item_id: string;
  payload: NotePayload;
  enqueued_at: string;
  retry_count: number;
}

export interface FolderQueueEntry {
  id: string;
  table: 'user_folders';
  // ...
}

export type QueueEntry =
  | UserSettingsQueueEntry
  | UserDictionaryQueueEntry
  | UserSnippetsQueueEntry
  | NoteQueueEntry
  | FolderQueueEntry;
```

- [ ] **Step 12.2: Étendre `src/lib/sync/schemas.ts`**

```ts
export const CloudUserNoteRowSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  title: z.string(),
  content_html: z.string(),
  folder_id: z.string().uuid().nullable(),
  favorite: z.boolean(),
  order: z.number().int(),
  updated_at: z.string(),
  deleted_at: z.string().nullable(),
  created_at: z.string(),
});

export const CloudUserFolderRowSchema = z.object({
  // ...
});
```

- [ ] **Step 12.3: Commit**

### Task 13 — Mapping notes ↔ cloud

- [ ] **Step 13.1: Étendre `src/lib/sync/mapping.ts`**

```ts
export function mapNoteToCloud(meta: NoteMeta, content: string): NotePayload {
  return {
    id: meta.id,
    title: meta.title,
    content_html: content,
    folder_id: meta.folderId ?? null,
    favorite: meta.favorite,
    order: meta.order,
    updated_at: meta.updatedAt,
    deleted_at: meta.deletedAt ?? null,
  };
}

export function mapNoteFromCloud(row: CloudUserNoteRow): { meta: NoteMeta; content: string } {
  // ...
}

export function mapFolderToCloud(folder: FolderMeta): FolderPayload { /* ... */ }
export function mapFolderFromCloud(row: CloudUserFolderRow): FolderMeta { /* ... */ }
```

- [ ] **Step 13.2: Tests Vitest** dans `mapping.test.ts`

- [ ] **Step 13.3: Commit**

### Task 14 — Client (pull) notes + folders

- [ ] **Step 14.1: Étendre `src/lib/sync/client.ts`**

```ts
export async function pullNotes(supabase: SupabaseClient, sinceIso?: string): Promise<PullResult<NotePayload>> {
  let query = supabase.from('user_notes').select('*');
  if (sinceIso) query = query.gt('updated_at', sinceIso);
  const { data, error } = await query;
  if (error) throw error;
  const validated = (data ?? []).map(row => CloudUserNoteRowSchema.safeParse(row));
  // Compte les invalid via safeParse, idem pattern existant sub-epic 02
  return { rows: validated.filter(r => r.success).map(r => r.data), invalid: validated.filter(r => !r.success).length };
}

export async function pullFolders(supabase: SupabaseClient, sinceIso?: string): Promise<PullResult<FolderPayload>> {
  // ...
}
```

- [ ] **Step 14.2: Tests Vitest** dans `client.test.ts`

- [ ] **Step 14.3: Commit**

### Task 15 — Merge LWW notes + folders

- [ ] **Step 15.1: Étendre `src/lib/sync/merge.ts`**

```ts
export function mergeNotes(local: NoteMeta[], cloudRows: NotePayload[]): {
  toApplyLocally: { meta: NoteMeta; content: string; toDelete: boolean }[];
  toPush: { meta: NoteMeta; content: string }[];
} {
  // LWW par item : compare local.updated_at vs cloud.updated_at
  // Soft-delete : compare deleted_at vs updated_at, plus récent gagne
  // ...
}

export function mergeFolders(local: FolderMeta[], cloudRows: FolderPayload[]): {
  toApplyLocally: { folder: FolderMeta; toDelete: boolean }[];
  toPush: FolderMeta[];
} {
  // ...
}
```

- [ ] **Step 15.2: Tests Vitest** dans `merge.test.ts`

Cas : LWW basique, delete vs update, create concurrent UUIDs distincts, propagation soft-delete, orphan note via folder soft-deleted.

- [ ] **Step 15.3: Commit**

### Task 16 — `notes-store.ts` (push-on-mutate)

- [ ] **Step 16.1: Créer `src/lib/sync/notes-store.ts`**

```ts
import { invoke } from '@tauri-apps/api/core';
import { queueAdd } from './queue';
import { mapNoteToCloud } from './mapping';
import { mutex } from './_mutex';

export async function createNoteSynced(folderId: string | null): Promise<NoteMeta> {
  return mutex('notes', async () => {
    const meta = await invoke<NoteMeta>('create_note', { folderId });
    await queueAdd({
      table: 'user_notes',
      operation: 'upsert',
      item_id: meta.id,
      payload: mapNoteToCloud(meta, ''),
    });
    return meta;
  });
}

export async function updateNoteSynced(id: string, content: string, title: string): Promise<NoteMeta> {
  return mutex('notes', async () => {
    const meta = await invoke<NoteMeta>('update_note', { id, content, title });
    await queueAdd({ /* ... */ });
    return meta;
  });
}

// Idem deleteNoteSynced, moveNoteToFolderSynced, toggleFavoriteSynced, reorderNotesInFolderSynced
```

Le **debounce 2s** spécifique à `updateNoteSynced` est géré au niveau du hook `useNotes` (pas dans le store), via un timer côté React.

- [ ] **Step 16.2: Tests Vitest**

- [ ] **Step 16.3: Créer `src/lib/sync/folders-store.ts`** (idem pattern, push immédiat)

- [ ] **Step 16.4: Commit**

### Task 17 — Câbler `useNotes` et `useFolders` sur la queue

- [ ] **Step 17.1: Modifier `src/hooks/useNotes.ts`**

- Remplacer les `invoke('create_note', ...)` etc. par les wrappers `*Synced` quand sync activée.
- Implémenter le debounce 2s spécifique à `updateNote` :

```ts
const updateNoteDebounceMap = new Map<string, NodeJS.Timeout>();

const updateNote = async (id: string, content: string, title: string) => {
  // Write local immédiat (pas de debounce sur l'écriture disque)
  await invoke<NoteMeta>('update_note', { id, content, title });

  // Debounce 2s du push sync
  if (syncEnabled) {
    const existing = updateNoteDebounceMap.get(id);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      pushNoteUpdate(id, content, title); // wrapper qui add à la queue
      updateNoteDebounceMap.delete(id);
    }, 2000);
    updateNoteDebounceMap.set(id, timer);
  }
};
```

⚠️ Veiller à flush ces timers au logout/blur de la note.

- [ ] **Step 17.2: Modifier `src/hooks/useFolders.ts`**

Push immédiat sur create/rename/reorder/delete.

- [ ] **Step 17.3: Tests vitest** sur la logique de debounce (mock timers)

- [ ] **Step 17.4: Commit**

### Task 18 — Extension `SyncContext` (pull lifecycle + purge post-pull)

- [ ] **Step 18.1: Modifier `src/contexts/SyncContext.tsx`**

- Ajouter `pullNotes` + `pullFolders` aux trois moments (login, focus >5min, manuel).
- Après pull réussi : appliquer le merge, écrire localement via Tauri commands (create_note / update_note / move / etc.), puis appeler `purge_soft_deleted_notes_post_pull` + `purge_soft_deleted_folders_post_pull` avec les IDs soft-deleted du cloud.
- Mettre à jour `last_pull_at` dans `sync-meta.json`.

- [ ] **Step 18.2: Tests d'intégration light (mock supabase + mock invoke)**

- [ ] **Step 18.3: Commit**

### Task 19 — Flush queue & timers au logout

- [ ] **Step 19.1: Au logout, flush les timers debounce notes en push immédiat**

Évite la perte des modifs en cours de debounce. Cf. pattern existant SyncContext.

- [ ] **Step 19.2: Commit**

---

## Phase D — UX

### Task 20 — Extension modale first-login

- [ ] **Step 20.1: Modifier `src/components/settings/sections/SyncActivationModal.tsx`**

- Ajouter compteurs notes + folders dans la phrase "Tu as déjà X notes, Y dossiers, Z snippets, ..."
- Aucun changement de flow logique (les 2 options "upload" vs "fresh" couvrent déjà les nouveaux types).

- [ ] **Step 20.2: i18n FR + EN**

- [ ] **Step 20.3: Commit**

### Task 21 — Extension page transparence "Voir ce qui est synchronisé"

- [ ] **Step 21.1: Modifier `src/components/settings/sections/SyncedDataOverview.tsx`**

Ajouter sections "Notes (X)" et "Dossiers (Y)" avec compteurs live. Quota display : afficher le quota du plan courant (Free 10 MB / Starter 100 MB / Pro 500 MB) lu depuis l'AuthContext / SubscriptionContext (sub-epic 04 livré).

- [ ] **Step 21.2: i18n FR + EN**

- [ ] **Step 21.3: Commit**

### Task 22 — Banner "note >1 MB non syncée"

- [ ] **Step 22.1: Créer `src/components/notes/NoteSizeWarning.tsx`**

Banner non-bloquante affichée en haut de l'éditeur si `content_html.length > 1_048_576`.

- [ ] **Step 22.2: Wire dans `src/components/notes/NotesEditor/NotesEditor.tsx`**

- [ ] **Step 22.3: i18n FR + EN**

- [ ] **Step 22.4: Commit**

### Task 23 — Quota display dynamique par plan + upsell free

- [ ] **Step 23.1: Centraliser les seuils dans un module TS**

Créer `src/lib/sync/quota.ts` :

```ts
export const QUOTA_BY_PLAN = {
  free: 10 * 1024 * 1024,
  starter: 100 * 1024 * 1024,
  pro: 500 * 1024 * 1024,
} as const;

export type Plan = keyof typeof QUOTA_BY_PLAN;

export function getQuotaForPlan(plan: Plan | string | undefined | null): number {
  if (plan && plan in QUOTA_BY_PLAN) return QUOTA_BY_PLAN[plan as Plan];
  return QUOTA_BY_PLAN.free;
}

export function getWarningThreshold(quota: number): number {
  return Math.floor(quota * 0.8);
}
```

- [ ] **Step 23.2: Chercher les occurrences hardcodées du quota dans `src/`**

Grep sur `5 MB`, `5_242_880`, `5242880`, `5 \* 1024`, `'5MB'`. Remplacer toute la logique d'affichage quota par un appel à `getQuotaForPlan(currentPlan)` avec le plan lu via `useAuth()` / `useSubscription()`.

- [ ] **Step 23.3: Composant upsell free**

Quand `currentPlan === 'free'` ET `usageBytes >= warningThreshold`, afficher une carte d'upsell dans `SyncedDataOverview` :

```
Tu utilises 8.5 MB sur les 10 MB de ton plan Free.
Passe à Starter (100 MB, 5€/mois) ou Pro (500 MB, 9€/mois) pour plus d'espace.
[Voir les plans]
```

Le lien "Voir les plans" pointe vers la page billing existante (sub-epic 04).

- [ ] **Step 23.4: Gestion 413 quota_exceeded côté client**

Quand l'Edge renvoie `{ error: "quota_exceeded", plan, used, limit }`, le `SyncContext` affiche une toast / modale avec le message adapté + lien upsell si `plan === 'free'`.

- [ ] **Step 23.5: i18n FR + EN**

Namespaces : `sync.quota.exceeded`, `sync.quota.upsell.free`, `sync.quota.usage` (avec placeholders `{{used}}` / `{{limit}}` / `{{plan}}`).

- [ ] **Step 23.6: Commit**

---

## Phase E — Tests, doc, closure

### Task 24 — Tests Vitest étendus

- [ ] **Step 24.1: Vérifier coverage des nouveaux modules**

```bash
pnpm test
```

Expected : tests mapping/merge/client/notes-store/folders-store passent. Si gap de coverage, compléter.

### Task 25 — Smoke E2E checklist manuelle

- [ ] **Step 25.1: Créer `docs/v3/03-sync-notes-e2e-checklist.md`**

Calquer sur `docs/v3/02-sync-settings-e2e-checklist.md`. Cas :

1. **First-login signup vierge** : aucune modale, sync silencieuse, 0 note pushée.
2. **First-login avec notes locales** : modale affiche compteurs, "Upload" pousse tout, vérifier via dashboard Supabase.
3. **Modif note offline** : couper réseau, modifier note, online → push après reconnect.
4. **LWW soft overwrite** : modifier même note sur 2 devices avec temps décalés, vérifier dernière modif gagne.
5. **Soft-delete propagation** : delete note device A, focus device B → note disparait.
6. **Delete folder** : folder soft-deleted, notes orphelines (folder_id null) côté local + cloud.
7. **Hard cap 1 MB** : coller image base64 5 MB dans note, vérifier banner UI + sync de cette note skip.
8. **Quota free 10 MB** : pousser ~9 MB sur user free, vérifier warning à 8 MB + upsell card, rejection à 10 MB. Bumper à Starter, vérifier que le user peut maintenant pousser jusqu'à 100 MB.
8bis. **Quota cross-plan** : forcer un user à Pro via dashboard, pousser ~450 MB, vérifier OK. Downgrade à Free, vérifier soft enforcement (data conservé, pushs bloqués, warning permanent).
9. **Backlinks post-pull** : créer note A référencée par note B sur device 1, pull sur device 2, backlinks correct.
10. **GDPR export** : Settings → "Exporter mes données" → JSON contient notes + folders complets.
11. **GDPR delete** : "Supprimer mon compte" → tables purgées (vérif via Supabase dashboard cascade).
12. **Purge cron** : modifier `deleted_at` d'une note pour la simuler >30j, lancer Edge purge manuellement, vérifier disparition.

- [ ] **Step 25.2: Exécuter la checklist sur build prod (à demander à l'user)**

⚠️ Cette task **bloque la release** : à dérouler avant tag/PR final.

### Task 26 — i18n FR + EN finalisation

- [ ] **Step 26.1: Vérifier tous les nouveaux strings ont une clé i18n**

```bash
```
Utiliser Grep sur les composants modifiés pour trouver les strings hardcodées.

- [ ] **Step 26.2: Compléter `src/locales/fr.json` + `en.json`** (namespaces `sync.notes.*`, `notes.size.*`, etc.)

- [ ] **Step 26.3: Commit**

### Task 27 — Documentation closure

- [ ] **Step 27.1: Mettre à jour `docs/v3/EPIC.md`**

Status sub-epic 03 : "🚧 en cours" → "✅ livré" (à la clôture). Indiquer le tag bêta de livraison (`v3.0.0-beta.X`).

- [ ] **Step 27.2: Ajouter ligne ADR 0016 dans `docs/v3/decisions/adr-implementation-matrix.md`**

| **0016** — Notes sync strategy | Tables séparées notes+folders + LWW + soft-delete + hard cap 1 MB | ✅ | Migrations 20260601000800-001000, Edge sync-push étendue, `src/lib/sync/*-store.ts`, hooks notes/folders câblés. |

- [ ] **Step 27.3: Créer ADR de clôture `docs/v3/decisions/0017-sub-epic-03-closure.md`**

Si ajustements vs spec → les tracer ici (style 0010-sub-epic-02-closure).

- [ ] **Step 27.4: Mettre à jour section `## V3 Documentation` de `CLAUDE.md`**

Ajouter sous-section "V3 Sync notes (livré sous-épique 03)" avec :
- backend Rust modifié (notes.rs + folders.rs + sync.rs)
- types DB (2 nouvelles tables)
- frontend (notes-store, folders-store, hooks câblés)
- migrations (3 nouvelles)
- tests (pgtap + vitest)
- checklist E2E

- [ ] **Step 27.5: Mettre à jour `memory/MEMORY.md`**

Ajouter ligne :
```
- [Sous-épique 03-sync-notes livré](project_v3_sync_notes.md) — LWW par note, soft-delete, hard cap 1 MB, quota freemium hybride (Free 10 MB / Starter 100 MB / Pro 500 MB), backlinks restent local
```

Créer le fichier mémoire correspondant.

- [ ] **Step 27.6: Commit final + PR**

```bash
git push -u origin feat/v3-sync-notes
gh pr create --title "feat(v3): sub-epic 03 — sync notes & folders" --body "..."
```

PR description doit inclure :
- Lien ADR 0016
- Lien spec design
- Lien checklist E2E
- Liste des ajustements vs plan initial (si applicable)

---

## Critères de release

- [ ] Tous les tests pgtap RLS passent (8 policies notes + folders).
- [ ] Test hard cap 1 MB passe (constraint Postgres + check Edge).
- [ ] Tests Vitest mapping/merge/client/store passent.
- [ ] `cargo check` + `cargo test` côté Rust : 0 erreur.
- [ ] `pnpm build` : 0 erreur TypeScript.
- [ ] Checklist E2E manuelle (Task 25) : 12/12 ✅.
- [ ] Edge Functions déployées (sync-push v2, account-export v2, purge cron).
- [ ] i18n FR + EN complète sur les nouveaux strings.
- [ ] Documentation à jour (EPIC, ADR matrix, CLAUDE.md, MEMORY.md).
- [ ] PR review approuvée.

---

## Liens

- [Design doc](../specs/2026-05-19-v3-sub-epic-03-sync-notes-design.md)
- [Living spec](../../../v3/03-sync-notes.md)
- [ADR 0016](../../../v3/decisions/0016-notes-sync-strategy.md)
- [Sub-epic 02 plan (référence pattern)](2026-04-24-v3-sub-epic-02-sync-settings.md)
- [Sub-epic 02 closure ADR](../../../v3/decisions/0010-sub-epic-02-closure.md)
