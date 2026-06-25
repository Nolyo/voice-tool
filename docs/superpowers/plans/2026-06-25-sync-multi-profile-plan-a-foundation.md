# Sync Multi-Profile — Plan A : Cloud Partitioning Foundation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Partitionner les données sync cloud par profil (`profile_id`) pour qu'activer la sync sur plusieurs profils locaux n'entraîne plus de fusion ("tout est mergé"). À l'issue de ce plan, chaque profil synchronise dans sa propre partition cloud sur un même appareil.

**Architecture :** Le cloud est aujourd'hui indexé uniquement par `user_id`. On ajoute une table `user_profiles` (registre des profils, LWW + soft-delete comme `user_folders`) et une colonne `profile_id uuid not null` sur les 5 tables synchronisées. Chaque profil local stocke un `cloud_profile_id` (UUID généré client) dans son `sync-meta.json` (déjà per-profil depuis le fix du 2026-06-23). Le client filtre les pulls par `profile_id` et envoie le `profile_id` au push ; l'Edge `sync-push` estampille chaque ligne. Snippets + dictionnaire passent per-profil (leurs stores locaux quittent la racine). Migration = **coupe nette** (tables sync vidées, re-push depuis le local). RLS reste `auth.uid() = user_id` — `profile_id` est un discriminant intra-user, pas une frontière de sécurité.

**Tech Stack :** Supabase (Postgres + RLS + pgtap), Deno Edge Functions (Zod), Tauri 2 (Rust), React 19 + TypeScript, Vitest, `cargo test`, `pnpm exec supabase`.

**Spec :** `docs/superpowers/specs/2026-06-25-sync-multi-profile-design.md`

## Global Constraints

- **Coupe nette** : on vide les 5 tables sync cloud ; `profile_id` est ajouté `NOT NULL`. Parc utilisateurs = 0, aucune préservation de données cloud existantes (le local re-pousse). Le local n'est jamais wipé.
- **RLS inchangé** : toutes les policies restent `auth.uid() = user_id`. Ne PAS tenter d'exprimer `profile_id` en RLS.
- **Quota inchangé** : `compute_user_sync_size(user_id)` continue de sommer tous les profils (quota = par compte). Ne pas le modifier.
- Ne jamais casser les dépendances existantes : pas de `cargo update`, pas de modif de features de crates (`feedback_no_breaking_deps`).
- `cargo check`/`cargo test` sur Windows nécessitent `LIBCLANG_PATH="C:/Program Files/LLVM/bin"` et CMake sur le PATH : `export PATH="$PATH:/c/Program Files/CMake/bin"`.
- PowerShell est le shell par défaut hors Bash tool : `$env:VAR = "..."`, jamais `VAR=val cmd`.
- Toute string UI passe par i18n (react-i18next) — aucune n'est ajoutée par ce plan, mais la règle tient.
- Commits en anglais, conventional-commits.
- Migrations Supabase : timestamp réel `YYYYMMDDHHMMSS` (`feedback_migration_timestamps`).
- Le path de store per-profil = `profiles/<id>/<filename>`, retourné par une commande Rust et passé à `Store.load(path)` — miroir exact de `get_active_profile_sync_queue_path`.
- Edge Functions : imports `npm:` (pas `esm.sh`), une seule `deno.json` à `supabase/functions/`.
- Ordre FK au push : `profile-upsert` AVANT toute op note/folder/settings/snippet/dictionary du même profil (FK `profile_id → user_profiles`). `folder-upsert` AVANT `note-upsert` (FK existante `user_notes.folder_id`).

---

### Task A1 : Migration — table `user_profiles`

**Files:**
- Create: `supabase/migrations/20260625130000_user_profiles.sql`
- Test: `supabase/tests/rls_user_profiles.sql`

**Interfaces:**
- Produces: table `public.user_profiles(id uuid pk, user_id uuid, name text, created_at, updated_at, deleted_at)` avec RLS deny-by-default (`auth.uid() = user_id`), trigger `updated_at`, index actifs. Consommée par la FK `profile_id` de Task A2 et par l'Edge en Task A4.

- [ ] **Step 1 : Écrire la migration**

Create `supabase/migrations/20260625130000_user_profiles.sql` :

```sql
-- user_profiles — registre des profils utilisateur synchronisés (multi-profil cloud).
-- Spec 2026-06-25. Modèle LWW par item + soft-delete, calqué sur user_folders.
-- Chaque profil local stocke ce `id` (UUID client-generated) dans son sync-meta (cloud_profile_id).
-- Les 5 tables sync portent une FK profile_id -> user_profiles(id).
create table if not exists public.user_profiles (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 64),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists user_profiles_user_active_idx
  on public.user_profiles (user_id) where deleted_at is null;

create index if not exists user_profiles_user_updated_idx
  on public.user_profiles (user_id, updated_at);

alter table public.user_profiles enable row level security;

create policy "user_profiles_select_own" on public.user_profiles
  for select using (auth.uid() = user_id);

create policy "user_profiles_insert_own" on public.user_profiles
  for insert with check (auth.uid() = user_id);

create policy "user_profiles_update_own" on public.user_profiles
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "user_profiles_delete_own" on public.user_profiles
  for delete using (auth.uid() = user_id);

create or replace function public.tg_user_profiles_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists user_profiles_updated_at on public.user_profiles;
create trigger user_profiles_updated_at
  before update on public.user_profiles
  for each row execute function public.tg_user_profiles_updated_at();

comment on table public.user_profiles is
  'v3 sync multi-profil: registre des profils. UUID client-generated + LWW + soft-delete.';
```

- [ ] **Step 2 : Écrire le test pgtap RLS cross-tenant**

Create `supabase/tests/rls_user_profiles.sql` (calque sur `rls_user_folders.sql` existant) :

```sql
begin;
select plan(4);

-- Deux users fictifs.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'a@test.dev'),
  ('00000000-0000-0000-0000-0000000000b2', 'b@test.dev')
on conflict do nothing;

-- User A crée un profil.
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"00000000-0000-0000-0000-0000000000a1"}';
insert into public.user_profiles (id, user_id, name)
  values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'Perso');

select is(
  (select count(*)::int from public.user_profiles),
  1,
  'User A voit son propre profil'
);

-- User B ne voit PAS le profil de A.
set local "request.jwt.claims" to '{"sub":"00000000-0000-0000-0000-0000000000b2"}';
select is(
  (select count(*)::int from public.user_profiles),
  0,
  'User B ne voit aucun profil de A (RLS isolation)'
);

-- User B ne peut pas modifier le profil de A.
select throws_ok(
  $$ update public.user_profiles set name = 'hacked'
     where id = '10000000-0000-0000-0000-000000000001' $$,
  null,
  null,
  'User B ne peut pas update le profil de A'
);
select is(
  (select count(*)::int from public.user_profiles
   where name = 'hacked'),
  0,
  'Aucun profil renommé par B'
);

select * from finish();
rollback;
```

