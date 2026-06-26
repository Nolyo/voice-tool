# Spec — Synchronisation multi-profils

- **Date** : 2026-06-25
- **Statut** : Design validé (brainstorming), prêt pour plan d'implémentation
- **Supersede** : ADR 0016 §10 et ADR 0010 (sync mono-profil) — un ADR de décision dédié devra être écrit lors de l'implémentation pour acter le passage multi-profil.
- **Contexte** : Aujourd'hui la sync cloud est mono-profil. Le modèle de données cloud est indexé uniquement par `user_id` ; activer la sync sur deux profils locaux fait converger leurs données dans la même partition (« tout est mergé »). Ce spec décrit le passage à une sync **partitionnée par profil**, multi-appareils.

---

## 1. Problème

- Les profils sont une notion **locale** (`profiles/<id>/`), avec un `id` dérivé du nom (`name_to_id`) **par appareil** → non utilisable comme clé cloud stable.
- Le schéma cloud (`user_notes`, `user_folders`, `user_settings`, `user_snippets`, `user_dictionary_words`) est indexé **uniquement par `user_id`**.
- Conséquence : deux profils locaux qui synchronisent poussent vers les mêmes lignes du même `user_id` → fusion non désirée.
- Depuis le fix du 2026-06-23, la **queue** et le **sync-meta** sont déjà per-profil (`profiles/<id>/sync-queue.json`, `sync-meta.json`) et un **sync-gate** process-wide n'active la sync que pour le profil actif. Mais le partitionnement **côté cloud** manque encore.

## 2. Décisions validées (brainstorming)

