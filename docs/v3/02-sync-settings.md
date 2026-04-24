# 02 — Sync settings (étendu v3.0)

> **Statut**: ✅ Livré le 2026-04-24. Voir [ADR 0010](decisions/0010-sub-epic-02-closure.md) pour les ajustements vs spec initiale.
> **Cible**: v3.0 (bloquant).
> **Dépendances**: [`00-threat-model.md`](00-threat-model.md), [`01-auth.md`](01-auth.md), ADRs 0002, 0003, 0007.

---

## Principe directeur

La synchronisation est un **upgrade volontaire**, pas un piège. Trois garanties pour l'utilisateur :

1. **Le mode local reste gratuit et entièrement fonctionnel.** Jamais de feature locale qui disparaît parce qu'on ajoute la sync.
2. **Un backup local est créé automatiquement avant toute opération destructrice** (première activation, écrasement, merge). Les 10 derniers backups sont conservés et restaurables depuis les settings.
3. **La sync peut être désactivée à tout moment** sans perte de données (pause, pas delete — la suppression effective passe par "Supprimer mon compte" GDPR).

---

## Périmètre

### ✅ Ce qui synchronise en v3.0 (Stratégie Y3)

**Scalaires** — dans `user_settings.data` (blob jsonb unique, <2 KB total) :

```json
{
  "ui": { "theme": "light|dark|auto", "language": "fr|en" },
  "hotkeys": {
    "toggle": "Ctrl+F11",
    "push_to_talk": "Ctrl+F12",
    "open_window": "Ctrl+Alt+O"
  },
  "features": {
    "auto_paste": true,
    "sound_effects": true
  },
  "transcription": {
    "provider": "openai|groq|whisper_rs",
    "local_model": "tiny|small|medium|large"
  }
}
```

**Collections** — chacune dans sa propre table :

| Collection | Table | Taille typique |
|---|---|---|
| Dictionnaire personnalisé | `user_dictionary_words` | <100 KB |
| Snippets | `user_snippets` | <500 KB |
| Prompts IA personnalisés | `user_prompts` | <100 KB |
| Préréglages de traduction | `user_translation_presets` | <50 KB |

**Total estimé par user actif normal** : <1 MB.

### ❌ Ce qui NE synchronise PAS en v3.0

| Exclusion | Raison |
|---|---|
| **Clés API** (OpenAI, Groq, Deepgram…) | ADR 0003 — device-local obligatoire, jamais en transit |
| **Settings per-device** (mic sélectionné, sample rate, window position/size, mini-window position/size, autostart) | Dépendants du hardware / résolution écran |
| **Modèles whisper-rs téléchargés** | Lourds (75 MB–3 GB), re-téléchargeables depuis HuggingFace |
| **Notes texte** | Reporté sous-épique 03, v3.1 |
| **Historique transcriptions** | Reporté v3.1+ |
| **Audios bruts** | Reporté v3.2+ (service managé) |
| **Cache, logs, données debug** | Temporaire, inutile |

---

## Schéma DB

### Tables

```sql
-- Scalaires (1 row par user)
create table user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  schema_version int not null default 1,
  updated_at timestamptz not null default now(),
  updated_by_device text,
  created_at timestamptz not null default now()
);

-- Dictionnaire (plat, clé composite → dédup naturelle, pas de conflit possible)
create table user_dictionary_words (
  user_id uuid not null references auth.users(id) on delete cascade,
  word text not null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,  -- soft-delete pour propagation cross-device
  primary key (user_id, word)
);

-- Snippets (UUID client-generated, LWW par item)
create table user_snippets (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null,
  content text not null,
  shortcut text,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create index on user_snippets (user_id) where deleted_at is null;

-- Prompts IA
create table user_prompts (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null,
  template text not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create index on user_prompts (user_id) where deleted_at is null;

-- Préréglages de traduction
create table user_translation_presets (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null,
  source_lang text not null,
  target_lang text not null,
  instructions text,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create index on user_translation_presets (user_id) where deleted_at is null;
```

### RLS — deny by default, policies explicites