- [ ] **Step 3 : Appliquer la migration en local et lancer pgtap**

Run (PowerShell) :
```
pnpm exec supabase db reset
pnpm exec supabase test db
```
Expected : `rls_user_profiles.sql` PASS (4/4), aucune régression sur les autres tests pgtap.

- [ ] **Step 4 : Commit**

```bash
git add supabase/migrations/20260625130000_user_profiles.sql supabase/tests/rls_user_profiles.sql
git commit -m "feat(sync): add user_profiles cloud registry table + RLS tests"
```

---

### Task A2 : Migration — `profile_id` sur les 5 tables sync (coupe nette)

**Files:**
- Create: `supabase/migrations/20260625131000_add_profile_id_sync_tables.sql`
- Test: `supabase/tests/profile_id_columns.sql`

**Interfaces:**
- Consumes: `public.user_profiles(id)` (Task A1).
- Produces: colonne `profile_id uuid not null references public.user_profiles(id) on delete cascade` sur `user_settings`, `user_dictionary_words`, `user_snippets`, `user_notes`, `user_folders`. PK `user_settings` → `(user_id, profile_id)` ; PK `user_dictionary_words` → `(user_id, profile_id, word)`. Index par profil. Consommée par l'Edge (A4) et le client (B3).

- [ ] **Step 1 : Écrire la migration**

Create `supabase/migrations/20260625131000_add_profile_id_sync_tables.sql` :

```sql
-- Multi-profil cloud : partition par profile_id sur les 5 tables sync.
-- COUPE NETTE (spec 2026-06-25) : parc = 0, on vide les tables et on ajoute
-- profile_id NOT NULL. Le client re-pousse depuis le local après réactivation.
-- RLS inchangé (auth.uid() = user_id) — profile_id est un discriminant intra-user.

-- 1. Vider les tables (ordre : notes avant folders à cause de la FK folder_id,
--    mais TRUNCATE ... CASCADE gère l'ensemble).
truncate table
  public.user_settings,
  public.user_dictionary_words,
  public.user_snippets,
  public.user_notes,
  public.user_folders
  cascade;

-- 2. user_settings : PK user_id -> (user_id, profile_id).
alter table public.user_settings
  add column profile_id uuid not null
    references public.user_profiles(id) on delete cascade;
alter table public.user_settings drop constraint user_settings_pkey;
alter table public.user_settings add primary key (user_id, profile_id);

-- 3. user_dictionary_words : PK (user_id, word) -> (user_id, profile_id, word).
alter table public.user_dictionary_words
  add column profile_id uuid not null
    references public.user_profiles(id) on delete cascade;
alter table public.user_dictionary_words drop constraint user_dictionary_words_pkey;
alter table public.user_dictionary_words add primary key (user_id, profile_id, word);
create index if not exists user_dictionary_words_profile_updated_idx
  on public.user_dictionary_words (user_id, profile_id, updated_at);

-- 4. user_snippets : PK id inchangée, ajout colonne + index.
alter table public.user_snippets
  add column profile_id uuid not null
    references public.user_profiles(id) on delete cascade;
create index if not exists user_snippets_profile_active_idx
  on public.user_snippets (user_id, profile_id) where deleted_at is null;

-- 5. user_notes : PK id inchangée, ajout colonne + index.
alter table public.user_notes
  add column profile_id uuid not null
    references public.user_profiles(id) on delete cascade;
create index if not exists user_notes_profile_active_idx
  on public.user_notes (user_id, profile_id) where deleted_at is null;

-- 6. user_folders : PK id inchangée, ajout colonne + index.
alter table public.user_folders
  add column profile_id uuid not null
    references public.user_profiles(id) on delete cascade;
create index if not exists user_folders_profile_active_idx
  on public.user_folders (user_id, profile_id) where deleted_at is null;
```

- [ ] **Step 2 : Écrire un test de présence des colonnes/PK**

Create `supabase/tests/profile_id_columns.sql` :

```sql
begin;
select plan(7);

select has_column('public', 'user_settings', 'profile_id', 'user_settings.profile_id existe');
select has_column('public', 'user_dictionary_words', 'profile_id', 'user_dictionary_words.profile_id existe');
select has_column('public', 'user_snippets', 'profile_id', 'user_snippets.profile_id existe');
select has_column('public', 'user_notes', 'profile_id', 'user_notes.profile_id existe');
select has_column('public', 'user_folders', 'profile_id', 'user_folders.profile_id existe');

select col_is_pk('public', 'user_settings', ARRAY['user_id', 'profile_id'],
  'user_settings PK = (user_id, profile_id)');
select col_is_pk('public', 'user_dictionary_words', ARRAY['user_id', 'profile_id', 'word'],
  'user_dictionary_words PK = (user_id, profile_id, word)');

select * from finish();
rollback;
```

- [ ] **Step 3 : Appliquer + tester**

Run :
```
pnpm exec supabase db reset
pnpm exec supabase test db
```
Expected : `profile_id_columns.sql` PASS (7/7), pas de régression.

- [ ] **Step 4 : Commit**

```bash
git add supabase/migrations/20260625131000_add_profile_id_sync_tables.sql supabase/tests/profile_id_columns.sql
git commit -m "feat(sync): partition sync tables by profile_id (clean break)"
```

---

### Task A3 : Edge `sync-push` — schéma `profile_id` + ops `profile-*`

**Files:**
- Modify: `supabase/functions/sync-push/schema.ts` (PushBodySchema + PushOperationSchema)
- Test: `supabase/functions/sync-push/schema.test.ts` (créer si absent, sinon étendre)

**Interfaces:**
- Produces: `PushBodySchema` accepte `profile_id: string (uuid)` ; `PushOperationSchema` accepte `{kind: "profile-upsert", profile: ProfilePayload}` et `{kind: "profile-delete", id}`. `ProfilePayloadSchema = { id (uuid), name (1..64), updated_at, deleted_at? }`. Consommé par A4.

- [ ] **Step 1 : Écrire le test**

Create `supabase/functions/sync-push/schema.test.ts` :

```ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { PushBodySchema } from "./schema.ts";

Deno.test("PushBodySchema requires profile_id uuid", () => {
  const ok = PushBodySchema.safeParse({
    profile_id: "10000000-0000-0000-0000-000000000001",
    device_id: "dev1",
    operations: [{ kind: "dictionary-upsert", word: "hello" }],
  });
  assertEquals(ok.success, true);

  const missing = PushBodySchema.safeParse({
    device_id: "dev1",
    operations: [{ kind: "dictionary-upsert", word: "hello" }],
  });
  assertEquals(missing.success, false);
});

Deno.test("PushOperationSchema accepts profile-upsert + profile-delete", () => {
  const up = PushBodySchema.safeParse({
    profile_id: "10000000-0000-0000-0000-000000000001",
    device_id: "dev1",
    operations: [
      {
        kind: "profile-upsert",
        profile: {
          id: "10000000-0000-0000-0000-000000000001",
          name: "Travail",
          updated_at: "2026-06-25T00:00:00+00:00",
        },
      },
      { kind: "profile-delete", id: "10000000-0000-0000-0000-000000000001" },
    ],
  });
  assertEquals(up.success, true);
});
```

- [ ] **Step 2 : Lancer le test (échec attendu)**

Run : `pnpm exec supabase functions serve --no-verify-jwt` n'est pas requis ; lance directement Deno :
```
deno test supabase/functions/sync-push/schema.test.ts --allow-all
```
Expected : FAIL — `profile_id` non requis / ops `profile-*` rejetées.

- [ ] **Step 3 : Implémenter**

Dans `supabase/functions/sync-push/schema.ts`, ajouter `ProfilePayloadSchema` après `FolderPayloadSchema` (ligne ~62) :

```ts
export const ProfilePayloadSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(64),
  updated_at: offsetDatetime(),
  deleted_at: offsetDatetime().nullable().optional(),
});
```

Ajouter deux entrées à `PushOperationSchema` (dans le `discriminatedUnion`, après `folder-delete`, ligne ~100) :

```ts
  z.object({
    kind: z.literal("profile-upsert"),
    profile: ProfilePayloadSchema,
  }),
  z.object({
    kind: z.literal("profile-delete"),
    id: z.string().uuid(),
  }),
```

Modifier `PushBodySchema` (ligne ~103) pour ajouter `profile_id` :

```ts
export const PushBodySchema = z.object({
  profile_id: z.string().uuid(),
  operations: z.array(PushOperationSchema).min(1).max(200),
  device_id: z.string().max(100),
});
```

- [ ] **Step 4 : Lancer le test (succès attendu)**

Run : `deno test supabase/functions/sync-push/schema.test.ts --allow-all`
Expected : PASS.

- [ ] **Step 5 : Commit**

```bash
git add supabase/functions/sync-push/schema.ts supabase/functions/sync-push/schema.test.ts
git commit -m "feat(sync): accept profile_id + profile ops in sync-push schema"
```

---

### Task A4 : Edge `sync-push` — estampiller `profile_id` + traiter `profile-*`

**Files:**
- Modify: `supabase/functions/sync-push/index.ts` (handler : lecture `profile_id`, chaque upsert, nouveaux cases)
- Test: `supabase/functions/sync-push/index.test.ts` (étendre les tests Deno existants)

**Interfaces:**
- Consumes: `PushBodySchema` (A3) ; table `user_profiles` (A1) + colonnes `profile_id` (A2).
- Produces: chaque upsert écrit `profile_id` ; `profile-upsert` upsert `user_profiles` ; `profile-delete` soft-delete `user_profiles`. onConflict ajustés.

- [ ] **Step 1 : Écrire le test**

Dans `supabase/functions/sync-push/index.test.ts`, ajouter (en réutilisant le harness de mock `client` existant du fichier — copier la forme des tests présents) un test qui vérifie qu'une op `note-upsert` écrit bien `profile_id`. Modèle (adapter au harness exact du fichier) :

```ts
Deno.test("note-upsert stamps profile_id from body", async () => {
  const captured: Record<string, unknown>[] = [];
  const client = makeFakeClient({ onUpsert: (table, row) => { if (table === "user_notes") captured.push(row); } });
  const req = new Request("http://x/sync-push", {
    method: "POST",
    body: JSON.stringify({
      profile_id: "10000000-0000-0000-0000-000000000001",
      device_id: "dev1",
      operations: [{
        kind: "note-upsert",
        note: {
          id: "20000000-0000-0000-0000-000000000002",
          title: "t", content_html: "", folder_id: null,
          favorite: false, order: 0,
          updated_at: "2026-06-25T00:00:00+00:00", deleted_at: null,
        },
      }],
    }),
  });
  await handler(req, { authenticate: async () => ({ userId: "00000000-0000-0000-0000-0000000000a1", client }) });
  assertEquals(captured[0].profile_id, "10000000-0000-0000-0000-000000000001");
});
```

(Si le harness `makeFakeClient` n'existe pas tel quel, réutilise le mock déjà présent dans le fichier de test — ne pas inventer une API ; copier la forme du test `note-upsert` existant et ajouter l'assertion sur `profile_id`.)

- [ ] **Step 2 : Lancer le test (échec attendu)**

Run : `deno test supabase/functions/sync-push/index.test.ts --allow-all`
Expected : FAIL — `profile_id` absent des rows upsertées.

- [ ] **Step 3 : Implémenter**

Dans `supabase/functions/sync-push/index.ts` :

a) Récupérer `profile_id` du body (ligne ~65) :

```ts
  const { operations, device_id, profile_id } = parsed.data;
```

b) Estampiller `profile_id` sur CHAQUE upsert. Modifs précises :

- `settings-upsert` (ligne ~79-85) : ajouter `profile_id,` dans l'objet et changer `onConflict` :
```ts
              {
                user_id: userId,
                profile_id,
                data: op.data,
                updated_by_device: device_id,
                updated_at: nowIso,
              },
              { onConflict: "user_id,profile_id" }
```

- `dictionary-upsert` (ligne ~94-100) : ajouter `profile_id,` et `onConflict: "user_id,profile_id,word"`.
- `dictionary-delete` (ligne ~110-116) : ajouter `profile_id,` et `onConflict: "user_id,profile_id,word"`.
- `snippet-upsert` (ligne ~123-132) : ajouter `profile_id,` (onConflict reste `"id"`).
- `note-upsert` (ligne ~150-161) : ajouter `profile_id,` (onConflict reste `"id"`).
- `folder-upsert` (ligne ~177-185) : ajouter `profile_id,` (onConflict reste `"id"`).

(Les `*-delete` par `.update().eq("id").eq("user_id")` n'ont pas besoin de `profile_id` : l'id est globalement unique. Laisser tels quels.)

c) Ajouter deux nouveaux `case` AVANT le `default:` (ligne ~199) :

