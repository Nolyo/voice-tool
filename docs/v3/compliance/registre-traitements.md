# Registre des traitements — Voice Tool v3

> Art. 30 GDPR. **Doc interne** (pas destinée au public — la privacy policy publique est le sous-épique 06).
> Dernière mise à jour : 2026-04-24

## Responsable du traitement

- **Nom** : <à remplir — nom personnel ou société>
- **Contact** : `security@voice-tool.app`
- **Pays d'établissement** : France

## Traitements

### T01 — Création et gestion des comptes utilisateurs

| Champ | Valeur |
|---|---|
| Finalité | Permettre à l'utilisateur d'avoir un compte pour synchroniser ses settings/notes |
| Base légale | Exécution du contrat (art. 6.1.b GDPR) |
| Catégories de personnes | Utilisateurs Voice Tool ayant créé un compte |
| Catégories de données | Email, hash password (bcrypt), timestamp signup, timestamp dernière activité, device_id, recovery codes (si 2FA activé) |
| Destinataires | Supabase (sous-traitant, DPA signé) |
| Transferts hors UE | Aucun (région EU Supabase) |
| Durée de conservation | Durée du compte + 30 jours après demande de suppression (purge effective via "Delete account") |
| Mesures techniques | RLS, TLS, 2FA optionnel, hash bcrypt, rate limiting, logs sans PII |

### T02 — Synchronisation settings étendus (Y3)

| Champ | Valeur |
|---|---|
| Finalité | Retrouver son setup sur plusieurs machines |
| Base légale | Exécution du contrat |
| Catégories de personnes | Utilisateurs ayant activé la sync |
| Catégories de données | Settings UI (thème, langue), hotkeys, dico perso, snippets, prompts, préréglages |
| Destinataires | Supabase |
| Transferts hors UE | Aucun |
| Durée de conservation | Durée du compte + 30 jours |
| Mesures techniques | RLS, TLS, encryption at rest Postgres |

### T03 — Synchronisation notes (v3.1)

À compléter au démarrage du sous-épique 03.

### T04 — Billing (v3.2)

À compléter au démarrage du sous-épique 04.

### T05 — Logs serveur (Edge Functions Supabase)

| Champ | Valeur |
|---|---|
| Finalité | Debug, monitoring, rate limiting |
| Base légale | Intérêt légitime (art. 6.1.f) |
| Catégories de personnes | Utilisateurs ayant fait une requête à un endpoint serveur |
| Catégories de données | Timestamp, endpoint, code HTTP, user_id (UUID, pas email), IP (hash ou pseudonymisée) |
| **Exclusions strictes** | Pas d'email, pas de contenu notes, pas de JWT, pas de password — cf. threat model mesure #5 |
| Destinataires | Supabase (logs Edge Functions) |
| Durée de conservation | 30 jours |
| Mesures techniques | Linter de logs à prévoir (sous-épique 01) |

### T06 — Notifications email (nouveaux devices, reset password)

| Champ | Valeur |
|---|---|
| Finalité | Sécurité du compte |
| Base légale | Exécution du contrat (sécurité) |
| Catégories de données | Email, timestamp, nom du device (OS + navigateur) |
| Destinataires | Supabase (email provider intégré) |
| Durée de conservation | Pas de log conservé au-delà de l'envoi |
| Mesures techniques | TLS SMTP |

## Sous-traitants

| Sous-traitant | Finalité | Localisation | DPA signé | Certification |
|---|---|---|---|---|
| Supabase | Backend (auth, DB, storage, edge functions) | EU (Frankfurt) | ✅ (inclus plan Pro) | SOC 2 Type 2 |
| Cloudflare | Hébergement auth-callback static | Global (edge) | ✅ (DPA public) | ISO 27001 |
| Lemon Squeezy (v3.2+) | Billing (Merchant of Record) | US | À signer en v3.2 | PCI DSS niveau 1 |
| Google (OAuth, v3.0) | Authentification OAuth | Global | Inclus ToS Google Cloud | Standard |

## Droit des personnes — comment les exercer

| Droit | Procédure | Délai |
|---|---|---|
| Accès | Settings → "Exporter mes données" (JSON téléchargeable) | Immédiat |
| Rectification | Settings → modifier profil | Immédiat |
| Effacement | Settings → "Supprimer mon compte" — purge complète (notes, settings, sessions, row auth.users) | ≤30 jours |
| Portabilité | Idem "Exporter" — format JSON standard | Immédiat |
| Opposition | Contact `security@voice-tool.app` | ≤30 jours |

## Historique

| Date | Modification |
|---|---|
| 2026-04-24 | Création du registre (sous-épique v3-00) |