```sql
-- Sur les 5 tables (pattern identique)
alter table user_settings enable row level security;
alter table user_dictionary_words enable row level security;
alter table user_snippets enable row level security;
alter table user_prompts enable row level security;
alter table user_translation_presets enable row level security;

-- Policies génériques pour toutes les tables (exemple pour user_snippets)
create policy "own_snippets_select" on user_snippets
  for select using (auth.uid() = user_id);

create policy "own_snippets_insert" on user_snippets
  for insert with check (auth.uid() = user_id);

create policy "own_snippets_update" on user_snippets
  for update using (auth.uid() = user_id);

create policy "own_snippets_delete" on user_snippets
  for delete using (auth.uid() = user_id);
```

⚠️ **Mesure #1 threat model** : tests automatisés cross-tenant obligatoires avant release — vérifier qu'un user A ne peut **jamais** lire/écrire les rows d'un user B sur chaque table.

### Trigger `updated_at` auto

```sql
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger user_settings_updated_at before update on user_settings
  for each row execute function update_updated_at();
-- ... pareil sur les 4 autres tables
```

### ON DELETE CASCADE — support GDPR

Toutes les FK sont en `on delete cascade` depuis `auth.users(id)`. Quand l'user supprime son compte (droit à l'oubli GDPR — mesure must-have #5), toutes ses données syncées sont purgées automatiquement par Postgres, sans code applicatif.

---

## Sync engine

### Déclencheurs (lifecycle-based)

| Événement | Action |
|---|---|
| **Login réussi** | Full pull de toutes les tables user-scoped vers le state local. Merge avec ce qui est local (stratégie migration Q4). |
| **Focus de l'app** (après ≥5 min d'inactivité détectée via `user_activity_last_at`) | Incremental pull : `where updated_at > last_pull_at` sur chaque table. |
| **Modification locale** (user ajoute un mot au dico, crée un snippet, change un setting…) | Push debounced 500ms de **l'item modifié uniquement** (pas de la table entière). |
| **Logout** | Flush de la queue en attente + invalidation session Supabase + purge data locale syncée. |
| **Clic "Synchroniser maintenant"** (bouton dans settings, debug/réassurance) | Full pull + flush queue. |

### Queue offline

**Stockage** : table locale `sync_queue` dans Tauri Store, persiste aux redémarrages de l'app.

**Format d'une entrée** :
```json
{
  "id": "uuid-local",
  "operation": "upsert|delete",
  "table": "user_snippets|user_prompts|...",
  "item_id": "uuid",
  "payload": { ... },
  "enqueued_at": "2026-04-22T10:00:00Z",
  "retry_count": 0
}
```

**Retry backoff** : 1s → 5s → 30s → 2 min → 5 min (cap).

**Idempotence** : chaque opération est idempotente grâce aux UUIDs client-side (upsert by ID, delete by ID). Pas de risque de duplication si la queue est rejouée.

**Ordre** : FIFO. Si l'user crée un snippet puis le modifie avant le push, les deux operations sont envoyées dans l'ordre (la seconde écrase la première au niveau DB).

### Sens du flow

```
┌─ Device A ──────┐         ┌─ Supabase ──┐         ┌─ Device B ──────┐
│                  │         │              │         │                  │
│  state local     │         │   DB        │         │  state local     │
│     │            │  push   │              │  pull   │     │            │
│     ├───────────►│────────►│─────────────►│────────►│─────│            │
│     │            │         │              │         │     │            │
│     │            │  pull   │              │  push   │     │            │
│     │◄───────────│◄────────│◄─────────────│◄────────│─────│            │
│                  │         │              │         │                  │
└──────────────────┘         └──────────────┘         └──────────────────┘
```

### Latence perçue

- **En ligne** : <1s entre modif locale et propagation cloud (debounce 500ms + requête API ~200ms).
- **Device distant** : jusqu'à 5 min dans le pire cas (si l'user laisse sa fenêtre inactive ; un focus déclenche le pull).
- **Offline** : queue persistante, push au retour online.

---

## Conflict resolution

### Par table

| Table | Stratégie | Rationale |
|---|---|---|
| `user_settings` | LWW sur le blob | Scalaires, pas de collision user-perçue |
| `user_dictionary_words` | Union de sets | Clé primaire composite `(user_id, word)` → impossible de dupliquer, deletion via `deleted_at` |
| `user_snippets` | LWW par item (comparaison `updated_at`) | UUID client-side → pas de collision create, chaque row merge indépendamment |
| `user_prompts` | LWW par item | Idem |
| `user_translation_presets` | LWW par item | Idem |