```ts
        case "profile-upsert": {
          const { error } = await client.from("user_profiles").upsert(
            {
              id: op.profile.id,
              user_id: userId,
              name: op.profile.name,
              deleted_at: null,
              updated_at: nowIso,
            },
            { onConflict: "id" },
          );
          if (error) throw error;
          break;
        }
        case "profile-delete": {
          const { error } = await client
            .from("user_profiles")
            .update({ deleted_at: nowIso, updated_at: nowIso })
            .eq("id", op.id)
            .eq("user_id", userId);
          if (error) throw error;
          break;
        }
```

- [ ] **Step 4 : Lancer les tests Deno (succès attendu)**

Run : `deno test supabase/functions/sync-push/ --allow-all`
Expected : tous PASS (existants + nouveau).

- [ ] **Step 5 : Commit**

```bash
git add supabase/functions/sync-push/index.ts supabase/functions/sync-push/index.test.ts
git commit -m "feat(sync): stamp profile_id on upserts + handle profile ops in sync-push"
```

---

### Task B1 : TS types — `profile_id` + types/ops profil

**Files:**
- Modify: `src/lib/sync/types.ts`

**Interfaces:**
- Produces: `profile_id: string` sur `CloudUserSettingsRow`, `CloudDictionaryWordRow`, `CloudSnippetRow`, `CloudUserNoteRow`, `CloudUserFolderRow`. Nouveaux `ProfilePayload`, `CloudUserProfileRow`. `SyncOperation` gagne `profile-upsert` / `profile-delete`. Consommé par B2, B3, D1.

- [ ] **Step 1 : Implémenter (types pur — pas de test unitaire dédié, vérif via tsc)**

Dans `src/lib/sync/types.ts` :

a) Ajouter `profile_id: string;` à chacune des 5 interfaces Row :
- `CloudUserSettingsRow` (après `user_id`, ligne ~28)
- `CloudDictionaryWordRow` (après `user_id`, ligne ~36)
- `CloudSnippetRow` (après `user_id`, ligne ~45)
- `CloudUserNoteRow` (après `user_id`, ligne ~155)
- `CloudUserFolderRow` (après `user_id`, ligne ~167)

b) Ajouter après `FolderPayload` (ligne ~130) :

```ts
export interface ProfilePayload {
  id: string;
  name: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface CloudUserProfileRow {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}
```

c) Étendre l'union `SyncOperation` (ligne ~72-81), ajouter deux variantes :

```ts
  | { kind: "profile-upsert"; profile: ProfilePayload }
  | { kind: "profile-delete"; id: string };
```

(Insérer avant le `;` final de l'union, à la suite de `folder-delete`.)

- [ ] **Step 2 : Type-check**

Run : `pnpm exec tsc -p tsconfig.json --noEmit`
Expected : des erreurs attendues dans les fichiers consommateurs NON encore mis à jour (client.ts, mapping.ts, sync-push schema TS) — c'est normal, elles seront résolues par B2/B3. Vérifier qu'il n'y a **aucune** erreur DANS `types.ts` lui-même.

- [ ] **Step 3 : Commit**

```bash
git add src/lib/sync/types.ts
git commit -m "feat(sync): add profile_id to cloud row types + profile sync ops"
```

---

### Task B2 : TS schemas Zod — `profile_id` + `CloudUserProfileRowSchema`

**Files:**
- Modify: `src/lib/sync/schemas.ts`
- Test: `src/lib/sync/schemas.test.ts` (créer si absent)

**Interfaces:**
- Consumes: rien (Zod). 
- Produces: les 5 `Cloud*RowSchema` exigent `profile_id` uuid ; nouveau `CloudUserProfileRowSchema`. Consommé par B3 (validation pull).

- [ ] **Step 1 : Écrire le test**

Create (ou étendre) `src/lib/sync/schemas.test.ts` :

```ts
import { describe, it, expect } from "vitest";
import {
  CloudUserNoteRowSchema,
  CloudUserProfileRowSchema,
} from "./schemas";

describe("schemas profile_id", () => {
  it("rejects a note row without profile_id", () => {
    const r = CloudUserNoteRowSchema.safeParse({
      id: "10000000-0000-0000-0000-000000000001",
      user_id: "00000000-0000-0000-0000-0000000000a1",
      title: "t", content_html: "", folder_id: null,
      favorite: false, order: 0,
      created_at: "2026-06-25T00:00:00Z",
      updated_at: "2026-06-25T00:00:00Z",
      deleted_at: null,
    });
    expect(r.success).toBe(false);
  });

  it("accepts a valid user_profiles row", () => {
    const r = CloudUserProfileRowSchema.safeParse({
      id: "10000000-0000-0000-0000-000000000001",
      user_id: "00000000-0000-0000-0000-0000000000a1",
      name: "Perso",
      created_at: "2026-06-25T00:00:00Z",
      updated_at: "2026-06-25T00:00:00Z",
      deleted_at: null,
    });
    expect(r.success).toBe(true);
  });
});
```

- [ ] **Step 2 : Lancer le test (échec attendu)**

Run : `pnpm exec vitest run src/lib/sync/schemas.test.ts`
Expected : FAIL — note sans `profile_id` acceptée à tort ; `CloudUserProfileRowSchema` introuvable.

- [ ] **Step 3 : Implémenter**

Dans `src/lib/sync/schemas.ts`, ajouter `profile_id: z.string().uuid(),` (juste après `user_id`) à chacun des 5 schémas : `CloudUserSettingsRowSchema` (~L29), `CloudDictionaryWordRowSchema` (~L37), `CloudSnippetRowSchema` (~L45), `CloudUserNoteRowSchema` (~L58), `CloudUserFolderRowSchema` (~L70).

Ajouter après `CloudUserFolderRowSchema` (ligne ~77) :

```ts
export const CloudUserProfileRowSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  name: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  deleted_at: z.string().nullable(),
});
```

- [ ] **Step 4 : Lancer le test (succès attendu)**

Run : `pnpm exec vitest run src/lib/sync/schemas.test.ts`
Expected : PASS.

- [ ] **Step 5 : Commit**

```bash
git add src/lib/sync/schemas.ts src/lib/sync/schemas.test.ts
git commit -m "feat(sync): require profile_id in row schemas + add profile row schema"
```

---

### Task B3 : TS client — pull scopé + push avec `profile_id`

**Files:**
- Modify: `src/lib/sync/client.ts` (`pullAll`, `pushOperations`, `pushSettings`, `PullResult`)
- Test: `src/lib/sync/client.test.ts` (étendre)

**Interfaces:**
- Consumes: types B1, schemas B2.
- Produces: `pullAll(since: string | null, profileId: string): Promise<PullResult>` (filtre `.eq("profile_id", profileId)` sur les 5 requêtes) ; `pushOperations(operations, deviceId, profileId)` (envoie `profile_id` dans le body) ; `pushSettings(data, deviceId, profileId)`. `PullResult` gagne `profiles: CloudUserProfileRow[]`. Consommé par D1.

- [ ] **Step 1 : Écrire le test**

Dans `src/lib/sync/client.test.ts`, ajouter un test vérifiant que `pushOperations` envoie `profile_id` dans le body (réutiliser le mock `supabase.functions.invoke` existant ; si absent, copier la forme des tests présents) :

```ts
it("pushOperations sends profile_id in the body", async () => {
  const invokeSpy = vi.fn(async () => ({ data: { ok: true, results: [] }, error: null }));
  // @ts-expect-error — accès mock
  supabase.functions.invoke = invokeSpy;
  await pushOperations(
    [{ kind: "dictionary-upsert", word: "hi" }],
    "dev1",
    "10000000-0000-0000-0000-000000000001"
  );
  expect(invokeSpy).toHaveBeenCalledWith("sync-push", {
    body: {
      operations: [{ kind: "dictionary-upsert", word: "hi" }],
      device_id: "dev1",
      profile_id: "10000000-0000-0000-0000-000000000001",
    },
  });
});
```

- [ ] **Step 2 : Lancer le test (échec attendu)**

Run : `pnpm exec vitest run src/lib/sync/client.test.ts`
Expected : FAIL — `pushOperations` n'accepte pas / n'envoie pas `profile_id`.

- [ ] **Step 3 : Implémenter**

Dans `src/lib/sync/client.ts` :

a) `PullResult` (ligne ~20) : ajouter `profiles: CloudUserProfileRow[];` et `profiles: number;` dans `invalid`. Importer `CloudUserProfileRow` + `CloudUserProfileRowSchema`.

