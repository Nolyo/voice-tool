# ADR 0008 — Stratégie de synchronisation settings v3.0

- **Statut**: Accepté
- **Date**: 2026-04-22
- **Contexte de la décision**: session de brainstorming dédiée au sous-épique 02-sync-settings

## Contexte

L'EPIC v3 livre en v3.0 **l'auth + la sync des settings étendus** (stratégie "Y3" décidée en session) : préférences UI, hotkeys, feature toggles, dictionnaire, snippets, prompts IA, préréglages de traduction. Les notes texte restent dans le sous-épique 03 (v3.1). Le billing est décalé en v3.2.

Cette décision élargit le périmètre initial du stub 02 (qui envisageait aussi un billing en v3.0) tout en excluant les notes texte (reportées). Elle nécessite de figer la stratégie technique de sync avant l'implémentation.

## Décisions figées

### 1. Périmètre — Stratégie Y3

**Syncé en v3.0** :
- Scalaires : theme, language, hotkeys (toggle, push-to-talk, open window), feature toggles (auto-paste, sound effects), transcription provider + local model
- Collections : dictionnaire personnalisé, snippets, prompts IA, préréglages de traduction

**Non syncé (rappels ADRs + EPIC)** :
- Clés API (ADR 0003, device-local)
- Settings per-device (microphone, sample rate, window geometry, autostart)
- Notes texte (sous-épique 03, v3.1)
- Historique transcriptions, audios bruts (reportés v3.1+ et v3.2+)

### 2. Schéma DB — Tables séparées (pas blob unique)

- `user_settings` (jsonb scalaires, 1 row par user)
- `user_dictionary_words` (clé composite user_id + word, dédup naturelle)
- `user_snippets`, `user_prompts`, `user_translation_presets` (UUID client-side + soft-delete)