### Edge case : delete vs update

Soft-delete via `deleted_at timestamptz` pour propagation des suppressions entre devices.

**Règle** : pour une même row, entre un `deleted_at` et un `updated_at`, le plus récent gagne.

| Scénario | Résultat |
|---|---|
| Desktop supprime à 10:00, laptop modifie à 10:01 | Modif gagne (row ré-apparaît côté desktop au prochain pull) |
| Desktop modifie à 10:00, laptop supprime à 10:01 | Suppression gagne (row disparaît côté desktop) |

### Edge case : create concurrent

**Impossible** — chaque device génère son `uuid` client-side. Créations concurrentes de "mon email" sur deux devices = 2 rows distinctes, l'user peut en supprimer une manuellement.

### Edge case : timestamps offline

Les `updated_at` / `deleted_at` sont **générés côté serveur** (Postgres `default now()`). Conséquence acceptée :

- Modif offline à 10:00 + push au retour online à 11:00 = `updated_at = 11:00` côté serveur.
- Si, entre-temps, une modif online à 10:30 sur un autre device, elle sera **écrasée** par le push offline à 11:00.

**Fréquence estimée** : rare (mono-user multi-device, pas collaboratif).

**Mitigation possible v3.1** : champ `client_modified_at` respecté côté serveur pour les pushes offline. Trade-off : vulnérable au clock skew client. Reporté.

### Ce qu'on NE FAIT PAS en v3.0

- ❌ Notification utilisateur en cas de conflit (LWW ne détecte pas vraiment les conflits)
- ❌ Historique / undo serveur (x2 stockage)
- ❌ Merge interactif ("voici les 2 versions, choisis")
- ❌ CRDT (Yjs) — overkill mono-user

### Ce qu'on FAIT pour limiter la casse