b) `pullAll` (ligne ~36) : nouvelle signature + filtres. Remplacer l'entête et les requêtes :

```ts
export async function pullAll(
  since: string | null,
  profileId: string
): Promise<PullResult> {
  const userRes = await supabase.auth.getUser();
  if (userRes.error || !userRes.data.user) {
    throw new Error("not authenticated");
  }

  const settingsQuery = supabase
    .from("user_settings")
    .select("*")
    .eq("profile_id", profileId)
    .maybeSingle();
  const dictQuery = since
    ? supabase.from("user_dictionary_words").select("*").eq("profile_id", profileId).gt("updated_at", since)
    : supabase.from("user_dictionary_words").select("*").eq("profile_id", profileId);
  const snipQuery = since
    ? supabase.from("user_snippets").select("*").eq("profile_id", profileId).gt("updated_at", since)
    : supabase.from("user_snippets").select("*").eq("profile_id", profileId);
  const notesQuery = since
    ? supabase.from("user_notes").select("*").eq("profile_id", profileId).gt("updated_at", since)
    : supabase.from("user_notes").select("*").eq("profile_id", profileId);
  const foldersQuery = since
    ? supabase.from("user_folders").select("*").eq("profile_id", profileId).gt("updated_at", since)
    : supabase.from("user_folders").select("*").eq("profile_id", profileId);
```

(Le reste de `pullAll` — validation Zod, assemblage — reste identique. Garder le `profiles: []` ajouté au `return` : le pull du registre des profils est hors scope de Plan A, on retourne un tableau vide ici pour satisfaire le type ; Plan B le remplira. Ajouter `profiles: [],` au return et `profiles: 0,` dans `invalid`.)

c) `pushOperations` (ligne ~179) : ajouter le param `profileId` et l'inclure dans le body :

```ts
export async function pushOperations(
  operations: SyncOperation[],
  deviceId: string,
  profileId: string
): Promise<PushResponse> {
  const { data, error } = await supabase.functions.invoke("sync-push", {
    body: { operations, device_id: deviceId, profile_id: profileId },
  });
```

d) `pushSettings` (ligne ~239) : propager le param :

```ts
export async function pushSettings(data: CloudSettingsData, deviceId: string, profileId: string) {
  return pushOperations([{ kind: "settings-upsert", data }], deviceId, profileId);
}
```

- [ ] **Step 4 : Lancer les tests (succès attendu)**

Run : `pnpm exec vitest run src/lib/sync/client.test.ts`
Expected : PASS (existants adaptés + nouveau). Si des tests existants appelaient `pullAll(x)` / `pushOperations(ops, dev)`, les mettre à jour pour passer un `profileId` factice.

- [ ] **Step 5 : Commit**

```bash
git add src/lib/sync/client.ts src/lib/sync/client.test.ts
git commit -m "feat(sync): scope pull by profile_id and send it on push"
```

---

### Task C1 : Rust — paths snippets/dico per-profil + migration locale

**Files:**
- Modify: `src-tauri/src/profiles.rs` (2 path fns + migration `migrate_global_snippets_dict_to_default`)
- Modify: `src-tauri/src/commands/profiles.rs` (2 commandes)
- Modify: `src-tauri/src/lib.rs` (enregistrer 2 commandes + appeler la migration au setup)
- Test: `src-tauri/src/profiles.rs` (`#[cfg(test)]`)

**Interfaces:**
- Produces: `pub fn snippets_store_path(app) -> String` / `dictionary_store_path(app) -> String` (→ `profiles/<id>/sync-snippets.json` resp. `sync-dictionary.json`) ; commandes `get_active_profile_snippets_path` / `get_active_profile_dictionary_path` ; migration one-shot des stores racine vers `profiles/default/`. Consommé par C2.

- [ ] **Step 1 : Écrire le test**

Dans `src-tauri/src/profiles.rs`, étendre `#[cfg(test)] mod tests` :

```rust
    #[test]
    fn profile_store_path_handles_snippets_and_dictionary() {
        assert_eq!(
            profile_store_path("perso", "sync-snippets.json"),
            "profiles/perso/sync-snippets.json"
        );
        assert_eq!(
            profile_store_path("perso", "sync-dictionary.json"),
            "profiles/perso/sync-dictionary.json"
        );
    }

    #[test]
    fn migrate_moves_root_snippets_dict_into_default() {
        use std::fs;
        let dir = std::env::temp_dir().join(format!(
            "lexena_snipmig_test_{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(dir.join("profiles").join("default")).unwrap();
        fs::write(dir.join("sync-snippets.json"), "{\"snippets\":[]}").unwrap();
        fs::write(dir.join("sync-dictionary.json"), "{\"words\":[]}").unwrap();

        super::migrate_global_snippets_dict_to_default_in(&dir).unwrap();

        assert!(!dir.join("sync-snippets.json").exists(), "root snippets moved");
        assert!(dir.join("profiles/default/sync-snippets.json").exists(), "snippets in default");
        assert!(!dir.join("sync-dictionary.json").exists(), "root dict moved");
        assert!(dir.join("profiles/default/sync-dictionary.json").exists(), "dict in default");

        // Idempotent
        super::migrate_global_snippets_dict_to_default_in(&dir).unwrap();
        let _ = fs::remove_dir_all(&dir);
    }
```

