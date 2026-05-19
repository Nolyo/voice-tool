# ADR 0016 — Stratégie de synchronisation notes

- **Statut**: Accepté
- **Date**: 2026-05-19
- **Contexte de la décision**: préparation autonome du sous-épique 03-sync-notes, calage sur le pattern figé en [ADR 0008-sync-strategy](0008-sync-strategy.md).

## Contexte

Le sous-épique 03 livre la sync cloud des notes texte (livraison dans une future bêta `v3.0.0-beta.X`). Le stub historique [`03-sync-notes.md`](../03-sync-notes.md) listait 8 questions ouvertes. Le pattern sync settings (sub-épique 02) est livré et stabilisé : 3 tables, RLS deny-by-default, Edge Function `sync-push`, LWW par item, soft-delete, lifecycle-based (login/focus/modif/logout), backup local, quota 5 MB.

Cet ADR fige les décisions transverses sur la sync notes. Toutes les questions du stub sont tranchées par alignement maximal sur le pattern settings, sauf justification explicite.

## Décisions figées

### 1. Périmètre

**Syncé dans le présent sous-épique** :
- **Notes** : `id`, `title`, `content_html` (TipTap HTML brut tel que stocké actuellement), `folder_id`, `favorite`, `order`, `created_at`, `updated_at`, `deleted_at`.
- **Dossiers** : `id`, `name`, `order`, `created_at`, `updated_at`, `deleted_at`.

**Non syncé** :
- Backlinks (recalculés client-side post-pull, cf. `get_backlinks` Rust existant).
- Recherche full-text (reste client-only).
- Sélection courante / état UI éditeur.
- Images embarquées via `data:` URI (couvertes par le hard cap par note — cf. décision 7).

### 2. Schéma DB — Deux tables séparées

- `user_notes` (UUID client-side, LWW par item, soft-delete).
- `user_folders` (UUID client-side, LWW par item, soft-delete).
- FK `user_notes.folder_id → user_folders(id) ON DELETE SET NULL` côté serveur, cohérent avec le comportement local `orphan_notes_in_folder` (suppression dossier = notes orphelines, jamais perdues).
- FK `user_id → auth.users(id) ON DELETE CASCADE` pour droit à l'oubli GDPR.
- `updated_at` généré serveur (`default now()` + trigger).

Justification : même pattern que `user_snippets` (déjà éprouvé en sub-epic 02). Tables séparées plutôt que blob unique parce qu'une note peut peser jusqu'à 1 MB (cf. décision 7) et que la collection grossit dans le temps — un blob serait ré-écrit intégralement à chaque keystroke debounced.

### 3. Sync engine — Lifecycle-based, pas Realtime

- Pull complet au **login** (notes + folders).
- Pull incremental au **focus post-inactivité >5 min**.
- Push debounced **2s** par note (vs 500ms settings) à chaque save local — voir décision 4.
- Push immédiat pour les opérations structurelles (create, delete, move folder, rename folder, toggle favorite, reorder).
- Flush queue au **logout**.
- Queue Tauri Store réutilisée (un seul `sync_queue` partagé settings + notes + folders).
- Retry backoff 1s → 5s → 30s → 2min → 5min (inchangé).

Pas de Realtime Supabase. Use case mono-user multi-device, pas collaboratif.

### 4. Debounce push notes — 2s vs 500ms settings

Un utilisateur tape dans une note à ~5 keystrokes/sec. Avec debounce 500ms, chaque pause >500ms déclenche un push. Avec debounce 2s, le push se déclenche quand l'user s'arrête vraiment d'écrire — typiquement à la fin d'un paragraphe ou avant de cliquer ailleurs.

Trade-off : on accepte jusqu'à 2s de perte côté serveur en cas de crash brutal du device pendant frappe (le contenu est sur disque local immédiatement via `update_note`, donc pas de perte réelle utilisateur).

Bénéfice : ~4× moins de pushes pour une session de frappe continue, Supabase free tier préservé.

### 5. Conflict resolution — LWW par item + soft-delete

