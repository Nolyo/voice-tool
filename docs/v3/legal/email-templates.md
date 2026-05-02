# Email transactionnels — templates Lexena v3.0

> **Statut** : draft du 2026-05-01.
> **Périmètre** : 7 templates couvrant les flows auth + sécurité + GDPR de la v3.0.
> **À configurer où** : Supabase Auth → Email Templates (override des templates par défaut). Nécessite l'activation d'un SMTP custom (Resend ou Postmark) — cf. follow-up bloquant ADR 0009.
> **Convention** : versions FR + EN miroir. Variables Supabase entre `{{ }}` (template Liquid).
> **À relire** : par un copywriter avant publication. Tonalité actuelle : factuelle, sobre, pro-friendly.

---

## Index des templates

| # | Template | Trigger | Variables Supabase |
|---|---|---|---|
| 1 | **Magic link** | Clic sur "Recevoir un lien" | `{{ .ConfirmationURL }}`, `{{ .Email }}`, `{{ .SiteURL }}` |
| 2 | **Signup confirmation** | Inscription par email/password | `{{ .ConfirmationURL }}`, `{{ .Email }}` |
| 3 | **Welcome** (post-confirmation) | Première connexion réussie | `{{ .Email }}`, `{{ .UserID }}` (envoyé via Edge Function, pas Supabase native) |
| 4 | **Password reset request** | Clic sur "Mot de passe oublié" | `{{ .ConfirmationURL }}`, `{{ .Email }}` |
| 5 | **New device alert** | Nouveau row dans `user_devices` (Edge Function `send-new-device-email` — follow-up) | `{{ .Email }}`, `{{ .DeviceName }}`, `{{ .OSName }}`, `{{ .AppVersion }}`, `{{ .Timestamp }}`, `{{ .IPCity }}` |
| 6 | **Account deletion request** | Soumission `request_account_deletion` | `{{ .Email }}`, `{{ .DeletionDate }}`, `{{ .CancelURL }}` |
| 7 | **Account deletion completion** | Cron purge a succédé | `{{ .Email }}` |

---

## 1 — Magic link

### FR

**Objet** : Connexion à Lexena

```
Bonjour,

Cliquez sur ce lien pour vous connecter à Lexena :

{{ .ConfirmationURL }}

Ce lien est valable 1 heure et ne peut être utilisé qu'une seule fois.

Si vous n'êtes pas à l'origine de cette demande, ignorez ce message — votre compte reste sécurisé.

—
L'équipe Lexena
```

### EN

**Subject**: Sign in to Lexena

```
Hello,

Click this link to sign in to Lexena:

{{ .ConfirmationURL }}

This link is valid for 1 hour and can only be used once.

If you didn't request this, ignore this message — your account remains secure.

—
The Lexena team
```

---

## 2 — Signup confirmation

### FR

**Objet** : Confirmez votre adresse email Lexena

```
Bonjour,

Bienvenue sur Lexena !

Pour finaliser la création de votre compte, confirmez votre adresse email en cliquant sur ce lien :

{{ .ConfirmationURL }}

Ce lien est valable 24 heures.

Si vous n'avez pas créé de compte Lexena, vous pouvez ignorer ce message.

—
L'équipe Lexena
```

### EN

**Subject**: Confirm your Lexena email address

```
Hello,

Welcome to Lexena!

To finalize your account creation, confirm your email address by clicking this link:

{{ .ConfirmationURL }}

This link is valid for 24 hours.

If you didn't create a Lexena account, you can ignore this message.

—
The Lexena team
```

---

## 3 — Welcome (post-confirmation)

> Envoyé par une Edge Function dédiée au moment du premier `SIGNED_IN` post-confirmation (pas par Supabase native).

### FR

**Objet** : Bienvenue sur Lexena 🎤

```
Bonjour,

Votre compte Lexena est actif. Voici quelques points clés pour bien démarrer :

🔒 Vos clés API et vos enregistrements ne quittent jamais votre appareil
   La synchronisation cloud (opt-in) couvre uniquement vos paramètres,
   votre dictionnaire et vos snippets.

🛡️ Activez la 2FA en quelques clics
   Settings > Sécurité > "Activer l'authentification à deux facteurs"

📥 Exportez vos données à tout moment
   Settings > Compte > "Exporter mes données"

🗑️ Supprimez votre compte quand vous voulez
   Settings > Sécurité > "Supprimer mon compte"
   (purge effective sous 30 jours, conforme RGPD)

Toutes nos décisions techniques sont publiques :
- Politique de confidentialité : <URL>/privacy
- Conditions générales : <URL>/terms
- Décisions d'architecture : <URL>/adr

Pour toute question : <support@DOMAINE>

—
L'équipe Lexena
```

### EN

**Subject**: Welcome to Lexena 🎤