- [ ] **Step 2 : Lancer le test (échec attendu)**

Run :
```
export PATH="$PATH:/c/Program Files/CMake/bin"; LIBCLANG_PATH="C:/Program Files/LLVM/bin" cargo test -p lexena_lib migrate_moves_root_snippets
```
Expected : FAIL — `migrate_global_snippets_dict_to_default_in` introuvable.

- [ ] **Step 3 : Implémenter**

Dans `src-tauri/src/profiles.rs`, après `notes_sidebar_store_path` (ligne ~88), ajouter :

```rust
/// Return the snippets store path for the active profile (relative to app_data_dir)
pub fn snippets_store_path(app: &AppHandle) -> String {
    profile_store_path(&get_active_id(app), "sync-snippets.json")
}

/// Return the dictionary store path for the active profile (relative to app_data_dir)
pub fn dictionary_store_path(app: &AppHandle) -> String {
    profile_store_path(&get_active_id(app), "sync-dictionary.json")
}
```

Après `cleanup_legacy_root_sync_stores` (ligne ~240), ajouter la migration :

```rust
/// Move the legacy GLOBAL snippets/dictionary stores from app_data root into
/// profiles/default/. Multi-profil sync makes these per-profile (spec 2026-06-25).
/// Idempotent: no-op if root files are absent. Preserves local content.
pub fn migrate_global_snippets_dict_to_default_in(
    app_data: &std::path::Path,
) -> std::io::Result<()> {
    let default_dir = app_data.join("profiles").join("default");
    for name in ["sync-snippets.json", "sync-dictionary.json"] {
        let src = app_data.join(name);
        if src.exists() {
            fs::create_dir_all(&default_dir)?;
            let dst = default_dir.join(name);
            if !dst.exists() {
                match fs::rename(&src, &dst) {
                    Ok(_) => tracing::info!("Moved global {} -> profiles/default/", name),
                    Err(e) => tracing::warn!("Could not move {} ({}), skipping", name, e),
                }
            }
        }
    }
    Ok(())
}

pub fn migrate_global_snippets_dict_to_default(app: &AppHandle) -> Result<()> {
    let app_data = app
        .path()
        .app_data_dir()
        .context("Could not resolve app data directory")?;
    migrate_global_snippets_dict_to_default_in(&app_data)?;
    Ok(())
}
```

Dans `src-tauri/src/commands/profiles.rs`, après `get_active_profile_sync_queue_path` (ligne ~50), ajouter :

```rust
/// Get the snippets store path for the active profile (for frontend Store.load)
#[tauri::command]
pub fn get_active_profile_snippets_path(app: AppHandle) -> Result<String, String> {
    Ok(crate::profiles::snippets_store_path(&app))
}

/// Get the dictionary store path for the active profile (for frontend Store.load)
#[tauri::command]
pub fn get_active_profile_dictionary_path(app: AppHandle) -> Result<String, String> {
    Ok(crate::profiles::dictionary_store_path(&app))
}
```

Dans `src-tauri/src/lib.rs` :
- Dans `tauri::generate_handler!`, après `commands::profiles::get_active_profile_sync_queue_path,`, ajouter :
```rust
            commands::profiles::get_active_profile_snippets_path,
            commands::profiles::get_active_profile_dictionary_path,
```
- Dans `setup`, juste après l'appel `cleanup_legacy_root_sync_stores` (ligne ~206-208), ajouter :
```rust
            if let Err(e) = profiles::migrate_global_snippets_dict_to_default(app.handle()) {
                tracing::warn!("Global snippets/dict migration failed: {}", e);
            }
```

- [ ] **Step 4 : Lancer le test + cargo check (succès attendu)**

Run :
```
export PATH="$PATH:/c/Program Files/CMake/bin"; LIBCLANG_PATH="C:/Program Files/LLVM/bin" cargo test -p lexena_lib migrate_moves_root_snippets profile_store_path_handles && LIBCLANG_PATH="C:/Program Files/LLVM/bin" cargo check
```
Expected : tests PASS, `cargo check` clean.

- [ ] **Step 5 : Commit**

```bash
git add src-tauri/src/profiles.rs src-tauri/src/commands/profiles.rs src-tauri/src/lib.rs
git commit -m "feat(sync): per-profile snippets/dictionary store paths + local migration"
```

---

### Task C2 : TS stores snippets/dico — charger le path per-profil

**Files:**
- Modify: `src/lib/sync/snippets-store.ts` (imports + `getStore`)
- Modify: `src/lib/sync/dictionary-store.ts` (imports + `getStore`)
- Test: `src/lib/sync/snippets-store.test.ts`, `src/lib/sync/dictionary-store.test.ts`

**Interfaces:**
- Consumes: commandes Rust `get_active_profile_snippets_path` / `get_active_profile_dictionary_path` (C1).
- Produces: API publique inchangée (`loadSnippets`, `upsertSnippet`, … `__resetForTests`) ; `getStore()` résout le path via `invoke`.

- [ ] **Step 1 : Écrire le test (snippets)**

Dans `src/lib/sync/snippets-store.test.ts`, adapter le mock pour intercepter `invoke` (copier la forme du mock de `queue.test.ts`) et ajouter :

```ts
const invokeMock = vi.fn(async (cmd: string) => {
  if (cmd === "get_active_profile_snippets_path") return "profiles/default/sync-snippets.json";
  throw new Error(`unexpected invoke ${cmd}`);
});
vi.mock("@tauri-apps/api/core", () => ({ invoke: (cmd: string) => invokeMock(cmd) }));

it("loads the per-profile snippets store path", async () => {
  await loadSnippets();
  expect(invokeMock).toHaveBeenCalledWith("get_active_profile_snippets_path");
});
```

