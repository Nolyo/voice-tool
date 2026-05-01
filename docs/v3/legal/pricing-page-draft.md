# Page Pricing — draft v3.0 / v3.2

> **Statut** : draft du 2026-05-01.
> **Périmètre** : v3.0 = page "free only" (rassurer sur la promesse local-only). v3.2 = activation du tier payant Lemon Squeezy.
> **À publier** : sur le site marketing (sous-épique 06), domaine final TBD.
> **Convention** : versions FR + EN miroir. Les prix v3.2 sont des **placeholders** à figer après brainstorming sous-épique 04.

---

## VERSION FRANÇAISE

### Hero

**Titre** : Lexena, gratuit. Pour de vrai.

**Sous-titre** : 100 % local. Aucun compte requis. Aucune carte bancaire. Vos enregistrements et vos clés d'API ne quittent jamais votre appareil.

**CTA principal** : `[Télécharger pour Windows]` `[Pour macOS]` `[Pour Linux]`
**CTA secondaire** : `Voir la documentation` →

---

### Section "Les deux modes d'usage"

**Mode 1 — Local (gratuit, illimité, sans compte)**

> Vous installez Lexena. Vous transcrivez. Tout reste sur votre machine. Vous configurez votre propre clé OpenAI / Groq, ou vous utilisez le modèle local Whisper qui tourne sur votre GPU. **Personne, y compris nous, ne voit jamais ce que vous dictez.**

✅ Transcription audio illimitée (modèle local ou API tierce de votre choix)
✅ Notes texte avec éditeur riche
✅ Snippets et dictionnaire personnel
✅ Auto-paste, raccourcis clavier, mini-fenêtre flottante
✅ Aucune connexion serveur côté Lexena
✅ Mises à jour gratuites à vie

**Mode 2 — Avec compte (gratuit en v3.0, opt-in)**

> Vous créez un compte. Vous activez la synchronisation. Vos paramètres, votre dictionnaire et vos snippets vous suivent sur tous vos appareils. **Vos clés d'API restent sur chaque machine — elles ne sont jamais transmises.** Vos enregistrements et vos transcriptions restent locaux aussi.

✅ Tout ce qui est inclus dans le mode local
✅ Synchronisation des paramètres entre vos appareils
✅ Synchronisation du dictionnaire personnel
✅ Synchronisation des snippets vocaux
✅ 2FA TOTP optionnel
✅ Notification email à chaque nouveau device connecté
✅ Export GDPR de vos données en un clic
✅ Suppression de compte effective sous 30 jours
🔒 Hébergement Supabase région EU (Frankfurt)

---

### Tableau comparatif

| | **Local** (sans compte) | **Avec compte** (v3.0) | **Premium** (v3.2 — à venir) |
|---|---|---|---|
| **Prix** | Gratuit | Gratuit | `<PRIX_MENSUEL>` € / mois |
| Transcription locale (Whisper) | ✅ illimitée | ✅ illimitée | ✅ illimitée |
| Transcription via votre clé API | ✅ (clé chez vous) | ✅ (clé chez vous) | ✅ (clé chez vous) |
| Notes texte | ✅ local | ✅ local | ✅ local + sync (v3.1) |
| Sync paramètres multi-device | ❌ | ✅ | ✅ |
| Sync dictionnaire | ❌ | ✅ | ✅ |
| Sync snippets | ❌ | ✅ | ✅ |
| Sync notes | ❌ | ❌ (v3.1) | ✅ (v3.1) |
| 2FA TOTP | — | ✅ | ✅ |
| Notifications nouveau device | — | ✅ | ✅ |
| Export GDPR | — | ✅ | ✅ |
| Service de transcription managé | ❌ | ❌ | `<TBD v3.3>` |
| `<Feature premium TBD>` | ❌ | ❌ | ✅ |
| Support email | — | Best effort | Prioritaire |

---

### FAQ

**Vais-je pouvoir continuer à utiliser Lexena hors-ligne ?**
Oui, toujours. Le mode local sans compte reste gratuit et illimité, même quand le mode payant sera disponible. C'est une promesse contractuelle (cf. nos [CGU](./terms-fr.md), article 7).

**Mes clés API (OpenAI, Groq, etc.) sont-elles synchronisées ?**
**Non, jamais.** Vos clés sont stockées dans le coffre-fort sécurisé de votre système d'exploitation (Windows Credential Manager / macOS Keychain / Linux Secret Service) et ne quittent jamais votre machine. C'est une décision d'architecture documentée publiquement (cf. [ADR 0003](../decisions/0003-api-keys-device-local.md)).

