# Runbook — Managed Transcription Service

## Vue d'ensemble

- **Worker** : `lexena-transcription-api` sur Cloudflare Workers
- **Production URL** : `https://api.lexena.app`
- **Staging URL** : `https://lexena-transcription-api.<account>.workers.dev`
- **Code source** : `workers/transcription-api/`
- **Providers upstream** : Groq (transcription Whisper turbo), OpenAI (post-process gpt-4o-mini / gpt-4o)
- **Storage** : Supabase Postgres EU (tables `usage_events`, `usage_summary`, `trial_credits`, `subscriptions`)
- **Zero-retention** : aucun audio persisté côté serveur. Seuls les `provider_request_id` et la durée sont loggés.

## Secrets

| Variable | Source | Rotation |
|---|---|---|
| `GROQ_API_KEY` | Console Groq > API Keys | Manuelle, à minima trimestrielle |
| `OPENAI_API_KEY` | Console OpenAI > API Keys | Manuelle, à minima trimestrielle |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard > Settings > API | À synchroniser avec rotation Supabase |
| `SUPABASE_JWT_SECRET` | Supabase Dashboard > Settings > API > JWT Secret | À synchroniser avec rotation Supabase |
| `SUPABASE_URL` | Supabase Dashboard > Project URL | Stable |

### Procédure de rotation

```bash
cd workers/transcription-api
pnpm exec wrangler secret put <VARIABLE_NAME> --env production
# coller la nouvelle valeur quand demandé
pnpm exec wrangler deploy --env production
```

Rotation `SUPABASE_JWT_SECRET` : invalide tous les access tokens en circulation. Coordonner avec un reset Supabase Auth si applicable, sinon les utilisateurs verront un 401 jusqu'à ce que leur token rafraîchisse (~1h max via refresh token).

## Monitoring

### Cloudflare Analytics

Dashboard > `lexena-transcription-api` > Analytics :
- Requests / sec, par status code (200 / 4xx / 5xx)
- P50 / P95 / P99 latency
- Errors par endpoint (`/transcribe` vs `/post-process`)

### Supabase

Dashboard > Logs Explorer :
- Filtrer sur `usage_events` : insertions par minute, par `kind`, par `source`
- Filtrer sur `subscriptions` : changements de status

Requêtes utiles :

```sql
-- Volume par jour (transcriptions)
SELECT date_trunc('day', created_at) AS day,
       SUM(units) AS total_minutes,
       COUNT(*) AS event_count
FROM usage_events
WHERE kind = 'transcription'
  AND created_at > NOW() - INTERVAL '7 days'
GROUP BY 1
ORDER BY 1 DESC;

-- Top 10 utilisateurs du mois courant
SELECT user_id, units_total, events_count
FROM usage_summary
WHERE year_month = to_char(NOW(), 'YYYY-MM')
  AND kind = 'transcription'
ORDER BY units_total DESC
LIMIT 10;
```

### Métriques d'alerte (à configurer post-launch)

- > 1% d'erreurs 5xx pendant 5 min → email admin
- P95 latency `/transcribe` > 5s pendant 10 min → email
- `usage_events` insert rate à zéro pendant 1h en heure ouvrable → vérifier worker dispo (Cloudflare incident ?)
- Spike >10x baseline sur une heure → investiguer abuse / leak de JWT

## Incidents fréquents

### Groq 5xx prolongé

1. Vérifier https://status.groq.com.
2. Si Groq down : communiquer aux users via toast "Service de transcription momentanément indisponible" (déjà en place via `cloud:errors.provider_unavailable`).
3. Pas de fallback automatique en phase 1. Attendre rétablissement.
4. Si downtime > 30 min, reconsidérer la note "fallback OpenAI Whisper" (design §12.1) — implémentable en quelques heures.

### OpenAI 5xx ou 429 prolongé

1. Vérifier https://status.openai.com.
2. Si rate limit (429) : vérifier la consommation tokens du mois sur la console OpenAI.
3. Augmenter le tier de l'API key OpenAI si bloquant.
4. Pas de fallback en phase 1 (Llama écarté, cf. ADR 0012).

### Supabase down

1. Vérifier https://status.supabase.com.
2. Le Worker retourne 500 sur tous les appels (impossible de vérifier le quota).
3. Toast generic ("erreur réseau, réessayer plus tard").
4. Une fois Supabase rétabli, vérifier qu'aucune ligne `usage_events` n'a été perdue (la transaction Worker → Supabase est synchrone, pas de queue).

### Quota explosion / abuse suspecté

```sql
-- Top 10 users par consommation transcription du mois
SELECT user_id, units_total, events_count
FROM usage_summary
WHERE year_month = to_char(NOW(), 'YYYY-MM')
  AND kind = 'transcription'
ORDER BY units_total DESC
LIMIT 10;
```

Si un user dépasse 5h/mois (hard cap fair use, design §4.5) :
- Le Worker retourne 402 automatiquement (cf. `checkQuotaForTranscription`).
- Mail manuel proposant upgrade ou ouverture conversation (pas d'auto-bannissement).
- Si abuse manifeste (spike 10x baseline) : `UPDATE subscriptions SET status='paused' WHERE user_id=...` pour bloquer le compte.

### JWT compromis suspecté

1. Si on suspecte qu'un JWT a fuité (ex : user signale activity suspect) :
2. Forcer un revoke en Supabase : Dashboard > Authentication > Users > Revoke all sessions for user.
3. Si suspect plus large : rotation `SUPABASE_JWT_SECRET` (cf. section Secrets).

## Déploiement

### Staging

```bash
cd workers/transcription-api
pnpm exec wrangler deploy --env staging

# Smoke test
curl -i https://lexena-transcription-api.<account>.workers.dev/health
```

### Production

```bash
cd workers/transcription-api
pnpm exec wrangler deploy --env production

# Smoke test prod
curl -i https://api.lexena.app/health
```

Une fois le déploiement validé, surveiller Cloudflare Analytics les 30 minutes suivantes pour détecter d'éventuels spikes d'erreurs.

## Rollback

```bash
# Lister les versions
cd workers/transcription-api
pnpm exec wrangler deployments list --env production

# Rollback à une version précédente
pnpm exec wrangler rollback --env production --message "incident X" <version-id>
```

Le rollback n'affecte pas les données Supabase (l'append-only ledger reste intact). Si un déploiement bugué a inséré des `usage_events` incorrects, soft-delete via :

```sql
-- À utiliser en dernier recours, après validation manuelle
UPDATE usage_events
SET source = 'corrected'  -- placeholder, à adapter
WHERE created_at BETWEEN '<incident-start>' AND '<incident-end>'
  AND <critère-spécifique>;
```

## Tests pgTAP

```bash
# Sur le projet Supabase staging linked
pnpm exec supabase test db --linked
```

Tests couverts (cf. `supabase/tests/`) :
- `rls_usage_events.sql` : RLS deny-by-default, owner-read seulement
- `rls_usage_summary.sql` : idem
- `rls_trial_credits.sql` : idem
- `usage_summary_trigger.sql` : trigger `upsert_usage_summary` mis à jour atomiquement à chaque insert