(S'assurer que le mock `Store.load` enregistre le path comme dans `queue.test.ts`.)

- [ ] **Step 2 : Lancer le test (échec attendu)**

Run : `pnpm exec vitest run src/lib/sync/snippets-store.test.ts`
Expected : FAIL — `getStore` charge le nom en dur `sync-snippets.json`, `invoke` jamais appelé.

- [ ] **Step 3 : Implémenter**

Dans `src/lib/sync/snippets-store.ts`, remplacer l'entête (lignes 1-17) :

```ts
import { Store } from "@tauri-apps/plugin-store";
import { invoke } from "@tauri-apps/api/core";
import type { LocalSnippet } from "./types";
import { createMutex } from "./_mutex";

const KEY_SNIPPETS = "snippets";
const KEY_MIGRATED = "legacy_migrated";

let storePromise: Promise<Awaited<ReturnType<typeof Store.load>>> | null = null;
const withLock = createMutex();

function getStore() {
  if (!storePromise) {
    storePromise = (async () => {
      const path = await invoke<string>("get_active_profile_snippets_path");
      return Store.load(path);
    })();
  }
  return storePromise;
}
```

(Supprimer la ligne `const STORE_FILE = "sync-snippets.json";`. `__resetForTests` reste inchangé.)

- [ ] **Step 4 : Idem dictionary-store**

Dans `src/lib/sync/dictionary-store.ts`, appliquer la même transformation : importer `invoke`, supprimer `const STORE_FILE = "sync-dictionary.json";`, et faire `getStore` résoudre `get_active_profile_dictionary_path`. Écrire le test miroir dans `dictionary-store.test.ts` (assert `invoke` appelé avec `"get_active_profile_dictionary_path"`).

Run : `pnpm exec vitest run src/lib/sync/snippets-store.test.ts src/lib/sync/dictionary-store.test.ts`
Expected : PASS.

- [ ] **Step 5 : Commit**

```bash
git add src/lib/sync/snippets-store.ts src/lib/sync/snippets-store.test.ts src/lib/sync/dictionary-store.ts src/lib/sync/dictionary-store.test.ts
git commit -m "feat(sync): load snippets/dictionary from per-profile store paths"
```

---

### Task D1 : SyncContext — lifecycle `cloud_profile_id` + threading

**Files:**
- Modify: `src/contexts/SyncContext.tsx` (helper `ensureCloudProfileId`, `enableSync`, `pullAndApply`, `flushQueue`)
- Test: `src/contexts/SyncContext.test.tsx` si présent, sinon test ciblé sur un helper extrait (voir Step 1)

**Interfaces:**
- Consumes: `pullAll(since, profileId)` + `pushOperations(ops, deviceId, profileId)` (B3) ; commandes profils `get_active_profile` + `list_profiles` (existantes).
- Produces: chaque profil obtient/réutilise un `cloud_profile_id` (clé sync-meta `cloud_profile_id`) ; un `profile-upsert` est poussé en TÊTE du push initial ; pull et push sont scopés.

- [ ] **Step 1 : Extraire + tester `ensureCloudProfileId`**

Créer un module testable `src/lib/sync/cloud-profile.ts` :

```ts
import { invoke } from "@tauri-apps/api/core";
import type { ProfileMeta } from "@/hooks/useProfiles";

/**
 * Resolve (and lazily create) the stable cloud profile id for the ACTIVE local
 * profile. Generated once per profile, stored in its per-profile sync-meta.
 * Returns { id, name } so callers can push a profile-upsert op.
 */
export async function ensureCloudProfileId(
  getMeta: <T>(k: string, d: T) => Promise<T>,
  setMeta: (k: string, v: unknown) => Promise<void>,
): Promise<{ id: string; name: string }> {
  let id = await getMeta<string | null>("cloud_profile_id", null);
  if (!id) {
    id = crypto.randomUUID();
    await setMeta("cloud_profile_id", id);
  }
  const activeId = await invoke<string>("get_active_profile");
  const profiles = await invoke<ProfileMeta[]>("list_profiles");
  const name = profiles.find((p) => p.id === activeId)?.name ?? "Profil";
  return { id, name };
}
```

Create `src/lib/sync/cloud-profile.test.ts` :

```ts
import { describe, it, expect, vi } from "vitest";

const invokeMock = vi.fn(async (cmd: string) => {
  if (cmd === "get_active_profile") return "default";
  if (cmd === "list_profiles") return [{ id: "default", name: "Perso", created_at: "" }];
  throw new Error(`unexpected ${cmd}`);
});
vi.mock("@tauri-apps/api/core", () => ({ invoke: (c: string) => invokeMock(c) }));

import { ensureCloudProfileId } from "./cloud-profile";

describe("ensureCloudProfileId", () => {
  it("generates and persists an id when absent, returns the active name", async () => {
    const store: Record<string, unknown> = {};
    const getMeta = async <T,>(k: string, d: T) => (store[k] as T) ?? d;
    const setMeta = async (k: string, v: unknown) => { store[k] = v; };

    const first = await ensureCloudProfileId(getMeta, setMeta);
    expect(first.id).toMatch(/[0-9a-f-]{36}/);
    expect(first.name).toBe("Perso");

    const second = await ensureCloudProfileId(getMeta, setMeta);
    expect(second.id).toBe(first.id); // stable, reused
  });
});
```

- [ ] **Step 2 : Lancer le test (échec attendu)**

Run : `pnpm exec vitest run src/lib/sync/cloud-profile.test.ts`
Expected : FAIL — module introuvable.

- [ ] **Step 3 : Créer le module + le faire passer**

Créer `src/lib/sync/cloud-profile.ts` avec le code du Step 1.
(Si le type `ProfileMeta` n'est pas exporté depuis `@/hooks/useProfiles`, utiliser le type réel exporté — vérifier l'import exact ; sinon déclarer `type ProfileMeta = { id: string; name: string }` localement.)

Run : `pnpm exec vitest run src/lib/sync/cloud-profile.test.ts`
Expected : PASS.

- [ ] **Step 4 : Câbler dans SyncContext**

Dans `src/contexts/SyncContext.tsx` :

a) Importer le helper :
```ts
import { ensureCloudProfileId } from "@/lib/sync/cloud-profile";
```

b) Ajouter une clé meta constante près de `KEY_ENABLED` (ligne ~57) :
```ts
const KEY_CLOUD_PROFILE_ID = "cloud_profile_id";
```

c) `pullAndApply` (ligne ~228) : résoudre le profileId et le passer à `pullAll`. Juste avant `const result = await pullAll(since);` (ligne ~239), insérer :
```ts
      const cloudProfileId = await getMeta<string | null>(KEY_CLOUD_PROFILE_ID, null);
      if (!cloudProfileId) {
        // Aucune partition cloud encore associée à ce profil : rien à tirer.
        setStatus("idle");
        return;
      }
```
et remplacer `const result = await pullAll(since);` par `const result = await pullAll(since, cloudProfileId);`.

d) `flushQueue` (ligne ~163) : résoudre le profileId une fois en tête de la fonction (après `const deviceId = await getDeviceId();`, ligne ~154) :
```ts
      const { id: cloudProfileId } = await ensureCloudProfileId(getMeta, setMeta);
```
et remplacer `const resp = await pushOperations(ops, deviceId);` par `const resp = await pushOperations(ops, deviceId, cloudProfileId);`.

