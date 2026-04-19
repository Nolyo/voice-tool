# ADR 0002 — Posture de chiffrement: server-side (style Notion)

- **Statut**: Accepté
- **Date**: 2026-04-19
- **Contexte de la décision**: session de brainstorming v3

## Contexte

La v3 introduit la sync cloud de données utilisateur (settings + notes). Quatre postures de chiffrement étaient envisageables:

- **A.** Server-side encryption uniquement (TLS + Postgres encrypted at rest)
- **B.** End-to-end (E2E) sur tout, sans aucune donnée lisible côté serveur
- **C.** Tiered: clés API en E2E, reste server-side
- **D.** E2E sur tout sauf métadonnées non-sensibles (style Bitwarden)

Trade-off principal: **UX/recovery** vs **garanties cryptographiques fortes**.

## Décision

On retient **A — server-side encryption (style Notion)** pour les données qui synchronisent.

Note: les clés API font l'objet d'une décision séparée (cf. [ADR 0003](0003-api-keys-device-local.md)) — elles ne synchronisent **jamais**, ce qui rend la posture A acceptable pour le reste.

## Justification

- L'utilisateur cible attend la même UX que Notion / Linear / les SaaS classiques. Recovery par email simple, pas de "vous avez perdu votre mot de passe = vous avez perdu vos données".
- Le contenu en jeu (notes, préférences UI, snippets) est sensible mais pas catastrophique en cas de fuite — contrairement aux clés API qui, elles, ne sortent jamais du device.
- E2E (B/D) ajoute une complexité énorme (key derivation, recovery codes, multi-device pairing, conflict resolution sans serveur) qui ne se justifie que si la promesse "zéro accès serveur" est centrale au produit.
- Tiered (C) crée une asymétrie de modèle de sécurité difficile à expliquer aux utilisateurs.

## Conséquences

### Positives
- Recovery utilisateur trivial (reset password par email)
- Sync conflict resolution possible côté serveur
- Recherche serveur possible (si on en a besoin plus tard)
- Multi-device "just works"
- Migration de schéma future plus simple

### Négatives / risques acceptés
- **Une fuite de la DB Supabase = lecture des notes en clair**. À documenter dans la privacy policy + dans le threat model (cf. `00-threat-model.md`).
- **Insider threat (toi-même, prestataire futur, employé Supabase)** théoriquement possible. À documenter aussi.
- La promesse marketing ne peut PAS être "nous ne pouvons pas voir vos données" — elle doit être "nous chiffrons en transit, à l'arrêt, et n'accédons jamais à votre contenu hors ce qui est nécessaire au fonctionnement du service".

### Mitigations à mettre en place

- Postgres encrypted at rest activé (default Supabase)
- TLS partout (default Supabase)
- RLS strict sur toutes les tables (deny by default)
- Service role key jamais distribuée au client
- Backup chiffré + plan de restauration testé
- Plan de réponse à incident écrit

## Décisions reportées

- Passage à E2E partiel ou total reste possible plus tard SI un signal utilisateur fort le demande, MAIS implique une migration de données conséquente. À éviter sauf nécessité commerciale.
