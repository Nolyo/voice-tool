# E2E Checklist — Managed Transcription

> Exécuter avant tag `v3.X.0-beta.X` qui inclut le bundle launch (auth + sync settings + managed transcription + billing).

## Pré-requis

- [ ] Worker déployé sur staging (`workers.dev`) avec secrets corrects (cf. Task 17 du plan).
- [ ] Cloudflare Rate Limiting Rules configurés (30/min/IP, 100/min/JWT) — cf. Task 18.
- [ ] Migrations Supabase appliquées en environnement de test (`supabase db push --linked` sur le projet staging).
- [ ] Insert manuel d'un row `trial_credits` pour le user de test :
  ```sql
  INSERT INTO public.trial_credits (user_id, minutes_granted, minutes_consumed, expires_at)
  VALUES ('<test-user-uuid>', 60, 0, NOW() + INTERVAL '30 days');
  ```
- [ ] Insert manuel d'un row `subscriptions` (optionnel, pour tester le path quota) :
  ```sql
  INSERT INTO public.subscriptions (user_id, plan, status, quota_minutes, overage_rate_cents, current_period_end)
  VALUES ('<test-user-uuid>', 'pro', 'active', 1000, 2, NOW() + INTERVAL '30 days');
  ```
- [ ] Build de l'app avec override staging :
  ```bash
  LEXENA_CLOUD_API_BASE="https://lexena-transcription-api.<account>.workers.dev" pnpm tauri dev
  ```

## Scénarios

### S1 — Transcription en mode trial

- [ ] Connecté avec un user qui a un `trial_credits` actif.
- [ ] Le badge `QuotaCounter` du header affiche "X min d'essai" (ou "Y jours d'essai" selon la métrique la plus contraignante).
- [ ] Settings → Cloud affiche bien le bloc "Essai gratuit en cours" avec minutes restantes et date d'expiration.
- [ ] Lancer un enregistrement court (~10s), arrêter.
- [ ] Le toast / popup affiche le texte retourné par Groq.
- [ ] La latence end-to-end est <2s pour 10s d'audio.
- [ ] `usage_events` contient une nouvelle ligne `kind=transcription, source=trial, units≈0.17` (10s ≈ 0.17 min).
- [ ] `trial_credits.minutes_consumed` a été incrémenté de la durée audio (RPC `bump_trial_minutes`).
- [ ] Le badge se met à jour après refresh manuel (Settings → Cloud → bouton Rafraîchir).
- [ ] L'historique de transcription affiche la dictée avec provider="Cloud" et apiCost=0.
- [ ] Aucun fichier WAV n'a été créé localement (zero-retention strict côté serveur, et pas de save local en mode cloud).

### S2 — Transcription en mode quota plan Pro

- [ ] Insérer un row `subscriptions` actif (cf. pré-requis).
- [ ] Désactiver le trial : `UPDATE trial_credits SET minutes_consumed = 60 WHERE user_id=...` (ou laisser expirer).
- [ ] Refresh app. `QuotaCounter` passe à "X min restantes" (basé sur quota - usage du mois courant).
- [ ] Lancer une transcription. `usage_events.source = 'quota'`.
- [ ] `usage_summary.units_total` augmente du delta minutes (vérifier la ligne `(user_id, year_month, kind=transcription)`).

### S3 — Quota épuisé (402)

- [ ] Forcer `usage_summary.units_total = quota_minutes + 300` (5h overage hard cap atteint) pour le mois courant.
- [ ] Lancer une transcription.
- [ ] L'app affiche le toast "Votre quota cloud est épuisé." (cloud:errors.quota_exhausted).
- [ ] Aucune ligne `usage_events` ajoutée (le Worker rejette en 402 avant le call Groq).
- [ ] Le mode local n'est pas déclenché en fallback automatique (cf. design §8.2).

### S4 — Provider Groq down (502)

- [ ] Tester en staging avec un `GROQ_API_KEY` invalide temporairement (ou mocker en local un Worker qui retourne 502).
- [ ] Lancer une transcription.
- [ ] L'app affiche le toast "Le service de transcription cloud est temporairement indisponible." (cloud:errors.provider_unavailable).
- [ ] **Aucune bascule automatique vers le mode local** (cf. design §8.2).
- [ ] La ligne `usage_events` n'est pas insérée (transcription pas comptabilisée si Groq échoue).

