# Sub-épique 03 — Sync Notes : checklist E2E manuelle

> **À dérouler avant le tag bêta de livraison du sous-épique 03.** Bloquant.
> Calqué sur [`02-sync-settings-e2e-checklist.md`](./02-sync-settings-e2e-checklist.md).

## Prérequis

- Build prod (`pnpm tauri build`) installé sur 2 devices (A et B) ou 2 profils Windows.
- Projet Supabase Lexena linké, Edge `sync-push` v2 + `account-export` v2 + `purge-account-deletions` v2 déployées.
- Compte test : peut être créé via `Settings → Compte → Créer un compte` puis magic link.
- Migrations `20260601000800` à `20260601001000` appliquées (cf. `pnpm exec supabase migration list`).

## Scénarios

### 1. First-login signup vierge
- [ ] Sur device A propre (aucune note locale autre que la welcome note).
- [ ] Sign-up via magic link → vérification e-mail → connecté.
- [ ] **Attendu** : modale d'activation affiche `1 note(s), 0 dossier(s), …` (la welcome note compte).
- [ ] Cliquer "Activer".
- [ ] Vérifier dans Supabase Studio (`select count(*) from user_notes where user_id = '<uid>'`) qu'1 note a été poussée.

### 2. First-login avec notes locales pré-existantes
- [ ] Sur device A : créer 3 notes texte (titres variés) + 2 dossiers + déplacer 2 notes dans un dossier.
- [ ] Se connecter (compte test).
- [ ] **Attendu** : modale "compteurs : 4 note(s), 2 dossier(s), …".
- [ ] Choisir "Upload" → activer.
- [ ] Supabase Studio : vérifier `user_notes` (4 rows) + `user_folders` (2 rows).

### 3. Modif note offline puis reconnect
- [ ] Sur device A, connecté + sync activée. Couper la connexion réseau.
- [ ] Modifier une note (frappe rapide, 5-10 secondes).
- [ ] **Attendu** : modif visible localement immédiatement. Queue sync grossit (visible dans `Account → Activité sync`).
- [ ] Rétablir le réseau.
- [ ] Attendre 2-3 secondes (debounce + flush).
- [ ] Supabase Studio : `select content_html from user_notes where id = '<note-id>'` reflète la modif.

### 4. LWW silent overwrite (2 devices)
- [ ] Sur device A : modifier la note X à `T0`. Push immédiat.
- [ ] Sur device B (qui a déjà la note X via pull) : modifier la même note à `T0+5s`.
- [ ] Sur device A : recharger la note via focus window (>5 min idle) ou bouton "Sync now".
- [ ] **Attendu** : la version de B (plus récente) écrase la version de A localement.
- [ ] Inverse : refaire avec A plus récent → A gagne.

### 5. Soft-delete propagation
- [ ] Sur device A : supprimer une note (icône corbeille).
- [ ] **Attendu** : note disparaît localement immédiatement. Queue contient `note-delete`.
- [ ] Sur device B : "Sync now".
- [ ] **Attendu** : note disparaît sur B aussi.
- [ ] Supabase Studio : `select deleted_at from user_notes where id = '<note-id>'` → non null.

### 6. Delete folder orpheline les notes
- [ ] Sur device A : créer dossier F + 2 notes dedans.
- [ ] Sync les deux devices.
- [ ] Sur device B : supprimer le dossier F (icône corbeille).
- [ ] **Attendu sur B** : les 2 notes apparaissent à la racine (folderId null), le dossier disparaît.
- [ ] Sur device A : "Sync now".
- [ ] **Attendu sur A** : idem (2 notes à la racine, dossier disparu).
- [ ] Supabase Studio : `folder_id` est null pour les 2 notes (FK ON DELETE SET NULL).

### 7. Hard cap 1 MB (note >1 MB non syncée)
- [ ] Sur device A : créer une note. Coller une image base64 ~5 MB (peut être généré : `data:image/png;base64,...`).
- [ ] **Attendu UI** : banner amber "⚠️ Cette note dépasse 1 MB (5.X MB)" affichée en haut de l'éditeur.
- [ ] Vérifier dans la console : le push de cette note échoue côté Edge (400 invalid body) ou est rejeté par la contrainte Postgres CHECK (`23514`).
- [ ] Vérifier dans Supabase Studio que cette note **n'existe pas** dans `user_notes`.
- [ ] Les autres notes <1 MB se syncent normalement (pas de blocage global).

