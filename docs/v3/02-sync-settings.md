# 02 — Sync settings (sans clés API)

> **Statut**: 📝 Stub.
> **Cible**: v3.0.
> **Dépendances**: 00, 01.

---

## Décisions déjà actées (cf. EPIC.md)

- Posture chiffrement: **server-side, style Notion** ([ADR 0002](decisions/0002-server-side-encryption.md))
- Clés API: **jamais syncées**, device-local uniquement ([ADR 0003](decisions/0003-api-keys-device-local.md))

---

## Périmètre — ce qui synchronise

À détailler par catégorie:

- [ ] Préférences UI (theme, langue, taille mini-window, position…)
- [ ] Hotkeys
- [ ] Snippets
- [ ] Dictionnaire personnalisé
- [ ] Prompts IA personnalisés
- [ ] Préréglages de traduction (cf. EPIC-03 du backlog)
- [ ] Choix du provider transcription (mais pas la clé)
- [ ] Choix du modèle local
- [ ] Toggles features (auto-paste, sounds, etc.)

## Périmètre — ce qui NE synchronise PAS

- ❌ Clés API (cf. ADR 0003) — message UX explicite obligatoire
- ❌ Modèles whisper-rs téléchargés (re-téléchargeables, lourds)
- ❌ Audios bruts (cf. décision périmètre v3.0)
- ❌ Historique transcriptions (cf. décision périmètre v3.0)
- ❌ Cache, logs, données de debug

---

## Questions à trancher

### Schéma DB

- [ ] Une table `user_settings` avec une colonne `data jsonb`? Ou colonnes typées?
- [ ] Versioning du schéma (migration future si on ajoute des champs)
- [ ] RLS: `select/update own only`
- [ ] Index sur `user_id`
- [ ] Trigger `updated_at`

### Sync engine

- [ ] Fréquence: à chaque modification (debounced)? Toutes les X min? Au login/logout?
- [ ] Sens: pull-then-push, push-then-pull, ou bidirectionnel temps réel (Supabase Realtime)?
- [ ] Stratégie de fetch initial: full pull au login
- [ ] Détection des changements distants: polling? Realtime channel?

### Conflict resolution

- [ ] Last-write-wins simple (basé `updated_at`)?
- [ ] Merge granulaire par champ (snippet par snippet)?
- [ ] Notification utilisateur en cas de conflit?
- [ ] Backup automatique avant overwrite?

### Migration des settings locaux existants

- [ ] User actuel a un fichier Tauri Store rempli — comment l'uploader à l'opt-in?
- [ ] Backup obligatoire pré-migration (export JSON local)
- [ ] Reversibilité (peut-on retourner à 100% local après avoir activé la sync?)

### UX

- [ ] Toggle "activer la sync" dans les settings
- [ ] Status indicator: "synchronisé / synchronisation… / erreur"
- [ ] Page "que synchronise-t-on?" listant explicitement (transparency)
- [ ] **Message clés API non syncées** — design + emplacement + ton

### Offline

- [ ] L'app reste 100% fonctionnelle offline (sync mise en attente)
- [ ] Queue des modifications offline → push au retour online
- [ ] Détection réseau côté Tauri (plugin? polling?)

### Coût / quota

- [ ] Taille moyenne du blob settings? (estimation: < 100 KB)
- [ ] Limite par utilisateur? (paranoia: éviter qu'un user pousse 10 MB de snippets)

---

## Livrables attendus

1. Schéma DB + migration SQL
2. Module sync côté Rust (queue, conflict, retry)
3. UX settings avec toggles + status + message clés API
4. Tests E2E du flow opt-in / sync / restore sur nouveau device
5. ADR `0007-sync-conflict-strategy.md` (selon choix)