- LWW sur le row `user_notes` complet (titre + contenu + folder_id + favorite + order via `updated_at` serveur).
- LWW par folder.
- Soft-delete via `deleted_at`. Le plus récent entre `deleted_at` et `updated_at` gagne (idem snippets).
- Pas de notification conflict, pas de merge interactif, pas de CRDT.
- Pas de granularité champ-par-champ : si user A renomme une note pendant que user B modifie son contenu sur un autre device, le dernier `updated_at` écrase l'autre intégralement. Mitigations standard (backup local + export GDPR).

### 6. Soft-delete & purge

- `delete_note` côté Rust passe en **soft-delete** : set `deleted_at` au lieu de `fs::remove_dir_all`. Le dossier physique reste sur disque jusqu'à la purge.
- `list_notes` filtre `deleted_at IS NULL`.
- Purge locale au login post-pull réussi : si une note a `deleted_at` non null **côté serveur** ET que le pull est successful, on hard-delete le dossier `notes/<id>/` localement (libère espace disque).
- Purge serveur : cron 30 jours (Edge Function nouvelle ou extension de `purge-account-deletions`). Décision impl reportée au sprint.
- Restore depuis corbeille UI : reporté ultérieurement.

### 7. Quota freemium hybride & hard cap par note

**Quota par plan** :

| Plan | Quota global (toutes tables syncées confondues) | Warning UI |
|---|---|---|
| **Free** (signup gratuit) | 10 MB | à 8 MB (80%) |
| **Starter** (5€/mois, ADR 0013) | 100 MB | à 80 MB (80%) |
| **Pro** (9€/mois, ADR 0013) | 500 MB | à 400 MB (80%) |

**Hard cap par note** : 1 MB (validation Edge Function + check constraint Postgres), **identique pour les 3 plans**. Ce n'est pas un cap "anti-volume" mais un cap "anti-abus" (bloque image base64 massive, log géant, fuite mémoire client).

**Implémentation Edge `sync-push`** :
1. Lire le plan courant de l'user via la table `subscriptions` (sub-epic 04 livré).
2. Mapper plan → quota selon la table ci-dessus. Plan inconnu / sans abo actif → fallback `free`.
3. Calcul `compute_user_sync_size(user_id)` après l'apply du batch.
4. Si dépassement, rollback du batch + HTTP 413 avec body `{ error: "quota_exceeded", plan, used, limit }` pour permettre à l'UI d'afficher un message d'upsell ciblé.

**Comportement post-downgrade Pro → Starter / Starter → Free** : enforcement **soft** sur le data existant — pas de suppression auto. Le user dépasse temporairement son quota, l'UI affiche un warning permanent ("Tu utilises 87 MB sur les 10 MB de ton plan Free. Re-souscris ou supprime des notes pour pouvoir continuer à éditer sur tous tes devices."), et les nouveaux pushs sont bloqués jusqu'à ce qu'il redescende sous le seuil. Standard industrie (Notion, Dropbox).

Justification :
- **Free 10 MB** : permet une vraie expérience sync (couvre ~100 notes moyennes) — assez pour onboarder, pas assez pour exploiter le free-tier comme stockage cloud illimité.
- **Starter 100 MB** : valeur claire vs Free (10×), couvre un usage "power user" confortable.
- **Pro 500 MB** : marge confortable pour les users qui s'appuient sur les notes au quotidien. Bumpable ultérieurement si le retour terrain le justifie.
- Évite de tomber dans le piège "Pro = illimité" qui exposerait à des cas pathologiques (1 user qui pousse 50 GB) sans bénéfice business clair.

À réévaluer post-traction via nouvel ADR si une cohorte significative se cogne au plafond du plan correspondant.

### 8. Migration des notes locales existantes

- Modale **first-login** si `liste_notes_locales > 0` OU `liste_folders_locaux > 0`.
- Sinon : upload silencieux (cas signup vierge).
- 2 options : **"Uploader mes notes actuelles"** (default) ou **"Partir d'un setup neuf"**.
- Backup local automatique dans tous les cas. Format : extension du JSON pre-sync existant avec sections `notes: [...]` et `folders: [...]` (pas de ZIP séparé).
- Cas "notes cloud + notes locales" : merge safe via UUIDs distincts (jamais de collision create), pas de perte.

### 9. Format contenu

