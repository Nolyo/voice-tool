# ADR 0012 — Managed Transcription Stack

**Date** : 2026-05-04
**Statut** : Accepté
**Contexte** : sous-épique 05 (managed transcription, cible bundle launch v3.2)
**Spec source** : [`docs/superpowers/specs/2026-05-04-managed-transcription-architecture-design.md`](../../superpowers/specs/2026-05-04-managed-transcription-architecture-design.md)

## Décisions

| # | Sujet | Décision |
|---|---|---|
| Q1 | Architecture | Hybride différée. Phase 1 = proxy d'un provider tiers ; bascule self-host envisagée post-launch si volume/marge le justifient. |
| Q2 | Hébergement proxy | Cloudflare Workers (plan Paid, $5/mois) sur `api.lexena.app`. |
| Q3 | Provider transcription | Groq `whisper-large-v3-turbo` seul. Fallback OpenAI Whisper noté post-launch. |
| Q4 | Provider post-process | OpenAI `gpt-4o-mini` par défaut, `gpt-4o` pour tier `full`. Llama écarté sur retour d'expérience direct. |
| Q5 | Stockage audio | Zero-retention strict. Aucune persistance disque ni Supabase. Logs : seulement `provider_request_id`. |

## Conséquences

- Time-to-market rapide pour le launch v3.2.
- Marge nette confortable sur Starter (~4,35€/user) et Pro (~7,55€/user).
- Dépendance unique Groq pour la transcription en phase 1 — risque accepté, mitigation post-launch via feature flag.
- DPA Groq + DPA OpenAI à signer avant launch (tâches ops).
- Schéma `usage_events` (event-sourced) + `usage_summary` (agrégat trigger) supersede la `usage_minutes` mentionnée à titre indicatif dans le spec premium 2026-04-27 §11.9.

## Alternatives écartées

- **Self-host Whisper sur GPU dès phase 1** : surcoût infra et complexité ops disproportionnés tant que le volume n'est pas validé.
- **OpenAI Whisper seul** : 10-50x plus lent que Groq, pas un argument vs BYOK user.
- **Multi-provider exposé à l'user** : friction UX sans gain équivalent.
- **Rétention temporaire 24-72h pour debug** : zone grise RGPD, contredit la promesse de confiance Lexena.
- **Llama 3 pour le post-process** : qualité catastrophique sur retour d'expérience direct (cf. mémoire `project_post_process_llm_choice.md`).

## Liens

- Spec : `docs/superpowers/specs/2026-05-04-managed-transcription-architecture-design.md`
- Plan : `docs/superpowers/plans/2026-05-04-managed-transcription-architecture.md`
- Sous-épique : `docs/v3/05-managed-transcription.md`
