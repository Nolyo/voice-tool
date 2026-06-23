# 03 — Sync notes

> **Statut**: 🚧 Spec figée (2026-05-19). Implémentation à venir dans une future bêta `v3.0.0-beta.X`.
> **Dépendances**: [`00-threat-model.md`](00-threat-model.md), [`01-auth.md`](01-auth.md), [`02-sync-settings.md`](02-sync-settings.md), ADRs 0002, 0003, 0008-sync, 0010, **0016**.

---

## Principe directeur

La sync notes hérite intégralement des trois garanties du sous-épique 02 :

1. **Le mode local reste gratuit et entièrement fonctionnel.** Les notes restent sur disque même sync désactivée.
2. **Backup local automatique** avant toute opération destructrice (étendu pour inclure notes + folders).
3. **La sync peut être désactivée à tout moment** sans perte de données.

Spécifique notes : **les backlinks restent locaux**, recalculés post-pull à partir du contenu HTML synced. Pas de table serveur dédiée — KISS.

---

## Périmètre

### ✅ Ce qui synchronise dans le présent sous-épique

**Notes** — dans `user_notes` :

| Champ | Type | Source de vérité conflit |
|---|---|---|
| `id` | uuid (client-side) | n/a |
| `title` | text | LWW |
| `content_html` | text | LWW |
| `folder_id` | uuid nullable | LWW |
| `favorite` | bool | LWW |
| `order` | int | LWW (acceptable de diverger entre devices) |
| `created_at` | timestamptz | inchangé serveur |
| `updated_at` | timestamptz | trigger serveur |
| `deleted_at` | timestamptz nullable | LWW vs `updated_at` |

**Dossiers** — dans `user_folders` :

| Champ | Type | Source de vérité conflit |
|---|---|---|
| `id` | uuid (client-side) | n/a |
| `name` | text | LWW |
| `order` | int | LWW |
| `created_at` | timestamptz | inchangé serveur |
| `updated_at` | timestamptz | trigger serveur |
| `deleted_at` | timestamptz nullable | LWW vs `updated_at` |

**Volumétrie typique** : ~50 notes × 50 KB = 2.5 MB par user actif (couvert même par le plan Free). Power user (~500 notes × 100 KB) = 50 MB → couvert par Starter, large marge sur Pro.

### ❌ Ce qui NE synchronise PAS dans le présent sous-épique

| Exclusion | Raison |
|---|---|
| **Backlinks** | Recalculés client-side via `get_backlinks` Rust à partir des `content_html` syncés. Pas de table serveur. |
| **Recherche full-text serveur** | Reste 100% client (`search_notes` Rust inchangé). FTS Postgres reporté ultérieurement. |
| **Sélection courante / état UI éditeur** | Per-device par nature. |
| **Images embarquées massives** | Hard cap 1 MB par note (cf. ADR 0016) — au-delà, sync de cette note bloquée avec message UI clair. |
| **Audio attachments** | Reporté ultérieurement (service managé). |
| **Historique versions** | Pas de versioning serveur (cf. ADR 0016, x2 stockage). |

---

## Schéma DB

### Tables

```sql
-- Dossiers (UUID client-side, LWW par item, soft-delete)
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

-- Notes (UUID client-side, LWW par item, soft-delete)
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
  created_at timestamptz not null default now()
);

create index on user_notes (user_id) where deleted_at is null;
create index on user_notes (user_id, folder_id) where deleted_at is null;
```

### Hard cap par note (côté serveur)

```sql
-- Check constraint : 1 MB max par contenu (sécurité défense en profondeur)
alter table user_notes
  add constraint user_notes_content_size_check
  check (octet_length(content_html) <= 1048576);
```