| Sujet | Décision |
|---|---|
| Scénario | Multi-appareils (perso + travail sur 2+ PC) |
| Identité cloud | Table `user_profiles` faisant foi + `cloud_profile_id` stocké par profil local |
| Nouvel appareil | **Hybride avec confirmation** : modale « Tu as N profils cloud, les ajouter ? » |
| Pull du contenu | **Différé** : seules les métadonnées profils arrivent au login ; le contenu se tire à la **1ʳᵉ activation** du profil (le switch redémarre l'app) |
| Snippets + dictionnaire | **Per-profil** (plus globaux) — les 5 tables reçoivent `profile_id` |
| Migration cloud | **Coupe nette** : wipe des tables sync, schéma neuf `profile_id NOT NULL`, re-push depuis le local |
| Suppression profil | **Soft-delete propagé** : `deleted_at` sur `user_profiles` → disparaît sur les autres appareils au pull |
| Quota | **Par compte** (inchangé) — somme de tous les profils |
| Concurrence | Un seul profil actif à la fois (app-restart-on-switch) — pas de pull concurrent |

## 3. Architecture

### 3.1 Identité du profil

- **Nouvelle table `user_profiles`** : `id uuid pk`, `user_id uuid not null references auth.users(id) on delete cascade`, `name text not null`, `created_at`, `updated_at` (trigger serveur), `deleted_at timestamptz`. Modèle **LWW par item + soft-delete**, identique à `user_folders`.
- **`cloud_profile_id`** : chaque profil local stocke son UUID cloud dans son `sync-meta.json` per-profil (clé `cloudProfileId`).
- **Première activation** d'un profil sans `cloud_profile_id` : le client **génère un UUID** (offline-friendly, comme les UUID client-side des notes — ADR 0016), l'écrit en sync-meta, et upsert la ligne `user_profiles` (op `profile-upsert` dans la queue). Toutes les lignes des 5 tables de ce profil portent ce `cloud_profile_id` en `profile_id`.

### 3.2 Schéma cloud

- Colonne **`profile_id uuid not null references public.user_profiles(id) on delete cascade`** ajoutée aux 5 tables : `user_notes`, `user_folders`, `user_settings`, `user_snippets`, `user_dictionary_words`.
- **PK ajustées** :
  - `user_settings` : `user_id` → `(user_id, profile_id)`.
  - `user_dictionary_words` : `(user_id, word)` → `(user_id, profile_id, word)`.
  - `user_notes`, `user_folders`, `user_snippets` : PK `id` uuid inchangée, `profile_id` en colonne + index.
- **Index** : ajouter `profile_id` aux index de listing/pull (ex. `user_notes (user_id, profile_id) where deleted_at is null`).
- **RLS inchangé** : `auth.uid() = user_id`. `profile_id` est un **discriminant applicatif intra-user**, pas une frontière de sécurité.
- **Migration** : coupe nette. DROP + recreate (ou TRUNCATE + ALTER) des 5 tables avec `profile_id NOT NULL`. Tables vides au départ (re-push depuis local). FK `profile_id` impose que `user_profiles` soit peuplée avant le push notes/folders/etc. → l'op `profile-upsert` doit être traitée en premier (voir 3.4).

### 3.3 Stores locaux

- **Snippets + dictionnaire deviennent per-profil** : `sync-snippets.json` et `sync-dictionary.json` passent de la racine à `profiles/<id>/`.
  - Nouvelles commandes Rust `get_active_profile_snippets_path` / `get_active_profile_dictionary_path` (miroir de `get_active_profile_sync_queue_path`).
  - `snippets-store.ts` / `dictionary-store.ts` chargent leur Store via `invoke(...)` au lieu du nom en dur.
  - **Migration one-shot** : au démarrage, si des stores racine `sync-snippets.json` / `sync-dictionary.json` existent, les déplacer dans `profiles/default/` (préserve le contenu local réel). Idempotent.
- Notes/dossiers locaux : **aucun changement** (déjà scopés au profil actif côté Rust via `get_active_id`).

### 3.4 Moteur de sync

- **Pull** (`client.ts pullAll`) : ajoute `.eq("profile_id", cloudProfileId)` aux 5 requêtes. Le `cloudProfileId` du profil actif est résolu depuis le sync-meta et passé à `pullAll`.
- **Push** (`pushOperations` → Edge `sync-push`) : `profile_id` envoyé **une seule fois** dans le body (toutes les ops d'une queue appartiennent au même profil). L'Edge estampille chaque upsert avec ce `profile_id`.
  - L'op **`profile-upsert`** (nouvelle `SyncOperation` kind) crée/maj la ligne `user_profiles` et **doit être appliquée avant** les ops notes/folders/etc. du même batch (contrainte FK).
  - Nouvelle op **`profile-delete`** (soft-delete `deleted_at` sur `user_profiles`).
- **Types** (`types.ts`) : ajouter `profile_id: string` aux 5 interfaces `Cloud*Row` + nouvelles `CloudUserProfileRow`, `ProfilePayload`, et les kinds `profile-upsert` / `profile-delete` à l'union `SyncOperation`.
- **Mapping** (`mapping.ts`) : les `map*FromCloud` extraient `profile_id` ; nouveaux `mapProfileToCloud` / `mapProfileFromCloud`.
- **Edge `sync-push`** (v3) : estampille `profile_id` sur chaque upsert ; gère `profile-upsert` / `profile-delete` ; quota `compute_user_sync_size(user_id)` **inchangé** (somme tous profils).
- **`account-export`** (v3) : inclut `user_profiles` + le `profile_id` sur chaque ligne exportée.
- **Purge** (`purge-account-deletions`, cron 30j) : étendu pour purger les lignes `user_profiles` (et leurs données via cascade) soft-deleted depuis >30j.

### 3.5 Cycle de vie de la sync

- **Login / app start** : pull du profil actif (filtré par son `cloud_profile_id`) — inchangé dans son principe, juste scopé.
- **Reconcile profils** (indépendant du profil actif) : à la connexion, le client lit `user_profiles` (RLS `user_id`) pour connaître la liste des profils cloud → alimente la modale d'onboarding.
- **Switch de profil** : redémarre l'app → le nouveau profil actif pull sa propre partition à son tour. Pas de pull concurrent.
- **Logout** : flush des queues (inchangé).

## 4. UX

### 4.1 Nouvel appareil — onboarding hybride

- Après connexion, si `user_profiles` (non soft-deleted) contient des profils **absents localement** (matching par `cloud_profile_id` stocké en sync-meta) → modale :
  > « Ton compte a 2 profils synchronisés : **Perso**, **Travail**. Les ajouter sur cet appareil ? »
- À la confirmation : créer les **coquilles** de profils locaux (nom depuis cloud + `cloud_profile_id` + `enabled=true` en sync-meta). Pas de pull immédiat du contenu.
- Le **contenu** de chaque profil se tire à sa **première activation** (switch → restart → pull de sa partition).
- Le profil local courant (ex. `default`) n'est pas écrasé : il reste tel quel (local-only tant que la sync n'y est pas activée, auquel cas il crée sa propre partition cloud).

### 4.2 Suppression d'un profil synchronisé

- `delete_profile` sur un profil ayant un `cloud_profile_id` → enqueue `profile-delete` (soft-delete `deleted_at` sur `user_profiles`).
- Au prochain pull sur un autre appareil : le profil cloud apparaît supprimé → on retire la coquille locale + ses données (purge locale, comme les notes soft-deleted).
- Purge serveur 30j (cron existant étendu) supprime physiquement les lignes.
- **Garde-fou** : confirmation explicite à la suppression d'un profil synchronisé (« supprime aussi sur tes autres appareils »).

### 4.3 AccountSection

- Le warning `sync.multi_profile_warning` (AccountSection.tsx, ~L402-408) est **remplacé** : plus de « multi-profil non supporté ». À la place, indication du profil cloud actif (nom + état sync) et lien vers la gestion des profils.
- `SyncedInventoryGrid` reflète le profil courant (compteurs notes/dossiers/snippets/dico du profil actif).

## 5. Migration

- **Cloud** : coupe nette. Wipe des 5 tables + ajout `profile_id NOT NULL` + création `user_profiles`. Tables vides au départ.
- **Local** :
  - Aucun wipe. Migration one-shot des stores racine `sync-snippets.json` / `sync-dictionary.json` → `profiles/default/` (préserve le contenu local).
  - À la réactivation de la sync sur chaque profil : génération `cloud_profile_id` + re-push de son contenu local.
- Parc utilisateurs = 0 (pré-launch) → aucun risque de perte. Cohérent avec le fix du 2026-06-23.

## 6. Périmètre / non-objectifs

- **Hors scope** : sync concurrente multi-profils (un seul actif à la fois) ; quota par profil (quota = par compte) ; fusion interactive / résolution de conflit sophistiquée (LWW sur le nom de profil comme les dossiers) ; renommage cross-device au-delà du LWW.
- **Reporté** : indicateur sync par profil dans le sélecteur (nice-to-have).

## 7. Impacts fichiers (synthèse)

| Domaine | Fichiers |
|---|---|
| Migrations | 5× `ALTER`/recreate (profile_id) + `user_profiles` + index + RPC quota (revue) |
| Edge Functions | `sync-push` (v3, profile_id + profile ops), `account-export` (v3), `purge-account-deletions` |
| Types/mapping | `src/lib/sync/types.ts`, `mapping.ts`, `schemas.ts` (Zod) |
| Client | `src/lib/sync/client.ts` (pull `.eq(profile_id)`, push body `profile_id`) |
| Stores | `snippets-store.ts`, `dictionary-store.ts` (per-profil), `queue.ts`/op kinds |
| Rust | `profiles.rs` / `commands/profiles.rs` (paths snippets/dico + migration), `delete_profile` (enqueue profile-delete) |
| Contexte | `src/contexts/SyncContext.tsx` (cloud_profile_id, reconcile, pull scopé) |
| UI | modale onboarding, `AccountSection.tsx` (warning remplacé), confirmation suppression |
| Tests | pgtap RLS (`user_profiles`), Deno Edge (sync-push v3, export, purge), Vitest (mapping/client/stores), Rust unit |

## 8. Taille & découpage

Chantier conséquent (≈ taille d'un sous-épique). Découpage probable en plan d'implémentation :

1. Schéma cloud + `user_profiles` + migration coupe nette + RLS/pgtap.
2. Types/mapping/schemas + ops `profile-*`.
3. Stores snippets/dico per-profil + migration locale + commandes Rust.
4. Client pull/push scopé `profile_id`.
5. Edge `sync-push` v3 + `account-export` v3 + purge.
6. `cloud_profile_id` lifecycle dans SyncContext + reconcile.
7. UX : onboarding hybride + suppression propagée + AccountSection.
8. Vérif E2E multi-appareils + ADR de clôture (supersede 0016 §10 / 0010).