Toutes les FK en `on delete cascade` depuis `auth.users(id)` pour support GDPR (droit à l'oubli effectif via purge Postgres native).

### 3. Sync engine — Lifecycle-based, pas Realtime

- Pull complet au **login**
- Pull incremental au **focus post-inactivité** (>5 min)
- Push debounced 500ms par item à chaque **modification locale**
- Flush queue au **logout**
- Queue persistante (Tauri Store) + retry backoff 1s→5s→30s→2min→5min
- Idempotence via UUIDs client-generated

Pas de Supabase Realtime / WebSocket en v3.0 — overkill pour un use case mono-user multi-device.

### 4. Conflict resolution — LWW par item + soft-delete

- **Scalaires** : LWW sur le blob `user_settings.data`
- **Dictionnaire** : union de sets (primary key composite), soft-delete
- **Snippets / prompts / préréglages** : LWW par item (via `updated_at` de chaque row), UUIDs client-side (pas de collision create)
- **Delete vs update** : soft-delete (`deleted_at`), le plus récent des timestamps gagne
- **Timestamps** : générés serveur (`default now()`). Edge case offline assumé (reporté v3.1 si problème remonté).

Pas de notification conflict, pas d'historique serveur, pas de merge interactif, pas de CRDT en v3.0.

### 5. Migration des settings locaux existants — Choix explicite

- Modale au premier login sur device avec state non-trivial (seuils définis dans le spec)
- 2 options : "Uploader mon setup actuel" (default) ou "Partir d'un setup neuf"
- **Backup local automatique dans tous les cas** (`%APPDATA%/com.nolyo.voice-tool/backups/pre-sync_*.json`, 10 derniers conservés)
- Cas "state cloud + state local" : merge safe via stratégie Q3

### 6. Réversibilité — Pause vs Delete

- "Désactiver la sync" = **pause** (data cloud conservée, réactivable safe via re-merge)
- "Supprimer mon compte" = **delete complet GDPR** (cascade via `auth.users`, purge keyring)
- UX distingue clairement les deux actions

### 7. Quota

- **Hard limit 5 MB par user** (data synced toutes tables confondues)
- Warning UI à 4 MB (80%)
- Validation dans Edge Function `/sync/push` avant insert/update
- Impl précise (trigger compteur cache vs calcul à la volée) reportée au sprint

### 8. UX

- Toggle "Synchronisation cloud" dans Settings > Compte (OFF par défaut)
- Lien transparence "Voir ce qui est synchronisé" (obligatoire éthique)
- Status indicator dans le header (4 états : synchronisé / en cours / hors ligne / erreur)
- Message affirmatif "clés API device-local" sur Settings > API Keys (posture privacy-first)
- Liste des backups locaux accessible depuis Settings > Compte

## Justification

### Tables séparées vs blob unique

Un blob jsonb unique simplifie le schéma (1 table, 1 RLS policy) mais force à ré-écrire tout le blob (jusqu'à 300 KB) à chaque modif et rend le conflict merge complexe à coder côté app. Les tables séparées coûtent ~1 jour de plus initialement mais :
- Writes atomiques par item (scale infiniment)
- Conflict LWW natif au schéma, pas un algo à débugger
- Soft-delete via `deleted_at` = pattern standard industrie (Notion, Dropbox, Google Drive)
- Fondations prêtes pour la sync des notes (v3.1) qui suivra le même pattern
- RLS simple à générer mécaniquement

### Lifecycle-based vs Realtime

Voice Tool est un outil **mono-user multi-device**, pas collaboratif temps réel. Un lag de 5 min max entre devices est invisible pour un user qui est sur une machine à la fois. Realtime ajoute un WebSocket permanent, de la complexité (reconnect, resubscribe), et un coût infra pour un gain UX quasi nul. Extensible vers Realtime plus tard si un use case collab émerge.

### LWW par item vs merge-par-champ ou CRDT

LWW par item (pas par table entière) couvre 100% des cas normaux en mono-user multi-device. Les cas pathologiques (modif concurrente du même snippet sur 2 devices en parallèle) sont rares et acceptables tant qu'on a le backup local et le data export. CRDT (Yjs) est overkill pour ce use case et ajoute une complexité énorme (reconciliation, tombstones, garbage collection).

### Pas de notification conflict en v3.0

Avec LWW, "détecter qu'un conflit s'est produit" demande de comparer les deux versions avant merge — complexité non justifiée. Les users qui veulent de la réassurance utilisent le bouton "Exporter mes données" (GDPR) comme backup cloud. Reportable si demande utilisateur forte.

### Quota 5 MB

User "actif normal" estimé à <1 MB. Le quota 5 MB laisse 5× de marge tout en empêchant les abus (spam, push en boucle via bug client). Valeur ronde, communicable clairement, révisable à la hausse si un user légitime se cogne au plafond.

### Modale migration explicite

Upload silencieux au signup serait ergonomique mais assume que l'user veut tout pousser. Certains testent en local puis veulent un compte propre. Le choix explicite respecte l'autonomie de l'user, coûte 1 modale au premier login et s'évite totalement pour les setups vierges.

## Conséquences

### Positives

- Schéma évolutif (ajouter une collection = ajouter une table, pas toucher l'existant)
- Fondations sync propres pour les notes (v3.1) via le même pattern
- Sync safe par défaut (backup auto, réversibilité, data export, delete GDPR)
- Coût infra minimal (pas de WebSocket, pas de Realtime)
- RLS testable de façon mécanique

### Négatives / risques acceptés

- **Cas pathologique LWW** : si 2 devices modifient le même snippet simultanément, l'un des deux changements est perdu. Fréquence rare, mitigations (backup, export) en place.
- **Edge case offline timestamps** : une modif offline poussée plus tard peut écraser une modif online récente. Fréquence rare, mitigation v3.1 possible.
- **5 tables à maintenir** (vs 1 seule avec blob) : coût initial ~1 jour de plus.
- **Pas de Realtime** : un user qui ouvre Voice Tool simultanément sur 2 devices voit des updates "en retard" (jusqu'à 5 min). Acceptable pour le use case.

### Mitigations

- Tests cross-tenant RLS automatisés (mesure #1 threat model, bloquant release)
- Backup local pré-sync (10 derniers, restaurables depuis UI)
- Export JSON complet (GDPR) disponible à tout moment
- Logs côté client de chaque opération sync pour debug
- Rate limiting sur `/sync/push` pour anti-abus

## Décisions reportées

- **Impl technique quota** (trigger Postgres vs calcul à la volée) — début sprint v3.0
- **Rate limiting techno** (table Postgres vs Cloudflare) — partagé avec 01-auth, début sprint
- **Trust timestamp client pour offline** — v3.1 si problème remonté
- **Compression blob** (`gzip` côté client) — si users massifs dépassent le quota
- **Realtime subscription** — v3.x si use case collab émerge
- **Notification conflict** — v3.x si demande utilisateur forte
- **Historique serveur / undo** — v3.x, x2 stockage

## Processus de révision

Cet ADR est **figé**. Toute révision passe par un nouvel ADR qui supersede celui-ci. Le document [`02-sync-settings.md`](../02-sync-settings.md) est un living document, révisé à chaque clôture de PR ou découverte en implémentation.