**Mes enregistrements audio et mes transcriptions sont-ils uploadés sur vos serveurs ?**
Non. En version 3.0, ni les enregistrements, ni les transcriptions, ni les notes texte ne quittent votre appareil. La synchronisation des notes est planifiée pour la v3.1, et nécessitera votre opt-in explicite (avec backup local automatique avant la première sync).

**Où sont hébergées mes données synchronisées ?**
Sur Supabase, en région **EU (Frankfurt, Allemagne)**. Aucun transfert hors UE pour les fonctionnalités principales. Détails complets dans notre [Politique de confidentialité](./privacy-policy-fr.md).

**Puis-je supprimer mon compte ?**
Oui, à tout moment, depuis Settings > Sécurité > "Supprimer mon compte". Grace period de 30 jours pendant laquelle vous pouvez annuler. Au terme des 30 jours, suppression effective et irréversible (un job automatisé tourne quotidiennement à 03:00 UTC).

**Mes données peuvent-elles servir à entraîner des modèles d'IA ?**
**Non.** Nos CGU (article 10.2) interdisent explicitement à l'éditeur d'utiliser le contenu utilisateur pour entraîner des modèles ou pour du marketing.

**Puis-je résilier l'abonnement payant à tout moment ?**
Oui, à tout moment, depuis le portail client Lemon Squeezy, sans pénalité. Cela prend effet à la fin de la période payée (mensuelle ou annuelle). Droit de rétractation de 14 jours pour les premiers achats (UE).

**Pourquoi Lemon Squeezy et pas Stripe direct ?**
Lemon Squeezy est *Merchant of Record* : ils gèrent intégralement la TVA EU MOSS, la sales tax US, et émettent les factures à notre place. Pour un éditeur indépendant, c'est plusieurs dizaines d'heures par an économisées en compliance fiscale internationale (cf. [ADR 0001](../decisions/0001-lemonsqueezy-vs-stripe.md)).

**L'application est-elle open source ?**
`<TBD — décision à prendre. Pour l'instant, code source non publié, mais documentation technique très ouverte.>`

**Comment vous contacter pour le support ?**
Email à `<support@DOMAINE>`. Réponse sous 48h en best effort en v3.0 (gratuit) ; prioritaire pour les abonnés Premium dès la v3.2.

---

### Bandeau confiance (footer pricing)

> **Open by design.**
> Notre [politique de confidentialité](./privacy-policy-fr.md), nos [conditions générales](./terms-fr.md), nos [Architecture Decision Records](../decisions/), notre [threat model](../00-threat-model.md), notre [registre GDPR interne](../compliance/registre-traitements.md), et nos [runbooks opérationnels](../runbooks/) sont publics et versionnés. Vous voyez ce qu'on fait, comment, et pourquoi.

---

---

## ENGLISH VERSION

### Hero

**Title**: Lexena, free. For real.

**Subtitle**: 100 % local. No account required. No credit card. Your recordings and API keys never leave your device.

**Primary CTA**: `[Download for Windows]` `[For macOS]` `[For Linux]`
**Secondary CTA**: `View documentation` →

---

### Section "The two modes of use"

**Mode 1 — Local (free, unlimited, no account)**

> You install Lexena. You transcribe. Everything stays on your machine. You configure your own OpenAI / Groq key, or you use the local Whisper model that runs on your GPU. **No one, including us, ever sees what you dictate.**

✅ Unlimited audio transcription (local model or third-party API of your choice)
✅ Text notes with rich editor
✅ Personal snippets and dictionary
✅ Auto-paste, keyboard shortcuts, floating mini-window
✅ No server connection on Lexena's side
✅ Free updates for life

**Mode 2 — With account (free in v3.0, opt-in)**

> You create an account. You enable synchronization. Your settings, dictionary, and snippets follow you across all your devices. **Your API keys stay on each machine — they are never transmitted.** Your recordings and transcriptions also stay local.

✅ Everything included in local mode
✅ Settings synchronization across your devices
✅ Personal dictionary synchronization
✅ Voice snippets synchronization
✅ Optional TOTP 2FA
✅ Email notification on every new connected device
✅ One-click GDPR data export
✅ Account deletion effective within 30 days
🔒 Supabase EU region hosting (Frankfurt)

---

### Comparison table

| | **Local** (no account) | **With account** (v3.0) | **Premium** (v3.2 — coming) |
|---|---|---|---|
| **Price** | Free | Free | `<MONTHLY_PRICE>` € / month |
| Local transcription (Whisper) | ✅ unlimited | ✅ unlimited | ✅ unlimited |
| Transcription via your API key | ✅ (key on your device) | ✅ (key on your device) | ✅ (key on your device) |
| Text notes | ✅ local | ✅ local | ✅ local + sync (v3.1) |
| Multi-device settings sync | ❌ | ✅ | ✅ |
| Dictionary sync | ❌ | ✅ | ✅ |
| Snippets sync | ❌ | ✅ | ✅ |
| Notes sync | ❌ | ❌ (v3.1) | ✅ (v3.1) |
| TOTP 2FA | — | ✅ | ✅ |
| New-device notifications | — | ✅ | ✅ |
| GDPR export | — | ✅ | ✅ |
| Managed transcription service | ❌ | ❌ | `<TBD v3.3>` |
| `<Premium feature TBD>` | ❌ | ❌ | ✅ |
| Email support | — | Best effort | Priority |