- `content_html text NOT NULL`, valeur `''` autorisée (note vide).
- Le serveur ne touche jamais au HTML — pas de sanitization, pas de parsing.
- Risque XSS uniquement côté éditeur TipTap, qui sandboxe déjà par design (déjà géré dans `NotesEditor`).
- Pas de chiffrement E2E (cf. ADR 0002, server-side encryption style Notion).

### 10. Multi-profil

- Sync mono-profil (idem ADR 0010 sub-epic 02). Seul le profil actif sync ses notes.
- Multi-profil cloud reporté ultérieurement.
- Warning UI existant (`AccountSection.tsx`) déjà en place pour users multi-profils.

### 11. UX

- Pas de toggle séparé "Sync notes" : le toggle global "Synchronisation cloud" (Settings > Compte) couvre settings + notes + folders.
- Page transparence "Voir ce qui est synchronisé" mise à jour avec compteurs notes + folders.
- Status indicator header inchangé (4 états).
- Pas d'indicateur de statut sync par note (nice-to-have, reporté ultérieurement). Le status global suffit.
- Pas de "cette note a été modifiée sur un autre device" pop-up : on accepte le silent overwrite LWW, mitigations standard (backup + export).
- Pagination : pas dans le présent sous-épique (le client charge la liste complète déjà aujourd'hui, ça scale jusqu'à ~1000 notes).

### 12. Backlinks

- Reste 100% client-side, recalcul après chaque pull.
- Si une note référencée n'existe plus localement (cas suppression cross-device), `BrokenNoteLinkDialog` gère déjà gracieusement.
- Pas de table `user_note_links` côté serveur. KISS.

### 13. Réversibilité

- **Désactiver la sync** = pause, data cloud conservée, notes locales conservées (idem settings).
- **Supprimer mon compte** = delete complet GDPR (cascade auth.users, purge keyring).
- L'export GDPR (Edge Function `account-export`) doit être étendu pour inclure notes + folders.

## Justification

### Pourquoi 2 tables et pas blob unique

Une note peut peser 100 KB en pratique (texte riche, code blocks). Re-pousser le blob à chaque keystroke debounced = 100 KB × 30 pushes/min = scale-killer Supabase free + bandwidth user. Tables séparées permettent push par item avec LWW natif.

### Pourquoi pas de CRDT (Yjs/Automerge)

- Mono-user multi-device, pas collaboratif. Le scénario "2 devices ouvrent la même note en même temps" reste rare (un humain est sur une machine à la fois).
- Coût intégration énorme : format binaire incompatible avec TipTap HTML actuel, migration complexe, debug pénible.
- Mitigations standard (backup auto + export GDPR + LWW prévisible) suffisent.
- Réversible : un futur ADR peut introduire CRDT sur `content_html` uniquement si un cas user power le justifie.

### Pourquoi pas de Realtime

Cohérent avec ADR 0008. Un WebSocket permanent coûte un connect actif par client × user × device, sans bénéfice mono-user. Lifecycle-based suffit.

### Pourquoi soft-delete au lieu de hard-delete immédiat

Sans tombstone, on ne peut pas propager une suppression : Device A supprime, Device B au prochain pull voit la note ne plus exister côté serveur et... ne sait pas si c'est une suppression ou un row jamais sync. Le soft-delete + `deleted_at` propage explicitement la suppression.

Coût : on conserve les notes sur disque 30j max (purge cron). Acceptable.

### Pourquoi un freemium hybride 10 / 100 / 500 MB

5 MB sub-epic 02 couvre settings + dico + snippets confortablement. Les notes seules peuvent saturer 5 MB rapidement (50 notes × 100 KB). Trois options envisagées :

1. **Sync notes payant uniquement** — rejeté : casse l'argument "crée ton compte, ton setup te suit" et fissure la cohérence avec sync settings gratos. Aucun pattern industrie ne paywall complètement la sync (Notion, Obsidian Sync, Apple Notes ont tous un free tier).
2. **Quota uniforme 10 MB pour tous** — simple mais expose au cas pathologique d'un user free qui pousse régulièrement à la limite sans value capture. Et ne valorise pas le plan payant côté stockage.
3. **Freemium hybride** (retenu) — Free 10 MB pour onboarding réel, Starter 100 MB (10×) pour power users, Pro 500 MB (50× Free) pour confort total. Ajoute une seconde dimension de valeur au plan payant (en plus des minutes de transcription managée).

