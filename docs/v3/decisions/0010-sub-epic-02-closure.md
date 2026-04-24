# ADR 0010 — Clôture sous-épique 02-sync-settings

- **Statut**: Accepté
- **Date**: 2026-04-24

## Résumé

Sous-épique 02 livrée : sync cloud des settings scalaires (9 clés mappées) + dictionnaire + snippets via Supabase + Edge Function `sync-push`. LWW par item, soft-delete, backup local automatique, GDPR export + delete, toggle explicit dans Settings > Compte.

## Ajustements vs spec initiale `02-sync-settings.md`

- **Architecture TS au lieu de Rust** (spec disait "module sync.rs"). Justification : cohérence avec pattern sub-épique 01 où la session vit côté React, lifecycle React naturel, pas de duplication de state. Module Rust limité à I/O filesystem (backups, export download).
- **Retrait de `user_prompts` et `user_translation_presets`** (décision 2026-04-24). Ces features n'existent pas dans l'app. Les tables seront créées quand les features existeront. Scope v3.0 réduit à 3 tables (settings, dico, snippets) au lieu de 5.
- **Sync mono-profil** (décision 2026-04-24). La v3.0 sync uniquement le profil actif. Multi-profils cloud = v3.x. Warning UI en place pour users multi-profils.
- **Clés scalaires syncables = 9** au lieu de la totalité du settings blob : UI (theme + ui_language), 3 hotkeys, 2 features (insertion_mode + enable_sounds), 2 transcription (provider + local_model_size). Reste local-only.
- **Pull = direct supabase-js + RLS**, **Push = Edge Function** (validation Zod + quota). Mix qui garde la simplicité pour la lecture et la défense en profondeur pour l'écriture.
- **Quota = post-apply** dans l'Edge Function (au lieu de pré-check). Simplifie l'atomicité des batches. Trade-off : un user peut très brièvement dépasser pendant un push avant qu'on rejette le batch suivant. Acceptable en v3.0.
- **Tests RLS automatisés** via pgtap (spec disait "tests Playwright + Supabase client" — on a préféré pgtap plus natif DB).
- **Validation runtime des payloads cloud** côté client (zod `CloudUserSettingsRowSchema` / `CloudDictionaryWordRowSchema` / `CloudSnippetRowSchema` / `PushResponseSchema`) pour éviter la propagation silencieuse de données malformées. Ajout d'un champ `invalid` dans `PullResult` pour remonter le nombre de rows rejetées.
- **Mutex per-store** (`src/lib/sync/_mutex.ts`) ajouté suite à review code-quality : les mutators des 3 stores locaux (snippets, dictionary, queue) sont sérialisés via promise-chain mutex pour éviter les pertes sur modifs concurrentes.
- **Migration legacy inconditionnelle** au mount de `useRecordingWorkflow` : les users qui n'activent jamais la sync récupèrent aussi leurs snippets/dictionary legacy dans les nouveaux stores. Évite la régression du recording workflow post-Task 18.

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
- **Déploiement Edge Functions `sync-push` + `account-export`** — à autoriser par l'user.
- **Vérification runtime SQL + pgtap** — nécessite Docker Desktop local ou push distant pour confirmer (la review statique a validé la syntaxe).
- **Déduplication UI delete-account** — SecuritySection a désormais la version avec confirmation forte ; AccountSection legacy minimal a été retiré (cf. commit cleanup).
- **Lock CORS Edge Functions** aux origines Tauri officielles (actuellement `*`).
- **Tests Deno Edge Functions** (`sync-push/test.ts` avec branches mockées + quota edge-case).

## Processus de révision

ADR figé. Ajustements ultérieurs = nouvel ADR ou sub-épiques 03+.