### S5 — Post-process (manuel via call direct)

> Note : le post-process n'est pas encore routé automatiquement vers le cloud côté UI (sub-epic 05 phase 1 a délibérément gardé le post-process local pour préserver les modes custom/grammar/formal qui n'existent pas côté cloud Worker). Tester via Tauri devtools console.

- [ ] Ouvrir devtools, exécuter :
  ```js
  await __TAURI__.core.invoke("post_process_cloud", {
    task: "reformulate",
    text: "ceci est un texte qui ne flow pas tres bien",
    language: "fr",
    modelTier: "mini",
    jwt: (await window.supabase.auth.getSession()).data.session.access_token,
    idempotencyKey: crypto.randomUUID(),
  });
  ```
- [ ] La réponse contient `text`, `tokens_in`, `tokens_out`, `request_id`, `source`.
- [ ] `usage_events` contient une ligne `kind=post_process, units_unit=tokens, model=gpt-4o-mini`.
- [ ] Réitérer pour les autres tasks (`correct`, `email`, `summarize`).

### S6 — Mode local préservé pour user non-signed-in

- [ ] Logout.
- [ ] `CloudContext.mode` passe à "local" (badge header disparaît, section Cloud des settings disparaît).
- [ ] Lancer une transcription : utilise whisper-rs local OU OpenAI/Groq via la clé API utilisateur, **aucune requête réseau vers `api.lexena.app`** (vérifier via DevTools network).
- [ ] L'historique enregistre l'audio localement comme avant (pas de zero-retention en mode local).

### S7 — Mode local préservé pour user signed-in mais sans eligibility

- [ ] User signed-in **sans** `trial_credits` ni `subscriptions` actifs.
- [ ] `useUsage` set `eligibility=false`, donc `mode=local`.
- [ ] Le badge `QuotaCounter` est absent.
- [ ] Settings → Cloud affiche "Aucun essai ni abonnement actif".
- [ ] Lancer une transcription : utilise le mode local existant (pas de call cloud).

### S8 — Idempotency key / retry réseau

- [ ] Mocker une erreur réseau (couper le wifi 2s après l'envoi du POST `/transcribe`).
- [ ] Vérifier dans les logs Worker que le retry interne (`withNetworkRetry` côté frontend) a bien renvoyé la même requête avec le **même `Idempotency-Key`**.
- [ ] Vérifier que `usage_events` ne contient PAS deux lignes pour le même appel — la 2e tentative doit être dédupliquée via la contrainte UNIQUE `(user_id, idempotency_key)`.
- [ ] Le résultat retourné doit être celui de la 1ʳᵉ requête (event_id réutilisé).

### S9 — Performance

- [ ] Transcription d'un fichier 30s : latence end-to-end <2s P95 (mesurer via DevTools network).
- [ ] Post-process d'un texte 500 mots : latence <3s P95.
- [ ] CPU et RAM Worker (Cloudflare dashboard) : pas d'anomalie sur les 100 premières requêtes.

### S10 — Refresh quota après transcription

- [ ] Avec trial actif, lancer une transcription.
- [ ] Le badge `QuotaCounter` ne se met PAS à jour automatiquement (pas de polling en phase 1) — c'est attendu.
- [ ] Aller dans Settings → Cloud → Rafraîchir. Le compteur reflète la nouvelle valeur.
- [ ] Note post-launch : ajouter un refresh automatique post-transcription si UX dégradée signalée.

## Validation pré-tag

- [ ] Tous les scénarios S1-S10 passent sur le projet Supabase staging.
- [ ] `pnpm exec vitest run src/lib/cloud src/hooks` : 100% green.
- [ ] `cargo check --manifest-path src-tauri/Cargo.toml` : 100% green.
- [ ] `pnpm exec supabase test db --linked` (sur le projet staging) : 100% green.
- [ ] Aucune régression sur la transcription locale (mode local préservé).
- [ ] Aucune dépendance d'API key utilisateur cassée (les utilisateurs sans abonnement continuent à pouvoir utiliser le mode local avec leur propre clé).