Le freemium n'introduit pas de complexité majeure : l'Edge `sync-push` lit déjà la table `subscriptions` post sub-epic 04, un simple `switch (plan)` sur le quota suffit.

### Pourquoi 1 MB hard cap par note

Une note de 1 MB en TipTap HTML = ~50 000 mots de texte plat ou ~50 pages A4. Au-delà, c'est probablement une fuite (image base64 collée, log géant). Cap protecteur, jamais atteint par un usage normal.

### Pourquoi debounce 2s vs 500ms

Frappe continue à 5 char/s = un push toutes les 100ms si pas debouncé. Settings (modifs ponctuelles) → 500ms ok. Notes (frappe continue) → 2s minimise le push spam sans dégrader l'UX (la note est déjà save sur disque local immédiatement).

## Conséquences

### Positives

- Réutilise 90% du sync engine settings (queue, retry, mutex, mapping, merge LWW, backups).
- Fondations propres : sync transcriptions (ultérieurement) suivra le même pattern par item.
- Backlinks restent intégralement local — pas de complexité serveur.
- Soft-delete + purge 30j = "corbeille implicite" gratuite (restore UI = ultérieurement si demandé).

### Négatives / risques acceptés

- **LWW silent overwrite** : édition concurrente sur 2 devices = perte d'une version. Fréquence rare. Mitigations standard.
- **Cap 1 MB par note** : limite réaliste mais peut frustrer un user qui colle une image. UX : message explicite "Cette note dépasse 1 MB. La sync est désactivée pour cette note jusqu'à réduction. Tes autres notes continuent de syncer."
- **Backend Rust à modifier** : ajouter `deleted_at` à `NoteMeta` + `updated_at` à `FolderMeta`, refactor `delete_note` en soft-delete. Migration des fichiers existants nécessaire.
- **Soft-delete fichiers locaux** : les dossiers `notes/<id>/` survivent jusqu'à la purge post-pull. Petite empreinte disque temporaire.

### Mitigations

- Tests RLS cross-tenant pgtap sur `user_notes` + `user_folders` (bloquant release).
- Backup local étendu (inclut notes + folders).
- Export GDPR étendu (notes + folders).
- Hard cap par note appliqué côté client AVANT push (économie bandwidth) + côté Edge Function (défense en profondeur).
- Logs sync côté client : table + item ID + opération + timestamp (zéro contenu).

## Décisions reportées

- **Restore depuis corbeille** (UI) — ultérieurement si demande user.
- **Indicateur sync par note** (pastille verte/orange/grise) — ultérieurement.
- **Realtime / collab temps réel** — ultérieurement si use case émerge.
- **FTS Postgres serveur** — ultérieurement si user power demande.
- **Pagination liste notes** — ultérieurement si user atteint >1000 notes.
- **CRDT sur content_html** — ultérieurement si LWW silent overwrite remonte régulièrement.
- **Chiffrement E2E** — pas planifié (cf. ADR 0002).
- **Compression gzip payloads notes** — si users dépassent quota régulièrement.
- **Trust `client_modified_at` pour pushes offline** — partagé avec sub-épique 02, reporté ultérieurement.
- **Edge Function purge tombstones cron 30j** — choix impl (nouvelle Edge dédiée vs extension `purge-account-deletions`) reporté au sprint.

## Processus de révision

Cet ADR est **figé**. Toute révision passe par un nouvel ADR qui supersede celui-ci. Le document [`03-sync-notes.md`](../03-sync-notes.md) est un living document, révisé à chaque clôture de PR ou découverte en implémentation.

## Références

- [ADR 0002 — Server-side encryption](0002-server-side-encryption.md)
- [ADR 0008 — Sync strategy settings](0008-sync-strategy.md)
- [ADR 0010 — Closure sub-epic 02-sync](0010-sub-epic-02-closure.md)
- [02 — Sync settings](../02-sync-settings.md)
- [03 — Sync notes](../03-sync-notes.md)
- [Threat model v3](../00-threat-model.md)