```
Hello,

Your Lexena account is active. Here are a few key points to get started:

🔒 Your API keys and recordings never leave your device
   Cloud sync (opt-in) only covers your settings,
   dictionary, and snippets.

🛡️ Enable 2FA in a few clicks
   Settings > Security > "Enable two-factor authentication"

📥 Export your data at any time
   Settings > Account > "Export my data"

🗑️ Delete your account whenever you want
   Settings > Security > "Delete my account"
   (effective purge within 30 days, GDPR-compliant)

All our technical decisions are public:
- Privacy Policy: <URL>/privacy
- Terms of Service: <URL>/terms
- Architecture Decision Records: <URL>/adr

For any question: <support@DOMAIN>

—
The Lexena team
```

---

## 4 — Password reset request

### FR

**Objet** : Réinitialisation de votre mot de passe Lexena

```
Bonjour,

Vous avez demandé à réinitialiser votre mot de passe Lexena. Cliquez sur ce lien pour choisir un nouveau mot de passe :

{{ .ConfirmationURL }}

Ce lien est valable 1 heure et ne peut être utilisé qu'une seule fois.

Si vous n'êtes pas à l'origine de cette demande :
- Ignorez ce message — votre mot de passe actuel reste valide
- Si vous voyez plusieurs demandes que vous n'avez pas faites, contactez-nous immédiatement à security@<DOMAINE>

Pour votre sécurité, à la prochaine connexion réussie après la réinitialisation, **toutes vos sessions actives sur d'autres appareils seront révoquées**.

—
L'équipe Lexena
```

### EN

**Subject**: Reset your Lexena password

```
Hello,

You requested to reset your Lexena password. Click this link to choose a new password:

{{ .ConfirmationURL }}

This link is valid for 1 hour and can only be used once.

If you didn't request this:
- Ignore this message — your current password remains valid
- If you see multiple requests you didn't make, contact us immediately at security@<DOMAIN>

For your security, on the next successful login after reset, **all your active sessions on other devices will be revoked**.

—
The Lexena team
```

---

## 5 — New device alert

> Envoyé par l'Edge Function `send-new-device-email` (follow-up bloquant ADR 0009/0010 pour ouverture publique).

### FR

**Objet** : Nouvelle connexion à votre compte Lexena

```
Bonjour,

Une nouvelle connexion à votre compte Lexena a été détectée.

📱 Appareil : {{ .DeviceName }}
🖥️ Système : {{ .OSName }}
🎤 Version Lexena : {{ .AppVersion }}
🕐 Heure : {{ .Timestamp }}
📍 Localisation approximative : {{ .IPCity }} (basée sur l'adresse IP, peut être imprécise)

Si c'est bien vous :
✅ Aucune action n'est nécessaire.

Si ce n'est pas vous :
🚨 Changez immédiatement votre mot de passe : <URL>/reset
🚨 Activez la 2FA si ce n'est pas déjà fait : Settings > Sécurité
🚨 Révoquez la session de l'appareil suspect : Settings > Sécurité > Appareils
🚨 Contactez-nous : security@<DOMAINE>

—
L'équipe Lexena
```

### EN

**Subject**: New sign-in to your Lexena account

```
Hello,

A new sign-in to your Lexena account has been detected.

📱 Device: {{ .DeviceName }}
🖥️ System: {{ .OSName }}
🎤 Lexena version: {{ .AppVersion }}
🕐 Time: {{ .Timestamp }}
📍 Approximate location: {{ .IPCity }} (based on IP address, may be inaccurate)

If this was you:
✅ No action needed.

If this wasn't you:
🚨 Change your password immediately: <URL>/reset
🚨 Enable 2FA if not already done: Settings > Security
🚨 Revoke the suspicious device's session: Settings > Security > Devices
🚨 Contact us: security@<DOMAIN>

—
The Lexena team
```

---

## 6 — Account deletion request (grace period notification)

### FR

**Objet** : Confirmation de votre demande de suppression de compte

```
Bonjour,

Nous avons bien reçu votre demande de suppression de votre compte Lexena.

📅 Date de purge effective : {{ .DeletionDate }}
⏳ Vous avez jusqu'à cette date pour annuler la suppression.

Pendant cette période de 30 jours :
- Votre compte est verrouillé : aucune connexion possible aux fonctionnalités cloud
- Vos données ne sont accessibles à personne, y compris vous
- Vous pouvez ANNULER en vous reconnectant à Lexena depuis n'importe quel appareil et en cliquant sur "Annuler la suppression"

Au terme des 30 jours :
- Suppression irréversible de toutes vos données synchronisées
- Email, mot de passe, paramètres, dictionnaire, snippets, recovery codes, sessions, devices : tout est purgé
- Vos données 100 % locales (recordings, transcriptions, notes) restent sur votre appareil — elles n'ont jamais été chez nous

Pour annuler maintenant :
{{ .CancelURL }}

Pour toute question : <contact@DOMAINE>

—
L'équipe Lexena
```