### 8. Quota free 10 MB → upsell + rejection
- [ ] Sur device A : utilisateur sans subscription active (= plan free).
- [ ] Créer ~9 MB de notes (script : copier ~1000 lignes de Lorem 9 fois).
- [ ] **Attendu UI** : carte "Plan Free — 10 MB" dans `Account → Sync` (visible dès que signed-in en plan free).
- [ ] Continuer à pousser jusqu'à 10 MB.
- [ ] **Attendu** : Edge renvoie 413 `{ error: "quota_exceeded", plan: "free", limit: 10485760 }`. SyncContext status = "quota-exceeded". Banner UI affichée.
- [ ] Vérifier que la note **précédente** (sous 10 MB) est bien syncée mais la dernière qui dépasse est rejetée.

### 8 bis. Quota cross-plan
- [ ] Via Supabase Studio : `update subscriptions set plan='starter', status='active' where user_id='<uid>'`.
- [ ] Sur device A : "Sync now".
- [ ] **Attendu** : carte plan affiche "Plan Starter — 100 MB", anciennes notes 10 MB OK, nouvelle note jusqu'à 100 MB OK.
- [ ] Forcer à `pro` → vérifier 500 MB.
- [ ] Forcer à `cancelled` → `Sync now` → 413 (fallback free).

### 9. Backlinks post-pull
- [ ] Sur device A : créer note "A" + note "B" qui référence A via le link `[[A]]` (note-link extension TipTap, `data-note-id="<A-id>"`).
- [ ] Sync.
- [ ] Sur device B : "Sync now".
- [ ] **Attendu** : note A affiche "Backlinks (1)" pointant vers B.
- [ ] Vérifier que les backlinks sont calculés localement (RPC `get_backlinks` côté Rust) — pas de requête réseau supplémentaire.

### 10. GDPR export inclut notes + folders
- [ ] Sur device A : `Account → Mes données → Exporter mes données`.
- [ ] Téléchargement JSON.
- [ ] Ouvrir le fichier : vérifier `"export_version": 2`, présence des sections `user_notes` (avec `content_html` complet) + `user_folders`.
- [ ] Vérifier que les notes soft-deleted (tombstones encore présentes serveur) figurent avec leur `deleted_at` rempli.

### 11. GDPR delete account
- [ ] Sur device A : `Account → Danger zone → Supprimer mon compte`.
- [ ] Confirmation → flow de suppression effectif (peut nécessiter recovery code 2FA).
- [ ] Attendre la déclaration de suppression côté Supabase.
- [ ] Forcer la purge via : `select cron.run('purge-account-deletions-daily');` (ou attendre le cron 03:00 UTC).
- [ ] Supabase Studio : `select count(*) from user_notes where user_id = '<uid>'` → 0. Idem `user_folders`. Idem `auth.users`.

### 12. Purge cron 30j tombstones
- [ ] Créer une note, la soft-deleter via Edge (passe par push : `note-delete`).
- [ ] Forcer dans Supabase Studio : `update user_notes set deleted_at = now() - interval '40 days' where id = '<note-id>'`.
- [ ] Idem pour un folder soft-deleted.
- [ ] Lancer manuellement : `select cron.run('purge-account-deletions-daily');`
- [ ] Vérifier dans les logs Edge Functions (`purge-account-deletions`) : `"sync_notes_purged": 1, "sync_folders_purged": 1`.
- [ ] Vérifier `select * from user_notes where id = '<note-id>'` retourne 0 row (hard-deleted).

## Critère de release

12/12 ✅. Si un cas échoue, il bloque la sortie de la bêta de livraison sub-epic 03.

## Liens

- [Spec figée](./03-sync-notes.md)
- [ADR 0016](./decisions/0016-notes-sync-strategy.md)
- [Plan d'implémentation](../superpowers/plans/2026-05-19-v3-sub-epic-03-sync-notes.md)
- [Runbook purge cron](./runbooks/account-deletion-purge.md)