---

### FAQ

**Will I still be able to use Lexena offline?**
Yes, always. The local mode without an account remains free and unlimited, even when paid mode becomes available. This is a contractual promise (cf. our [Terms](./terms-en.md), article 7).

**Are my API keys (OpenAI, Groq, etc.) synchronized?**
**No, never.** Your keys are stored in your operating system's secure keyring (Windows Credential Manager / macOS Keychain / Linux Secret Service) and never leave your machine. This is a publicly documented architectural decision (cf. [ADR 0003](../decisions/0003-api-keys-device-local.md)).

**Are my audio recordings and transcriptions uploaded to your servers?**
No. In version 3.0, neither recordings, transcriptions, nor text notes leave your device. Notes synchronization is planned for v3.1, and will require your explicit opt-in (with automatic local backup before the first sync).

**Where is my synchronized data hosted?**
On Supabase, in **EU region (Frankfurt, Germany)**. No transfer outside the EU for the core features. Full details in our [Privacy Policy](./privacy-policy-en.md).

**Can I delete my account?**
Yes, at any time, from Settings > Security > "Delete my account". 30-day grace period during which you can cancel. After 30 days, effective and irreversible deletion (an automated job runs daily at 03:00 UTC).

**Can my data be used to train AI models?**
**No.** Our Terms (article 10.2) explicitly forbid the publisher from using user content to train models or for marketing.

**Can I cancel the paid subscription at any time?**
Yes, at any time, from the Lemon Squeezy customer portal, without penalty. It takes effect at the end of the paid period (monthly or annual). 14-day right of withdrawal for first purchases (EU).

**Why Lemon Squeezy and not Stripe directly?**
Lemon Squeezy is *Merchant of Record*: they fully handle EU VAT MOSS, US sales tax, and issue invoices on our behalf. For an independent publisher, that's tens of hours per year saved in international tax compliance (cf. [ADR 0001](../decisions/0001-lemonsqueezy-vs-stripe.md)).

**Is the application open source?**
`<TBD — decision pending. For now, source code not published, but very open technical documentation.>`

**How can I contact you for support?**
Email to `<support@DOMAIN>`. Response within 48h on best effort in v3.0 (free); priority for Premium subscribers from v3.2 onward.

---

### Trust footer (pricing footer)

> **Open by design.**
> Our [Privacy Policy](./privacy-policy-en.md), our [Terms](./terms-en.md), our [Architecture Decision Records](../decisions/), our [threat model](../00-threat-model.md), our [internal GDPR processing register](../compliance/registre-traitements.md), and our [operational runbooks](../runbooks/) are public and versioned. You see what we do, how, and why.

---

## Notes implémentation (sous-épique 06)

- **i18n** : utiliser le namespace `pricing.*` côté `src/locales/{fr,en}.json` quand la page sera implémentée dans le site marketing.
- **Stack site marketing** : non figé (Astro recommandé pour SEO + perf, alternatives : Next.js, Hugo). Décision sous-épique 06.
- **CTA download** : pointer vers les NSIS / .dmg / .AppImage les plus récents via `releases.json` généré par le workflow release.
- **Trust badges** : afficher "EU hosting", "GDPR compliant", "Open by design", "No tracking" en bas de page.
- **Conversion funnel** : tracker uniquement avec analytics opt-in (cf. [06-onboarding.md](../06-onboarding.md) section Tracking).
- **Schema.org** : ajouter `Product` + `Offer` + `Organization` markup pour SEO.
- **Mentions légales** : lien dans le footer global du site (extrait de `terms-fr.md` section 16 + `privacy-policy-fr.md` section 11).

## Décisions à figer avant publication v3.2

- [ ] Prix mensuel (TTC EU) : `<TBD>`
- [ ] Prix annuel avec discount (TTC EU) : `<TBD>`
- [ ] Liste exacte des features Premium (gating)
- [ ] Trial gratuit ? (cf. ADR 0011 email canonical anti-cumul de trials)
- [ ] Discount éducation / open source / non-profit ?
- [ ] Plan team / enterprise (placeholder ou différé v3.x ?)
- [ ] Fréquence facturation (mois ou an, ou les deux dès le départ)
