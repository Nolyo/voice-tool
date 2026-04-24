# Checklist comptes ops — sécurité

> Statut cible : **tous les comptes listés doivent avoir 2FA activé + mot de passe unique >= 16 chars stocké dans un gestionnaire (Bitwarden, 1Password, etc.)**.
> Dernière vérification : <date>

## Comptes critiques (bloquant avant toute ouverture v3 au public)

| Compte | 2FA activé ? | Méthode 2FA | MDP unique ≥16 ? | Email de récupération | Remarques |
|---|---|---|---|---|---|
| GitHub (repo + releases + signing key) | ☐ | TOTP / clé hardware | ☐ | ☐ | Secrets repo = clé privée updater, tokens CI. 2FA obligatoire. |
| Supabase (projet v3) | ☐ | TOTP | ☐ | ☐ | Plan Pro, région EU. Owner = email personnel. |
| Lemon Squeezy (futur, v3.2) | ☐ | TOTP | ☐ | ☐ | À activer lors de l'ouverture du compte. |
| Google Cloud Console (OAuth app) | ☐ | TOTP / clé hardware | ☐ | ☐ | App OAuth Voice Tool. |
| Cloudflare (Pages auth-callback + DNS futur) | ☐ | TOTP | ☐ | ☐ | DNS futur, cf. sous-épique 06. |
| Registrar DNS (futur) | ☐ | TOTP | ☐ | ☐ | À activer à l'achat du domaine. |
| Gestionnaire de mots de passe | ☐ | TOTP | — (MDP maître) | ☐ | Le maillon central ; MDP maître très long + 2FA. |

## Procédure

1. Pour chaque compte ci-dessus, se connecter aux settings sécurité.
2. Activer 2FA TOTP (ou clé hardware si disponible) — **pas de SMS** (SIM swap).
3. Stocker les recovery codes dans le gestionnaire de mots de passe.
4. Cocher la case dans le tableau + dater la vérif.

## Revue

- Révision **trimestrielle** (mettre un rappel calendrier).
- Révision immédiate si suspicion de compromission.
