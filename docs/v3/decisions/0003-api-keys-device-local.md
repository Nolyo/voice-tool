# ADR 0003 — Clés API: jamais syncées, device-local uniquement

- **Statut**: Accepté
- **Date**: 2026-04-19
- **Contexte de la décision**: session de brainstorming v3

## Contexte

L'app stocke des **clés API tierces** (OpenAI, Groq, Deepgram, etc.) saisies par l'utilisateur. Ces clés sont des **secrets financiers actifs**: une fuite = facturation immédiate sur le compte de l'utilisateur, parfois en heures.

Quatre options envisagées pour la sync v3.0:

- **A.** Synchronisées comme tout le reste (Postgres encrypted at rest)
- **B.** Synchronisées avec une couche supplémentaire (Supabase Vault / pgsodium)
- **C.** Jamais synchronisées (device-local uniquement)
- **D.** Synchronisées avec un mot de passe vault séparé

## Décision

On retient **C — clés API jamais syncées, device-local uniquement.**

Un message UX explicite sera affiché sur la page de synchronisation:

> "Pour votre sécurité et votre confidentialité, les clés API ne sont pas sauvegardées dans le cloud. Vous devrez les ressaisir lors de la connexion sur un nouveau matériel."

## Justification

- Une clé API n'est **jamais perdue**: elle vit dans le compte de l'utilisateur chez OpenAI/Groq/etc., il peut toujours en régénérer une. Donc "ne pas synchroniser" coûte ~30 secondes par nouveau device — friction négligeable.
- Permet d'afficher publiquement: **"Nous ne voyons jamais vos clés API."** Argument de confiance fort, vérifiable techniquement.
- Élimine **par construction** le pire scénario (fuite Supabase ⇒ leak en cascade des comptes OpenAI de tous les utilisateurs).
- Cohérent avec l'esprit "local-first" historique du produit.

## Conséquences

### Positives
- Posture sécurité publiquement vérifiable et marketable
- Pas de couche cryptographique supplémentaire à maintenir
- Pas de risque de fuite cascade
- Compatible avec la décision globale "server-side encryption" pour le reste (cf. ADR 0002): l'asymétrie n'existe pas car on ne stocke pas du tout

### Négatives
- Léger surcoût UX: l'utilisateur doit ressaisir ses clés API à chaque nouveau device
- Si l'utilisateur a 5 clés API configurées, ça prend ~3 min sur un nouveau device

### Mitigations
- Message UX clair (cf. ci-dessus)
- Dans les settings, distinguer visuellement les champs "synchronisés" vs "device-local" (icône, badge, ou section séparée)
- Lors du premier login sur un nouveau device, afficher un message "Pensez à reconfigurer vos clés API"

## Décisions reportées

- Si demande utilisateur très forte plus tard (rare), réenvisager option B (Supabase Vault). Mais la posture C est défendable indéfiniment et change la conversation: ce n'est pas "comment on protège les clés sur le serveur", c'est "il n'y a pas de clés sur le serveur".