Validation aussi côté Edge Function `sync-push` (rejet HTTP 413 avec message clair AVANT le `insert/update`, pour donner un message UI utile sans déclencher l'erreur Postgres bas niveau).

### RLS — deny by default

```sql
alter table user_folders enable row level security;
alter table user_notes enable row level security;

-- user_folders policies
create policy "own_folders_select" on user_folders for select using (auth.uid() = user_id);
create policy "own_folders_insert" on user_folders for insert with check (auth.uid() = user_id);
create policy "own_folders_update" on user_folders for update using (auth.uid() = user_id);
create policy "own_folders_delete" on user_folders for delete using (auth.uid() = user_id);

-- user_notes policies (pattern identique)
create policy "own_notes_select" on user_notes for select using (auth.uid() = user_id);
create policy "own_notes_insert" on user_notes for insert with check (auth.uid() = user_id);
create policy "own_notes_update" on user_notes for update using (auth.uid() = user_id);
create policy "own_notes_delete" on user_notes for delete using (auth.uid() = user_id);
```

⚠️ **Mesure #1 threat model** : pgtap cross-tenant obligatoire avant release pour les 2 tables (8 policies au total).

### Triggers `updated_at`

```sql
create trigger user_folders_updated_at before update on user_folders
  for each row execute function update_updated_at();

create trigger user_notes_updated_at before update on user_notes
  for each row execute function update_updated_at();
```

Réutilisation de la fonction `update_updated_at()` livrée en sub-epic 02.

### Quota — extension `compute_user_sync_size`

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

**Quota freemium hybride** (cf. [ADR 0016 décision 7](decisions/0016-notes-sync-strategy.md)) :

| Plan | Quota global | Warning UI à 80% |
|---|---|---|
| **Free** | 10 MB | 8 MB |
| **Starter** (5€/mois) | 100 MB | 80 MB |
| **Pro** (9€/mois) | 500 MB | 400 MB |

Hard cap **1 MB par note** identique sur les 3 plans (anti-abus, pas anti-volume).

L'Edge Function `sync-push` lit le plan courant via la table `subscriptions` (livrée sub-epic 04), mappe vers le quota correspondant, fallback `free` si plan inconnu / abo inactif. Rejection HTTP 413 avec body `{ error: "quota_exceeded", plan, used, limit }` pour permettre à l'UI un message d'upsell ciblé.

Comportement post-downgrade : **soft enforcement** — data existant conservé, nouveaux pushs bloqués tant que `used > limit`, warning UI permanent.

### ON DELETE CASCADE — GDPR

FK `user_id → auth.users(id) ON DELETE CASCADE` sur les 2 tables. La suppression de compte purge automatiquement les notes + folders.

### FK folder_id — comportement orphelin

`user_notes.folder_id → user_folders(id) ON DELETE SET NULL`. Cohérent avec le comportement Rust local `orphan_notes_in_folder` (déjà en place). Une suppression de dossier ne perd jamais les notes.

---

## Sync engine

### Déclencheurs (lifecycle-based)

| Événement | Action |
|---|---|
| **Login réussi** | Full pull `user_notes` + `user_folders` (où `deleted_at IS NULL` OU `deleted_at > now() - 30 days` pour propager les tombstones récents). Merge local. |
| **Focus app post-inactivité ≥5 min** | Incremental pull : `where updated_at > last_pull_at` sur les 2 tables. |
| **Création note / folder** | Push immédiat (pas de debounce). |
| **Save contenu note** (update_note) | Push debounced **2s** par note. |
| **Renommage / move / favorite / reorder** | Push immédiat. |
| **Delete note / folder** | Push immédiat (soft-delete avec `deleted_at = now()`). |
| **Logout** | Flush queue + purge data locale syncée. |
| **Clic "Synchroniser maintenant"** | Full pull + flush queue. |

### Queue offline

Réutilisation intégrale du store `sync-queue.json` existant (sub-epic 02). Nouveaux types d'items :

```ts
type QueueEntry =
  | { table: 'user_settings'; ... }          // existant
  | { table: 'user_dictionary_words'; ... }  // existant
  | { table: 'user_snippets'; ... }          // existant
  | { table: 'user_notes'; operation: 'upsert' | 'delete'; itemId: string; payload: NotePayload; enqueuedAt: string; retryCount: number }  // NOUVEAU
  | { table: 'user_folders'; operation: 'upsert' | 'delete'; itemId: string; payload: FolderPayload; enqueuedAt: string; retryCount: number };  // NOUVEAU
```

FIFO, retry backoff 1s → 5s → 30s → 2min → 5min, idempotence via UUIDs client-side.

### Debounce push notes — 2s

Spécifique aux update_note (frappe continue). Toutes les autres opérations (create, move, rename folder, delete, favorite, reorder) = push immédiat. Cf. [ADR 0016 décision 4](decisions/0016-notes-sync-strategy.md).

### Latence perçue

- **En ligne, frappe continue** : push toutes les 2s pendant frappe, propagation cloud ~2.2s.
- **Device distant** : jusqu'à 5 min pire cas (focus).
- **Offline** : queue persiste, push au retour online.

---

## Conflict resolution

### Par table

| Table | Stratégie |
|---|---|
| `user_notes` | LWW par row complet (`updated_at` serveur) |
| `user_folders` | LWW par row complet |

### Edge cases

| Scénario | Résultat |
|---|---|
| Device A renomme note à 10:00, Device B édite contenu à 10:01 | Édition B gagne (titre original perdu). Mitigation : backup local + export. |
| Device A soft-delete note à 10:00, Device B édite à 10:01 | Édition B gagne, note ressuscite côté A au prochain pull. |
| Device A soft-delete folder à 10:00, Device B déplace note vers ce folder à 10:01 | Note se retrouve avec `folder_id` pointant vers un dossier soft-deleted. Au pull, le device détecte folder `deleted_at IS NOT NULL` et orpheline la note localement (cohérent avec FK SET NULL serveur). |
| Devices A et B créent une note simultanément | UUIDs distincts → 2 rows distinctes. Pas de collision. |
| Backlinks après suppression | Note référencée n'existe plus localement → `BrokenNoteLinkDialog` gère gracieusement (déjà en place). |
| Note dépasse 1 MB localement | Sync refuse cette note (avec message UI), les autres notes continuent de syncer. |

### Ce qu'on NE FAIT PAS dans le présent sous-épique

- ❌ Notification "cette note a été modifiée sur un autre device" (silent overwrite LWW assumé).
- ❌ Merge par champ (titre vs contenu vs folder) — row entier.
- ❌ Historique / undo serveur.
- ❌ CRDT (Yjs/Automerge).
- ❌ Realtime Supabase channels.

### Ce qu'on FAIT pour limiter la casse

- ✅ Backup local étendu (notes + folders inclus).
- ✅ Export GDPR étendu (notes + folders).
- ✅ Logs côté client : opération + table + item ID + timestamp (zéro contenu).
- ✅ Hard cap 1 MB par note bloque les abus.

---

## Migration des notes locales existantes

### Détection "state non-trivial"

Étend la modale sub-epic 02 first-login. Conditions agrégées :
- ≥ 1 snippet créé (existant)
- ≥ 3 mots dico (existant)
- ≥ 1 hotkey modifiée (existant)
- **≥ 1 note locale** (nouveau)
- **≥ 1 folder local** (nouveau)

Si user déjà sync settings (sub-epic 02) sans notes, le toggle "Synchronisation cloud" reste ON et le pull notes au prochain login se fait silencieusement (rien à uploader localement, juste pull).

### Cas d'usage

#### Cas 1 — Sync activée pour la première fois après livraison du sub-épique notes, notes locales existent

Modale extension :

```
┌────────────────────────────────────────────────────┐
│  Activer la synchronisation                        │
│                                                     │
│  Tu as déjà X notes et Y dossiers sur ce device.  │
│                                                     │
│  [ ● ] Uploader tout (recommandé)                   │
│        Tes notes, dossiers, snippets, dico,         │
│        prompts et préférences seront envoyés au     │
│        cloud et disponibles sur tes autres devices. │
│                                                     │
│  [   ] Partir d'un setup neuf                       │
│        Ton state local sera remplacé par un état   │
│        vierge. Un backup est conservé localement.   │
│                                                     │
│  ℹ️ Tes clés API restent device-local.              │
│  ℹ️ Backup automatique dans tous les cas.           │
│                                                     │
│                       [Annuler]    [Activer]        │
└────────────────────────────────────────────────────┘
```

#### Cas 2 — Bêta précédente avec sync settings active, première bêta avec sync notes

Au premier login post-upgrade :
- Si `local_notes_count > 0` et `cloud_notes_count == 0` : modale "Tu as X notes locales. On les upload au cloud ?" (Oui par défaut, Non = sync notes désactivée mais sync settings reste active).
- Si `local_notes_count > 0` et `cloud_notes_count > 0` (rare, jamais possible normalement) : merge safe par UUIDs distincts, info-bar non bloquante "Tes notes locales et cloud ont été mergées."
- Si `local_notes_count == 0` : pull silencieux, pas de modale.

#### Cas 3 — Nouveau device, cloud populated

Pull complet au login. Notes apparaissent dans la liste. Backlinks recalculés via `get_backlinks` post-pull. Pas de modale.

### Backup local étendu

- Fichier : `%APPDATA%/com.nolyo.lexena/profiles/<profile_id>/backups/pre-sync_YYYY-MM-DD_HHmmss.json`
- Format JSON : sections existantes + nouvelles :

```json
{
  "settings": { ... },
  "snippets": [ ... ],
  "dictionary": [ ... ],
  "notes": [
    { "id": "...", "meta": {...}, "content": "<html>..." }
  ],
  "folders": [ ... ]
}
```

- Restore : décompresse les sections vers leurs storage respectifs (Tauri Store pour settings/snippets/dico, fichiers `notes/<id>/note.json + content.html` pour notes, `folders.json` pour folders).
- Rotation FIFO 10 backups.

### Réversibilité

| Action | Comportement |
|---|---|
| Toggle "Sync cloud" OFF | Pause — cloud conservé, local conservé, réactivation safe via merge par UUID. |
| Supprimer mon compte | Delete complet GDPR (cascade auth.users → user_notes + user_folders + autres tables). Local conservé "non syncé". |

---

## UX

### Toggle "Synchronisation cloud" (inchangé)

Le toggle existant Settings > Compte couvre maintenant settings **+ notes + folders**. Pas de toggle séparé "Sync notes" pour rester simple — l'user qui veut pas sync ses notes désactive tout.

### Page transparence "Voir ce qui est synchronisé"

Mise à jour avec compteurs notes + folders :

```
Synchronisé sur ce compte :
- Préférences (theme, langue, hotkeys, etc.)
- Dictionnaire personnalisé (247 mots)
- Snippets (12)
- Notes (45) ← nouveau
- Dossiers (6) ← nouveau

Stockage utilisé : 3.2 MB / 10 MB (plan Free) ← affiche le quota du plan courant
```

### Status indicator (inchangé)

4 états (synchronisé / en cours / hors ligne / erreur). Pas d'indicateur par note dans le présent sous-épique.

### Hard cap 1 MB par note — message UI

Si l'user édite une note qui dépasse 1 MB :

```
┌────────────────────────────────────────────────────┐
│  ⚠️ Cette note dépasse 1 MB                        │
│                                                     │
│  Elle ne sera pas synchronisée tant que sa taille  │
│  reste au-dessus de cette limite. Tes autres notes │
│  continuent à se synchroniser normalement.          │
│                                                     │
│  Astuce : supprime les images intégrées ou         │
│  scinde-la en plusieurs notes.                      │
└────────────────────────────────────────────────────┘
```

Le contenu reste sauvegardé localement, pas de perte.

### Reporté ultérieurement

- Pastille sync par note (vert/orange/gris)
- Modale conflit "voici les 2 versions"
- Restore depuis corbeille UI (les notes soft-deleted ne sont pas exposées dans l'UI ; purge auto 30j)
- Pagination liste notes

---

## Offline

### Détection

Inchangée vs sub-epic 02 : reqwest timeout 10s, retry backoff. Status indicator passe en 📶 après 2 échecs consécutifs.

### Queue persistante

Réutilise `sync-queue.json` existant. Taille max conseillée : ~10 MB (largement au-dessus d'un usage normal — soft cap, pas hard).

### Au retour online

Flush queue dans l'ordre FIFO. Status indicator passe en 🔄 puis ✅.

---

## Backend Rust — modifications nécessaires

### `NoteMeta` + `FolderMeta` — ajout champs

```rust
// src-tauri/src/notes.rs
pub struct NoteMeta {
    pub id: String,
    pub title: String,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default)]
    pub favorite: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub folder_id: Option<String>,
    #[serde(default)]
    pub order: i32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub deleted_at: Option<String>, // NOUVEAU
}

// src-tauri/src/folders.rs
pub struct FolderMeta {
    pub id: String,
    pub name: String,
    pub created_at: String,
    pub updated_at: String, // NOUVEAU (était absent)
    #[serde(default)]
    pub order: i32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub deleted_at: Option<String>, // NOUVEAU
}
```

Migration au démarrage : si `updated_at` manquant dans `folders.json`, défaut = `created_at` (idempotent).

### `delete_note` — soft-delete

```rust
#[tauri::command]
pub async fn delete_note(app_handle: AppHandle, id: String) -> Result<(), String> {
    // AVANT : fs::remove_dir_all(&note_dir)
    // APRÈS : set deleted_at = now() + écrire note.json
    let mut meta = read_note_meta(&note_dir).map_err(|e| e.to_string())?;
    meta.deleted_at = Some(chrono::Utc::now().to_rfc3339());
    meta.updated_at = meta.deleted_at.clone().unwrap();
    let meta_json = serde_json::to_string_pretty(&meta).map_err(|e| e.to_string())?;
    fs::write(note_dir.join("note.json"), meta_json).map_err(|e| e.to_string())?;
    Ok(())
}
```

`list_notes`, `search_notes`, `get_backlinks`, `orphan_notes_in_folder` filtrent maintenant `meta.deleted_at.is_none()`.

### Purge locale post-pull

Nouvelle fonction Rust `purge_soft_deleted_notes_post_pull(app_handle, note_ids: Vec<String>)` :
- Pour chaque note ID dans la liste (notes serveur avec `deleted_at IS NOT NULL`), si le dossier local existe et que le meta local a aussi `deleted_at`, hard-delete le dossier.
- Appelée par le sync engine TS après chaque pull réussi.

### Purge serveur cron 30j

Edge Function (impl reportée au sprint, cf. [ADR 0016](decisions/0016-notes-sync-strategy.md)). Soit nouvelle Edge `purge-soft-deleted-notes` cron 30j, soit extension de `purge-account-deletions` pour traiter aussi notes/folders tombstoned.

### Update Edge Function `sync-push`

Étend les schémas Zod pour accepter `note` et `folder` items :

```ts
// supabase/functions/sync-push/schema.ts
const NotePayloadSchema = z.object({
  id: z.string().uuid(),
  title: z.string().max(500),
  content_html: z.string().max(1_048_576), // 1 MB hard cap
  folder_id: z.string().uuid().nullable(),
  favorite: z.boolean(),
  order: z.number().int(),
  updated_at: z.string().datetime(),
  deleted_at: z.string().datetime().nullable(),
});

const FolderPayloadSchema = z.object({
  id: z.string().uuid(),
  name: z.string().max(200),
  order: z.number().int(),
  updated_at: z.string().datetime(),
  deleted_at: z.string().datetime().nullable(),
});
```

Validation quota post-apply réutilisée (compute_user_sync_size étendue).

---

## Threats & mitigations

| Mesure threat model | Application sync notes |
|---|---|
| **#1 — RLS cross-tenant** | 2 tables × 4 policies = 8 policies. pgtap automatisé. **Bloquant release.** |
| **#3 — Rate limiting Edge Functions** | `/sync/push` couvre déjà notes + folders (même Edge réutilisée). |
| **#4 — Validation input Zod** | Schémas notes/folders + hard cap 1 MB côté Edge AVANT insert. |
| **#5 — Logs serveur zéro PII** | Pas de title, pas de content dans logs. Uniquement user_id + operation + table + item_id + duration_ms. |
| **GDPR #5 — Droit à l'oubli** | ON DELETE CASCADE depuis auth.users → purge automatique notes + folders. Test pgtap. |
| **GDPR #6 — Data export** | Edge Function `account-export` étendue pour inclure notes (full content_html) + folders. |

---

## Questions techniques reportées au sprint

1. **Edge purge cron 30j** — nouvelle Edge dédiée `purge-soft-deleted-notes` vs extension `purge-account-deletions`.
2. **Migration `updated_at` folders** — au login Rust ou au premier `list_folders` ? Idempotent dans les 2 cas, mais préférable au mount pour ne pas push toutes les folders en bulk au premier appel.
3. **Backup format** — JSON unique extended (recommandé) vs ZIP avec arbre fichiers. JSON tranché pour ce sub-épique (cohérence sub-epic 02), à reconsidérer si volumétrie pose problème.
4. **Bumping quotas freemium** au-delà des seuils figés (10/100/500) — data-driven post-traction si une cohorte de users payants se cogne au plafond de leur plan.

---

## Livrables dev prévus (PRs indicatives)

1. **Supabase schema + RLS notes** — 2 migrations (`user_folders`, `user_notes`) + check constraint 1 MB + extension `compute_user_sync_size`. Tests pgtap cross-tenant.
2. **Edge Function `sync-push` étendue** — schémas Zod notes/folders, hard cap 1 MB, quota post-apply.
3. **Edge Function purge tombstones cron 30j** — ou extension `purge-account-deletions`.
4. **Edge Function `account-export` étendue** — sections notes + folders dans le JSON.
5. **Backend Rust modifications** — `deleted_at` sur NoteMeta, `updated_at` + `deleted_at` sur FolderMeta, soft-delete dans `delete_note`, filtre `list_notes`/`search_notes`/`get_backlinks`/`orphan_notes_in_folder`, fonction `purge_soft_deleted_notes_post_pull`.
6. **Frontend sync engine notes** — extension queue + mapping + client + merge pour notes/folders. Hooks `useNotes` / `useFolders` câblés sur la queue (push debounced 2s sur update_note, push immédiat sur les autres).
7. **UX migration** — extension modale first-login avec compteurs notes + folders.
8. **UX hard cap par note** — banner non-bloquante quand une note dépasse 1 MB.
9. **Backup local étendu** — extension format JSON + restore.
10. **Tests E2E** — cross-device Windows↔Windows et Windows↔macOS, conflict LWW, soft-delete propagation, folder rename + note move, backlinks post-pull, offline + reconnexion, migration 3 cas.

---

## Liens

- [EPIC v3](EPIC.md)
- [00 — Threat model](00-threat-model.md)
- [01 — Auth & comptes](01-auth.md)
- [02 — Sync settings](02-sync-settings.md)
- [ADR 0002 — Server-side encryption](decisions/0002-server-side-encryption.md)
- [ADR 0008 — Sync strategy settings](decisions/0008-sync-strategy.md)
- [ADR 0010 — Closure sub-epic 02-sync](decisions/0010-sub-epic-02-closure.md)
- [ADR 0016 — Notes sync strategy](decisions/0016-notes-sync-strategy.md)
