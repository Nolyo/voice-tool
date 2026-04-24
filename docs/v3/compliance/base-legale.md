# Base légale par traitement

> Art. 6 GDPR. Synthèse à usage interne, nourrit la privacy policy publique (sous-épique 06).

## Règle générale

Voice Tool v3 utilise **deux bases légales** selon les traitements :

1. **Exécution du contrat** (art. 6.1.b) — pour tout ce qui relève du service lui-même (compte, sync, billing).
2. **Intérêt légitime** (art. 6.1.f) — pour la sécurité et les logs techniques (rate limiting, anti-fraude).

Le **consentement explicite** (art. 6.1.a) n'est requis que pour les traitements non nécessaires au service (ex: cookies analytics — pas prévus v3.0).

## Détail par traitement

| Traitement | Base légale | Justification |
|---|---|---|
| T01 — Compte utilisateur | Exécution du contrat | Sans compte, le service "sync" ne peut pas exister |
| T02 — Sync settings | Exécution du contrat | Fonctionnalité contractualisée au signup |
| T03 — Sync notes (v3.1) | Exécution du contrat | Idem |
| T04 — Billing (v3.2) | Exécution du contrat | Facturation nécessaire au service payant |
| T05 — Logs serveur | Intérêt légitime | Sécurité du service, protection des users, aucune donnée sensible |
| T06 — Notifications sécurité | Exécution du contrat | Obligation de sécurité vis-à-vis de l'user (GDPR art. 32) |
| Analytics produit (v3.x, pas v3.0) | Consentement explicite | Non nécessaire au service, doit être opt-in |

## Points d'attention

- Le **mode local** (sans compte) ne traite aucune donnée perso chez nous. Pas de base légale nécessaire (traitement hors-scope Voice Tool serveur).
- La **suppression de compte** implique la destruction effective des données sous 30 jours max — sinon la base "exécution du contrat" tombe et il n'y a plus de justification à conserver les données.
- Toute nouvelle fonctionnalité doit être classifiée dans ce tableau **avant** déploiement.
