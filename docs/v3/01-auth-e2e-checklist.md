# E2E checklist — sous-épique 01 auth

Exécutée avant merge sur `main`. Cocher chaque ligne avec date + OS.

## Flow 1 — Signup magic link

- [ ] (Win, date) Email reçu avec lien `voice-tool-auth-callback.pages.dev/?token=...&type=magiclink`
- [ ] Clic du lien → page callback → app s'ouvre → user loggué
- [ ] Refresh token stocké dans Credential Manager / Keychain / libsecret
- [ ] Row insérée dans `user_devices`

## Flow 2 — Google OAuth

- [ ] Clic "Continuer avec Google" ouvre le navigateur
- [ ] Consent → callback → deep link → user loggué
- [ ] `state` nonce rejeté si rejoué (test manuel : ouvrir 2× la même URL de callback)

## Flow 3 — Signup E/P

- [ ] Password < 10 chars : refusé avec message clair
- [ ] Password "password" : refusé (pwned list)
- [ ] Password valide : email de confirmation reçu
- [ ] Clic du lien de confirmation → user loggué directement

## Flow 4 — Login E/P

- [ ] Password incorrect : message "invalid credentials" générique
- [ ] Password correct sans 2FA : loggué
- [ ] Password correct avec 2FA : écran challenge apparaît

## Flow 5 — Reset password

- [ ] Email de reset reçu
- [ ] Clic du lien → modale avec formulaire nouveau password
- [ ] Submission : password mis à jour, toutes sessions autres devices invalidées (check sur un 2e device si possible)

## Flow 6 — Activation 2FA

- [ ] Settings → Sécurité → "Activer l'authentification à deux facteurs"
- [ ] QR code visible + seed en texte (section "Ou recopie cette clé")
- [ ] Code validé par Google Authenticator / Authy / Bitwarden
- [ ] 10 recovery codes affichés (8 chars alphanumériques, lisibles)
- [ ] Bouton "Terminer" désactivé tant que checkbox non cochée
- [ ] Row dans `recovery_codes` (10 lignes, `used_at` NULL, vérifier via dashboard Supabase)

## Flow 7 — Login avec 2FA

- [ ] Code TOTP valide → loggué
- [ ] Code TOTP invalide → message d'erreur
- [ ] Recovery code valide → loggué + ligne `used_at` mise à jour en DB

## Flow 8 — Logout

- [ ] Settings → Compte → bouton "Se déconnecter"
- [ ] Session invalide après clic (refresh token purge + status = signed-out)
- [ ] Credential Manager / Keychain vidé (vérifier manuellement)

## Tests cross-OS (obligatoires pour v3.0 GA — pas pour ce sprint dev)

- [ ] Flow 1 validé sur Windows 11
- [ ] Flow 1 validé sur macOS 14+
- [ ] Flow 1 validé sur Ubuntu 24.04 (avec libsecret)
- [ ] Flow 1 validé sur Ubuntu sans libsecret : message "keyring indisponible" affiché, session non persistée

## Historique d'exécution

| Date | OS | Exécutant | Flows couverts | Résultat | Notes |
|---|---|---|---|---|---|
| — | — | — | — | — | — |
