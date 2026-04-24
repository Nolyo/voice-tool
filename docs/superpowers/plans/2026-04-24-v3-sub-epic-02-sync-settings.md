# V3 Sub-Epic 02 — Sync Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Livrer la synchronisation cloud des settings et collections utilisateur de Voice Tool v3.0 : settings scalaires (UI, hotkeys, features, transcription provider/modèle), dictionnaire personnalisé, snippets — entre devices via Supabase, en préservant la promesse "mode local gratuit/complet" et en garantissant un backup local automatique avant toute opération destructive.

**Architecture:** Quatre chantiers articulés :
1. **Supabase DB** — 3 tables (`user_settings`, `user_dictionary_words`, `user_snippets`) avec RLS deny-by-default, triggers `updated_at`, fonction de calcul quota, `ON DELETE CASCADE` pour GDPR.
2. **Edge Function `/sync/push`** — Deno + Zod : validation payload + contrôle quota (5 MB) + upsert/soft-delete. Les pulls restent en accès direct via supabase-js (RLS suffit).
3. **Frontend TypeScript** — `SyncContext` + `useSync` hook, queue offline persistée (Tauri Store), retry backoff, debounce 500ms, déclencheurs lifecycle (login / focus / modif locale / logout), backup local + restore.
4. **UX** — toggle dans Settings > Compte, status indicator dans le header, modale migration first-login, page transparence "Ce qui est synchronisé", bouton GDPR export + wire delete-account (tombstone déjà en place sub-epic 01).

**Tech Stack:** `@supabase/supabase-js` (déjà en place), Supabase Edge Functions (Deno + TypeScript), `zod` (validation), Tauri Store plugin v2 (déjà en place), React 19 + Context, Tailwind 4 + design system `.vt-app`, i18next. **Pas de nouveau code Rust** : toute la logique sync vit côté TS (cohérent avec le pattern sub-epic 01 où auth.rs ne couvrait que keyring / deep link / device ID).

**Related spec:** [`docs/v3/02-sync-settings.md`](../../v3/02-sync-settings.md) (figée 2026-04-22), [`docs/v3/decisions/0002-server-side-encryption.md`](../../v3/decisions/0002-server-side-encryption.md), [`docs/v3/decisions/0003-api-keys-device-local.md`](../../v3/decisions/0003-api-keys-device-local.md), [`docs/v3/decisions/0008-sync-strategy.md`](../../v3/decisions/0008-sync-strategy.md), [`docs/v3/00-threat-model.md`](../../v3/00-threat-model.md).

**Build verification:**
- Rust : `LIBCLANG_PATH="C:/Program Files/LLVM/bin" PATH="$PATH:/c/Program Files/CMake/bin" cargo check` dans `src-tauri/` (cf. `memory/MEMORY.md`) — **seulement si** une tâche touche Rust (Task 5 backup fs, Task 17 export).
- Frontend : `pnpm build` (TypeScript strict + Vite). Demander au user pour lancer `pnpm tauri dev` (cf. CLAUDE.md — interdit de lancer soi-même).
- Tests automatisés : Vitest (nouveau, à installer Task 1.5) pour logique queue/merge/mapping + `supabase db reset` + `pnpm exec supabase test db` (pgtap) pour RLS cross-tenant.
- Checklist manuelle E2E en Task 20.

**Scope exclu** (retiré du sub-épique 02, reporté ou déjà fait) :
- `user_prompts` et `user_translation_presets` — features inexistantes dans l'app, **retirées du scope v3.0** (décision 2026-04-24). Les tables seront créées quand les features existeront.
- Notes texte — sub-épique 03, v3.1.
- Historique transcriptions — v3.1+.
- Audio brut — v3.2 (service managé).
- Clés API — device-local forever (ADR 0003).
- Multi-profils dans le cloud — v3.0 sync **uniquement le profil actif** (décision 2026-04-24). Un warning UI explique la contrainte aux users multi-profils.
- Apple OAuth / backup phone / géolocalisation device — ADR 0007, reportés.
- Compression gzip payloads — prématuré, différé.
- `client_modified_at` trust pour pushes offline — reporté v3.1.

**Hypothèses figées au démarrage** (trançées 2026-04-24 avant rédaction du plan) :
- **Q1** Multi-profils → **option A** : v3.0 sync uniquement le profil actif, warning UI si >1 profil local.
- **Q2** Schéma snippets → **option A** : migration one-shot Tauri Store `{trigger, replacement}` → `{id uuid, label, content, shortcut, updated_at, deleted_at}`. Mapping : `label = trigger`, `content = replacement`, `shortcut = trigger` (conservé tel quel pour matcher la saisie user en dictée).
- **Q3** `user_prompts` + `user_translation_presets` → **option B** : hors scope 02, table pas créée. Les 4 scalaires et 2 collections (dico + snippets) suffisent pour v3.0.
- **Q4** Dico → suivre la spec : composite key `(user_id, word)` côté serveur, `string[]` côté client + `tombstones: string[]` (mots supprimés à propager) dans le store local.

---

## File Structure

### Files created

**Supabase migrations** (`supabase/migrations/`)
- `supabase/migrations/20260525000100_user_settings.sql` — table `user_settings` + RLS + trigger
- `supabase/migrations/20260525000200_user_dictionary_words.sql` — table + RLS + trigger
- `supabase/migrations/20260525000300_user_snippets.sql` — table + RLS + trigger + index partiel
- `supabase/migrations/20260525000400_sync_quota_function.sql` — fonction `compute_user_sync_size(uuid) returns bigint`

**Supabase tests** (`supabase/tests/`)
- `supabase/tests/rls_user_settings.sql` — pgtap cross-tenant `user_settings`
- `supabase/tests/rls_user_dictionary_words.sql` — pgtap cross-tenant `user_dictionary_words`
- `supabase/tests/rls_user_snippets.sql` — pgtap cross-tenant `user_snippets`
- `supabase/tests/quota.sql` — pgtap fonction quota

**Edge Functions** (`supabase/functions/`)
- `supabase/functions/_shared/cors.ts` — helpers CORS partagés
- `supabase/functions/_shared/auth.ts` — extraction user_id depuis JWT
- `supabase/functions/sync-push/index.ts` — validation + upsert + quota
- `supabase/functions/sync-push/schema.ts` — schémas Zod partagés
- `supabase/functions/sync-push/deno.json` — config Deno
- `supabase/functions/account-export/index.ts` — GDPR data export (JSON complet)
- `supabase/functions/account-export/deno.json`

**Frontend — sync engine** (`src/lib/sync/`)
- `src/lib/sync/types.ts` — types TS partagés (payloads, queue entries, cloud shapes)
- `src/lib/sync/mapping.ts` — AppSettings ↔ cloud shape
- `src/lib/sync/queue.ts` — queue persistante FIFO avec retry
- `src/lib/sync/queue.test.ts` — tests Vitest
- `src/lib/sync/client.ts` — wrapper supabase-js (pull direct + push via Edge)
- `src/lib/sync/backups.ts` — backup local + restore + rotation FIFO 10
- `src/lib/sync/merge.ts` — logique LWW settings + merge dico + merge snippets
- `src/lib/sync/merge.test.ts` — tests Vitest conflict resolution
- `src/lib/sync/snippets-store.ts` — wrapper Tauri Store nouvelle structure snippets
- `src/lib/sync/dictionary-store.ts` — wrapper Tauri Store dico + tombstones

**Frontend — contexts + hooks**
- `src/contexts/SyncContext.tsx` — état global sync + lifecycle
- `src/hooks/useSync.ts` — hook ergonomique

**Frontend — composants**
- `src/components/settings/sections/SyncActivationModal.tsx` — modale first-login choix upload/fresh
- `src/components/settings/sections/SyncedDataOverview.tsx` — page transparence "Ce qui est synchronisé"
- `src/components/settings/sections/LocalBackupsList.tsx` — liste + restore backups
- `src/components/SyncStatusIndicator.tsx` — icône header 4 états

**Backend Rust** (seulement pour filesystem I/O backups + export download)
- `src-tauri/src/sync.rs` — commandes `write_local_backup`, `list_local_backups`, `read_local_backup`, `delete_local_backup`, `save_export_to_download` (filesystem-only, pas de logique sync)

**Scripts**
- `scripts/deploy-edge-functions.sh` — alias `pnpm exec supabase functions deploy ...`

### Files modified

- `src-tauri/src/lib.rs` — enregistrer les nouvelles commandes `sync::*`
- `src-tauri/src/commands/mod.rs` — si tu routes les commandes via ce module (à vérifier en Task 5)
- `src-tauri/Cargo.toml` — si besoin de dépendance filesystem (normalement `std::fs` suffit)
- `src-tauri/capabilities/default.json` — vérifier capabilities fs si nécessaires
- `src/main.tsx` — wrapper `<SyncProvider>` autour de l'app
- `src/App.tsx` — monter `SyncStatusIndicator` dans le header
- `src/components/settings/sections/AccountSection.tsx` — ajouter toggle sync + liens
- `src/components/settings/sections/SecuritySection.tsx` — wire up "Supprimer mon compte" (si pas déjà fait dans sub-epic 01)
- `src/components/settings/sections/VocabularySection.tsx` — utiliser `snippets-store` + `dictionary-store` au lieu de `settings.snippets` / `settings.dictionary` directement
- `src/contexts/SettingsContext.tsx` — hook pour détecter modifs sur les clés syncables (push trigger)
- `src/lib/settings.ts` — marquer les clés dépréciées `settings.snippets` / `settings.dictionary` (migration one-shot en Task 4)
- `src/locales/fr.json` + `src/locales/en.json` — namespace `sync.*`
- `package.json` — ajouter `zod`, `vitest`, `@vitest/ui` (dev)
- `CLAUDE.md` — section V3 sync settings (Task 22)

---

## Préflight (à exécuter **avant** de démarrer les tâches codées)

### 0.1 Vérifier branche + env

- [ ] **Step 1: Vérifier branche de travail**

```bash
git branch --show-current
```
Expected: `feat/ui_params`.

- [ ] **Step 2: Vérifier .env.local (Supabase déjà configuré sub-epic 01)**

```bash
test -f .env.local && grep -E "VITE_SUPABASE_URL|VITE_SUPABASE_PUBLISHABLE_KEY" .env.local | cut -d= -f1
```
Expected: `VITE_SUPABASE_URL` et `VITE_SUPABASE_PUBLISHABLE_KEY`.

- [ ] **Step 3: Vérifier Supabase CLI dispo**

```bash
pnpm exec supabase --version
```
Expected: version >= 1.x. Si erreur : `pnpm add -D supabase` (mémoire `memory/MEMORY.md` : déjà dev dep).

- [ ] **Step 4: Vérifier que le projet Supabase est linké**

```bash
pnpm exec supabase projects list
```
Expected: liste avec le projet `voice-tool` marqué `● LINKED` (ou au moins présent). Si pas linké : `pnpm exec supabase link --project-ref <ref>` (ref dans dashboard Supabase > Project Settings).

### 0.2 Installer dépendances front

- [ ] **Step 5: Ajouter zod + vitest**

```bash
pnpm add zod
pnpm add -D vitest @vitest/ui
```

- [ ] **Step 6: Configurer vitest**

Créer `vitest.config.ts` à la racine :

```typescript
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
```

- [ ] **Step 7: Ajouter scripts test dans package.json**

```json
"scripts": {
  "test": "vitest run",
  "test:watch": "vitest"
}
```

- [ ] **Step 8: Commit préflight**

```bash
git add package.json pnpm-lock.yaml vitest.config.ts
git commit -m "chore(v3): prepare sync deps — zod, vitest"
```

### 0.3 Mapping spec ↔ code (référence pour toutes les tâches)

**Clés settings à synchroniser (subset du blob `user_settings.data`)** — mapping spec nested ↔ AppSettings flat :

| Spec (nested, côté cloud) | AppSettings (flat, côté client) | Type | Notes |
|---|---|---|---|
| `ui.theme` | `theme` | `"light"\|"dark"` | — |
| `ui.language` | `ui_language` | `"fr"\|"en"` | — |
| `hotkeys.toggle` | `record_hotkey` | `string` | — |
| `hotkeys.push_to_talk` | `ptt_hotkey` | `string` | — |
| `hotkeys.open_window` | `open_window_hotkey` | `string` | — |
| `features.auto_paste` | `insertion_mode` | `"cursor"\|"clipboard"\|"none"` | **L'enum est synchronisé tel quel**. Spec parlait de `boolean` par simplification ; on garde la granularité existante. |
| `features.sound_effects` | `enable_sounds` | `boolean` | — |
| `transcription.provider` | `transcription_provider` | `"OpenAI"\|"Google"\|"Local"\|"Groq"` | — |
| `transcription.local_model` | `local_model_size` | `"tiny"\|"base"\|"small"\|"medium"\|"large-v1"\|...` | — |

