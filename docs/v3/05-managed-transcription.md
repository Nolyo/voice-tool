# 05 — Service managé transcription (proxy modèles)

> **Statut**: 📝 Stub.
> **Cible**: v3.2 (post-v3.0/3.1).
> **Dépendances**: 01, 04, et idéalement les 100 premiers users payants pour modéliser les coûts.

---

## Pourquoi ce sous-épique en dernier

Permet à l'utilisateur de transcrire **sans gérer sa propre clé API** (OpenAI, Groq, Deepgram…). On agit comme proxy: on consomme le crédit chez le provider, on facture l'utilisateur via son abonnement.

C'est techniquement le plus complexe (audio = gros payload, latence-sensible) et économiquement le plus risqué (marge sur le différentiel de coût). Donc: après que le reste tourne.

---

## Questions architecturales

### Stack

- [ ] Supabase Edge Functions (Deno) — **probablement pas adapté** (latence cold-start, limites de payload, runtime Deno moins outillé pour streaming audio)
- [ ] Cloudflare Workers — bon pour la latence, limites payload à vérifier (~100MB)
- [ ] Fly.io / Railway — service Node/Rust dédié, meilleur contrôle, plus de complexité ops
- [ ] Service Rust dédié (réutilise le code transcription existant) — cohérent avec la stack mais infra à gérer

### Proxy ou re-implémentation?

- [ ] Proxy direct vers OpenAI/Groq (relais HTTP, on ne stocke pas l'audio)
- [ ] On stocke l'audio temporairement (pour retry, monitoring, support)? RGPD-sensible.

### Modèles supportés

- [ ] Whisper hébergé sur Groq (turbo, ultra rapide, pas cher)
- [ ] OpenAI Whisper (référence, plus cher)
- [ ] Deepgram (streaming natif, autre prix)
- [ ] Choix utilisateur ou choix imposé par le plan?

### Quotas & facturation

- [ ] Modèle: à l'usage (pay-per-minute) ou inclus dans l'abonnement (X minutes/mois)?
- [ ] Tracking précis des minutes consommées par user
- [ ] Hard cap pour éviter une facture catastrophe (notre coût)
- [ ] Notification user à 80% / 100% du quota
- [ ] Possibilité d'acheter du surplus

### Sécurité

- [ ] Auth requise (JWT du compte) à chaque appel
- [ ] Rate limiting par user
- [ ] Validation taille audio (max?)
- [ ] Pas de stockage de l'audio par défaut (zero-retention)
- [ ] Anonymisation des logs (pas de transcription dans les logs)
- [ ] DPA avec OpenAI / Groq pour la chaîne de sous-traitance

### Latence

- [ ] Cible: <2s pour 30s d'audio
- [ ] Cold-start des fonctions serverless (pénalité pour le premier appel)
- [ ] Streaming partiel (Deepgram seul le supporte nativement)

### Coûts opérationnels

- [ ] Modélisation: prix Groq (~$0.06/h) + marge + Supabase + infra proxy
- [ ] Abonnement break-even: combien de minutes/mois?
- [ ] Risque "abuse" (user qui consomme 100h/mois pour 9€)

### UX

- [ ] Toggle "utiliser le service Voice Tool" en plus des providers existants
- [ ] Status: minutes restantes ce mois-ci
- [ ] Fallback si quota dépassé / service down → repli sur clé API perso ou modèle local

---

## Livrables attendus

1. Choix de stack confirmé (avec POC infra si nécessaire)
2. Schéma DB usage tracking
3. Service proxy implémenté
4. Module client Tauri qui route vers notre service
5. Dashboard usage user
6. Modélisation financière documentée
7. ADR `0010-managed-transcription-stack.md`
