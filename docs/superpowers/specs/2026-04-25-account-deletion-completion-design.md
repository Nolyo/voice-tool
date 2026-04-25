# Account deletion — completion of the 30-day purge pipeline

**Date** : 2026-04-25
**Branche cible** : `feat/ui_params` (chantier v3)
**Statut** : design approuvé, prêt à être planifié
**Reports clos** : ADR 0009 (sub-épique 01) et ADR 0010 (sub-épique 02), tous deux traçant l'Edge Function `purge-account-deletions` comme "à livrer".

---

## 1. Contexte et problème

Le bouton "Supprimer mon compte" dans `src/components/settings/sections/AccountSection.tsx:811-824` appelle aujourd'hui le RPC `request_account_deletion()` puis fait un `signOut()` local. Le RPC, défini dans `supabase/migrations/20260501000500_account_deletion.sql`, insère uniquement une ligne dans une table tombstone `account_deletion_requests`.

Aucune donnée utilisateur n'est jamais purgée :
- pas d'Edge Function `purge-account-deletions` ;
- pas de cron qui déclenche la purge à J+30 ;
- pas de blocage du re-login pendant la fenêtre 30j (l'utilisateur peut se reconnecter normalement) ;
- pas d'UI d'annulation de la demande.

Conséquence pour l'utilisateur testeur : "je clique, je vois une alerte 30j, je suis déconnecté, je peux me reconnecter, rien ne change en base". Le bouton est conforme RGPD sur le papier (la demande est tracée) mais sans effet opérationnel.

L'épique v3 ne peut pas sortir publiquement avec un compte non-supprimable. Ce design referme le pipeline.

## 2. Décisions de design

| # | Sujet | Décision |
|---|---|---|
| Q1 | Grace period | **30 jours** (cohérent avec l'UX déjà annoncée et les ADR 0009/0010) |
| Q2 | Re-login pendant la fenêtre | **Bloqué** : écran dédié "compte en attente de suppression" avec annulation ou logout |
| Q3 | 2FA | Check de la tombstone fait **post-AAL2** ; annulation et demande exigent AAL2 si MFA enrolled |
| Q4 | Mécanisme de purge | **pg_cron + Edge Function** `purge-account-deletions` utilisant `auth.admin.deleteUser()` |
| Q5 | Emails | **Reportés** (dépendent du SMTP custom déjà différé, ADR 0009) |
| Q6 | Sessions actives | `signOut({ scope: 'global' })` au moment de la demande — révoque tous les refresh tokens |
| Q7 | Données locales | Purge des **caches cloud** (sync stores, backups locaux) ; conservation des données 100% locales (transcriptions, recordings, settings hardware) |

## 3. Architecture

```
┌─ Frontend (Tauri client) ───────────────────────────┐
│  DangerCard (AccountSection)                        │
│   ├─ supabase.rpc('request_account_deletion')       │
│   │     retry MFA challenge si aal2_required        │
│   ├─ purgeLocalCloudData()                          │
│   └─ supabase.auth.signOut({ scope: 'global' })     │
│                                                      │
│  AuthContext                                        │
│   └─ effet déclenché si AAL2 atteint :              │
│      → SELECT requested_at                          │
│        FROM account_deletion_requests               │
│        WHERE user_id = auth.uid()                   │
│      → si présent : setDeletionPending(...)         │
│                                                      │
│  App.tsx                                            │
│   └─ if deletionPending: <DeletionPendingScreen/>   │
│       (court-circuite l'UI normale)                 │
│                                                      │
│  DeletionPendingScreen (nouveau)                    │
│   ├─ "Suppression prévue le {date}"                 │
│   ├─ rpc('cancel_account_deletion')  (AAL2 req.)    │
│   └─ boutons "Se déconnecter" / "Mode local"        │
└─────────────────────────────────────────────────────┘

┌─ Supabase ──────────────────────────────────────────┐
│  RPC request_account_deletion (durci AAL2)          │
│  RPC cancel_account_deletion (nouveau)              │
│  Edge Function purge-account-deletions (nouveau)    │
│   ├─ vérifie Authorization Bearer CRON_SECRET       │
│   ├─ SELECT user_id WHERE requested_at < now()-30d  │
│   └─ pour chaque uid: auth.admin.deleteUser(uid)    │
│        → cascade FK purge user_devices,             │
│          recovery_codes, user_settings,             │
│          user_dictionary_words, user_snippets,      │
│          account_deletion_requests                  │
│  pg_cron job daily 03:00 UTC → http_post → fn       │
└─────────────────────────────────────────────────────┘
```

### 3.1 Flux happy path (suppression complète)

1. User authentifié AAL2 clique "Supprimer mon compte" et tape le mot de confirmation.
2. Frontend appelle `request_account_deletion()`. Si `aal2_required` (MFA enrolled mais session AAL1), MFA challenge puis retry.
3. Tombstone insérée en DB.
4. Frontend purge les caches cloud locaux (sync stores + backups) et fait `signOut({ scope: 'global' })`.
5. Tous les refresh tokens de l'user sont révoqués côté Supabase. Les access tokens déjà émis restent valides jusqu'à leur expiration (TTL 1h par défaut), mais aucune nouvelle session ne peut être obtenue. Concrètement, toute autre app ouverte sur un autre device sera déconnectée au plus tard 1h après — typiquement plus tôt si elle déclenche un refresh.
6. Pendant 30j : tout login successif (sur n'importe quel device) atteint AAL2 puis est routé vers `DeletionPendingScreen`.
7. Au jour 30, le cron Postgres déclenche l'Edge Function. La fonction itère les tombstones expirées et appelle `auth.admin.deleteUser(uid)` pour chacune. La cascade FK fait disparaître toutes les données utilisateur de toutes les tables, y compris la tombstone elle-même.

### 3.2 Flux cancel path (avant J+30)

1. User se reconnecte (mot de passe + TOTP si MFA). Atteint AAL2.
2. AuthContext détecte la tombstone, populate `deletionPending`.
3. App route vers `DeletionPendingScreen`.
4. User clique "Annuler la suppression" → `cancel_account_deletion()` (retry MFA si AAL2 manquant).
5. Tombstone supprimée. `deletionPending` repassé à `null`. App normale s'affiche.

### 3.3 Edge case 2FA

- **Demande sans AAL2** : RPC raise `aal2_required` → frontend trigger un MFA challenge → retry. Si l'user abandonne, rien ne se passe (pas de tombstone créée).
- **Annulation sans AAL2** : symétrique.
- **Perte du TOTP + recovery codes pendant la fenêtre 30j** : l'user ne peut pas annuler. Purge automatique au J+30. Comportement souhaité : le filet de sécurité de 30j n'a pas vocation à empêcher une suppression légitime quand l'user a perdu ses moyens d'accès.
- **Recovery codes disponibles** : utilisables comme alternative au TOTP, le flow 2FA challenge supporte déjà ce path (sub-épique 01).

## 4. Changements détaillés

### 4.1 Backend SQL

**Migration `supabase/migrations/20260425000100_account_deletion_v2.sql`** :

- Remplace `request_account_deletion()` par une version qui exige AAL2 si l'user a un facteur MFA `verified`. Lecture du claim via `auth.jwt() ->> 'aal'`. Erreur explicite `aal2_required` (errcode 42501).
- Ajoute `cancel_account_deletion()` : symétrique, AAL2 si MFA enrolled, `delete from account_deletion_requests where user_id = auth.uid()`.
- Grants : `execute` sur les deux fonctions à `authenticated`.
- La table `account_deletion_requests` et son RLS existent déjà (migration 20260501000500), pas modifiés.

**Migration `supabase/migrations/20260425000200_account_deletion_cron.sql`** :

- `create extension if not exists pg_cron with schema extensions;`
- `select cron.schedule('purge-account-deletions-daily', '0 3 * * *', $$ select net.http_post(...) $$)` — appelle l'Edge Function avec header `Authorization: Bearer <cron_secret>`. URL et secret lus via `current_setting('app.settings.*')` (GUCs custom à initialiser hors migration).

### 4.2 Edge Function `supabase/functions/purge-account-deletions/`

- `index.ts` :
  - Vérifie `Authorization: Bearer <CRON_SECRET>` (rejette 401 sinon).
  - Crée un client `supabase` avec `SERVICE_ROLE_KEY`.
  - `delete from account_deletion_requests where requested_at < now() - interval '30 days' returning user_id` — atomique, évite la race avec un cancel concurrent (un cancel passé juste avant fait disparaître la ligne avant le RETURNING ; un cancel passé juste après n'a plus de ligne à effacer mais c'est trop tard, le purge tombstone est acté côté DB).
  - Pour chaque `uid` retourné, appelle `await supabase.auth.admin.deleteUser(uid)`. La cascade FK (déjà en place sur toutes les tables user) purge le reste — la tombstone elle-même est déjà supprimée par le DELETE RETURNING.
  - Tolère les échecs partiels (un user en erreur n'arrête pas le job). Renvoie `{ purged: N, errors: [{ uid, message }] }`. Si `auth.admin.deleteUser` échoue après que le tombstone est déjà supprimé, l'erreur est loggée et l'user reste orphelin dans `auth.users` jusqu'à intervention manuelle (cas extrêmement rare, monitoring manuel pour v3.0).
  - Log structuré (count, durée, erreurs) — visible dans Supabase Logs.
- `test.ts` : tests Deno avec mocks du SDK admin, pattern aligné sur `supabase/functions/sync-push/test.ts`. Cas couverts : 401 sans token, purge sélective sur seuil 30j, échec partiel.

### 4.3 Frontend

**`src/components/settings/sections/account/DangerCard.tsx`** (extrait de `AccountSection.tsx`) :

- `onDelete()` enchaîne : RPC → retry MFA si `aal2_required` → purge locale → `signOut({ scope: 'global' })`.
- L'extraction du composant en fichier dédié est un refactor opportun (le fichier `AccountSection.tsx` fait actuellement 940 lignes ; la `DangerCard` va grossir avec la logique MFA-retry).

**`src/lib/sync/local-purge.ts`** (nouveau) :

- `purgeLocalCloudData()` supprime les Tauri Store : `sync-snippets.json`, `sync-dictionary.json`, `sync-queue.json`, `sync-meta.json`.
- Invoque la commande Tauri `delete_all_local_backups`.
- Couvert par un test unitaire vitest (mock `Store` et `invoke`).

**`src-tauri/src/sync.rs`** :

- Nouvelle commande `delete_all_local_backups` : itère le dossier `backups/` dans `app_data_dir`, `fs::remove_file` chaque `.json.gz`. Idempotent (no-op si dossier vide).
- Permission ajoutée dans `src-tauri/capabilities/default.json`.

**`src/contexts/AuthContext.tsx`** :

- Nouveau state `deletionPending: { requestedAt: string; purgeAt: string } | null`.
- Effet déclenché quand `status === 'signed-in'` ET (`!hasMfa` OU `aal === 'aal2'`) : SELECT sur `account_deletion_requests` filtrée par `user_id = auth.uid()`. Populate ou clear `deletionPending`.
- Helper pur `extractAalFromJwt(access_token)` (testé unitairement) pour décoder le claim `aal` du JWT — le claim n'est pas exposé sur `session.user`, il faut le lire dans le payload du token.
- `requireAal2()` : helper qui ouvre le MFA challenge modal et résout quand AAL2 atteint, utilisé par `DangerCard.onDelete` et `DeletionPendingScreen.onCancel`.

**`src/components/auth/DeletionPendingScreen.tsx`** (nouveau) :

- Affiche les deux dates (demande, purge prévue), le countdown, et trois actions : annuler, se déconnecter, mode local.
- Annulation : `supabase.rpc('cancel_account_deletion')` avec retry MFA si nécessaire. Sur succès, met `deletionPending` à `null` (l'app normale s'affiche).
- "Mode local" : `signOut()` (le mode local de Voice Tool reste accessible signed-out).

**`src/App.tsx`** : `if (auth.deletionPending) return <DeletionPendingScreen ... />` court-circuite l'UI normale (avant tout le reste). Pattern aligné sur la gestion existante de l'AuthModal pour les signed-out.

**i18n** : nouvelles clés sous `auth.deletion_pending.*` et `sync.delete_account.aal2_required` dans `fr.json` et `en.json`. Aucune string en dur (alignement feedback `feedback_i18n_required.md`).

## 5. Tests

### 5.1 pgtap — `supabase/tests/account_deletion.sql`

- `request_account_deletion()` insère une ligne pour un user authentifié AAL1 sans MFA.
- `request_account_deletion()` raise `aal2_required` pour un user avec MFA enrolled mais session AAL1.
- `request_account_deletion()` raise `not authenticated` sans session.
- `cancel_account_deletion()` symétrique (mêmes 3 cas).
- RLS cross-tenant : user A ne peut pas SELECT/DELETE la demande de user B (fixture multi-users, pattern sub-épique 02).

### 5.2 Edge Function (Deno) — `supabase/functions/purge-account-deletions/test.ts`

- 401 sans / mauvais Bearer.
- N'appelle pas `auth.admin.deleteUser` pour des requêtes < 30j.
- Appelle `auth.admin.deleteUser` pour chaque user dont `requested_at < now() - 30d`.
- Sur 3 users dont 1 erreur, les 2 autres sont quand même supprimés et la réponse liste l'erreur.

### 5.3 Vitest frontend

- `purgeLocalCloudData()` : les 4 stores sont supprimés ET `delete_all_local_backups` est invoqué.
- `extractAalFromJwt()` : décode correctement le claim `aal` d'un access token typique.

### 5.4 E2E manuel — `docs/v3/03-account-deletion-e2e-checklist.md`

1. User sans MFA : cycle complet demande → re-login bloqué → annulation → app normale.
2. User avec MFA : demande déclenche MFA challenge, retry succès.
3. User avec MFA : annulation déclenche MFA challenge, retry succès.
4. Sessions actives multi-devices : demande sur PC1, PC2 perd accès au prochain refresh (constater dans la minute).
5. Trigger manuel cron sur tombstone backdatée à -31j : user disparaît de `auth.users`, toutes les tables FK vidées, tombstone disparue (cascade).
6. Recovery codes : MFA TOTP perdu, user utilise recovery code, atteint AAL2, peut annuler.

## 6. Déploiement et rollback

### Ordre de déploiement (chaque étape réversible)

1. Local : `pnpm exec supabase db reset` + tests pgtap verts.
2. Push migrations distantes : `pnpm exec supabase db push`.
3. Deploy Edge Function : `pnpm exec supabase functions deploy purge-account-deletions`.
4. Set secret : `pnpm exec supabase secrets set CRON_SECRET=$(openssl rand -hex 32)`.
5. Set GUCs Postgres dans Studio SQL : `alter database postgres set app.settings.cron_secret = '...'` et `app.settings.supabase_url = '...'`.
6. Vérifier le cron actif : `select * from cron.job`.
7. Smoke test manuel : `select cron.run('purge-account-deletions-daily')`. Vérifier les logs Edge Function.
8. Frontend release : tag `v2.x.x` → CI build/sign/release. Auto-update livre aux clients existants.

### Rollback

- **Migrations** : la nouvelle est additive. Downgrade = restaurer le RPC `request_account_deletion` à sa version actuelle (script SQL prêt dans le runbook).
- **pg_cron** : `select cron.unschedule('purge-account-deletions-daily')` désactive sans toucher aux migrations.
- **Edge Function** : `pnpm exec supabase functions delete purge-account-deletions` ou simplement ne plus l'appeler (unschedule du cron suffit).
- **Frontend** : auto-update peut downgrade via tag précédent. Les clients à jour avec backend rolled back verront le RPC `cancel_account_deletion` en 404 ; l'erreur est affichée dans `DeletionPendingScreen` mais ne bloque pas l'app.

### Risques

| Risque | Mitigation |
|---|---|
| `auth.admin.deleteUser()` échoue silencieusement | Logs structurés Edge Function ; vigilance manuelle Supabase Logs pour v3.0 ; alerte automatique en suivi |
| `pg_cron` non activé sur le projet | Vérifier `select * from pg_extension where extname='pg_cron'` avant push ; activable via Dashboard si manquant |
| User MFA perd tout pendant la fenêtre | Comportement souhaité, documenté |
| Race annulation J+29 23:59 / cron J+30 00:00 | DELETE-RETURNING dans l'Edge Function (cf. 4.2) sérialise : si l'annulation passe avant, le RETURNING ne voit pas la ligne ; si elle passe après, la tombstone est déjà supprimée mais le `auth.admin.deleteUser` est en route — le user voit sa demande "annulée" en UI mais la purge se déclenche quand même. Fenêtre de course : quelques ms par jour à 03:00 UTC, acceptable |

## 7. Hors-scope

### Reporté (dépendances externes ou jugé non-critique)

- Email de confirmation immédiat — dépend du SMTP custom (ADR 0009).
- Email de rappel J-3 avant purge — idem + second pg_cron.
- Polling périodique de la tombstone côté client — non nécessaire grâce au `signOut({ scope: 'global' })`.
- Page web "annuler ma suppression" sur le repo `voice-tool-auth-callback` — utile uniquement avec un email contenant un lien d'annulation.
- Alerting automatique sur erreurs Edge Function (webhook Slack) — monitoring manuel pour v3.0.

### Délibérément exclu (pas un report)

- Purge des transcriptions et recordings locaux (100% locaux, jamais syncés).
- Purge des settings non-syncés (clés API, raccourcis hardware).
- Suppression instantanée sans grace period (la fenêtre 30j est un filet de sécurité explicite et conforme RGPD).
- Audit trail dédié des suppressions (la cascade fait disparaître la tombstone elle-même, ce qui est la disposition RGPD attendue).

## 8. Documentation parallèle

- `docs/v3/decisions/0011-account-deletion-completion.md` — ADR de clôture, ferme officiellement le report tracé en 0009/0010.
- `docs/v3/compliance/registre-traitements.md` — ajouter la mention "purge automatique 30j via pg_cron + auth.admin.deleteUser".
- `docs/v3/runbooks/account-deletion-purge.md` — runbook : lancer manuellement le job, investiguer les échecs, rollback.
- `docs/v3/03-account-deletion-e2e-checklist.md` — checklist E2E (pattern aligné sur sync-settings).