### EN

**Subject**: Confirmation of your account deletion request

```
Hello,

We have received your request to delete your Lexena account.

📅 Effective purge date: {{ .DeletionDate }}
⏳ You have until this date to cancel the deletion.

During this 30-day period:
- Your account is locked: no access possible to cloud features
- Your data is not accessible to anyone, including you
- You can CANCEL by signing back in to Lexena from any device and clicking "Cancel deletion"

After 30 days:
- Irreversible deletion of all your synchronized data
- Email, password, settings, dictionary, snippets, recovery codes, sessions, devices: all purged
- Your 100 % local data (recordings, transcriptions, notes) remains on your device — it was never with us

To cancel now:
{{ .CancelURL }}

For any question: <contact@DOMAIN>

—
The Lexena team
```

---

## 7 — Account deletion completion

### FR

**Objet** : Votre compte Lexena a été supprimé

```
Bonjour,

Votre compte Lexena a été définitivement supprimé conformément à votre demande.

✅ Toutes vos données synchronisées (paramètres, dictionnaire, snippets, devices, sessions) ont été purgées de nos serveurs.
✅ Conformément au RGPD, aucune trace personnelle ne subsiste, à l'exception des éventuelles obligations légales de conservation (logs de sécurité anonymisés conservés 30 jours maximum).

Vous pouvez continuer à utiliser Lexena en mode 100 % local sans compte, gratuitement et sans limite, sur tous vos appareils. C'est une promesse contractuelle.

Si vous changez d'avis, vous pouvez créer un nouveau compte avec la même adresse email à tout moment — il sera vide.

Merci d'avoir essayé Lexena. Si vous voulez nous dire pourquoi vous êtes parti, on lit tout : <support@DOMAINE>

—
L'équipe Lexena
```

### EN

**Subject**: Your Lexena account has been deleted

```
Hello,

Your Lexena account has been permanently deleted as requested.

✅ All your synchronized data (settings, dictionary, snippets, devices, sessions) has been purged from our servers.
✅ In accordance with GDPR, no personal trace remains, except for any legal retention obligations (anonymized security logs kept 30 days maximum).

You can continue using Lexena in 100 % local mode without an account, free and unlimited, on all your devices. This is a contractual promise.

If you change your mind, you can create a new account with the same email address at any time — it will be empty.

Thank you for trying Lexena. If you want to tell us why you left, we read everything: <support@DOMAIN>

—
The Lexena team
```

---

## Recommandations d'envoi

### Configuration SMTP

Supabase Free limite à ~30 emails/h projet + ~3-4 `/recover` par email/h. Bloquant pour ouverture publique. Solution : SMTP custom.

**Recommandation** : **Resend** (moderne, DX agréable, free tier 100 emails/jour) ou **Postmark** (réputation deliverability). À configurer dans Supabase Auth → SMTP Settings.

### En-têtes obligatoires

- `From: Lexena <noreply@<DOMAIN>>`
- `Reply-To: <support@DOMAIN>` (sauf magic link / reset où on veut éviter le reply)
- `List-Unsubscribe: <mailto:<unsubscribe@DOMAIN>?subject=unsubscribe>` pour les emails non-transactionnels (welcome notamment)
- `Message-ID` unique par email
- `X-Lexena-Email-Type` : `magic-link | signup | welcome | reset | new-device | deletion-request | deletion-completion` (debug + filtering Resend)

### Anti-spam

- SPF, DKIM, DMARC configurés sur le domaine d'envoi (côté Resend / Postmark)
- DMARC : démarrer en `p=none` pendant 2 semaines pour observer, puis `p=quarantine` puis `p=reject`
- BIMI (logo dans Gmail) : optionnel, à activer si la marque est déposée

### Conformité GDPR / CAN-SPAM

- Tous les templates ci-dessus sont **transactionnels** (déclenchés par une action user) → ne nécessitent pas de consentement marketing.
- Le template "Welcome" est à la frontière : il contient du contenu non strictement transactionnel (tips). Inclure un `List-Unsubscribe` par sécurité.
- Aucun template ne doit contenir de promotion produit, d'upsell vers Premium en v3.0, ni de tracking pixel sans consentement.

### Tests à faire avant ouverture publique

- [ ] Envoi test sur Gmail, Outlook, Yahoo, ProtonMail, iCloud — vérifier que le template ne tombe pas en spam
- [ ] Rendu sur mobile (iOS Mail, Gmail Android, Outlook mobile)
- [ ] Liens deep link `lexena://` testés sur Windows, macOS, Linux
- [ ] Vérification des unicode emojis (rendu correct sur tous les clients)
- [ ] Test de bounce handling (email invalide → retour SMTP géré côté Edge Function ?)
