# Runbook — rotation des secrets

## Fréquence

- **Préventive** : annuelle, sans urgence.
- **Immédiate** : si suspicion de compromission (fuite, logs exposés, départ d'un tiers ayant eu accès, scan révélant un pattern dans un bundle publié).

## Secrets couverts

| Secret | Où | Impact rotation | Procédure ci-dessous |
|---|---|---|---|
| Supabase `service_role` key | Supabase dashboard + GitHub Secrets | Edge functions HS pendant la bascule | §1 |
| Supabase JWT secret | Supabase dashboard | **Invalidation de toutes les sessions users** | §2 |
| Webhook secret Lemon Squeezy (v3.2+) | LS dashboard + env var côté Edge Function | Webhooks rejetés jusqu'à bascule | §3 |
| Clé privée updater (Tauri) | GitHub Secret `TAURI_SIGNING_PRIVATE_KEY` | **Nouvelles releases ne seront pas reconnues par les anciennes versions de l'app** (blocage update) | §4 |
| DB password Supabase | Gestionnaire mdp perso uniquement | Accès admin SQL pendant la bascule | §5 |

## §1 — Rotation `service_role` key

1. Dashboard Supabase → `Settings` → `API` → `Reset service_role key`
2. Copier la nouvelle clé
3. GitHub → `Settings` → `Secrets and variables` → `Actions` → éditer `SUPABASE_SERVICE_ROLE_KEY`
4. Relancer tous les workflows qui dépendent du secret (Edge Functions deploy, tests d'intégration)
5. Mettre à jour le gestionnaire de mots de passe perso
6. Vérifier : 1 edge function marche en appelant un endpoint qui requiert service_role

## §2 — Rotation JWT secret

⚠️ **Bascule destructrice pour les users**. Planifier en maintenance.

1. Prévenir les users via status page / email
2. Dashboard Supabase → `Settings` → `API` → `Regenerate JWT secret`
3. Tous les tokens existants deviennent invalides → users devront se reconnecter
4. Aucun changement GitHub à faire (Supabase gère la clé côté serveur)

## §3 — Rotation webhook Lemon Squeezy

(À documenter précisément lors du sous-épique 04 quand LS sera intégré. Placeholder pour l'instant.)

## §4 — Rotation clé privée updater

⚠️ **À ne faire qu'en cas d'exposition avérée**. La clé privée publie toutes les releases ; la changer signifie que les users sur la version N ne pourront pas auto-update vers N+1 signée avec la nouvelle clé tant qu'ils n'auront pas réinstallé manuellement.

1. Générer la nouvelle paire : `pnpm tauri signer generate --write-keys src-tauri/private.key --ci -p ""`
2. Ne **pas** commiter `src-tauri/private.key`
3. Remplacer la clé publique dans `src-tauri/tauri.conf.json` (champ `plugins.updater.pubkey`)
4. GitHub → `Settings` → `Secrets` → remplacer `TAURI_SIGNING_PRIVATE_KEY` avec le contenu du nouveau fichier `.key`
5. Publier une release **avec communication** demandant aux users d'installer manuellement
6. Archiver l'ancienne clé dans un stockage sécurisé hors-ligne (peut servir pour vérifier des signatures d'anciens artefacts)

## §5 — Rotation DB password Supabase

1. Dashboard Supabase → `Settings` → `Database` → `Reset database password`
2. Mettre à jour le gestionnaire de mots de passe perso
3. Si une edge function ou un script externe utilise ce password directement (ce qui ne devrait pas être le cas — privilégier service_role key) : mettre à jour les secrets correspondants

## Historique des rotations

| Date | Secret | Raison (préventive / compromission) | Opérateur |
|---|---|---|---|
| <à remplir> | | | |