e) `enableSync` (ligne ~373) : juste après `setStatus("idle");` (ligne ~377) et AVANT la legacy migration, garantir l'id cloud :
```ts
    const { id: cloudProfileId, name: cloudProfileName } = await ensureCloudProfileId(
      getMeta,
      setMeta
    );
```
Puis dans le push initial (ligne ~398, `const ops: SyncOperation[] = [];`), pousser le `profile-upsert` en PREMIER, AVANT le `settings-upsert` :
```ts
      const ops: SyncOperation[] = [];
      ops.push({
        kind: "profile-upsert",
        profile: {
          id: cloudProfileId,
          name: cloudProfileName,
          updated_at: new Date().toISOString(),
          deleted_at: null,
        },
      });
      ops.push({
        kind: "settings-upsert",
        data: extractCloudSettings(settingsRef.current),
      });
```
(Le reste du push initial — dictionary/snippets/folders/notes — inchangé. `pushOperations` plus bas dans `enableSync` doit aussi recevoir `cloudProfileId` : repérer l'appel `pushOperations(ops, deviceId)` du push initial et ajouter `, cloudProfileId`.)

f) Si `pushSettings` est appelé ailleurs dans le fichier (rechercher `pushSettings(`), ajouter le 3ᵉ argument `cloudProfileId` en le résolvant via `ensureCloudProfileId` au point d'appel.

- [ ] **Step 5 : Type-check + suite complète**

Run : `pnpm exec tsc -p tsconfig.json --noEmit && pnpm exec vitest run`
Expected : tsc clean, toute la suite verte (corriger les appels `pullAll`/`pushOperations`/`pushSettings` restants signalés par tsc).

- [ ] **Step 6 : Commit**

```bash
git add src/lib/sync/cloud-profile.ts src/lib/sync/cloud-profile.test.ts src/contexts/SyncContext.tsx
git commit -m "feat(sync): cloud_profile_id lifecycle + scope pull/push per profile"
```

---

### Task E1 : Vérification complète + test manuel d'isolation (1 appareil)

**Files:** aucun (vérification).

- [ ] **Step 1 : Suite Rust**

Run :
```
export PATH="$PATH:/c/Program Files/CMake/bin"; LIBCLANG_PATH="C:/Program Files/LLVM/bin" cargo test -p lexena_lib && LIBCLANG_PATH="C:/Program Files/LLVM/bin" cargo check
```
Expected : tous PASS, `cargo check` clean.

- [ ] **Step 2 : Frontend type-check + Vitest**

Run : `pnpm exec tsc -p tsconfig.json --noEmit && pnpm exec vitest run`
Expected : clean + tout vert.

- [ ] **Step 3 : Edge Deno + pgtap**

Run :
```
deno test supabase/functions/sync-push/ --allow-all
pnpm exec supabase db reset
pnpm exec supabase test db
```
Expected : Deno PASS, pgtap PASS (incl. `rls_user_profiles`, `profile_id_columns`).

- [ ] **Step 4 : Déploiement Edge + build (demander à l'utilisateur)**

Demander à l'utilisateur de :
1. Déployer l'Edge : `pnpm exec supabase functions deploy sync-push`.
2. Pousser la migration distante : `pnpm exec supabase db push`.
3. Lancer un build dev (`pnpm tauri dev`), puis **réactiver la sync** dans le profil actif (la coupe nette + le nouveau `cloud_profile_id` repartent de zéro).

- [ ] **Step 5 : Test manuel d'isolation mono-appareil**

  1. Profil **Perso** actif, connecté → réactiver la sync. Vérifier dans Supabase Studio : une ligne `user_profiles` (name=Perso) + les notes/folders avec son `profile_id`.
  2. Créer une note "NotePerso". Vérifier `select count(*) from user_notes where title = 'NotePerso'` = 1, avec le `profile_id` de Perso.
  3. Switch vers **Travail** (l'app reload) → réactiver la sync. Vérifier une 2ᵉ ligne `user_profiles` (name=Travail) avec un `profile_id` distinct.
  4. Créer "NoteTravail". Vérifier que `NoteTravail.profile_id` ≠ `NotePerso.profile_id`.
  5. Re-switch vers Perso : vérifier que "NoteTravail" **n'apparaît pas** dans Perso (pull scopé). `select title, profile_id from user_notes order by profile_id` montre 2 partitions disjointes.

- [ ] **Step 6 : Documenter dans CLAUDE.md**

Ajouter à la section "V3 Sync notes" une ligne documentant le partitionnement par profil (table `user_profiles`, colonne `profile_id` sur les 5 tables, `cloud_profile_id` en sync-meta, stores snippets/dico per-profil, coupe nette). Référencer ce plan + le spec. Commit :

```bash
git add CLAUDE.md docs/superpowers/plans/2026-06-25-sync-multi-profile-plan-a-foundation.md
git commit -m "docs(sync): document multi-profile cloud partitioning (Plan A)"
```

---

## Self-Review

- **Spec coverage (Plan A scope) :** §3.1 identité → A1 (table) + D1 (`cloud_profile_id`) ; §3.2 schéma → A2 ; §3.3 stores per-profil → C1+C2 ; §3.4 moteur pull/push → A3+A4 (edge) + B1/B2/B3 (client) + D1 (threading + `profile-upsert` en tête) ; §5 migration coupe nette → A2 (cloud) + C1 (local). **Hors Plan A (→ Plan B)** : onboarding hybride nouvel appareil, suppression propagée (`profile-delete` côté UI), `account-export` v3, purge, refonte `AccountSection`, pull du registre `user_profiles` (PullResult.profiles laissé vide en A).
- **Placeholder scan :** chaque step de code contient du code concret. Les seules notes "copier la forme du harness existant" (tests Deno A4, mocks Vitest C2) sont des garde-fous contre l'invention d'API de mock, pas des placeholders de logique.
- **Type consistency :** `pullAll(since, profileId)` et `pushOperations(ops, deviceId, profileId)` définis en B3, consommés en D1. `ProfilePayload` / `CloudUserProfileRow` définis en B1, schéma en B2, op `profile-upsert` produite en D1 et traitée en A4. `ensureCloudProfileId(getMeta, setMeta)` défini en D1 Step 1, consommé en D1 Steps 4. Clé meta `cloud_profile_id` cohérente entre D1 (`KEY_CLOUD_PROFILE_ID`) et le helper.
- **FK ordering :** `profile-upsert` poussé en tête (D1 e) garantit `user_profiles` peuplée avant les ops référençant `profile_id` ; `folder-upsert` reste avant `note-upsert` (ordre existant préservé).
- **Risque connu :** `PullResult.profiles` est introduit (type) mais non rempli en A (`profiles: []`). Documenté comme charnière vers Plan B — pas un placeholder de logique, le pull du registre est une fonctionnalité distincte (onboarding) hors scope A.