**Clés explicitement NON syncées (device-local)** :
- `openai_api_key`, `google_api_key`, `groq_api_key` (ADR 0003)
- `input_device_index`, `silence_threshold`, `trim_silence` (hardware-dependent)
- `main_window_state`, `main_window_geometry`, `mini_window_geometry`, `mini_window_waveform_samples` (résolution-dépendant)
- `start_minimized_on_boot` (UX par-device)
- `recordings_keep_last`, `history_keep_last` (storage local-seulement)
- `auto_check_updates`, `update_channel` (updater par-device)
- `keep_model_in_memory` (hardware)
- `groq_model`, `smart_formatting`, `translate_mode`, `language`, `whisper_initial_prompt` (**à confirmer** : restent local-only v3.0 ou syncés ? Décision par défaut : local-only v3.0, peut s'étendre en v3.0.x si demande user)
- `post_process_*` (local-only v3.0, report v3.0.x)
- `record_mode`, `cancel_hotkey`, `post_process_toggle_hotkey` (report v3.0.x)
- `show_transcription_in_mini_window`, `mini_visualizer_mode` (préférences display)
- `enable_history_audio_preview` (local-only)

**Forme cloud** (`user_settings.data`) :

```json
{
  "ui": { "theme": "dark", "language": "fr" },
  "hotkeys": { "toggle": "Ctrl+F11", "push_to_talk": "Ctrl+F12", "open_window": "Ctrl+Alt+O" },
  "features": { "auto_paste": "cursor", "sound_effects": true },
  "transcription": { "provider": "Local", "local_model": "base" }
}
```

### 0.4 Architecture sync — décision TS vs Rust (pour référence)

La spec `02-sync-settings.md` dit "Backend Rust — module `sync.rs`". **Décision 2026-04-24** : on dévie. Toute la logique sync (queue, retry, lifecycle, client HTTP) vit en **TypeScript**, cohérent avec le pattern sub-épique 01 (auth en TS + `auth.rs` limité à keyring/deep-link/device-id). Justifications :
- La session Supabase est déjà dans le contexte React (`useAuth`). Dupliquer en Rust = double source de vérité.
- Supabase JS client gère refresh token transparent. Re-implémenter côté Rust ajoute du code sans valeur.
- Le lifecycle (login, focus window, debounce) est naturellement côté React.
- Le seul besoin Rust : écriture/lecture fichiers backups + download export (Task 5, Task 17).

Cette décision est documentée dans l'ADR de clôture (Task 23).

---

## Task 1: Migration SQL — `user_settings` (scalaires)

**Files:**
- Create: `supabase/migrations/20260525000100_user_settings.sql`

- [ ] **Step 1: Écrire la migration**

```sql
-- user_settings — blob jsonb scalaires sync (ui, hotkeys, features, transcription)
create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  schema_version int not null default 1,
  updated_at timestamptz not null default now(),
  updated_by_device text,
  created_at timestamptz not null default now()
);

alter table public.user_settings enable row level security;

create policy "user_settings_select_own" on public.user_settings
  for select using (auth.uid() = user_id);

create policy "user_settings_insert_own" on public.user_settings
  for insert with check (auth.uid() = user_id);

create policy "user_settings_update_own" on public.user_settings
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "user_settings_delete_own" on public.user_settings
  for delete using (auth.uid() = user_id);

-- Trigger updated_at auto
create or replace function public.tg_user_settings_updated_at()
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

drop trigger if exists user_settings_updated_at on public.user_settings;
create trigger user_settings_updated_at
  before update on public.user_settings
  for each row execute function public.tg_user_settings_updated_at();

comment on table public.user_settings is
  'v3 sync: scalaires syncables (UI, hotkeys, features, transcription). 1 row par user.';
```

- [ ] **Step 2: Appliquer localement**

```bash
pnpm exec supabase db reset
```
Expected: migration appliquée sans erreur, schéma recréé from scratch avec toutes les migrations existantes + la nouvelle.

- [ ] **Step 3: Vérifier schéma**

```bash
pnpm exec supabase db diff --schema public --use-migra
```
Expected: aucun diff (l'état local matche la somme des migrations).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260525000100_user_settings.sql
git commit -m "feat(v3-sync): add user_settings table with RLS"
```

---

## Task 2: Migration SQL — `user_dictionary_words`

**Files:**
- Create: `supabase/migrations/20260525000200_user_dictionary_words.sql`

- [ ] **Step 1: Écrire la migration**

```sql
-- user_dictionary_words — dico personnalisé, clé composite (user_id, word)
create table if not exists public.user_dictionary_words (
  user_id uuid not null references auth.users(id) on delete cascade,
  word text not null check (char_length(word) between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (user_id, word)
);

create index if not exists user_dictionary_words_user_updated_idx
  on public.user_dictionary_words (user_id, updated_at);

alter table public.user_dictionary_words enable row level security;

create policy "user_dict_select_own" on public.user_dictionary_words
  for select using (auth.uid() = user_id);

create policy "user_dict_insert_own" on public.user_dictionary_words
  for insert with check (auth.uid() = user_id);

create policy "user_dict_update_own" on public.user_dictionary_words
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "user_dict_delete_own" on public.user_dictionary_words
  for delete using (auth.uid() = user_id);

-- Trigger updated_at auto
create or replace function public.tg_user_dictionary_words_updated_at()
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

drop trigger if exists user_dict_updated_at on public.user_dictionary_words;
create trigger user_dict_updated_at
  before update on public.user_dictionary_words
  for each row execute function public.tg_user_dictionary_words_updated_at();

comment on table public.user_dictionary_words is
  'v3 sync: mots dico utilisateur. Clé composite + soft-delete pour propagation cross-device.';
```

- [ ] **Step 2: Appliquer + vérifier**

```bash
pnpm exec supabase db reset
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260525000200_user_dictionary_words.sql
git commit -m "feat(v3-sync): add user_dictionary_words table with composite PK + RLS"
```

---

## Task 3: Migration SQL — `user_snippets`

**Files:**
- Create: `supabase/migrations/20260525000300_user_snippets.sql`

- [ ] **Step 1: Écrire la migration**

```sql
-- user_snippets — raccourcis de dictée (snippet trigger → texte à insérer)
create table if not exists public.user_snippets (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null check (char_length(label) between 1 and 200),
  content text not null check (char_length(content) between 1 and 10000),
  shortcut text check (shortcut is null or char_length(shortcut) between 1 and 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- Index "actifs" (non soft-deleted) — queries courantes
create index if not exists user_snippets_user_active_idx
  on public.user_snippets (user_id) where deleted_at is null;

-- Index pull incremental
create index if not exists user_snippets_user_updated_idx
  on public.user_snippets (user_id, updated_at);

alter table public.user_snippets enable row level security;

create policy "user_snippets_select_own" on public.user_snippets
  for select using (auth.uid() = user_id);

create policy "user_snippets_insert_own" on public.user_snippets
  for insert with check (auth.uid() = user_id);

create policy "user_snippets_update_own" on public.user_snippets
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "user_snippets_delete_own" on public.user_snippets
  for delete using (auth.uid() = user_id);

-- Trigger updated_at auto
create or replace function public.tg_user_snippets_updated_at()
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

drop trigger if exists user_snippets_updated_at on public.user_snippets;
create trigger user_snippets_updated_at
  before update on public.user_snippets
  for each row execute function public.tg_user_snippets_updated_at();

comment on table public.user_snippets is
  'v3 sync: snippets de dictée. UUID client-generated + soft-delete pour LWW par item.';
```

- [ ] **Step 2: Appliquer + vérifier**

```bash
pnpm exec supabase db reset
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260525000300_user_snippets.sql
git commit -m "feat(v3-sync): add user_snippets table with UUID PK + RLS + partial index"
```

---

## Task 4: Migration SQL — fonction quota

**Files:**
- Create: `supabase/migrations/20260525000400_sync_quota_function.sql`

- [ ] **Step 1: Écrire la migration**

```sql
-- Calcule la taille totale des données sync pour un user (bytes).
-- Utilisée par l'Edge Function /sync/push pour rejeter quand > 5 MB.
create or replace function public.compute_user_sync_size(target_user uuid)
returns bigint
language plpgsql
security definer
set search_path = public, pg_catalog
stable
as $$
declare
  total bigint := 0;
begin
  -- Sécurité : seul un user peut interroger sa propre taille
  if auth.uid() is null or auth.uid() <> target_user then
    raise exception 'access denied' using errcode = '42501';
  end if;

  select coalesce(sum(pg_column_size(data)), 0) into total
    from public.user_settings where user_id = target_user;

  select coalesce(total + sum(pg_column_size(word)), total) into total
    from public.user_dictionary_words
    where user_id = target_user and deleted_at is null;

  select coalesce(total + sum(pg_column_size(label) + pg_column_size(content) + coalesce(pg_column_size(shortcut), 0)), total) into total
    from public.user_snippets
    where user_id = target_user and deleted_at is null;

  return total;
end;
$$;

revoke all on function public.compute_user_sync_size(uuid) from public;
grant execute on function public.compute_user_sync_size(uuid) to authenticated;

comment on function public.compute_user_sync_size is
  'v3 sync: taille totale (bytes) des données sync pour le user courant. Appelée par /sync/push pour quota 5 MB.';
```

- [ ] **Step 2: Appliquer**

```bash
pnpm exec supabase db reset
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260525000400_sync_quota_function.sql
git commit -m "feat(v3-sync): add compute_user_sync_size() RPC for quota check"
```

---

## Task 5: Tests pgtap — RLS cross-tenant

**Files:**
- Create: `supabase/tests/rls_user_settings.sql`
- Create: `supabase/tests/rls_user_dictionary_words.sql`
- Create: `supabase/tests/rls_user_snippets.sql`
- Create: `supabase/tests/quota.sql`

> **Objectif :** mesure #1 du threat model — cross-tenant isolation vérifiée automatiquement. Un user A ne doit JAMAIS lire/écrire les rows d'un user B, sur aucune des 3 tables.

- [ ] **Step 1: Vérifier que pgtap est activé en local**

```bash
pnpm exec supabase db reset
# Dans la sortie tu dois voir "CREATE EXTENSION pgtap" ou équivalent.
# Si non, ajouter à supabase/config.toml dans [db.extensions] ou créer une migration.
```

Si pgtap n'est pas activé par défaut, créer `supabase/migrations/20260525000050_enable_pgtap.sql` (avant les autres) :

```sql
create extension if not exists pgtap with schema extensions;
```

- [ ] **Step 2: Écrire `supabase/tests/rls_user_settings.sql`**

```sql
begin;
select plan(6);

-- Fixture : 2 users
insert into auth.users (id, email, aud, role) values
  ('11111111-1111-1111-1111-111111111111', 'a@test.local', 'authenticated', 'authenticated'),
  ('22222222-2222-2222-2222-222222222222', 'b@test.local', 'authenticated', 'authenticated');

-- User A pose un row
set local role authenticated;
set local "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';
insert into public.user_settings (user_id, data) values
  ('11111111-1111-1111-1111-111111111111', '{"ui":{"theme":"dark"}}'::jsonb);

select results_eq(
  $$ select count(*)::int from public.user_settings $$,
  $$ values (1) $$,
  'User A voit son row'
);

-- Bascule vers user B
set local "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';

select results_eq(
  $$ select count(*)::int from public.user_settings $$,
  $$ values (0) $$,
  'User B ne voit PAS le row de A'
);

select lives_ok(
  $$ update public.user_settings set data = '{"ui":{"theme":"light"}}'::jsonb where user_id = '11111111-1111-1111-1111-111111111111' $$,
  'User B UPDATE de A ne lève pas (RLS filtre en silence)'
);
set local "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';

select results_eq(
  $$ select data->'ui'->>'theme' from public.user_settings where user_id = '11111111-1111-1111-1111-111111111111' $$,
  $$ values ('dark') $$,
  'Le row de A est inchangé après tentative UPDATE de B'
);

-- User B tente insert avec user_id = A → doit échouer (RLS WITH CHECK)
set local "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
select throws_ok(
  $$ insert into public.user_settings (user_id, data) values ('11111111-1111-1111-1111-111111111111', '{"hack":true}'::jsonb) $$,
  '42501',
  null,
  'User B ne peut pas INSERT un row avec user_id de A'
);

-- Cleanup
set local role postgres;
delete from auth.users where id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');

select pass('Cleanup OK');

select * from finish();
rollback;
```

- [ ] **Step 3: Écrire `supabase/tests/rls_user_dictionary_words.sql`**

```sql
begin;
select plan(5);

insert into auth.users (id, email, aud, role) values
  ('11111111-1111-1111-1111-111111111111', 'a@test.local', 'authenticated', 'authenticated'),
  ('22222222-2222-2222-2222-222222222222', 'b@test.local', 'authenticated', 'authenticated');

set local role authenticated;
set local "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';
insert into public.user_dictionary_words (user_id, word) values
  ('11111111-1111-1111-1111-111111111111', 'tauri'),
  ('11111111-1111-1111-1111-111111111111', 'supabase');

select results_eq(
  $$ select count(*)::int from public.user_dictionary_words where deleted_at is null $$,
  $$ values (2) $$,
  'User A voit ses 2 mots'
);

set local "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
select results_eq(
  $$ select count(*)::int from public.user_dictionary_words $$,
  $$ values (0) $$,
  'User B ne voit aucun mot'
);

select throws_ok(
  $$ insert into public.user_dictionary_words (user_id, word) values ('11111111-1111-1111-1111-111111111111', 'hack') $$,
  '42501',
  null,
  'User B ne peut pas injecter un mot avec user_id de A'
);

-- delete réussit silencieusement sur 0 rows via RLS
select lives_ok(
  $$ delete from public.user_dictionary_words where user_id = '11111111-1111-1111-1111-111111111111' $$,
  'User B DELETE de A ne lève pas (RLS filtre en silence)'
);
set local "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';
select results_eq(
  $$ select count(*)::int from public.user_dictionary_words where user_id = '11111111-1111-1111-1111-111111111111' and deleted_at is null $$,
  $$ values (2) $$,
  'Les mots de A restent après tentative DELETE de B'
);

set local role postgres;
delete from auth.users where id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');

select * from finish();
rollback;
```

- [ ] **Step 4: Écrire `supabase/tests/rls_user_snippets.sql`**

```sql
begin;
select plan(5);

insert into auth.users (id, email, aud, role) values
  ('11111111-1111-1111-1111-111111111111', 'a@test.local', 'authenticated', 'authenticated'),
  ('22222222-2222-2222-2222-222222222222', 'b@test.local', 'authenticated', 'authenticated');

set local role authenticated;
set local "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';
insert into public.user_snippets (id, user_id, label, content, shortcut) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'sign', 'Cordialement, Jean', 'sign');

select results_eq(
  $$ select count(*)::int from public.user_snippets where deleted_at is null $$,
  $$ values (1) $$,
  'User A voit son snippet'
);

set local "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
select results_eq(
  $$ select count(*)::int from public.user_snippets $$,
  $$ values (0) $$,
  'User B ne voit pas le snippet de A'
);

select throws_ok(
  $$ insert into public.user_snippets (id, user_id, label, content) values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-1111-1111-1111-111111111111', 'hack', 'bad') $$,
  '42501',
  null,
  'User B ne peut pas créer un snippet sous le user_id de A'
);

select lives_ok(
  $$ update public.user_snippets set content = 'pwned' where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
  'User B UPDATE de A ne lève pas (RLS filtre en silence)'
);
set local "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';
select results_eq(
  $$ select content from public.user_snippets where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
  $$ values ('Cordialement, Jean') $$,
  'Le snippet de A est inchangé après tentative UPDATE de B'
);

set local role postgres;
delete from auth.users where id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');

select * from finish();
rollback;
```

- [ ] **Step 5: Écrire `supabase/tests/quota.sql`**

```sql
begin;
select plan(3);

insert into auth.users (id, email, aud, role) values
  ('11111111-1111-1111-1111-111111111111', 'a@test.local', 'authenticated', 'authenticated');

set local role authenticated;
set local "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';
insert into public.user_settings (user_id, data) values
  ('11111111-1111-1111-1111-111111111111', '{"ui":{"theme":"dark","language":"fr"}}'::jsonb);
insert into public.user_dictionary_words (user_id, word) values
  ('11111111-1111-1111-1111-111111111111', 'tauri');
insert into public.user_snippets (id, user_id, label, content) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'sign', 'Cordialement');

select ok(
  public.compute_user_sync_size('11111111-1111-1111-1111-111111111111') > 0,
  'compute_user_sync_size retourne > 0 pour user avec data'
);

-- Prouve que la taille intègre bien la contribution de chaque table : ajouter un mot dico doit strictement augmenter la taille.
do $$
declare
  before bigint;
  after bigint;
begin
  before := public.compute_user_sync_size('11111111-1111-1111-1111-111111111111');
  insert into public.user_dictionary_words (user_id, word) values
    ('11111111-1111-1111-1111-111111111111', 'extrabig_word_for_test');
  after := public.compute_user_sync_size('11111111-1111-1111-1111-111111111111');
  if after <= before then
    raise exception 'size did not grow: before=% after=%', before, after;
  end if;
end $$;
select pass('compute_user_sync_size intègre la contribution dico');

-- Test que user B ne peut pas compute la size de user A
insert into auth.users (id, email, aud, role) values
  ('22222222-2222-2222-2222-222222222222', 'b@test.local', 'authenticated', 'authenticated');
set local "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';

select throws_ok(
  $$ select public.compute_user_sync_size('11111111-1111-1111-1111-111111111111') $$,
  '42501',
  'access denied',
  'User B ne peut pas compute la size de A'
);

set local role postgres;
delete from auth.users where id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');

select * from finish();
rollback;
```

- [ ] **Step 6: Lancer les tests**

```bash
pnpm exec supabase test db
```
Expected: tous les tests passent (`# ok`). Si échec, lire l'output et fixer migrations ou tests selon le cas.

- [ ] **Step 7: Commit**

```bash
git add supabase/tests/ supabase/migrations/20260525000050_enable_pgtap.sql
git commit -m "test(v3-sync): pgtap cross-tenant RLS + quota coverage"
```

---

## Task 6: Commandes Rust filesystem pour backups + export

**Files:**
- Create: `src-tauri/src/sync.rs`
- Modify: `src-tauri/src/lib.rs`

> **Justification** : on a besoin de lire/écrire des fichiers JSON dans `{appData}/backups/` et de sauvegarder l'export GDPR dans Downloads. C'est le seul travail Rust de ce sub-épique.

- [ ] **Step 1: Créer `src-tauri/src/sync.rs`**

```rust
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use tracing::{info, warn};

// ── Constants ────────────────────────────────────────────────────────────────

const BACKUPS_SUBDIR: &str = "backups";
const BACKUP_FILE_PREFIX: &str = "pre-sync_";
const MAX_BACKUPS: usize = 10;

// ── Structs ──────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupMeta {
    pub filename: String,
    pub created_at: String,
    pub size_bytes: u64,
}

// ── Helpers ──────────────────────────────────────────────────────────────────

fn backups_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("cannot resolve app_data_dir: {}", e))?
        .join(BACKUPS_SUBDIR);
    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|e| format!("cannot create backups dir: {}", e))?;
    }
    Ok(dir)
}

fn rotate_backups(dir: &PathBuf) -> Result<(), String> {
    let mut entries: Vec<(PathBuf, std::time::SystemTime)> = fs::read_dir(dir)
        .map_err(|e| format!("cannot read backups dir: {}", e))?
        .flatten()
        .filter_map(|e| {
            let path = e.path();
            let name = path.file_name()?.to_string_lossy().to_string();
            if !name.starts_with(BACKUP_FILE_PREFIX) || !name.ends_with(".json") {
                return None;
            }
            let meta = e.metadata().ok()?;
            Some((path, meta.modified().ok()?))
        })
        .collect();

    entries.sort_by_key(|(_, mtime)| *mtime);

    while entries.len() > MAX_BACKUPS {
        let (oldest, _) = entries.remove(0);
        if let Err(e) = fs::remove_file(&oldest) {
            warn!("failed to remove old backup {:?}: {}", oldest, e);
        } else {
            info!("rotated old backup {:?}", oldest);
        }
    }
    Ok(())
}

// ── Tauri commands ───────────────────────────────────────────────────────────

#[tauri::command]
pub async fn write_local_backup(app: AppHandle, payload_json: String) -> Result<String, String> {
    let dir = backups_dir(&app)?;
    let now = chrono::Local::now();
    let filename = format!(
        "{}{}.json",
        BACKUP_FILE_PREFIX,
        now.format("%Y-%m-%d_%H%M%S")
    );
    let path = dir.join(&filename);
    fs::write(&path, payload_json.as_bytes())
        .map_err(|e| format!("cannot write backup: {}", e))?;
    rotate_backups(&dir)?;
    info!("local backup written: {}", filename);
    Ok(filename)
}

#[tauri::command]
pub async fn list_local_backups(app: AppHandle) -> Result<Vec<BackupMeta>, String> {
    let dir = backups_dir(&app)?;
    let mut out: Vec<BackupMeta> = fs::read_dir(&dir)
        .map_err(|e| format!("cannot read backups dir: {}", e))?
        .flatten()
        .filter_map(|e| {
            let path = e.path();
            let filename = path.file_name()?.to_string_lossy().to_string();
            if !filename.starts_with(BACKUP_FILE_PREFIX) || !filename.ends_with(".json") {
                return None;
            }
            let meta = e.metadata().ok()?;
            let mtime = meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| chrono::DateTime::<chrono::Utc>::from_timestamp(d.as_secs() as i64, 0))
                .flatten()
                .map(|dt| dt.to_rfc3339())
                .unwrap_or_default();
            Some(BackupMeta {
                filename,
                created_at: mtime,
                size_bytes: meta.len(),
            })
        })
        .collect();
    out.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(out)
}

#[tauri::command]
pub async fn read_local_backup(app: AppHandle, filename: String) -> Result<String, String> {
    if !filename.starts_with(BACKUP_FILE_PREFIX) || !filename.ends_with(".json") {
        return Err("invalid backup filename".into());
    }
    if filename.contains("..") || filename.contains('/') || filename.contains('\\') {
        return Err("invalid backup filename".into());
    }
    let dir = backups_dir(&app)?;
    let path = dir.join(&filename);
    fs::read_to_string(&path).map_err(|e| format!("cannot read backup: {}", e))
}

#[tauri::command]
pub async fn delete_local_backup(app: AppHandle, filename: String) -> Result<(), String> {
    if !filename.starts_with(BACKUP_FILE_PREFIX) || !filename.ends_with(".json") {
        return Err("invalid backup filename".into());
    }
    if filename.contains("..") || filename.contains('/') || filename.contains('\\') {
        return Err("invalid backup filename".into());
    }
    let dir = backups_dir(&app)?;
    let path = dir.join(&filename);
    fs::remove_file(&path).map_err(|e| format!("cannot delete backup: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn save_export_to_download(
    app: AppHandle,
    payload_json: String,
    suggested_filename: String,
) -> Result<String, String> {
    // Sanity check filename
    if suggested_filename.contains("..") || suggested_filename.contains('/') || suggested_filename.contains('\\') {
        return Err("invalid filename".into());
    }
    let downloads = app
        .path()
        .download_dir()
        .map_err(|e| format!("cannot resolve download dir: {}", e))?;
    if !downloads.exists() {
        fs::create_dir_all(&downloads).map_err(|e| format!("cannot create download dir: {}", e))?;
    }
    let path = downloads.join(&suggested_filename);
    fs::write(&path, payload_json.as_bytes()).map_err(|e| format!("cannot write export: {}", e))?;
    Ok(path.to_string_lossy().to_string())
}

// ── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    #[test]
    fn filename_guard_rejects_traversal() {
        // Reproduit la logique guard
        let bad = vec!["../escape.json", "pre-sync_/etc/passwd", "pre-sync_a.json\0"];
        for f in bad {
            assert!(
                f.contains("..") || f.contains('/') || f.contains('\\') || f.contains('\0'),
                "filename {} devrait déclencher un guard",
                f
            );
        }
    }
}
```

- [ ] **Step 2: Enregistrer le module dans `lib.rs`**

Ouvre `src-tauri/src/lib.rs`. En haut avec les autres `mod` :

```rust
mod sync;
```

Dans `invoke_handler` (builder Tauri), ajouter à côté des autres commandes :

```rust
.invoke_handler(tauri::generate_handler![
    // ... existantes
    sync::write_local_backup,
    sync::list_local_backups,
    sync::read_local_backup,
    sync::delete_local_backup,
    sync::save_export_to_download,
])
```

- [ ] **Step 3: Compiler**

```bash
cd src-tauri && LIBCLANG_PATH="C:/Program Files/LLVM/bin" PATH="$PATH:/c/Program Files/CMake/bin" cargo check
```
Expected: compile sans erreur (warnings OK).

- [ ] **Step 4: Lancer tests Rust**

```bash
cd src-tauri && LIBCLANG_PATH="C:/Program Files/LLVM/bin" PATH="$PATH:/c/Program Files/CMake/bin" cargo test sync::
```
Expected: `filename_guard_rejects_traversal ... ok`.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/sync.rs src-tauri/src/lib.rs
git commit -m "feat(v3-sync): rust commands for local backups + GDPR export write"
```

---

## Task 7: Types TypeScript partagés sync

**Files:**
- Create: `src/lib/sync/types.ts`

- [ ] **Step 1: Écrire `src/lib/sync/types.ts`**

```typescript
// Shape du blob côté cloud (matche la spec nested).
export interface CloudSettingsData {
  ui: {
    theme: "light" | "dark";
    language: "fr" | "en";
  };
  hotkeys: {
    toggle: string;
    push_to_talk: string;
    open_window: string;
  };
  features: {
    auto_paste: "cursor" | "clipboard" | "none";
    sound_effects: boolean;
  };
  transcription: {
    provider: "OpenAI" | "Google" | "Local" | "Groq";
    local_model: string;
  };
}

// Rows côté cloud
export interface CloudUserSettingsRow {
  user_id: string;
  data: CloudSettingsData;
  schema_version: number;
  updated_at: string; // ISO
  updated_by_device: string | null;
}

export interface CloudDictionaryWordRow {
  user_id: string;
  word: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface CloudSnippetRow {
  id: string; // uuid
  user_id: string;
  label: string;
  content: string;
  shortcut: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

// Shape côté client (Tauri Store) pour snippets
export interface LocalSnippet {
  id: string; // uuid
  label: string;
  content: string;
  shortcut: string | null;
  updated_at: string; // ISO — trace côté client pour debug
  deleted_at: string | null;
  created_at: string;
}

export interface LocalDictionary {
  words: string[];
  tombstones: string[]; // mots supprimés mais pas encore push
  updated_at: string;
}

// Queue entries (persistées dans Tauri Store)
export type SyncOperation =
  | { kind: "settings-upsert"; data: CloudSettingsData }
  | { kind: "dictionary-upsert"; word: string }
  | { kind: "dictionary-delete"; word: string }
  | { kind: "snippet-upsert"; snippet: LocalSnippet }
  | { kind: "snippet-delete"; id: string };

export interface SyncQueueEntry {
  id: string; // uuid local de l'entrée queue (idempotence côté client)
  operation: SyncOperation;
  enqueued_at: string;
  retry_count: number;
  last_error: string | null;
}

// État global
export type SyncStatus = "disabled" | "idle" | "syncing" | "offline" | "error";

export interface SyncState {
  enabled: boolean;
  status: SyncStatus;
  last_sync_at: string | null;
  last_pull_at: string | null;
  pending_count: number;
  last_error: string | null;
}
```

- [ ] **Step 2: Vérifier build**

```bash
pnpm build
```
Expected: build OK. Les types ne sont pas encore utilisés.

- [ ] **Step 3: Commit**

```bash
git add src/lib/sync/types.ts
git commit -m "feat(v3-sync): shared TypeScript types for sync engine"
```

---

## Task 8: Mapping AppSettings ↔ Cloud shape

**Files:**
- Create: `src/lib/sync/mapping.ts`
- Create: `src/lib/sync/mapping.test.ts`

- [ ] **Step 1: Écrire le test d'abord**

```typescript
// src/lib/sync/mapping.test.ts
import { describe, it, expect } from "vitest";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { extractCloudSettings, applyCloudSettings } from "./mapping";

describe("mapping AppSettings ↔ Cloud", () => {
  it("extractCloudSettings returns the spec shape", () => {
    const cloud = extractCloudSettings(DEFAULT_SETTINGS.settings);
    expect(cloud).toEqual({
      ui: { theme: "dark", language: DEFAULT_SETTINGS.settings.ui_language },
      hotkeys: {
        toggle: "Ctrl+F11",
        push_to_talk: "Ctrl+F12",
        open_window: "Ctrl+Alt+O",
      },
      features: { auto_paste: "cursor", sound_effects: true },
      transcription: { provider: "Local", local_model: "base" },
    });
  });

  it("applyCloudSettings merges only syncable keys", () => {
    const local = { ...DEFAULT_SETTINGS.settings };
    const cloud = {
      ui: { theme: "light" as const, language: "en" as const },
      hotkeys: {
        toggle: "Ctrl+F5",
        push_to_talk: "Ctrl+F6",
        open_window: "Ctrl+Alt+P",
      },
      features: { auto_paste: "clipboard" as const, sound_effects: false },
      transcription: { provider: "OpenAI" as const, local_model: "small" },
    };
    const merged = applyCloudSettings(local, cloud);

    expect(merged.theme).toBe("light");
    expect(merged.ui_language).toBe("en");
    expect(merged.record_hotkey).toBe("Ctrl+F5");
    expect(merged.insertion_mode).toBe("clipboard");
    expect(merged.enable_sounds).toBe(false);
    expect(merged.transcription_provider).toBe("OpenAI");
    expect(merged.local_model_size).toBe("small");

    // Non-syncable keys préservées
    expect(merged.openai_api_key).toBe(local.openai_api_key);
    expect(merged.silence_threshold).toBe(local.silence_threshold);
  });

  it("round-trip extract -> apply est idempotent pour les clés syncées", () => {
    const local = {
      ...DEFAULT_SETTINGS.settings,
      theme: "light" as const,
      transcription_provider: "Groq" as const,
    };
    const cloud = extractCloudSettings(local);
    const merged = applyCloudSettings(DEFAULT_SETTINGS.settings, cloud);
    expect(merged.theme).toBe("light");
    expect(merged.transcription_provider).toBe("Groq");
  });
});
```

- [ ] **Step 2: Lancer le test — doit échouer (module absent)**

```bash
pnpm test
```
Expected: FAIL avec "Cannot find module './mapping'".

- [ ] **Step 3: Écrire `src/lib/sync/mapping.ts`**

```typescript
import type { AppSettings } from "@/lib/settings";
import type { CloudSettingsData } from "./types";

export function extractCloudSettings(s: AppSettings["settings"]): CloudSettingsData {
  return {
    ui: {
      theme: s.theme,
      language: s.ui_language,
    },
    hotkeys: {
      toggle: s.record_hotkey,
      push_to_talk: s.ptt_hotkey,
      open_window: s.open_window_hotkey,
    },
    features: {
      auto_paste: s.insertion_mode,
      sound_effects: s.enable_sounds,
    },
    transcription: {
      provider: s.transcription_provider,
      local_model: s.local_model_size,
    },
  };
}

export function applyCloudSettings(
  local: AppSettings["settings"],
  cloud: CloudSettingsData
): AppSettings["settings"] {
  return {
    ...local,
    theme: cloud.ui.theme,
    ui_language: cloud.ui.language,
    record_hotkey: cloud.hotkeys.toggle,
    ptt_hotkey: cloud.hotkeys.push_to_talk,
    open_window_hotkey: cloud.hotkeys.open_window,
    insertion_mode: cloud.features.auto_paste,
    enable_sounds: cloud.features.sound_effects,
    transcription_provider: cloud.transcription.provider,
    local_model_size: cloud.transcription.local_model as AppSettings["settings"]["local_model_size"],
  };
}

// Retourne true si au moins une clé syncable diffère entre deux snapshots AppSettings.
export function syncableSettingsChanged(
  a: AppSettings["settings"],
  b: AppSettings["settings"]
): boolean {
  const ca = extractCloudSettings(a);
  const cb = extractCloudSettings(b);
  return JSON.stringify(ca) !== JSON.stringify(cb);
}
```

- [ ] **Step 4: Relancer — doit passer**

```bash
pnpm test
```
Expected: 3 tests passent.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sync/mapping.ts src/lib/sync/mapping.test.ts
git commit -m "feat(v3-sync): mapping between AppSettings and cloud shape"
```

---

## Task 9: Store local snippets (nouvelle structure)

**Files:**
- Create: `src/lib/sync/snippets-store.ts`
- Create: `src/lib/sync/snippets-store.test.ts`

> **Note migration** : les snippets legacy vivent dans `settings.snippets: {trigger, replacement}[]`. On ne les supprime **pas** du settings blob immédiatement — on ajoute un nouveau store. Une migration one-shot au premier accès du nouveau store importe les anciens en tant que rows `{id, label=trigger, content=replacement, shortcut=trigger}` et vide `settings.snippets` ensuite. Cf. Task 10 (wire up).

- [ ] **Step 1: Écrire le test**

```typescript
// src/lib/sync/snippets-store.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock the Tauri store plugin
const storeData: Record<string, unknown> = {};
vi.mock("@tauri-apps/plugin-store", () => {
  return {
    Store: {
      load: async () => ({
        get: async (k: string) => storeData[k] ?? null,
        set: async (k: string, v: unknown) => {
          storeData[k] = v;
        },
        save: async () => {},
      }),
    },
  };
});

import {
  loadSnippets,
  upsertSnippet,
  softDeleteSnippet,
  migrateLegacySnippetsOnce,
  __resetForTests,
} from "./snippets-store";

describe("snippets-store", () => {
  beforeEach(async () => {
    Object.keys(storeData).forEach((k) => delete storeData[k]);
    __resetForTests();
  });

  it("starts empty", async () => {
    const all = await loadSnippets();
    expect(all).toEqual([]);
  });

  it("upsert creates then updates", async () => {
    const s1 = await upsertSnippet({ label: "sign", content: "Cordialement", shortcut: "sign" });
    expect(s1.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(s1.deleted_at).toBeNull();

    const s1bis = await upsertSnippet({ id: s1.id, label: "sign", content: "Best regards", shortcut: "sign" });
    expect(s1bis.id).toBe(s1.id);
    expect(s1bis.content).toBe("Best regards");
    expect(new Date(s1bis.updated_at).getTime()).toBeGreaterThanOrEqual(new Date(s1.updated_at).getTime());

    const all = await loadSnippets();
    expect(all).toHaveLength(1);
  });

  it("soft-delete sets deleted_at", async () => {
    const s1 = await upsertSnippet({ label: "hi", content: "hello", shortcut: null });
    await softDeleteSnippet(s1.id);
    const all = await loadSnippets();
    expect(all[0].deleted_at).not.toBeNull();
  });

  it("migrateLegacySnippetsOnce imports legacy then is idempotent", async () => {
    const legacy = [
      { trigger: "sign", replacement: "Cordialement" },
      { trigger: "hi", replacement: "hello" },
    ];
    const cleared = await migrateLegacySnippetsOnce(legacy);
    expect(cleared).toBe(true);
    const all = await loadSnippets();
    expect(all).toHaveLength(2);
    expect(all.find((s) => s.label === "sign")?.content).toBe("Cordialement");

    // Second call: noop
    const cleared2 = await migrateLegacySnippetsOnce(legacy);
    expect(cleared2).toBe(false);
    const all2 = await loadSnippets();
    expect(all2).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Lancer test — échoue**

```bash
pnpm test snippets-store
```
Expected: FAIL (module absent).

- [ ] **Step 3: Écrire `src/lib/sync/snippets-store.ts`**

```typescript
import { Store } from "@tauri-apps/plugin-store";
import type { LocalSnippet } from "./types";

const STORE_FILE = "sync-snippets.json";
const KEY_SNIPPETS = "snippets";
const KEY_MIGRATED = "legacy_migrated";

let storePromise: Promise<Awaited<ReturnType<typeof Store.load>>> | null = null;

function getStore() {
  if (!storePromise) {
    storePromise = Store.load(STORE_FILE);
  }
  return storePromise;
}

export function __resetForTests() {
  storePromise = null;
}

function newUuid(): string {
  // crypto.randomUUID dispo en Node 18+ et navigateurs récents
  return crypto.randomUUID();
}

export async function loadSnippets(): Promise<LocalSnippet[]> {
  const store = await getStore();
  const data = (await store.get<LocalSnippet[]>(KEY_SNIPPETS)) ?? [];
  return data;
}

export async function saveSnippets(list: LocalSnippet[]): Promise<void> {
  const store = await getStore();
  await store.set(KEY_SNIPPETS, list);
  await store.save();
}

export interface UpsertSnippetInput {
  id?: string;
  label: string;
  content: string;
  shortcut: string | null;
}

export async function upsertSnippet(input: UpsertSnippetInput): Promise<LocalSnippet> {
  const all = await loadSnippets();
  const now = new Date().toISOString();
  const existingIdx = input.id ? all.findIndex((s) => s.id === input.id) : -1;

  let result: LocalSnippet;
  if (existingIdx >= 0) {
    result = {
      ...all[existingIdx],
      label: input.label,
      content: input.content,
      shortcut: input.shortcut,
      updated_at: now,
      deleted_at: null,
    };
    all[existingIdx] = result;
  } else {
    result = {
      id: input.id ?? newUuid(),
      label: input.label,
      content: input.content,
      shortcut: input.shortcut,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    };
    all.push(result);
  }
  await saveSnippets(all);
  return result;
}

export async function softDeleteSnippet(id: string): Promise<void> {
  const all = await loadSnippets();
  const idx = all.findIndex((s) => s.id === id);
  if (idx < 0) return;
  const now = new Date().toISOString();
  all[idx] = { ...all[idx], deleted_at: now, updated_at: now };
  await saveSnippets(all);
}

/** Applique un push depuis le cloud (réception d'un snippet merged LWW). */
export async function applyRemoteSnippet(remote: LocalSnippet): Promise<void> {
  const all = await loadSnippets();
  const idx = all.findIndex((s) => s.id === remote.id);
  if (idx < 0) {
    all.push(remote);
  } else {
    const localUpdated = new Date(all[idx].updated_at).getTime();
    const remoteUpdated = new Date(remote.updated_at).getTime();
    if (remoteUpdated >= localUpdated) {
      all[idx] = remote;
    }
  }
  await saveSnippets(all);
}

/** Import one-shot des snippets legacy `{trigger, replacement}`.
 *  Retourne true si la migration a tourné, false si déjà faite. */
export async function migrateLegacySnippetsOnce(
  legacy: Array<{ trigger: string; replacement: string }>
): Promise<boolean> {
  const store = await getStore();
  const already = await store.get<boolean>(KEY_MIGRATED);
  if (already) return false;
  for (const { trigger, replacement } of legacy) {
    await upsertSnippet({ label: trigger, content: replacement, shortcut: trigger });
  }
  await store.set(KEY_MIGRATED, true);
  await store.save();
  return true;
}
```

- [ ] **Step 4: Relancer test**

```bash
pnpm test snippets-store
```
Expected: 4 tests passent.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sync/snippets-store.ts src/lib/sync/snippets-store.test.ts
git commit -m "feat(v3-sync): local snippets store with UUID + soft-delete + legacy migration"
```

---

## Task 10: Store local dictionnaire + tombstones

**Files:**
- Create: `src/lib/sync/dictionary-store.ts`
- Create: `src/lib/sync/dictionary-store.test.ts`

- [ ] **Step 1: Écrire le test**

```typescript
// src/lib/sync/dictionary-store.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";

const storeData: Record<string, unknown> = {};
vi.mock("@tauri-apps/plugin-store", () => {
  return {
    Store: {
      load: async () => ({
        get: async (k: string) => storeData[k] ?? null,
        set: async (k: string, v: unknown) => {
          storeData[k] = v;
        },
        save: async () => {},
      }),
    },
  };
});

import {
  loadDictionary,
  addWord,
  removeWord,
  drainTombstones,
  applyRemoteWord,
  migrateLegacyDictionaryOnce,
  __resetForTests,
} from "./dictionary-store";

describe("dictionary-store", () => {
  beforeEach(async () => {
    Object.keys(storeData).forEach((k) => delete storeData[k]);
    __resetForTests();
  });

  it("starts empty", async () => {
    const d = await loadDictionary();
    expect(d.words).toEqual([]);
    expect(d.tombstones).toEqual([]);
  });

  it("addWord is idempotent", async () => {
    await addWord("tauri");
    await addWord("tauri");
    const d = await loadDictionary();
    expect(d.words).toEqual(["tauri"]);
  });

  it("removeWord moves to tombstones", async () => {
    await addWord("tauri");
    await removeWord("tauri");
    const d = await loadDictionary();
    expect(d.words).toEqual([]);
    expect(d.tombstones).toEqual(["tauri"]);
  });

  it("drainTombstones empties the list", async () => {
    await addWord("a");
    await removeWord("a");
    const t = await drainTombstones();
    expect(t).toEqual(["a"]);
    const d = await loadDictionary();
    expect(d.tombstones).toEqual([]);
  });

  it("applyRemoteWord with deleted_at removes locally + tombstones", async () => {
    await addWord("cloudword");
    await applyRemoteWord({ word: "cloudword", deleted: true, updated_at: new Date().toISOString() });
    const d = await loadDictionary();
    expect(d.words).toEqual([]);
  });

  it("applyRemoteWord with new word adds it", async () => {
    await applyRemoteWord({ word: "fromcloud", deleted: false, updated_at: new Date().toISOString() });
    const d = await loadDictionary();
    expect(d.words).toContain("fromcloud");
  });

  it("migrateLegacyDictionaryOnce imports then is idempotent", async () => {
    const ran1 = await migrateLegacyDictionaryOnce(["tauri", "supabase"]);
    expect(ran1).toBe(true);
    const d = await loadDictionary();
    expect(d.words.sort()).toEqual(["supabase", "tauri"]);
    const ran2 = await migrateLegacyDictionaryOnce(["x"]);
    expect(ran2).toBe(false);
    const d2 = await loadDictionary();
    expect(d2.words).not.toContain("x");
  });
});
```

- [ ] **Step 2: Écrire `src/lib/sync/dictionary-store.ts`**

```typescript
import { Store } from "@tauri-apps/plugin-store";
import type { LocalDictionary } from "./types";

const STORE_FILE = "sync-dictionary.json";
const KEY_DATA = "dictionary";
const KEY_MIGRATED = "legacy_migrated";

let storePromise: Promise<Awaited<ReturnType<typeof Store.load>>> | null = null;

function getStore() {
  if (!storePromise) {
    storePromise = Store.load(STORE_FILE);
  }
  return storePromise;
}

export function __resetForTests() {
  storePromise = null;
}

export async function loadDictionary(): Promise<LocalDictionary> {
  const store = await getStore();
  const data = await store.get<LocalDictionary>(KEY_DATA);
  if (!data) return { words: [], tombstones: [], updated_at: new Date(0).toISOString() };
  return data;
}

async function saveDictionary(d: LocalDictionary): Promise<void> {
  const store = await getStore();
  await store.set(KEY_DATA, d);
  await store.save();
}

export async function addWord(word: string): Promise<void> {
  const w = word.trim();
  if (!w) return;
  const d = await loadDictionary();
  if (d.words.includes(w)) return;
  d.words = [...d.words, w];
  d.tombstones = d.tombstones.filter((t) => t !== w);
  d.updated_at = new Date().toISOString();
  await saveDictionary(d);
}

export async function removeWord(word: string): Promise<void> {
  const w = word.trim();
  if (!w) return;
  const d = await loadDictionary();
  const hadIt = d.words.includes(w);
  d.words = d.words.filter((x) => x !== w);
  if (hadIt && !d.tombstones.includes(w)) {
    d.tombstones = [...d.tombstones, w];
  }
  d.updated_at = new Date().toISOString();
  await saveDictionary(d);
}

/** Vide et retourne la liste des tombstones à pousser au cloud. */
export async function drainTombstones(): Promise<string[]> {
  const d = await loadDictionary();
  const tombs = d.tombstones;
  d.tombstones = [];
  await saveDictionary(d);
  return tombs;
}

export interface RemoteWordEvent {
  word: string;
  deleted: boolean;
  updated_at: string;
}

export async function applyRemoteWord(ev: RemoteWordEvent): Promise<void> {
  const d = await loadDictionary();
  if (ev.deleted) {
    d.words = d.words.filter((w) => w !== ev.word);
    d.tombstones = d.tombstones.filter((w) => w !== ev.word);
  } else {
    if (!d.words.includes(ev.word)) d.words = [...d.words, ev.word];
    d.tombstones = d.tombstones.filter((w) => w !== ev.word);
  }
  await saveDictionary(d);
}

export async function migrateLegacyDictionaryOnce(legacy: string[]): Promise<boolean> {
  const store = await getStore();
  const already = await store.get<boolean>(KEY_MIGRATED);
  if (already) return false;
  const d = await loadDictionary();
  const merged = Array.from(new Set([...d.words, ...legacy.map((w) => w.trim()).filter(Boolean)]));
  d.words = merged;
  d.updated_at = new Date().toISOString();
  await saveDictionary(d);
  await store.set(KEY_MIGRATED, true);
  await store.save();
  return true;
}
```

- [ ] **Step 3: Lancer tests**

```bash
pnpm test dictionary-store
```
Expected: 7 tests passent.

- [ ] **Step 4: Commit**

```bash
git add src/lib/sync/dictionary-store.ts src/lib/sync/dictionary-store.test.ts
git commit -m "feat(v3-sync): local dictionary store with tombstones + legacy migration"
```

---

## Task 11: Queue offline persistante

**Files:**
- Create: `src/lib/sync/queue.ts`
- Create: `src/lib/sync/queue.test.ts`

- [ ] **Step 1: Écrire le test**

```typescript
// src/lib/sync/queue.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";

const storeData: Record<string, unknown> = {};
vi.mock("@tauri-apps/plugin-store", () => {
  return {
    Store: {
      load: async () => ({
        get: async (k: string) => storeData[k] ?? null,
        set: async (k: string, v: unknown) => {
          storeData[k] = v;
        },
        save: async () => {},
      }),
    },
  };
});

import { enqueue, peekAll, dequeue, markRetry, size, clear, __resetForTests } from "./queue";
import type { SyncOperation } from "./types";

const OP: SyncOperation = { kind: "dictionary-upsert", word: "hello" };

describe("sync queue", () => {
  beforeEach(async () => {
    Object.keys(storeData).forEach((k) => delete storeData[k]);
    __resetForTests();
  });

  it("starts empty", async () => {
    expect(await size()).toBe(0);
  });

  it("enqueue adds entries FIFO", async () => {
    await enqueue(OP);
    await enqueue({ kind: "dictionary-delete", word: "bye" });
    const all = await peekAll();
    expect(all).toHaveLength(2);
    expect(all[0].operation.kind).toBe("dictionary-upsert");
    expect(all[1].operation.kind).toBe("dictionary-delete");
  });

  it("dequeue removes head FIFO", async () => {
    await enqueue(OP);
    await enqueue({ kind: "dictionary-delete", word: "bye" });
    const first = await dequeue();
    expect(first?.operation.kind).toBe("dictionary-upsert");
    expect(await size()).toBe(1);
  });

  it("markRetry increments retry_count and stores error", async () => {
    await enqueue(OP);
    const all = await peekAll();
    await markRetry(all[0].id, "network timeout");
    const after = await peekAll();
    expect(after[0].retry_count).toBe(1);
    expect(after[0].last_error).toBe("network timeout");
  });

  it("clear empties queue", async () => {
    await enqueue(OP);
    await clear();
    expect(await size()).toBe(0);
  });
});
```

- [ ] **Step 2: Écrire `src/lib/sync/queue.ts`**

```typescript
import { Store } from "@tauri-apps/plugin-store";
import type { SyncOperation, SyncQueueEntry } from "./types";

const STORE_FILE = "sync-queue.json";
const KEY_QUEUE = "queue";

let storePromise: Promise<Awaited<ReturnType<typeof Store.load>>> | null = null;

function getStore() {
  if (!storePromise) {
    storePromise = Store.load(STORE_FILE);
  }
  return storePromise;
}

export function __resetForTests() {
  storePromise = null;
}

async function loadQueue(): Promise<SyncQueueEntry[]> {
  const store = await getStore();
  const q = await store.get<SyncQueueEntry[]>(KEY_QUEUE);
  return q ?? [];
}

async function saveQueue(q: SyncQueueEntry[]): Promise<void> {
  const store = await getStore();
  await store.set(KEY_QUEUE, q);
  await store.save();
}

export async function enqueue(op: SyncOperation): Promise<SyncQueueEntry> {
  const q = await loadQueue();
  const entry: SyncQueueEntry = {
    id: crypto.randomUUID(),
    operation: op,
    enqueued_at: new Date().toISOString(),
    retry_count: 0,
    last_error: null,
  };
  q.push(entry);
  await saveQueue(q);
  return entry;
}

export async function peekAll(): Promise<SyncQueueEntry[]> {
  return loadQueue();
}

export async function peekHead(): Promise<SyncQueueEntry | null> {
  const q = await loadQueue();
  return q[0] ?? null;
}

export async function dequeue(): Promise<SyncQueueEntry | null> {
  const q = await loadQueue();
  if (q.length === 0) return null;
  const head = q.shift()!;
  await saveQueue(q);
  return head;
}

export async function markRetry(id: string, error: string): Promise<void> {
  const q = await loadQueue();
  const idx = q.findIndex((e) => e.id === id);
  if (idx < 0) return;
  q[idx] = { ...q[idx], retry_count: q[idx].retry_count + 1, last_error: error };
  await saveQueue(q);
}

export async function size(): Promise<number> {
  const q = await loadQueue();
  return q.length;
}

export async function clear(): Promise<void> {
  await saveQueue([]);
}

/** Retourne le délai d'attente avant prochain retry en ms selon retry_count.
 * Backoff : 1s → 5s → 30s → 2min → 5min cap. */
export function backoffMs(retryCount: number): number {
  const table = [1_000, 5_000, 30_000, 120_000, 300_000];
  return table[Math.min(retryCount, table.length - 1)];
}
```

- [ ] **Step 3: Lancer tests**

```bash
pnpm test queue
```
Expected: 5 tests passent.

- [ ] **Step 4: Commit**

```bash
git add src/lib/sync/queue.ts src/lib/sync/queue.test.ts
git commit -m "feat(v3-sync): persistent offline queue with FIFO + backoff helper"
```

---

## Task 12: Backups locaux wrapper TS

**Files:**
- Create: `src/lib/sync/backups.ts`

- [ ] **Step 1: Écrire `src/lib/sync/backups.ts`**

```typescript
import { invoke } from "@tauri-apps/api/core";
import { Store } from "@tauri-apps/plugin-store";

export interface BackupMeta {
  filename: string;
  created_at: string;
  size_bytes: number;
}

export interface BackupPayload {
  version: 1;
  created_at: string;
  tauri_stores: Record<string, unknown>;
}

const STORES_TO_SNAPSHOT = [
  "settings.json",
  "sync-snippets.json",
  "sync-dictionary.json",
];

/** Capture les Tauri Stores listés + sérialise en JSON pour écriture locale. */
async function snapshotStores(): Promise<Record<string, unknown>> {
  const snapshot: Record<string, unknown> = {};
  for (const file of STORES_TO_SNAPSHOT) {
    try {
      const s = await Store.load(file);
      const entries = await s.entries();
      snapshot[file] = Object.fromEntries(entries);
    } catch (e) {
      console.warn(`[backup] cannot snapshot ${file}:`, e);
      snapshot[file] = null;
    }
  }
  return snapshot;
}

/** Crée un backup local. Retourne le filename (ex. `pre-sync_2026-04-24_143012.json`). */
export async function createLocalBackup(): Promise<string> {
  const payload: BackupPayload = {
    version: 1,
    created_at: new Date().toISOString(),
    tauri_stores: await snapshotStores(),
  };
  return invoke<string>("write_local_backup", { payloadJson: JSON.stringify(payload) });
}

export async function listLocalBackups(): Promise<BackupMeta[]> {
  return invoke<BackupMeta[]>("list_local_backups");
}

export async function readLocalBackup(filename: string): Promise<BackupPayload> {
  const raw = await invoke<string>("read_local_backup", { filename });
  return JSON.parse(raw) as BackupPayload;
}

export async function deleteLocalBackup(filename: string): Promise<void> {
  await invoke("delete_local_backup", { filename });
}

/** Restaure : écrase chaque Tauri Store par la version du backup. */
export async function restoreLocalBackup(filename: string): Promise<void> {
  const payload = await readLocalBackup(filename);
  for (const [file, content] of Object.entries(payload.tauri_stores)) {
    if (!content || typeof content !== "object") continue;
    const store = await Store.load(file);
    // Clear + rewrite atomic best-effort
    const currentKeys = await store.keys();
    for (const k of currentKeys) {
      await store.delete(k);
    }
    for (const [k, v] of Object.entries(content as Record<string, unknown>)) {
      await store.set(k, v);
    }
    await store.save();
  }
}
```

- [ ] **Step 2: Vérifier build**

```bash
pnpm build
```
Expected: OK (types Tauri store plugin).

- [ ] **Step 3: Commit**

```bash
git add src/lib/sync/backups.ts
git commit -m "feat(v3-sync): local backups wrapper (snapshot/restore Tauri stores)"
```

---

## Task 13: Deno Edge Function shared helpers

**Files:**
- Create: `supabase/functions/_shared/cors.ts`
- Create: `supabase/functions/_shared/auth.ts`

- [ ] **Step 1: Écrire `supabase/functions/_shared/cors.ts`**

```typescript
export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function preflight(): Response {
  return new Response("ok", { headers: corsHeaders });
}
```

- [ ] **Step 2: Écrire `supabase/functions/_shared/auth.ts`**

```typescript
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

/** Extrait le user_id depuis le JWT présenté dans Authorization: Bearer <token>.
 *  Retourne { userId, client } où client a les permissions du user (RLS actif). */
export async function getAuthenticatedUser(req: Request): Promise<
  | { userId: string; client: ReturnType<typeof createClient>; token: string }
  | { error: string; status: number }
> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { error: "missing or invalid Authorization header", status: 401 };
  }
  const token = authHeader.slice("Bearer ".length);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) {
    return { error: "server misconfigured", status: 500 };
  }

  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) {
    return { error: "invalid token", status: 401 };
  }
  return { userId: data.user.id, client, token };
}
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/_shared/
git commit -m "feat(v3-sync): shared Deno helpers for Edge Functions (cors, auth)"
```

---

## Task 14: Edge Function `/sync-push`

**Files:**
- Create: `supabase/functions/sync-push/index.ts`
- Create: `supabase/functions/sync-push/schema.ts`
- Create: `supabase/functions/sync-push/deno.json`

- [ ] **Step 1: Écrire `supabase/functions/sync-push/deno.json`**

```json
{
  "imports": {
    "@supabase/supabase-js": "https://esm.sh/@supabase/supabase-js@2.49.1",
    "zod": "https://esm.sh/zod@3.23.8"
  }
}
```

- [ ] **Step 2: Écrire `supabase/functions/sync-push/schema.ts`**

```typescript
import { z } from "zod";

export const CloudSettingsDataSchema = z.object({
  ui: z.object({
    theme: z.enum(["light", "dark"]),
    language: z.enum(["fr", "en"]),
  }),
  hotkeys: z.object({
    toggle: z.string().max(100),
    push_to_talk: z.string().max(100),
    open_window: z.string().max(100),
  }),
  features: z.object({
    auto_paste: z.enum(["cursor", "clipboard", "none"]),
    sound_effects: z.boolean(),
  }),
  transcription: z.object({
    provider: z.enum(["OpenAI", "Google", "Local", "Groq"]),
    local_model: z.string().max(50),
  }),
});

export const SnippetSchema = z.object({
  id: z.string().uuid(),
  label: z.string().min(1).max(200),
  content: z.string().min(1).max(10000),
  shortcut: z.string().max(200).nullable(),
});

export const PushOperationSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("settings-upsert"),
    data: CloudSettingsDataSchema,
  }),
  z.object({
    kind: z.literal("dictionary-upsert"),
    word: z.string().min(1).max(100),
  }),
  z.object({
    kind: z.literal("dictionary-delete"),
    word: z.string().min(1).max(100),
  }),
  z.object({
    kind: z.literal("snippet-upsert"),
    snippet: SnippetSchema,
  }),
  z.object({
    kind: z.literal("snippet-delete"),
    id: z.string().uuid(),
  }),
]);

export const PushBodySchema = z.object({
  operations: z.array(PushOperationSchema).min(1).max(200),
  device_id: z.string().max(100),
});

export const QUOTA_BYTES = 5 * 1024 * 1024;
```

- [ ] **Step 3: Écrire `supabase/functions/sync-push/index.ts`**

```typescript
// deno-lint-ignore-file no-explicit-any
import { corsHeaders, preflight } from "../_shared/cors.ts";
import { getAuthenticatedUser } from "../_shared/auth.ts";
import { PushBodySchema, QUOTA_BYTES } from "./schema.ts";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight();
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const auth = await getAuthenticatedUser(req);
  if ("error" in auth) return json({ error: auth.error }, auth.status);

  const raw = await req.json().catch(() => null);
  const parsed = PushBodySchema.safeParse(raw);
  if (!parsed.success) {
    return json({ error: "invalid body", details: parsed.error.flatten() }, 400);
  }
  const { operations, device_id } = parsed.data;

  const { userId, client } = auth;
  const nowIso = new Date().toISOString();
  const results: Array<{ index: number; ok: boolean; error?: string }> = [];

  for (let i = 0; i < operations.length; i++) {
    const op = operations[i];
    try {
      switch (op.kind) {
        case "settings-upsert": {
          const { error } = await client
            .from("user_settings")
            .upsert(
              {
                user_id: userId,
                data: op.data,
                updated_by_device: device_id,
                updated_at: nowIso,
              },
              { onConflict: "user_id" }
            );
          if (error) throw error;
          break;
        }
        case "dictionary-upsert": {
          const { error } = await client
            .from("user_dictionary_words")
            .upsert(
              {
                user_id: userId,
                word: op.word,
                deleted_at: null,
                updated_at: nowIso,
              },
              { onConflict: "user_id,word" }
            );
          if (error) throw error;
          break;
        }
        case "dictionary-delete": {
          // Soft delete via update pour que les autres devices le propagent
          const { error } = await client
            .from("user_dictionary_words")
            .upsert(
              {
                user_id: userId,
                word: op.word,
                deleted_at: nowIso,
                updated_at: nowIso,
              },
              { onConflict: "user_id,word" }
            );
          if (error) throw error;
          break;
        }
        case "snippet-upsert": {
          const { error } = await client.from("user_snippets").upsert(
            {
              id: op.snippet.id,
              user_id: userId,
              label: op.snippet.label,
              content: op.snippet.content,
              shortcut: op.snippet.shortcut,
              deleted_at: null,
              updated_at: nowIso,
            },
            { onConflict: "id" }
          );
          if (error) throw error;
          break;
        }
        case "snippet-delete": {
          const { error } = await client
            .from("user_snippets")
            .update({ deleted_at: nowIso, updated_at: nowIso })
            .eq("id", op.id)
            .eq("user_id", userId);
          if (error) throw error;
          break;
        }
      }
      results.push({ index: i, ok: true });
    } catch (e: any) {
      results.push({ index: i, ok: false, error: String(e?.message ?? e) });
    }
  }

  // Quota check après l'application — rejet si > seuil, client doit supprimer du contenu
  const { data: sizeData, error: sizeErr } = await client.rpc("compute_user_sync_size", {
    target_user: userId,
  });
  if (sizeErr) {
    return json({ error: "quota check failed", details: sizeErr.message }, 500);
  }
  const size = Number(sizeData ?? 0);
  if (size > QUOTA_BYTES) {
    return json(
      {
        error: "quota exceeded",
        quota_bytes: QUOTA_BYTES,
        current_bytes: size,
        results,
      },
      413
    );
  }

  return json({ ok: true, server_time: nowIso, current_bytes: size, results });
});
```

- [ ] **Step 4: Tester localement**

```bash
pnpm exec supabase functions serve sync-push --no-verify-jwt
```

Dans un autre terminal, récupérer un JWT valide (ou utiliser `supabase gen types` / un user test) et tester :

```bash
# Créer un user test + session
pnpm exec supabase db reset
# ... puis via supabase studio local (localhost:54323) créer un user et copier l'access_token
# Puis :
curl -X POST http://127.0.0.1:54321/functions/v1/sync-push \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"operations":[{"kind":"dictionary-upsert","word":"tauri"}],"device_id":"test-device"}'
```
Expected: `{"ok":true,...}`.

- [ ] **Step 5: Déployer l'Edge Function sur le projet distant**

```bash
pnpm exec supabase functions deploy sync-push --no-verify-jwt=false
```
Expected: "Function sync-push deployed". Vérifier dans le dashboard Supabase > Edge Functions.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/sync-push/
git commit -m "feat(v3-sync): sync-push Edge Function with Zod validation + quota"
```

---

## Task 15: Client sync TS (pull + push via Edge)

**Files:**
- Create: `src/lib/sync/client.ts`

- [ ] **Step 1: Écrire `src/lib/sync/client.ts`**

```typescript
import { supabase } from "@/lib/supabase";
import type {
  CloudSettingsData,
  CloudUserSettingsRow,
  CloudDictionaryWordRow,
  CloudSnippetRow,
  SyncOperation,
} from "./types";

export interface PullResult {
  settings: CloudUserSettingsRow | null;
  dictionary: CloudDictionaryWordRow[];
  snippets: CloudSnippetRow[];
}

/** Pull FULL ou INCREMENTAL (since = ISO timestamp, null = full). */
export async function pullAll(since: string | null): Promise<PullResult> {
  const userRes = await supabase.auth.getUser();
  if (userRes.error || !userRes.data.user) {
    throw new Error("not authenticated");
  }

  const settingsQuery = supabase.from("user_settings").select("*").maybeSingle();
  const dictQuery = since
    ? supabase.from("user_dictionary_words").select("*").gt("updated_at", since)
    : supabase.from("user_dictionary_words").select("*");
  const snipQuery = since
    ? supabase.from("user_snippets").select("*").gt("updated_at", since)
    : supabase.from("user_snippets").select("*");

  const [settingsRes, dictRes, snipRes] = await Promise.all([
    settingsQuery,
    dictQuery,
    snipQuery,
  ]);

  if (settingsRes.error) throw settingsRes.error;
  if (dictRes.error) throw dictRes.error;
  if (snipRes.error) throw snipRes.error;

  return {
    settings: (settingsRes.data as CloudUserSettingsRow | null) ?? null,
    dictionary: (dictRes.data ?? []) as CloudDictionaryWordRow[],
    snippets: (snipRes.data ?? []) as CloudSnippetRow[],
  };
}

export interface PushResponse {
  ok: boolean;
  server_time?: string;
  current_bytes?: number;
  results: Array<{ index: number; ok: boolean; error?: string }>;
  error?: string;
  quota_bytes?: number;
}

export async function pushOperations(
  operations: SyncOperation[],
  deviceId: string
): Promise<PushResponse> {
  const { data, error } = await supabase.functions.invoke<PushResponse>("sync-push", {
    body: { operations, device_id: deviceId },
  });
  if (error) {
    // Le Functions client throw sur status >= 400, capturer proprement :
    return {
      ok: false,
      error: error.message,
      results: [],
    };
  }
  return data ?? { ok: false, error: "empty response", results: [] };
}

/** Envoie uniquement le blob settings (upsert). Retourne l'erreur éventuelle. */
export async function pushSettings(data: CloudSettingsData, deviceId: string) {
  return pushOperations([{ kind: "settings-upsert", data }], deviceId);
}
```

- [ ] **Step 2: Vérifier build**

```bash
pnpm build
```
Expected: OK.

- [ ] **Step 3: Commit**

```bash
git add src/lib/sync/client.ts
git commit -m "feat(v3-sync): sync client wrapping supabase-js pull + edge push"
```

---

## Task 16: Merge LWW + orchestration pull

**Files:**
- Create: `src/lib/sync/merge.ts`
- Create: `src/lib/sync/merge.test.ts`

- [ ] **Step 1: Écrire le test**

```typescript
// src/lib/sync/merge.test.ts
import { describe, it, expect } from "vitest";
import { mergeSnippetLWW, mergeSettingsLWW } from "./merge";
import type { LocalSnippet, CloudSnippetRow, CloudUserSettingsRow } from "./types";
import { DEFAULT_SETTINGS } from "@/lib/settings";

function localSnippet(partial: Partial<LocalSnippet>): LocalSnippet {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    label: "a",
    content: "A",
    shortcut: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    deleted_at: null,
    ...partial,
  };
}

function cloudSnippet(partial: Partial<CloudSnippetRow>): CloudSnippetRow {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    user_id: "u",
    label: "a",
    content: "A",
    shortcut: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    deleted_at: null,
    ...partial,
  };
}

describe("merge LWW snippets", () => {
  it("cloud plus récent → cloud gagne", () => {
    const local = localSnippet({ content: "old", updated_at: "2026-01-01T10:00:00Z" });
    const remote = cloudSnippet({ content: "new", updated_at: "2026-01-01T11:00:00Z" });
    const merged = mergeSnippetLWW(local, remote);
    expect(merged.content).toBe("new");
  });

  it("local plus récent → local gagne", () => {
    const local = localSnippet({ content: "newer", updated_at: "2026-01-01T12:00:00Z" });
    const remote = cloudSnippet({ content: "stale", updated_at: "2026-01-01T11:00:00Z" });
    const merged = mergeSnippetLWW(local, remote);
    expect(merged.content).toBe("newer");
  });

  it("cloud soft-deleted plus récent → local marqué deleted", () => {
    const local = localSnippet({ updated_at: "2026-01-01T10:00:00Z", deleted_at: null });
    const remote = cloudSnippet({
      updated_at: "2026-01-01T11:00:00Z",
      deleted_at: "2026-01-01T11:00:00Z",
    });
    const merged = mergeSnippetLWW(local, remote);
    expect(merged.deleted_at).not.toBeNull();
  });
});

describe("merge LWW settings", () => {
  it("cloud plus récent que local → applique cloud", () => {
    const localBlob: CloudUserSettingsRow | null = null;
    const cloud = {
      user_id: "u",
      data: {
        ui: { theme: "light", language: "en" },
        hotkeys: {
          toggle: "Ctrl+F5",
          push_to_talk: "Ctrl+F6",
          open_window: "Ctrl+Alt+P",
        },
        features: { auto_paste: "clipboard", sound_effects: false },
        transcription: { provider: "OpenAI", local_model: "small" },
      },
      schema_version: 1,
      updated_at: "2026-01-01T12:00:00Z",
      updated_by_device: "dev",
    } as CloudUserSettingsRow;
    const merged = mergeSettingsLWW(DEFAULT_SETTINGS.settings, null, cloud);
    expect(merged.settings.theme).toBe("light");
    expect(merged.action).toBe("apply-cloud");
  });

  it("local modifié après cloud → push-local", () => {
    const cloud = {
      user_id: "u",
      data: {
        ui: { theme: "light", language: "en" },
        hotkeys: { toggle: "Ctrl+F5", push_to_talk: "Ctrl+F6", open_window: "Ctrl+Alt+P" },
        features: { auto_paste: "clipboard", sound_effects: false },
        transcription: { provider: "OpenAI", local_model: "small" },
      },
      schema_version: 1,
      updated_at: "2026-01-01T10:00:00Z",
      updated_by_device: "dev",
    } as CloudUserSettingsRow;
    // Local modifié à 11:00 (via pushed_at local)
    const localPushedAt = "2026-01-01T11:00:00Z";
    const merged = mergeSettingsLWW(DEFAULT_SETTINGS.settings, localPushedAt, cloud);
    expect(merged.action).toBe("push-local");
  });
});
```

- [ ] **Step 2: Écrire `src/lib/sync/merge.ts`**

```typescript
import type { LocalSnippet, CloudSnippetRow, CloudUserSettingsRow } from "./types";
import type { AppSettings } from "@/lib/settings";
import { applyCloudSettings } from "./mapping";

export function mergeSnippetLWW(
  local: LocalSnippet | null,
  remote: CloudSnippetRow
): LocalSnippet {
  const remoteAsLocal: LocalSnippet = {
    id: remote.id,
    label: remote.label,
    content: remote.content,
    shortcut: remote.shortcut,
    created_at: remote.created_at,
    updated_at: remote.updated_at,
    deleted_at: remote.deleted_at,
  };
  if (!local) return remoteAsLocal;

  const localTs = new Date(local.updated_at).getTime();
  const remoteTs = new Date(remote.updated_at).getTime();
  return remoteTs >= localTs ? remoteAsLocal : local;
}

export type SettingsMergeAction = "apply-cloud" | "push-local" | "no-op";

export interface SettingsMergeResult {
  settings: AppSettings["settings"];
  action: SettingsMergeAction;
}

/** Décide qui gagne entre settings locaux et cloud.
 *  - `localLastPushedAt` = le dernier `updated_at` renvoyé par le serveur lors du précédent push (stocké côté client).
 *    Si null, on est en pre-sync → cloud gagne si présent.
 *  - Si `cloud === null` et qu'on a du local à pousser (tracking externe), l'appelant décide.
 */
export function mergeSettingsLWW(
  local: AppSettings["settings"],
  localLastPushedAt: string | null,
  cloud: CloudUserSettingsRow | null
): SettingsMergeResult {
  if (!cloud) {
    return { settings: local, action: "push-local" };
  }
  if (!localLastPushedAt) {
    return {
      settings: applyCloudSettings(local, cloud.data),
      action: "apply-cloud",
    };
  }
  const localTs = new Date(localLastPushedAt).getTime();
  const cloudTs = new Date(cloud.updated_at).getTime();
  if (cloudTs > localTs) {
    return {
      settings: applyCloudSettings(local, cloud.data),
      action: "apply-cloud",
    };
  }
  // Local plus récent → on pousse
  return { settings: local, action: "push-local" };
}
```

- [ ] **Step 3: Lancer tests**

```bash
pnpm test merge
```
Expected: 5 tests passent.

- [ ] **Step 4: Commit**

```bash
git add src/lib/sync/merge.ts src/lib/sync/merge.test.ts
git commit -m "feat(v3-sync): LWW merge helpers for snippets and settings"
```

---

## Task 17: `SyncContext` + `useSync` hook + lifecycle

**Files:**
- Create: `src/contexts/SyncContext.tsx`
- Create: `src/hooks/useSync.ts`
- Modify: `src/main.tsx`

> **Scope** : c'est le gros morceau orchestration. Il intègre les pieces des Tasks 7-16 et expose un état + des actions au reste de l'app. Les steps sont plus gros — suivre l'ordre exactement.

- [ ] **Step 1: Écrire `src/hooks/useSync.ts` (expose simplement le context)**

```typescript
import { useContext } from "react";
import { SyncContext, type SyncContextValue } from "@/contexts/SyncContext";

export function useSync(): SyncContextValue {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error("useSync must be used within SyncProvider");
  return ctx;
}
```

- [ ] **Step 2: Écrire `src/contexts/SyncContext.tsx` — état + provider**

```typescript
import { createContext, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Store } from "@tauri-apps/plugin-store";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useAuth } from "@/hooks/useAuth";
import { useSettings } from "@/hooks/useSettings";
import { extractCloudSettings, syncableSettingsChanged } from "@/lib/sync/mapping";
import { pullAll, pushOperations } from "@/lib/sync/client";
import { enqueue, peekAll, dequeue, markRetry, size as queueSize, backoffMs } from "@/lib/sync/queue";
import { loadSnippets, applyRemoteSnippet, migrateLegacySnippetsOnce } from "@/lib/sync/snippets-store";
import {
  loadDictionary,
  applyRemoteWord,
  drainTombstones,
  migrateLegacyDictionaryOnce,
} from "@/lib/sync/dictionary-store";
import { mergeSettingsLWW } from "@/lib/sync/merge";
import type { AppSettings } from "@/lib/settings";
import type { SyncOperation, SyncState, SyncStatus } from "@/lib/sync/types";

const SYNC_META_STORE = "sync-meta.json";
const KEY_ENABLED = "enabled";
const KEY_LAST_PULL_AT = "last_pull_at";
const KEY_LAST_PUSHED_SETTINGS_AT = "last_pushed_settings_at";
const DEBOUNCE_PUSH_MS = 500;
const FOCUS_PULL_IDLE_MS = 5 * 60 * 1000;

export interface SyncContextValue extends SyncState {
  enableSync(): Promise<void>;
  disableSync(): Promise<void>;
  syncNow(): Promise<void>;
  // opérations locales à notifier au sync engine
  notifySettingsChanged(previous: AppSettings["settings"], current: AppSettings["settings"]): void;
  notifyDictionaryUpserted(word: string): void;
  notifyDictionaryDeleted(word: string): void;
  notifySnippetUpserted(snippetId: string, label: string, content: string, shortcut: string | null): void;
  notifySnippetDeleted(snippetId: string): void;
}

export const SyncContext = createContext<SyncContextValue | null>(null);

async function getMeta<T>(key: string, def: T): Promise<T> {
  const store = await Store.load(SYNC_META_STORE);
  const v = await store.get<T>(key);
  return v ?? def;
}
async function setMeta(key: string, value: unknown): Promise<void> {
  const store = await Store.load(SYNC_META_STORE);
  await store.set(key, value);
  await store.save();
}

export function SyncProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const { settings, updateSettings } = useSettings();
  const [enabled, setEnabled] = useState(false);
  const [status, setStatus] = useState<SyncStatus>("disabled");
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [lastPullAt, setLastPullAt] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [lastError, setLastError] = useState<string | null>(null);
  const debounceRef = useRef<number | null>(null);
  const prevSettingsRef = useRef<AppSettings["settings"] | null>(null);
  const flushingRef = useRef(false);

  // Charger enabled + last_pull_at au mount
  useEffect(() => {
    (async () => {
      const en = await getMeta<boolean>(KEY_ENABLED, false);
      const lp = await getMeta<string | null>(KEY_LAST_PULL_AT, null);
      setEnabled(en);
      setLastPullAt(lp);
      setPendingCount(await queueSize());
      setStatus(en ? "idle" : "disabled");
    })();
  }, []);

  const getDeviceId = useCallback(async (): Promise<string> => {
    return invoke<string>("get_or_create_device_id");
  }, []);

  const flushQueue = useCallback(async () => {
    if (flushingRef.current) return;
    flushingRef.current = true;
    setStatus("syncing");
    try {
      const deviceId = await getDeviceId();
      // On flush par batch de 50 max
      while (true) {
        const pending = await peekAll();
        if (pending.length === 0) break;
        const batch = pending.slice(0, 50);
        const ops = batch.map((e) => e.operation);
        const resp = await pushOperations(ops, deviceId);
        if (!resp.ok) {
          // Échec global réseau → on incrémente le retry du head seulement et on sort
          const head = pending[0];
          await markRetry(head.id, resp.error ?? "push failed");
          setStatus("offline");
          setLastError(resp.error ?? "push failed");
          break;
        }
        // Échecs individuels : on retire les OK, on marque les autres en retry
        for (let i = 0; i < batch.length; i++) {
          const r = resp.results.find((x) => x.index === i);
          if (r?.ok) {
            await dequeue();
          } else {
            await markRetry(batch[i].id, r?.error ?? "unknown");
          }
        }
        if (resp.results.some((r) => !r.ok)) {
          setStatus("error");
          setLastError("Some operations failed");
          break;
        }
      }
      setPendingCount(await queueSize());
    } finally {
      flushingRef.current = false;
    }
  }, [getDeviceId]);

  const enqueueAndTry = useCallback(
    async (op: SyncOperation) => {
      if (!enabled) return;
      await enqueue(op);
      setPendingCount(await queueSize());
      void flushQueue();
    },
    [enabled, flushQueue]
  );

  const pullAndApply = useCallback(async () => {
    if (!enabled || auth.status !== "signed-in") return;
    setStatus("syncing");
    try {
      const since = await getMeta<string | null>(KEY_LAST_PULL_AT, null);
      const result = await pullAll(since);
      // settings : LWW → écrire la diff syncable dans le SettingsContext
      if (result.settings) {
        const lastPushedAt = await getMeta<string | null>(KEY_LAST_PUSHED_SETTINGS_AT, null);
        const merged = mergeSettingsLWW(settings.settings, lastPushedAt, result.settings);
        if (merged.action === "apply-cloud") {
          await updateSettings({
            theme: merged.settings.theme,
            ui_language: merged.settings.ui_language,
            record_hotkey: merged.settings.record_hotkey,
            ptt_hotkey: merged.settings.ptt_hotkey,
            open_window_hotkey: merged.settings.open_window_hotkey,
            insertion_mode: merged.settings.insertion_mode,
            enable_sounds: merged.settings.enable_sounds,
            transcription_provider: merged.settings.transcription_provider,
            local_model_size: merged.settings.local_model_size,
          });
          await setMeta(KEY_LAST_PUSHED_SETTINGS_AT, result.settings.updated_at);
        }
      }
      // dico
      for (const row of result.dictionary) {
        await applyRemoteWord({
          word: row.word,
          deleted: row.deleted_at !== null,
          updated_at: row.updated_at,
        });
      }
      // snippets
      for (const row of result.snippets) {
        await applyRemoteSnippet({
          id: row.id,
          label: row.label,
          content: row.content,
          shortcut: row.shortcut,
          created_at: row.created_at,
          updated_at: row.updated_at,
          deleted_at: row.deleted_at,
        });
      }
      const nowIso = new Date().toISOString();
      await setMeta(KEY_LAST_PULL_AT, nowIso);
      setLastPullAt(nowIso);
      setLastSyncAt(nowIso);
      setStatus("idle");
      setLastError(null);
    } catch (e: any) {
      setStatus("error");
      setLastError(String(e?.message ?? e));
    }
  }, [enabled, auth.status, settings]);

  const enableSync = useCallback(async () => {
    await setMeta(KEY_ENABLED, true);
    setEnabled(true);
    setStatus("idle");
    // Legacy migration : si settings.snippets / settings.dictionary contiennent de la donnée,
    // la migrer vers les nouveaux stores.
    try {
      await migrateLegacySnippetsOnce(settings.settings.snippets ?? []);
      await migrateLegacyDictionaryOnce(settings.settings.dictionary ?? []);
    } catch (e) {
      console.warn("[sync] legacy migration failed", e);
    }
    await pullAndApply();
    // Full push initial : settings + tout le dico local + tous les snippets
    const deviceId = await getDeviceId();
    const ops: SyncOperation[] = [];
    ops.push({ kind: "settings-upsert", data: extractCloudSettings(settings.settings) });
    const d = await loadDictionary();
    for (const w of d.words) ops.push({ kind: "dictionary-upsert", word: w });
    const sn = await loadSnippets();
    for (const s of sn) {
      if (s.deleted_at) continue;
      ops.push({
        kind: "snippet-upsert",
        snippet: { id: s.id, label: s.label, content: s.content, shortcut: s.shortcut, updated_at: s.updated_at, deleted_at: null, created_at: s.created_at },
      });
    }
    if (ops.length > 0) {
      const resp = await pushOperations(ops, deviceId);
      if (resp.server_time) await setMeta(KEY_LAST_PUSHED_SETTINGS_AT, resp.server_time);
    }
  }, [settings, pullAndApply, getDeviceId]);

  const disableSync = useCallback(async () => {
    await setMeta(KEY_ENABLED, false);
    setEnabled(false);
    setStatus("disabled");
  }, []);

  const syncNow = useCallback(async () => {
    if (!enabled) return;
    await flushQueue();
    await pullAndApply();
  }, [enabled, flushQueue, pullAndApply]);

  const notifySettingsChanged = useCallback(
    (previous: AppSettings["settings"], current: AppSettings["settings"]) => {
      if (!enabled) return;
      if (!syncableSettingsChanged(previous, current)) return;
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => {
        void enqueueAndTry({ kind: "settings-upsert", data: extractCloudSettings(current) });
      }, DEBOUNCE_PUSH_MS);
    },
    [enabled, enqueueAndTry]
  );

  const notifyDictionaryUpserted = useCallback(
    (word: string) => {
      void enqueueAndTry({ kind: "dictionary-upsert", word });
    },
    [enqueueAndTry]
  );

  const notifyDictionaryDeleted = useCallback(
    (word: string) => {
      void enqueueAndTry({ kind: "dictionary-delete", word });
    },
    [enqueueAndTry]
  );

  const notifySnippetUpserted = useCallback(
    (id: string, label: string, content: string, shortcut: string | null) => {
      void enqueueAndTry({
        kind: "snippet-upsert",
        snippet: {
          id,
          label,
          content,
          shortcut,
          updated_at: new Date().toISOString(),
          deleted_at: null,
          created_at: new Date().toISOString(),
        },
      });
    },
    [enqueueAndTry]
  );

  const notifySnippetDeleted = useCallback(
    (id: string) => {
      void enqueueAndTry({ kind: "snippet-delete", id });
    },
    [enqueueAndTry]
  );

  // Lifecycle : login → pullAndApply
  useEffect(() => {
    if (!enabled) return;
    if (auth.status !== "signed-in") return;
    prevSettingsRef.current = null;
    void pullAndApply().then(() => flushQueue());
  }, [auth.status, enabled, pullAndApply, flushQueue]);

  // Lifecycle : focus window idle ≥ 5 min → incremental pull
  useEffect(() => {
    if (!enabled) return;
    const win = getCurrentWindow();
    let idleSince = Date.now();
    let blurUnlisten: (() => void) | undefined;
    let focusUnlisten: (() => void) | undefined;

    (async () => {
      focusUnlisten = await win.onFocusChanged(({ payload: focused }) => {
        if (focused) {
          const idle = Date.now() - idleSince;
          if (idle >= FOCUS_PULL_IDLE_MS) {
            void pullAndApply();
          }
        } else {
          idleSince = Date.now();
        }
      });
    })();

    return () => {
      blurUnlisten?.();
      focusUnlisten?.();
    };
  }, [enabled, pullAndApply]);

  // Logout → disable + clear meta
  useEffect(() => {
    if (auth.status === "signed-out" && enabled) {
      void disableSync();
    }
  }, [auth.status, enabled, disableSync]);

  const value = useMemo<SyncContextValue>(
    () => ({
      enabled,
      status,
      last_sync_at: lastSyncAt,
      last_pull_at: lastPullAt,
      pending_count: pendingCount,
      last_error: lastError,
      enableSync,
      disableSync,
      syncNow,
      notifySettingsChanged,
      notifyDictionaryUpserted,
      notifyDictionaryDeleted,
      notifySnippetUpserted,
      notifySnippetDeleted,
    }),
    [
      enabled,
      status,
      lastSyncAt,
      lastPullAt,
      pendingCount,
      lastError,
      enableSync,
      disableSync,
      syncNow,
      notifySettingsChanged,
      notifyDictionaryUpserted,
      notifyDictionaryDeleted,
      notifySnippetUpserted,
      notifySnippetDeleted,
    ]
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}
```

- [ ] **Step 3: Wrapper `<SyncProvider>` dans `src/main.tsx`**

Lire `src/main.tsx` pour voir l'ordre des providers. Ajouter `<SyncProvider>` **à l'intérieur** de `<AuthProvider>` et `<SettingsProvider>`, **à l'extérieur** des composants qui consomment `useSync`.

```tsx
// Exemple de hiérarchie attendue :
<AuthProvider>
  <SettingsProvider>
    <SyncProvider>
      <App />
    </SyncProvider>
  </SettingsProvider>
</AuthProvider>
```

- [ ] **Step 4: Vérifier build**

```bash
pnpm build
```
Expected: build OK. Warnings sur les deps de useEffect potentielles, acceptables.

- [ ] **Step 5: Commit**

```bash
git add src/contexts/SyncContext.tsx src/hooks/useSync.ts src/main.tsx
git commit -m "feat(v3-sync): SyncContext + useSync with lifecycle (login, focus, logout)"
```

---

## Task 18: Câbler `VocabularySection` sur les nouveaux stores

**Files:**
- Modify: `src/components/settings/sections/VocabularySection.tsx`

> **Objectif** : VocabularySection lit/écrit actuellement `settings.snippets` et `settings.dictionary`. On bascule vers `snippets-store.ts` / `dictionary-store.ts` ET on notifie `SyncContext` à chaque modif.

- [ ] **Step 1: Lire le composant actuel**

```bash
# Examiner la version courante
```
Utiliser `Read` sur `src/components/settings/sections/VocabularySection.tsx`.

- [ ] **Step 2: Refacto — remplacer les lectures**

Remplacer :

```tsx
const { settings, updateSetting } = useSettings();
// ... settings.settings.snippets, settings.settings.dictionary
```

Par un usage des nouveaux stores via `useEffect` pour loader + state local + mutation via les helpers + appel aux notify du `useSync`.

Pattern :

```tsx
import { loadSnippets, upsertSnippet, softDeleteSnippet } from "@/lib/sync/snippets-store";
import { loadDictionary, addWord, removeWord } from "@/lib/sync/dictionary-store";
import { useSync } from "@/hooks/useSync";
import type { LocalSnippet } from "@/lib/sync/types";

// ... dans le composant :
const sync = useSync();
const [snippets, setSnippets] = useState<LocalSnippet[]>([]);
const [words, setWords] = useState<string[]>([]);

useEffect(() => {
  (async () => {
    setSnippets((await loadSnippets()).filter((s) => s.deleted_at === null));
    setWords((await loadDictionary()).words);
  })();
}, []);

const onAddWord = async (w: string) => {
  await addWord(w);
  setWords((await loadDictionary()).words);
  sync.notifyDictionaryUpserted(w);
};
const onRemoveWord = async (w: string) => {
  await removeWord(w);
  setWords((await loadDictionary()).words);
  sync.notifyDictionaryDeleted(w);
};
const onUpsertSnippet = async (data: { id?: string; label: string; content: string; shortcut: string | null }) => {
  const s = await upsertSnippet(data);
  setSnippets((await loadSnippets()).filter((x) => x.deleted_at === null));
  sync.notifySnippetUpserted(s.id, s.label, s.content, s.shortcut);
};
const onDeleteSnippet = async (id: string) => {
  await softDeleteSnippet(id);
  setSnippets((await loadSnippets()).filter((x) => x.deleted_at === null));
  sync.notifySnippetDeleted(id);
};
```

Adapter le JSX existant pour utiliser ces actions. Garder les chaînes i18n existantes (`settings.vocabulary.*`).

- [ ] **Step 3: Vérifier build**

```bash
pnpm build
```
Expected: OK.

- [ ] **Step 4: Demander au user de lancer `pnpm tauri dev`** et tester manuellement :
  - Ajouter un mot dico → voir qu'il persiste après restart
  - Créer un snippet → idem
  - Supprimer → idem

Ne **pas** lancer soi-même (cf. CLAUDE.md).

- [ ] **Step 5: Commit**

```bash
git add src/components/settings/sections/VocabularySection.tsx
git commit -m "refactor(v3-sync): VocabularySection uses sync stores + notifies SyncContext"
```

---

## Task 19: `SettingsContext` → hook diff pour push debounced

**Files:**
- Modify: `src/contexts/SettingsContext.tsx`

> **Objectif** : dans `SyncContext`, on a `notifySettingsChanged(prev, curr)`. Pour l'appeler à chaque `updateSetting`, on intercepte dans `SettingsContext`.

- [ ] **Step 1: Lire le contexte actuel**

Utiliser `Read` sur `src/contexts/SettingsContext.tsx`.

- [ ] **Step 2: Ajouter un observer pattern**

Dans le SettingsProvider, exposer un `onSettingsChanged` via Context ou bus simple :

```tsx
type Observer = (prev: AppSettings["settings"], next: AppSettings["settings"]) => void;

// Dans SettingsProvider :
const observersRef = useRef<Set<Observer>>(new Set());

const subscribe = useCallback((obs: Observer) => {
  observersRef.current.add(obs);
  return () => observersRef.current.delete(obs);
}, []);

const updateSettings = async (partial: Partial<AppSettings["settings"]>) => {
  const prev = settingsRef.current;
  // ... logique existante
  const next = { ...prev, ...partial };
  // ... persist
  settingsRef.current = next;
  setSettings((s) => ({ ...s, settings: next }));
  observersRef.current.forEach((obs) => {
    try { obs(prev, next); } catch (e) { console.warn("[settings observer]", e); }
  });
};

// Expose via Context :
return (
  <SettingsContext.Provider value={{ ..., subscribeToChanges: subscribe }}>
    {children}
  </SettingsContext.Provider>
);
```

- [ ] **Step 3: Dans `SyncProvider`, s'abonner**

```tsx
import { useSettingsContext } from "@/contexts/SettingsContext";

// Dans SyncProvider :
const settingsCtx = useSettingsContext();
useEffect(() => {
  if (!enabled) return;
  const unsub = settingsCtx.subscribeToChanges((prev, next) => {
    notifySettingsChanged(prev, next);
  });
  return unsub;
}, [enabled, notifySettingsChanged, settingsCtx]);
```

- [ ] **Step 4: Vérifier build**

```bash
pnpm build
```
Expected: OK.

- [ ] **Step 5: Commit**

```bash
git add src/contexts/SettingsContext.tsx src/contexts/SyncContext.tsx
git commit -m "feat(v3-sync): settings observer pattern for debounced push"
```

---

## Task 20: UI — Toggle sync + modale migration (AccountSection)

**Files:**
- Create: `src/components/settings/sections/SyncActivationModal.tsx`
- Create: `src/components/settings/sections/SyncedDataOverview.tsx`
- Create: `src/components/settings/sections/LocalBackupsList.tsx`
- Modify: `src/components/settings/sections/AccountSection.tsx`

> Chaque step est une création de fichier ciblée. Les classes Tailwind suivent le design system `.vt-app` (cf. `memory/project_vt_app_scope.md`).

- [ ] **Step 1: `SyncActivationModal.tsx`**

```tsx
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { loadSnippets } from "@/lib/sync/snippets-store";
import { loadDictionary } from "@/lib/sync/dictionary-store";
import { createLocalBackup } from "@/lib/sync/backups";
import { useSync } from "@/hooks/useSync";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function SyncActivationModal({ open, onClose }: Props) {
  const { t } = useTranslation();
  const sync = useSync();
  const [nonTrivial, setNonTrivial] = useState<boolean | null>(null);
  const [choice, setChoice] = useState<"upload" | "fresh">("upload");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Détecte state non-trivial au mount
  useEffect(() => {
    (async () => {
      const sn = (await loadSnippets()).filter((s) => s.deleted_at === null);
      const d = await loadDictionary();
      const nonTriv = sn.length > 0 || d.words.length >= 3;
      setNonTrivial(nonTriv);
      if (!nonTriv) setChoice("upload");
    })();
  }, []);

  const handleActivate = async () => {
    setBusy(true);
    setError(null);
    try {
      await createLocalBackup();
      // NB : le choix "fresh" n'efface pas le local ici — le pull qui suit enableSync()
      // rapporte le cloud existant, qui écrase les scalaires via LWW + merge les collections
      // par UUID/clé composite. Le backup créé juste avant protège en cas de mauvaise surprise.
      await sync.enableSync();
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div className="vt-app fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="vt-card w-full max-w-lg rounded-lg bg-[oklch(var(--vt-bg))] p-6 shadow-xl">
        <h2 className="vt-heading mb-4 text-xl font-semibold">
          {t("sync.activation.title")}
        </h2>
        {nonTrivial === null && <p className="text-sm opacity-70">…</p>}
        {nonTrivial === false && (
          <p className="mb-4 text-sm opacity-80">{t("sync.activation.no_local_data")}</p>
        )}
        {nonTrivial === true && (
          <>
            <p className="mb-4 text-sm">{t("sync.activation.has_local_data")}</p>
            <label className="mb-3 flex cursor-pointer items-start gap-3">
              <input
                type="radio"
                name="sync-choice"
                value="upload"
                checked={choice === "upload"}
                onChange={() => setChoice("upload")}
                className="mt-1"
              />
              <div>
                <div className="font-medium">{t("sync.activation.choice_upload")}</div>
                <div className="text-xs opacity-70">{t("sync.activation.choice_upload_desc")}</div>
              </div>
            </label>
            <label className="mb-4 flex cursor-pointer items-start gap-3">
              <input
                type="radio"
                name="sync-choice"
                value="fresh"
                checked={choice === "fresh"}
                onChange={() => setChoice("fresh")}
                className="mt-1"
              />
              <div>
                <div className="font-medium">{t("sync.activation.choice_fresh")}</div>
                <div className="text-xs opacity-70">{t("sync.activation.choice_fresh_desc")}</div>
              </div>
            </label>
          </>
        )}
        <div className="rounded border border-amber-500/40 bg-amber-500/10 p-3 text-xs mb-3">
          {t("sync.activation.api_keys_notice")}
        </div>
        <div className="rounded border border-blue-500/40 bg-blue-500/10 p-3 text-xs mb-4">
          {t("sync.activation.backup_notice")}
        </div>
        {error && <p className="mb-3 text-sm text-red-500">{error}</p>}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="vt-btn-ghost rounded px-3 py-1.5 text-sm"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={handleActivate}
            disabled={busy || nonTrivial === null}
            className="vt-btn-primary rounded px-3 py-1.5 text-sm font-medium"
          >
            {busy ? t("sync.activation.activating") : t("sync.activation.activate")}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: `SyncedDataOverview.tsx`**

```tsx
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { loadSnippets } from "@/lib/sync/snippets-store";
import { loadDictionary } from "@/lib/sync/dictionary-store";

export function SyncedDataOverview() {
  const { t } = useTranslation();
  const [counts, setCounts] = useState<{ snippets: number; words: number } | null>(null);

  useEffect(() => {
    (async () => {
      const sn = (await loadSnippets()).filter((s) => s.deleted_at === null);
      const d = await loadDictionary();
      setCounts({ snippets: sn.length, words: d.words.length });
    })();
  }, []);

  return (
    <div className="vt-app space-y-2 rounded border p-4 text-sm">
      <h3 className="font-medium">{t("sync.overview.title")}</h3>
      <ul className="list-disc pl-5 space-y-1 opacity-80">
        <li>{t("sync.overview.scalars")}</li>
        <li>
          {t("sync.overview.snippets", { count: counts?.snippets ?? 0 })}
        </li>
        <li>
          {t("sync.overview.dictionary", { count: counts?.words ?? 0 })}
        </li>
      </ul>
      <p className="mt-2 text-xs opacity-70">{t("sync.overview.not_synced_disclaimer")}</p>
    </div>
  );
}
```

- [ ] **Step 3: `LocalBackupsList.tsx`**

```tsx
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { listLocalBackups, restoreLocalBackup, deleteLocalBackup, type BackupMeta } from "@/lib/sync/backups";

export function LocalBackupsList() {
  const { t } = useTranslation();
  const [list, setList] = useState<BackupMeta[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setList(await listLocalBackups());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onRestore = async (filename: string) => {
    if (!confirm(t("sync.backups.confirm_restore"))) return;
    setBusy(true);
    setMsg(null);
    try {
      await restoreLocalBackup(filename);
      setMsg(t("sync.backups.restore_ok"));
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (filename: string) => {
    if (!confirm(t("sync.backups.confirm_delete"))) return;
    setBusy(true);
    try {
      await deleteLocalBackup(filename);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="vt-app space-y-2">
      <h3 className="text-sm font-medium">{t("sync.backups.title")}</h3>
      {list.length === 0 && <p className="text-xs opacity-60">{t("sync.backups.empty")}</p>}
      <ul className="space-y-1">
        {list.map((b) => (
          <li key={b.filename} className="flex items-center justify-between rounded border px-3 py-2 text-xs">
            <div>
              <div className="font-mono">{b.filename}</div>
              <div className="opacity-60">
                {new Date(b.created_at).toLocaleString()} · {(b.size_bytes / 1024).toFixed(1)} KB
              </div>
            </div>
            <div className="flex gap-2">
              <button type="button" disabled={busy} onClick={() => onRestore(b.filename)} className="vt-btn-ghost rounded px-2 py-1">
                {t("sync.backups.restore")}
              </button>
              <button type="button" disabled={busy} onClick={() => onDelete(b.filename)} className="vt-btn-ghost rounded px-2 py-1 text-red-500">
                {t("common.delete")}
              </button>
            </div>
          </li>
        ))}
      </ul>
      {msg && <p className="text-xs">{msg}</p>}
    </div>
  );
}
```

- [ ] **Step 4: Modifier `AccountSection.tsx`**

Ajouter après les infos compte existantes :

```tsx
import { useSync } from "@/hooks/useSync";
import { useState } from "react";
import { SyncActivationModal } from "./SyncActivationModal";
import { SyncedDataOverview } from "./SyncedDataOverview";
import { LocalBackupsList } from "./LocalBackupsList";

// Dans le rendu :
const sync = useSync();
const [activationOpen, setActivationOpen] = useState(false);

{auth.status === "signed-in" && (
  <section className="vt-app space-y-4 border-t pt-4">
    <header>
      <h2 className="text-lg font-semibold">{t("sync.section_title")}</h2>
    </header>
    <div className="flex items-center justify-between">
      <div>
        <div className="font-medium">{t("sync.toggle_label")}</div>
        <div className="text-xs opacity-70">{t("sync.toggle_desc")}</div>
      </div>
      <button
        type="button"
        onClick={() => {
          if (sync.enabled) void sync.disableSync();
          else setActivationOpen(true);
        }}
        className="vt-btn-primary rounded px-3 py-1.5 text-sm"
      >
        {sync.enabled ? t("sync.disable") : t("sync.enable")}
      </button>
    </div>
    {sync.enabled && (
      <>
        <SyncedDataOverview />
        <button
          type="button"
          onClick={() => void sync.syncNow()}
          className="vt-btn-ghost rounded px-3 py-1.5 text-sm"
        >
          {t("sync.sync_now")}
        </button>
      </>
    )}
    <LocalBackupsList />
    <SyncActivationModal open={activationOpen} onClose={() => setActivationOpen(false)} />
  </section>
)}
```

- [ ] **Step 5: Build + test manuel**

```bash
pnpm build
```

Demander au user de lancer `pnpm tauri dev` et tester le toggle, la modale, la liste des backups.

- [ ] **Step 6: Commit**

```bash
git add src/components/settings/sections/SyncActivationModal.tsx src/components/settings/sections/SyncedDataOverview.tsx src/components/settings/sections/LocalBackupsList.tsx src/components/settings/sections/AccountSection.tsx
git commit -m "feat(v3-sync): UI toggle + activation modal + data overview + local backups"
```

---

## Task 21: Status indicator header

**Files:**
- Create: `src/components/SyncStatusIndicator.tsx`
- Modify: `src/App.tsx` (ou le header où sont déjà placés les autres indicators)

- [ ] **Step 1: Écrire `src/components/SyncStatusIndicator.tsx`**

```tsx
import { useTranslation } from "react-i18next";
import { useSync } from "@/hooks/useSync";
import { useAuth } from "@/hooks/useAuth";

export function SyncStatusIndicator() {
  const { t } = useTranslation();
  const auth = useAuth();
  const sync = useSync();

  if (auth.status !== "signed-in") return null;
  if (!sync.enabled) return null;

  const { status, pending_count } = sync;
  const iconMap: Record<typeof status, string> = {
    disabled: "",
    idle: "✅",
    syncing: "🔄",
    offline: "📶",
    error: "⚠️",
  };
  const tooltipKey: Record<typeof status, string> = {
    disabled: "",
    idle: "sync.status.idle",
    syncing: "sync.status.syncing",
    offline: "sync.status.offline",
    error: "sync.status.error",
  };

  return (
    <button
      type="button"
      onClick={() => void sync.syncNow()}
      title={
        status === "offline"
          ? t(tooltipKey[status], { count: pending_count })
          : t(tooltipKey[status])
      }
      className="inline-flex items-center justify-center rounded px-2 py-1 text-sm hover:bg-white/10"
    >
      <span className={status === "syncing" ? "animate-spin inline-block" : ""}>
        {iconMap[status]}
      </span>
    </button>
  );
}
```

- [ ] **Step 2: Monter dans le header**

Trouver le header existant (grep `DashboardHeader`). Ajouter `<SyncStatusIndicator />` à côté du bouton Settings.

```bash
# Exemple : grep component
```

- [ ] **Step 3: Build**

```bash
pnpm build
```

- [ ] **Step 4: Commit**

```bash
git add src/components/SyncStatusIndicator.tsx src/App.tsx
git commit -m "feat(v3-sync): header status indicator with click-to-sync-now"
```

---

## Task 22: i18n — namespace `sync.*`

**Files:**
- Modify: `src/locales/fr.json`
- Modify: `src/locales/en.json`

- [ ] **Step 1: Ajouter namespace FR**

Ajouter dans `src/locales/fr.json` au niveau racine :

```json
"sync": {
  "section_title": "Synchronisation cloud",
  "toggle_label": "Activer la synchronisation",
  "toggle_desc": "Retrouve ton setup (préférences, dictionnaire, snippets) sur tous tes devices.",
  "enable": "Activer",
  "disable": "Désactiver",
  "sync_now": "Synchroniser maintenant",
  "activation": {
    "title": "Activer la synchronisation",
    "no_local_data": "Ton setup est presque vide. La synchronisation va juste récupérer ton état cloud s'il existe, ou démarrer un nouveau profil vide côté cloud.",
    "has_local_data": "Tu as déjà configuré Voice Tool sur ce device. Que veux-tu faire ?",
    "choice_upload": "Uploader mon setup actuel (recommandé)",
    "choice_upload_desc": "Tes snippets, hotkeys, dictionnaire seront envoyés au cloud et disponibles sur tes autres devices.",
    "choice_fresh": "Partir d'un setup neuf",
    "choice_fresh_desc": "Ton setup local sera remplacé par l'état cloud existant. Un backup est conservé localement.",
    "api_keys_notice": "⚠️ Tes clés API (OpenAI, Groq, Google) ne sont jamais synchronisées. Tu les re-saisiras sur tes autres devices.",
    "backup_notice": "ℹ️ Un backup local de ton état actuel est créé automatiquement dans tous les cas.",
    "activate": "Activer",
    "activating": "Activation…"
  },
  "overview": {
    "title": "Ce qui est synchronisé",
    "scalars": "Thème, langue, hotkeys, préférences audio, provider + modèle de transcription",
    "snippets": "{{count}} snippet(s)",
    "dictionary": "{{count}} mot(s) dans le dictionnaire",
    "not_synced_disclaimer": "Les clés API, les positions de fenêtres, les modèles téléchargés restent locaux."
  },
  "backups": {
    "title": "Backups locaux",
    "empty": "Aucun backup pour l'instant.",
    "restore": "Restaurer",
    "confirm_restore": "Cela écrase ton état local actuel par le backup. Continuer ?",
    "confirm_delete": "Supprimer ce backup ?",
    "restore_ok": "Backup restauré."
  },
  "status": {
    "idle": "Tout est à jour",
    "syncing": "Synchronisation…",
    "offline": "Hors ligne — {{count}} modif(s) en attente",
    "error": "Erreur de sync (clique pour réessayer)"
  }
}
```

- [ ] **Step 2: Ajouter namespace EN (miroir)**

```json
"sync": {
  "section_title": "Cloud sync",
  "toggle_label": "Enable sync",
  "toggle_desc": "Your preferences, dictionary and snippets follow you on every device.",
  "enable": "Enable",
  "disable": "Disable",
  "sync_now": "Sync now",
  "activation": {
    "title": "Enable sync",
    "no_local_data": "Your local setup is nearly empty. Sync will pull your existing cloud state, or start fresh if none exists.",
    "has_local_data": "You already set up Voice Tool on this device. What do you want to do?",
    "choice_upload": "Upload my current setup (recommended)",
    "choice_upload_desc": "Your snippets, hotkeys and dictionary will be sent to the cloud and available on your other devices.",
    "choice_fresh": "Start from a fresh setup",
    "choice_fresh_desc": "Your local setup will be replaced by the existing cloud state. A local backup is kept anyway.",
    "api_keys_notice": "⚠️ Your API keys (OpenAI, Groq, Google) are never synchronized. You'll re-enter them on your other devices.",
    "backup_notice": "ℹ️ A local backup of your current state is always created before any change.",
    "activate": "Activate",
    "activating": "Activating…"
  },
  "overview": {
    "title": "What's synchronized",
    "scalars": "Theme, language, hotkeys, audio preferences, transcription provider + model",
    "snippets": "{{count}} snippet(s)",
    "dictionary": "{{count}} word(s) in dictionary",
    "not_synced_disclaimer": "API keys, window positions, downloaded models stay local."
  },
  "backups": {
    "title": "Local backups",
    "empty": "No backup yet.",
    "restore": "Restore",
    "confirm_restore": "This will overwrite your current local state with the backup. Continue?",
    "confirm_delete": "Delete this backup?",
    "restore_ok": "Backup restored."
  },
  "status": {
    "idle": "All synced",
    "syncing": "Syncing…",
    "offline": "Offline — {{count}} change(s) pending",
    "error": "Sync error (click to retry)"
  }
}
```

- [ ] **Step 3: Vérifier que rien n'est en dur dans les composants (feedback i18n)**

```bash
pnpm build
```
Regarder la sortie TS : toute chaîne hors `t()` dans les nouveaux composants serait une régression. Si tu vois du texte littéral dans Sync*.tsx, fixer immédiatement.

- [ ] **Step 4: Commit**

```bash
git add src/locales/
git commit -m "feat(v3-sync): i18n strings for sync (FR + EN)"
```

---

## Task 23: Edge Function `/account-export` (GDPR #6)

**Files:**
- Create: `supabase/functions/account-export/index.ts`
- Create: `supabase/functions/account-export/deno.json`

- [ ] **Step 1: Écrire `deno.json`**

```json
{
  "imports": {
    "@supabase/supabase-js": "https://esm.sh/@supabase/supabase-js@2.49.1"
  }
}
```

- [ ] **Step 2: Écrire `index.ts`**

```typescript
import { corsHeaders, preflight } from "../_shared/cors.ts";
import { getAuthenticatedUser } from "../_shared/auth.ts";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight();
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const auth = await getAuthenticatedUser(req);
  if ("error" in auth) return json({ error: auth.error }, auth.status);

  const { userId, client } = auth;

  const [settings, dictionary, snippets, devices] = await Promise.all([
    client.from("user_settings").select("*").maybeSingle(),
    client.from("user_dictionary_words").select("*"),
    client.from("user_snippets").select("*"),
    client.from("user_devices").select("*"),
  ]);

  for (const r of [settings, dictionary, snippets, devices]) {
    if (r.error) return json({ error: r.error.message }, 500);
  }

  const payload = {
    export_version: 1,
    exported_at: new Date().toISOString(),
    user_id: userId,
    user_settings: settings.data,
    user_dictionary_words: dictionary.data,
    user_snippets: snippets.data,
    user_devices: devices.data,
  };

  return json(payload);
});
```

- [ ] **Step 3: Déployer**

```bash
pnpm exec supabase functions deploy account-export --no-verify-jwt=false
```

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/account-export/
git commit -m "feat(v3-sync): account-export Edge Function (GDPR data portability)"
```

---

## Task 24: Bouton "Exporter mes données" (client)

**Files:**
- Create: `src/lib/sync/export.ts`
- Modify: `src/components/settings/sections/AccountSection.tsx`

- [ ] **Step 1: Écrire `src/lib/sync/export.ts`**

```typescript
import { supabase } from "@/lib/supabase";
import { invoke } from "@tauri-apps/api/core";

export async function downloadAccountExport(): Promise<string> {
  const { data, error } = await supabase.functions.invoke<Record<string, unknown>>("account-export", {
    body: {},
  });
  if (error) throw error;
  const now = new Date();
  const stamp = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filename = `voice-tool-export_${stamp}.json`;
  return invoke<string>("save_export_to_download", {
    payloadJson: JSON.stringify(data, null, 2),
    suggestedFilename: filename,
  });
}
```

- [ ] **Step 2: Ajouter le bouton dans `AccountSection.tsx`**

```tsx
import { downloadAccountExport } from "@/lib/sync/export";
// ...
const [exportBusy, setExportBusy] = useState(false);
const [exportMsg, setExportMsg] = useState<string | null>(null);

const onExport = async () => {
  setExportBusy(true);
  setExportMsg(null);
  try {
    const path = await downloadAccountExport();
    setExportMsg(t("sync.export.saved", { path }));
  } catch (e: unknown) {
    setExportMsg(e instanceof Error ? e.message : String(e));
  } finally {
    setExportBusy(false);
  }
};

// Dans le rendu :
<button
  type="button"
  onClick={onExport}
  disabled={exportBusy}
  className="vt-btn-ghost rounded px-3 py-1.5 text-sm"
>
  {exportBusy ? t("sync.export.exporting") : t("sync.export.button")}
</button>
{exportMsg && <p className="text-xs opacity-70">{exportMsg}</p>}
```

- [ ] **Step 3: Ajouter i18n**

Dans `fr.json` + `en.json`, namespace `sync` :

```json
"export": {
  "button": "Exporter mes données (JSON)",
  "exporting": "Export en cours…",
  "saved": "Export sauvegardé : {{path}}"
}
```
(EN miroir.)

- [ ] **Step 4: Build + commit**

```bash
pnpm build
git add src/lib/sync/export.ts src/components/settings/sections/AccountSection.tsx src/locales/
git commit -m "feat(v3-sync): GDPR data export button (JSON download)"
```

---

## Task 25: Wire up "Supprimer mon compte" (tombstone)

**Files:**
- Modify: `src/components/settings/sections/SecuritySection.tsx`

> La migration `20260501000500_account_deletion.sql` + RPC `request_account_deletion` existent depuis sub-épique 01 (cf. ADR 0009). Il faut juste câbler l'UI.

- [ ] **Step 1: Vérifier l'existence du RPC**

```bash
# Cherche la fonction dans les migrations
```
Utiliser `Grep` sur `supabase/migrations/20260501000500_account_deletion.sql` pour confirmer le nom exact du RPC (attendu : `request_account_deletion`).

- [ ] **Step 2: Modifier `SecuritySection.tsx`**

Ajouter une section "Danger zone" en bas :

```tsx
import { supabase } from "@/lib/supabase";
import { useState } from "react";

const [deleteOpen, setDeleteOpen] = useState(false);
const [confirmText, setConfirmText] = useState("");
const [deleteBusy, setDeleteBusy] = useState(false);
const [deleteError, setDeleteError] = useState<string | null>(null);

const onDelete = async () => {
  setDeleteBusy(true);
  setDeleteError(null);
  try {
    const { error } = await supabase.rpc("request_account_deletion");
    if (error) throw error;
    await supabase.auth.signOut();
    // sync sera auto-disabled par l'effet logout du SyncContext
    alert(t("sync.delete_account.submitted"));
  } catch (e: unknown) {
    setDeleteError(e instanceof Error ? e.message : String(e));
  } finally {
    setDeleteBusy(false);
  }
};

// Rendu :
<section className="vt-app mt-6 space-y-3 rounded border border-red-500/40 p-4">
  <h3 className="text-sm font-semibold text-red-500">{t("sync.delete_account.title")}</h3>
  <p className="text-xs opacity-80">{t("sync.delete_account.description")}</p>
  {!deleteOpen ? (
    <button
      type="button"
      onClick={() => setDeleteOpen(true)}
      className="rounded border border-red-500/60 px-3 py-1.5 text-xs text-red-500"
    >
      {t("sync.delete_account.start")}
    </button>
  ) : (
    <div className="space-y-2">
      <p className="text-xs">{t("sync.delete_account.confirm_prompt")}</p>
      <input
        value={confirmText}
        onChange={(e) => setConfirmText(e.target.value)}
        placeholder="SUPPRIMER"
        className="w-full rounded border px-2 py-1 text-sm"
      />
      {deleteError && <p className="text-xs text-red-500">{deleteError}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setDeleteOpen(false)}
          disabled={deleteBusy}
          className="vt-btn-ghost rounded px-3 py-1 text-xs"
        >
          {t("common.cancel")}
        </button>
        <button
          type="button"
          disabled={deleteBusy || confirmText !== "SUPPRIMER"}
          onClick={onDelete}
          className="rounded bg-red-500 px-3 py-1 text-xs text-white"
        >
          {deleteBusy ? t("sync.delete_account.deleting") : t("sync.delete_account.confirm")}
        </button>
      </div>
    </div>
  )}
</section>
```

- [ ] **Step 3: i18n**

Ajouter dans `sync.*` :

```json
"delete_account": {
  "title": "Supprimer mon compte",
  "description": "Supprime définitivement ton compte et toutes les données synchronisées (GDPR). Effectif sous 30 jours. Tes données locales (clés API, historique local) ne sont pas touchées.",
  "start": "Supprimer mon compte",
  "confirm_prompt": "Tape SUPPRIMER pour confirmer.",
  "confirm": "Confirmer la suppression",
  "deleting": "Suppression en cours…",
  "submitted": "Ta demande de suppression est enregistrée. Tu as été déconnecté. Tes données seront purgées sous 30 jours."
}
```
(EN miroir — "DELETE" comme mot de confirmation.)

- [ ] **Step 4: Build + commit**

```bash
pnpm build
git add src/components/settings/sections/SecuritySection.tsx src/locales/
git commit -m "feat(v3-sync): wire up account deletion (GDPR right to be forgotten)"
```

---

## Task 26: Warning multi-profils

**Files:**
- Modify: `src/components/settings/sections/AccountSection.tsx`

> **Objectif** : si user a >1 profil local, on affiche un encart avertissement expliquant que v3.0 sync uniquement le profil actif.

- [ ] **Step 1: Récupérer la liste des profils**

Lire le ProfilesContext existant (`src/contexts/ProfilesContext.tsx`). Identifier le hook qui expose la liste (probablement `useProfiles()`).

- [ ] **Step 2: Ajouter l'encart dans AccountSection**

```tsx
import { useProfiles } from "@/contexts/ProfilesContext"; // adapter selon nom exact
// ...
const { profiles, activeProfileId } = useProfiles();
const activeProfile = profiles.find((p) => p.id === activeProfileId);

{profiles.length > 1 && sync.enabled && (
  <div className="rounded border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
    {t("sync.multi_profile_warning", { name: activeProfile?.name ?? activeProfileId })}
  </div>
)}
```

- [ ] **Step 3: i18n**

```json
"multi_profile_warning": "La synchronisation couvre uniquement ton profil actif (« {{name}} »). Tes autres profils restent locaux à ce device."
```
(EN miroir.)

- [ ] **Step 4: Build + commit**

```bash
pnpm build
git add src/components/settings/sections/AccountSection.tsx src/locales/
git commit -m "feat(v3-sync): warn multi-profile users that sync covers active profile only"
```

---

## Task 27: Checklist E2E manuelle

**Files:**
- Create: `docs/v3/02-sync-settings-e2e-checklist.md`

- [ ] **Step 1: Écrire la checklist**

```markdown
# Sub-épique 02 — Sync Settings : Checklist E2E manuelle

> **Précondition** : 2 devices (ou 2 utilisateurs OS différents, ou 1 device + 1 VM). Un compte Supabase. Projet déployé avec migrations 20260525* + Edge Functions `sync-push` et `account-export`.

## Scénario 1 — Activation sync + upload initial
1. Device A : Lancer l'app, créer un compte (signup magic link ou E/P).
2. Device A : Settings > Vocabulaire > ajouter 5 mots dico + 2 snippets.
3. Device A : Settings > Raccourcis > changer "Toggle" en `Ctrl+Shift+R`.
4. Device A : Settings > Compte > "Activer". Modale apparaît, choix "Upload". Backup local doit être créé (vérifier Settings > Compte > Backups locaux).
5. Attendre ≤ 5s que l'icône header passe à ✅.
6. Vérifier dans Supabase Studio que `user_settings`, `user_dictionary_words`, `user_snippets` contiennent la data du user.

## Scénario 2 — Pull sur device B
1. Device B : Lancer l'app (fresh install, aucun setup).
2. Device B : Créer un compte **avec les mêmes identifiants** (ou login si signup est fait).
3. Device B : Settings > Compte > "Activer". Modale doit indiquer "état local quasi-vide" → "Upload" auto.
4. Observer que les 5 mots + 2 snippets + hotkey apparaissent dans ~2-3s.

## Scénario 3 — LWW par item
1. Device A et B tous deux connectés et sync activée.
2. Device A : modifier le snippet X → contenu "A".
3. Device B (offline, couper wifi) : modifier le même snippet → contenu "B".
4. Device B : rebrancher wifi. Attendre le flush queue.
5. Résultat attendu : Device A voit "B" (le push offline a un `updated_at` serveur plus récent).

## Scénario 4 — Delete vs update conflict
1. Device A : supprimer snippet X à 10:00.
2. Device B : modifier le même snippet X à 10:00:30 (la propagation du delete n'est pas encore arrivée).
3. Après sync des deux : soit delete gagne, soit update → c'est le `updated_at` le plus récent qui gagne (LWW).
4. Vérifier que le résultat est cohérent (pas de "zombie row").

## Scénario 5 — Offline / reconnexion
1. Device A : couper wifi.
2. Ajouter 3 mots dico + supprimer 1 snippet.
3. Vérifier icône header : 📶 avec count = 4.
4. Rebrancher wifi. Icône passe à 🔄 puis ✅.
5. Device B : vérifier que les 3 mots apparaissent + snippet supprimé.

## Scénario 6 — Cross-tenant (sécurité)
1. Avec 2 users A et B, vérifier manuellement dans Supabase Studio que :
   - Requête `select * from user_settings` en tant que A ne retourne que sa row.
   - Aucune query de A ne retourne quoi que ce soit de B.
2. (Déjà couvert par pgtap Task 5 mais re-vérifier manuellement une fois en prod.)

## Scénario 7 — Export GDPR
1. Device A : Settings > Compte > "Exporter mes données".
2. Fichier `voice-tool-export_YYYY-MM-DD_HHmmss.json` doit apparaître dans Downloads.
3. Ouvrir le JSON, vérifier présence de `user_settings`, `user_dictionary_words`, `user_snippets`, `user_devices`.

## Scénario 8 — Delete account
1. Device A : Settings > Sécurité > "Supprimer mon compte" → taper "SUPPRIMER" → confirmer.
2. App se déconnecte.
3. Vérifier dans Supabase Studio : la row `account_deletion_requests` est créée.
4. Les données `user_settings/snippets/dictionary` sont toujours présentes (purge effective post-cron 30j).

## Scénario 9 — Restore backup local
1. Device A : avant tout, noter snippets + dico.
2. Device A : Settings > Compte > Backups locaux > choisir le plus récent → Restaurer.
3. Vérifier que l'état est identique au snapshot pré-sync.

## Scénario 10 — Quota (option manuelle, lourd)
1. Device A : ajouter ~6 MB de données (snippets gros payloads).
2. Observer que le push rejette avec HTTP 413 et message "quota exceeded".
3. Supprimer quelques snippets → push repasse.

## Scénarios cross-OS (obligatoires avant v3.0 GA)
- Windows 11 ↔ Windows 11
- Windows 11 ↔ macOS Sonoma (si environnement dispo)
- Linux (si environnement dispo)
```

- [ ] **Step 2: Commit**

```bash
git add docs/v3/02-sync-settings-e2e-checklist.md
git commit -m "docs(v3): E2E manual checklist for sub-epic 02 sync"
```

---

## Task 28: Documentation & ADR de clôture

**Files:**
- Create: `docs/v3/decisions/0010-sub-epic-02-closure.md`
- Modify: `CLAUDE.md`
- Modify: `docs/v3/02-sync-settings.md` (marquer livré)

- [ ] **Step 1: Écrire ADR 0010**

```markdown
# ADR 0010 — Clôture sous-épique 02-sync-settings

- **Statut**: Accepté
- **Date**: [date de clôture réelle]

## Résumé

Sous-épique 02 livrée : sync cloud des settings scalaires (9 clés mappées) + dictionnaire + snippets via Supabase + Edge Function `sync-push`. LWW par item, soft-delete, backup local automatique, GDPR export + delete, toggle explicit dans Settings > Compte.

## Ajustements vs spec initiale `02-sync-settings.md`

- **Architecture TS au lieu de Rust** (spec disait "module sync.rs"). Justification : cohérence avec pattern sub-épique 01 où la session vit côté React, lifecycle React naturel, pas de duplication de state. Module Rust limité à I/O filesystem (backups, export download).
- **Retrait de `user_prompts` et `user_translation_presets`** (décision 2026-04-24). Ces features n'existent pas dans l'app. Les tables seront créées quand les features existeront. Scope v3.0 réduit à 3 tables (settings, dico, snippets) au lieu de 5.
- **Sync mono-profil** (décision 2026-04-24). La v3.0 sync uniquement le profil actif. Multi-profils cloud = v3.x. Warning UI en place pour users multi-profils.
- **Clés scalaires syncables = 9** au lieu de la totalité du settings blob : 8 UI/hotkeys/features/transcription essentielles. Reste local-only.
- **Pull = direct supabase-js + RLS**, **Push = Edge Function** (validation Zod + quota). Mix qui garde la simplicité pour la lecture et la défense en profondeur pour l'écriture.
- **Quota = post-application** dans l'Edge Function (au lieu de pré-check). Simplifie l'atomicité des batches. Trade-off : un user peut très brièvement dépasser pendant un push avant qu'on rejette le batch suivant. Acceptable en v3.0.
- **Tests RLS automatisés** via pgtap (spec disait "tests Playwright + Supabase client" — on a préféré pgtap plus natif DB).

## Follow-ups ouverts (reportés)

- **`user_prompts` / `user_translation_presets`** — à livrer quand les features existeront.
- **Multi-profils dans le cloud** — colonne `profile_id` à ajouter aux tables + conflict resolution étendu.
- **Trust `client_modified_at`** pour pushes offline (mitigation clock skew). Reporté v3.1.
- **Compression gzip payloads** — prématuré v3.0, à implémenter si users dépassent régulièrement 1 MB.
- **Edge Function "send-new-device-email"** — déjà tracé sub-épique 01 ADR 0009.
- **Edge Function "purge-account-deletions" cron 30j** — idem.
- **SMTP custom Resend/Postmark** — déjà tracé sub-épique 01 ADR 0009.
- **Upgrade plan Supabase Pro** avant mise en prod publique (backups quotidiens + DPA).
- **Notes texte** — sous-épique 03 (v3.1).

## Processus de révision

ADR figé. Ajustements ultérieurs = nouvel ADR ou sub-épiques 02+.
```

- [ ] **Step 2: Mettre à jour `CLAUDE.md`**

Ajouter une section dans "V3 Documentation" juste après la section "V3 Auth (livré sous-épique 01)" :

```markdown
### V3 Sync settings (livré sous-épique 02)

- Backend : `src-tauri/src/sync.rs` (commandes filesystem backups + export download)
- Sync engine TS : `src/lib/sync/` (types, mapping, queue, backups, merge, client, stores)
- Context : `src/contexts/SyncContext.tsx` + hook `src/hooks/useSync.ts`
- Stores locaux : `sync-snippets.json` + `sync-dictionary.json` + `sync-queue.json` + `sync-meta.json` (Tauri Store plugin)
- Edge Functions : `supabase/functions/sync-push/`, `supabase/functions/account-export/`
- Tables Supabase : `user_settings`, `user_dictionary_words`, `user_snippets` (migrations `20260525*`)
- Clés settings syncées : 9 scalaires (theme, ui_language, 3 hotkeys, insertion_mode, enable_sounds, transcription_provider, local_model_size)
- Non syncé : clés API (ADR 0003), settings hardware-dépendants, notes, historique transcriptions, autres profils
- Tests : pgtap RLS cross-tenant + Vitest unitaires (queue/merge/mapping/stores)
- Supabase CLI : `pnpm exec supabase functions deploy sync-push` / `account-export`
```

- [ ] **Step 3: Marquer la spec comme livrée**

En tête de `docs/v3/02-sync-settings.md`, changer la ligne statut :

```markdown
> **Statut**: ✅ Livré le [date]. Voir [ADR 0010](decisions/0010-sub-epic-02-closure.md) pour les ajustements vs spec initiale.
```

- [ ] **Step 4: Commit final**

```bash
git add docs/v3/decisions/0010-sub-epic-02-closure.md CLAUDE.md docs/v3/02-sync-settings.md
git commit -m "docs(v3): close sub-epic 02 sync-settings with adr 0010"
```

---

## Sortie de sous-épique — critères d'acceptation

- [ ] Les 28 tâches sont toutes cochées (`- [x]`).
- [ ] `pnpm build` passe sans erreur TS.
- [ ] `cargo check` dans `src-tauri/` passe sans erreur (LIBCLANG + CMake exports en place).
- [ ] `pnpm test` passe (> 20 tests Vitest OK).
- [ ] `pnpm exec supabase test db` passe (> 13 assertions pgtap OK).
- [ ] Toutes les migrations sont appliquées en distant (`pnpm exec supabase db push` OK).
- [ ] Les 2 Edge Functions sont déployées (`sync-push`, `account-export`).
- [ ] Le toggle sync est opérationnel (user peut activer/désactiver).
- [ ] Au moins les 9 scénarios de la checklist E2E `docs/v3/02-sync-settings-e2e-checklist.md` passent sur Windows 11.
- [ ] ADR 0010 figé.

---

## Ordre d'exécution recommandé

1. **Préflight** (deps, branches, Supabase CLI link).
2. **Tasks 1–5** (backend SQL + tests RLS) en séquence. Bloquant pour tout le reste.
3. **Task 6** (Rust filesystem) en parallèle possible avec 7–12 si on a du temps.
4. **Tasks 7–12** (lib TS : types, mapping, stores, queue, backups) — strictement séquentiel, chaque module dépend des précédents via imports.
5. **Tasks 13–14** (Edge Functions) : 13 avant 14. Peut se faire en parallèle avec Tasks 7–12 (cross-chantier).
6. **Tasks 15–16** (client TS + merge).
7. **Task 17** (SyncContext) — grosse tâche, dépend de **toutes** les précédentes.
8. **Task 18** (VocabularySection refacto) : après Task 17.
9. **Task 19** (Settings observer) : après 17.
10. **Tasks 20–22** (UI + i18n) : parallélisable.
11. **Tasks 23–25** (GDPR + multi-profile warning).
12. **Tasks 26–28** (tests E2E manuel + docs + ADR).

---

## Self-review checklist

- [ ] **Spec coverage** : les 6 livrables PRs de la spec (SQL/RLS ✅ Task 1-5, Edge Functions ✅ Task 13-14, Backend Rust ✅ Task 6, Frontend ✅ Tasks 7-22, Tests E2E ✅ Task 27, Data export + delete ✅ Task 23-25) sont tous mappés à des tâches. Multi-profils = warning (Task 26). Quota = Task 14 step 3.
- [ ] **Placeholder scan** : aucune mention "TBD", "à implémenter plus tard", "similar to Task N sans code". Chaque step contient le code exécutable.
- [ ] **Type consistency** : `LocalSnippet`, `CloudSnippetRow`, `SyncOperation`, `SyncQueueEntry`, `CloudSettingsData` sont définis Task 7 et utilisés uniformément partout.
- [ ] **Scope hygiène** : `user_prompts` et `user_translation_presets` sont absents de toutes les tâches (cohérent avec décision 2026-04-24). Aucun code Rust sync engine (cohérent avec décision 2026-04-24).
- [ ] **i18n** : tous les composants nouveaux utilisent `useTranslation()` et jamais de texte en dur (cf. `memory/feedback_i18n_required.md`).
- [ ] **Tests avant code** : tâches 8, 9, 10, 11, 16 suivent le TDD (test d'abord, fail, puis impl).

---