- ✅ Backup local automatique pré-sync au premier login (10 derniers, rotation)
- ✅ Bouton "Exporter mes données" (JSON complet, obligatoire GDPR mesure #6)
- ✅ Logs côté client de chaque opération sync (table, item ID, timestamp) pour debug

---

## Migration — premier login avec state local existant

### Détection "state non-trivial"

Modale affichée si **au moins une** des conditions :
- ≥ 1 snippet créé
- ≥ 3 mots dans le dictionnaire
- ≥ 1 prompt IA personnalisé
- ≥ 1 préréglage de traduction
- Au moins une hotkey modifiée par rapport aux defaults

Sinon (setup quasi-vierge) : upload auto silencieux, zéro friction.

### Flow modale

```
┌─────────────────────────────────────────────┐
│  Activer la synchronisation                 │
│                                              │
│  Tu as déjà configuré Voice Tool sur ce     │
│  device. Que veux-tu faire ?                │
│                                              │
│  [ ● ] Uploader mon setup actuel (recommandé)│
│        Tes snippets, hotkeys, dico, etc.     │
│        seront envoyés au cloud et           │
│        disponibles sur tes autres devices.   │
│                                              │
│  [   ] Partir d'un setup neuf                │
│        Ton setup local sera remplacé par    │
│        un état vierge. Un backup est        │
│        conservé localement.                  │
│                                              │
│  ⚠️ Tes clés API (OpenAI, Groq…) ne sont    │
│  pas syncées pour ta sécurité. Tu les       │
│  re-saisiras sur tes autres devices.        │
│                                              │
│  ℹ️ Un backup du state actuel est créé      │
│  automatiquement dans les deux cas.         │
│                                              │
│                    [Annuler]    [Activer]   │
└─────────────────────────────────────────────┘
```

### Cas 3 — Nouveau device, state local + state cloud existants

Warning supplémentaire dans la modale :

> ⚠️ Un setup existe déjà sur ton compte cloud. Si tu uploades, le cloud et ton local seront mergés (pas de perte grâce à la stratégie merge par UUID). Si tu pars neuf, ton local sera remplacé par ton cloud.

Merge safe garanti par :
- Dico : union de sets
- Snippets/prompts/préréglages : merge par UUID (devices différents = UUIDs différents)
- Scalaires : LWW

### Backup automatique

Dans **tous les cas** où le state local est modifié :

- Fichier : `%APPDATA%/com.nolyo.voice-tool/backups/pre-sync_YYYY-MM-DD_HHmmss.json`
- Contenu : Tauri Store complet (y compris les clés API car c'est un backup local qui ne sort jamais du device)
- Conservation : 10 derniers, rotation auto (FIFO)
- Accessible depuis Settings > Compte > "Backups locaux" → liste déroulante + bouton "Restaurer"

### Réversibilité

| Action | Comportement |
|---|---|
| **Désactiver la sync** (toggle OFF) | Pause — données cloud restent en place, local garde son état, réactivation safe via re-merge |
| **Supprimer mon compte** (Settings > Compte > "Supprimer mon compte") | Delete complet GDPR — purge DB cloud (cascade via `auth.users`), purge keyring, déconnexion. Local conservé mais "non syncé". |

Distinction UX claire : désactiver ≠ supprimer.

---

## UX

### Toggle "Synchronisation cloud"

Emplacement : Settings > onglet "Compte".

```
┌──────────────────────────────────────────────────┐
│  Synchronisation cloud                     [ON]  │
│                                                   │
│  Tes snippets, dictionnaire, prompts IA,         │
│  préréglages et préférences sont disponibles     │
│  sur tous tes devices.                            │
│                                                   │
│  → Voir ce qui est synchronisé                   │
│  → Voir mes backups locaux                        │
└──────────────────────────────────────────────────┘
```

- OFF par défaut, activé explicitement par l'user au signup (via modale migration)
- Lien "Voir ce qui est synchronisé" → modale avec liste détaillée + compteurs ("12 snippets, 247 mots dico, …") — **transparence totale**
- Lien "Voir mes backups locaux" → liste des snapshots + bouton restore

### Status indicator

Emplacement : icône discrète dans le header de l'app, à droite du bouton Settings.

| État | Icône | Tooltip |
|---|---|---|
| Synchronisé | ✅ (vert) | "Tout est à jour" |
| En cours | 🔄 (anim) | "Synchronisation..." |
| Hors ligne | 📶 (grisé) | "Hors ligne — X modifications en attente" |
| Erreur | ⚠️ (orange) | "Erreur de sync" + clic → modale détails + bouton Réessayer |

Sync désactivée = icône absente. Pas connecté = icône absente.

### Message "clés API device-local"

Emplacement : en tête de la page Settings > API Keys.

```
┌──────────────────────────────────────────────────┐
│  🔒 Tes clés API ne quittent jamais ce device    │
│                                                   │
│  Contrairement à tes autres réglages, tes clés   │
│  API (OpenAI, Groq, Deepgram) ne sont pas        │
│  envoyées à nos serveurs ni synchronisées.       │
│                                                   │
│  C'est volontaire : une fuite côté serveur ne    │
│  peut jamais exposer tes clés. Pour les utiliser  │
│  sur un autre device, re-saisis-les directement   │
│  là-bas.                                          │
└──────────────────────────────────────────────────┘
```

Ton affirmatif, privacy-first, présenté comme un choix de design.

---

## Offline

### Détection

Pas de plugin réseau dédié. On laisse les appels HTTPS échouer naturellement via `reqwest` (timeout 10s) et on gère l'échec via retry backoff.

Après 2 échecs consécutifs, le status indicator passe en 📶 grisé.

### Queue persistante

- Stockée dans Tauri Store (clé `sync_queue`)
- Survit aux redémarrages de l'app et de l'OS
- Ordre FIFO, idempotence via UUIDs
- Taille max conseillée : ~10 MB (largement au-dessus d'un usage normal)

### Au retour online

Retry réussit → queue vidée dans l'ordre. Status indicator passe en 🔄 pendant le vidage, puis ✅ quand terminé.

---

## Quota

### Limites v3.0

| Seuil | Action |
|---|---|
| **< 4 MB** | Comportement normal |
| **≥ 4 MB** (80% quota) | Warning dans l'UI : *"Tu approches de la limite de 5 MB (actuellement X MB). Pense à supprimer les snippets inutilisés."* + lien "Exporter tout" |
| **≥ 5 MB** | Rejection du push avec message clair. L'user peut **supprimer** des items pour redescendre, pas en ajouter. |
| **>> 5 MB** (incohérence DB / bug) | Log pour monitoring admin + rejection |

### Implémentation

Calcul de la taille totale par user :
- `pg_column_size(data)` sur `user_settings`
- `sum(pg_column_size(word))` sur `user_dictionary_words`
- `sum(pg_column_size(label) + pg_column_size(content))` sur `user_snippets`
- Idem sur `user_prompts` et `user_translation_presets`

Validation dans l'Edge Function `/sync/push` avant insert/update. Rejection avec code HTTP 413 si dépassement.

⚠️ **Impl technique précise reportée au sprint** : trigger Postgres qui maintient un compteur cache vs calcul à la volée à chaque push. Trade-off performance/fraîcheur.

---

## Threats & mitigations (références threat model)

| Mesure threat model | Application dans ce sous-épique |
|---|---|
| **#1 — RLS strict + tests cross-tenant** | 5 tables × 4 policies = 20 policies auto-générées. Tests Playwright + Supabase client qui vérifient qu'user A ne peut jamais lire/écrire les rows d'user B. **Bloquant release.** |
| **#3 — Rate limiting Edge Functions** | `/sync/push` et `/sync/pull` soumis au rate limit (techno à trancher au sprint : table Postgres ou Cloudflare). Cohérent avec 01-auth. |
| **#4 — Validation input Zod** | Chaque payload sync validé : forme du blob `user_settings.data`, taille max d'un snippet/prompt/préréglage, longueur max d'un mot dico. Rejet hard en cas de schema mismatch. |
| **#5 — Logs serveur zéro PII** | Pas d'email, pas de contenu snippet, pas de word dico dans les logs. Uniquement `user_id` + `operation` + `table` + `duration_ms`. |
| **GDPR #5 — Droit à l'oubli** | `ON DELETE CASCADE` depuis `auth.users` → purge automatique de toutes les tables user-scoped. Test automatisé. |
| **GDPR #6 — Data export** | Bouton "Exporter mes données" dans settings → génère un JSON complet : `user_settings.data` + toutes les rows user-scoped des 4 tables collections (incluant soft-deleted si demandé pour transparence). |

---

## Questions techniques reportées au sprint

1. **Implémentation quota** — trigger Postgres avec compteur cache vs calcul à la volée.
2. **Rate limiting techno** — table Postgres `rate_limit_log` vs Cloudflare Workers (décision partagée avec 01-auth).
3. **Trust timestamp client pour pushes offline** — reporté v3.1 si users remontent le problème.
4. **Compression blob** — si un user pousse systématiquement 4 MB, envisager `gzip` côté client + decompress côté Edge. Prématuré v3.0.

---

## Livrables dev prévus (PRs indicatives)

1. **Supabase schema + RLS** — migration SQL des 5 tables, 20 policies, triggers, indexes. Tests cross-tenant automatisés.
2. **Edge Functions** — `/sync/pull` (incremental + full), `/sync/push` (upsert + delete + soft-delete), validation Zod, rate limiting, validation quota.
3. **Backend Rust** — module `sync.rs` : queue persistante (Tauri Store), retry backoff, idempotence, pull lifecycle (login + focus), debounce push 500ms.
4. **Frontend** — toggle sync (Settings > Compte), status indicator (header), modale migration, page transparence "Ce qui est synchronisé", message device-local clés API, liste + restore backups.
5. **Tests E2E** — sync cross-device Windows↔Windows et Windows↔macOS, conflict LWW, offline/reconnexion, migration 3 cas (local seul / cloud seul / deux présents).
6. **Data export + delete account** — GDPR mesures must-have #5 et #6.

---

## Liens

- [EPIC v3](EPIC.md)
- [00 — Threat model](00-threat-model.md)
- [01 — Auth & comptes](01-auth.md)
- [ADR 0002 — Server-side encryption](decisions/0002-server-side-encryption.md)
- [ADR 0003 — Clés API device-local](decisions/0003-api-keys-device-local.md)
- [ADR 0006 — Threat model](decisions/0006-threat-model.md)
- [ADR 0007 — Configuration auth](decisions/0007-auth-configuration.md)
- [ADR 0008 — Stratégie de synchronisation](decisions/0008-sync-strategy.md)
