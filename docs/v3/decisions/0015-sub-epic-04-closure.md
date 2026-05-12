# 0015 — Clôture sous-épique 04 (billing)

> **Statut**: Livré.
> **Date**: 2026-05-05.

## Périmètre livré

- Schéma `subscriptions` complet (status enum, provider columns, idempotency `processed_webhooks`)
- Edge Function `lemonsqueezy-webhook` (HMAC SHA-256 + idempotence par webhook_id)
- Tauri command `open_checkout` + frontend `lib/billing/`
- `SubscribeButton` (2 plans × mensuel/annuel, i18n FR/EN)
- `WelcomeScreen` first-run (branche A cloud / branche B local)
- `ExpirationPopup` non-bloquant sur fin de trial
- `CloudContext` refresh sur deep link `lexena://billing/success`
- ADR 0013 (premium offer) + 0014 (trial mechanics)

## Reporté post-launch

- Page pricing site marketing (sous-épique 06)
- Privacy policy + ToS update Lemon Squeezy (cf. `project_v3_launch_posture.md`)
- DPA Groq + DPA OpenAI signés
- Plans Team / Enterprise
- Annuel agressif (-40%)
- Phone verification anti-abus

## Tests

- pgtap : `rls_subscriptions.sql`, `processed_webhooks.sql`, `grant_trial_on_verify.sql` (PR #45)
- Deno : `lemonsqueezy-webhook/test/signature.test.ts`, `idempotency.test.ts`
- Vitest : `SubscribeButton.test.tsx`, `ExpirationPopup.test.tsx`, `WelcomeScreen.test.tsx`, `lib/billing/checkout.test.ts`
- Cargo : `cargo check` (Tauri command compile)

## Gates manuels (deferred)

- Configurer le Store Lemon Squeezy production avec 4 variants
- Mettre les variant_ids et slugs dans les env Vite + secrets Edge Function
- Configurer le webhook URL dans LS dashboard → secret partagé
- Configurer la redirect URL dans LS = `lexena://billing/success`
- Test E2E sandbox : signup → trial → checkout → quota → expiration
