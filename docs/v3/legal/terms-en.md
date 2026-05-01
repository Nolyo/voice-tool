# Terms of Service — Lexena

> **Version**: v3.0 — draft 2026-05-01.
> **To publish**: after replacing the `<placeholders>` (publisher identity, final domain, billing v3.2 prices).
> **To review**: by a lawyer prior to publication. This draft mirrors `docs/v3/legal/terms-fr.md` and covers v3.0 (free) while anticipating v3.2 (billing) with a dedicated section to activate later.

---

## 1. Purpose

These Terms of Service (the "**Terms**") govern the use of the **Lexena** application (the "**Application**"), published by **`<PUBLISHER NAME>`** (the "**Publisher**"), based at `<ADDRESS>`.

The Application is distributed free of charge from `<DOWNLOAD_URL>` and runs on Windows, macOS, and Linux. It offers two modes of use:

1. **Local mode without an account** — free and unlimited, no data leaves the user's device.
2. **Mode with account** — cloud synchronization features for application settings, personal dictionary, and snippets across multiple devices.

Account registration constitutes full acceptance of these Terms and of the [Privacy Policy](./privacy-policy-en.md).

---

## 2. Definitions

- **User**: any natural person using the Application, with or without an account.
- **Account**: set of credentials (email + password or OAuth) granting access to cloud features.
- **Service**: all cloud features (synchronization, export, etc.) accessible from an Account.
- **User Content**: all data entered or produced by the User in the Application (settings, dictionary, snippets, transcriptions, notes, recordings).
- **Local mode**: use of the Application without an Account, with no data transmission to the Publisher's servers.

---

## 3. Acceptance of Terms

Use of the Application in local mode does not imply acceptance of the Terms.

Creating an Account requires explicit acceptance of the Terms and of the Privacy Policy, materialized by a checkbox at signup.

The Publisher reserves the right to modify the Terms at any time. Any material change will be notified to the User:

- By email to the address associated with the Account (at least **15 days** before entry into force).
- By an in-app notification at the next launch.

A User who does not accept the new Terms may delete their Account (cf. article 11).

---

## 4. Account creation and access

### 4.1 Creation

Account creation is free. Three methods are offered:

- Email + password (with email confirmation).
- Magic link (single-use link sent by email).
- Google OAuth.

The User undertakes to provide accurate and up-to-date information. One real email address = one Account (Gmail canonicalization is applied to prevent duplicates via aliases).

### 4.2 Account security

The User is responsible for the confidentiality of their password and any recovery codes generated when enabling 2FA. The Publisher strongly recommends:

- Using a long (≥ 12 characters) and unique password, generated and stored via a password manager.
- Enabling TOTP 2FA from Settings > Security.

The User undertakes to report to the Publisher without delay any suspected compromise of their Account (`security@<DOMAIN>`).

### 4.3 Access and restrictions

The Application is intended for persons aged at least **15 years old** (digital consent age in France; varies by jurisdiction). Use is forbidden to minors under 15.

The Publisher reserves the right to suspend or close an Account without notice in case of:

- Manifest violation of these Terms.
- Fraudulent or abusive activity (creating multiple accounts to bypass free tier limits, scraping, DDoS attacks, etc.).
- Court order or administrative injunction.

---

## 5. Service scope v3.0

The Service in version 3.0 includes:

- **Synchronization of application settings** (theme, language, shortcuts, insertion options, transcription engine choice).
- **Synchronization of personal dictionary** (replacement words and expressions).
- **Synchronization of snippets** (voice triggers + replacement texts).
- **Connected device tracking** + security notifications.
- **GDPR export** (JSON download of all synchronized data).
- **Account deletion** with 30-day grace period.

**The Service v3.0 does NOT synchronize**:

- Audio recordings.
- Transcription history.
- Text notes (planned for v3.1, opt-in).
- Third-party API keys (OpenAI, Groq, etc.) — these remain exclusively on the User's device, in the operating system's secure keyring.

---

## 6. Quotas and limits

The Publisher applies a storage quota per Account for synchronized data (settings + dictionary + snippets). The current quota is **`<QUOTA_MB>` MB**, sized to cover a very wide range of normal use. If you exceed this quota, new modifications will no longer be synchronized until you reduce your volume (deletion of snippets or dictionary words). A banner in the Application will inform you.

The Publisher may adjust this quota at any time (upward or downward, with reasonable notice in case of decrease).

---

## 7. Publisher's commitments

The Publisher commits to:

- Making the Service available with reasonable diligence, within the means of an independent publisher.
- Protecting the User's data in accordance with the [Privacy Policy](./privacy-policy-en.md) and the GDPR.
- Notifying the User in case of security incident affecting their data under the conditions of article 34 GDPR.
- Allowing the User to export and delete their data at any time.
- Maintaining the **compatibility of local mode without an account**: no essential offline-use feature will be removed to push the User toward a paid Account.

The Publisher provides **no service availability guarantee** (SLA), nor any guarantee of result. The Service is provided "as is". See article 9 for liability.

---

## 8. User's commitments

The User commits to:

- Not using the Application for illegal purposes (clandestine recording of persons without their consent in jurisdictions where this is forbidden, harassment, etc.).
- Not attempting to circumvent security or quota mechanisms (creating multiple accounts, abusive automation, etc.).
- Respecting the intellectual property rights of the Publisher and third parties.
- Not redistributing the Application modified under the Lexena name or using the Lexena trademark (cf. article 13).

The User acknowledges that **transcriptions and content generated by third-party AI models** (OpenAI, Groq, local models) are under the responsibility of the model provider, and that the Publisher does not guarantee accuracy, completeness, or absence of bias of the produced results.

---

## 9. Liability

### 9.1 Limitation of Publisher's liability

To the maximum extent permitted by applicable law, the Publisher's liability cannot be engaged:

- In case of temporary unavailability of the Service (maintenance, incident, sub-processor outage such as Supabase or Cloudflare).
- In case of data loss caused by an Application malfunction, except where gross negligence by the Publisher is demonstrated. The User is invited to keep local backups (the "GDPR Export" function is available at any time).
- In case of use of transcriptions or generated content that would cause harm to the User or to a third party.

In any case, the Publisher's maximum liability to the User is limited:

- In free version: to zero (the Service is provided free of charge).
- In paid version (v3.2+): to the amount paid by the User in the **last 12 months** preceding the triggering event.

### 9.2 User's liability

The User is solely responsible for:

- The content they record, transcribe, or store with the Application.
- Compliance with third-party rights (notably the rights to image and voice of recorded persons, professional secrecy if applicable).
- The security of their Account (password, 2FA, recovery codes).

---

## 10. Intellectual property

### 10.1 Application

The Lexena Application, its source code, trademark, logo, and visual identity are the exclusive property of the Publisher, except for third-party components under open source licenses listed at `<LICENSES_URL>`.

The User is granted a personal, non-exclusive, non-transferable right of use, to use the Application in accordance with these Terms. No right of resale, modified redistribution, or commercial exploitation is granted.

### 10.2 User Content

The User retains all rights to their User Content. The Publisher acquires no ownership, exploitation, or transfer rights over this content.

The User grants the Publisher the strictly necessary license to host, back up, and synchronize their data between their devices, strictly within the scope of the Service. This license is revocable at any time via Account deletion.

The Publisher **shall under no circumstances**:

- Use User Content for marketing, profiling, or resale to third parties.
- Train artificial intelligence models on User Content.
- Read User Content in clear without an explicit legitimate operational reason (e.g., support request initiated by the User, investigation following a security incident with consent).

---

## 11. Account deletion and termination

### 11.1 At the User's initiative

The User may delete their Account at any time, without notice or justification, from Settings > Security > "Delete my account". Deletion entails:

- Immediate logout from all devices.
- A **30-day** grace period during which the request can be canceled by simply logging back in.
- At the end of the grace period, definitive and irreversible deletion of synchronized data (cf. Privacy Policy, article 6).

### 11.2 At the Publisher's initiative

The Publisher may suspend or terminate an Account without notice in case of serious violation of these Terms (article 4.3). In case of termination, the User has 30 days to export their data.

### 11.3 Continued use in local mode

Account termination does not prevent the User from continuing to use the Application in local mode without an account. Download and use in local mode remain free and unlimited.

---

## 12. Paid Service (to be activated in v3.2)

> ⚠️ **Section not applicable in v3.0.** This section will be activated upon the introduction of billing in version 3.2. It is drafted for information and will be updated before effective publication.

### 12.1 Offer

A paid offer "Lexena Premium" will be proposed starting with version 3.2 at the price of **`<MONTHLY_PRICE>` € / month** or **`<ANNUAL_PRICE>` € / year** including VAT. This offer will include: `<PREMIUM_FEATURES_LIST_TBD>`.

### 12.2 Payment provider

Payment is processed by **Lemon Squeezy** (Lemon Squeezy LLC, USA), acting as **Merchant of Record**. As such, Lemon Squeezy assumes the collection and remittance of applicable VAT (EU) and sales tax (US/Canada).

The Publisher stores **no banking data**. Lemon Squeezy's general conditions are available at `<LS_URL>`.

### 12.3 Cancellation and refund

The User may cancel their subscription at any time from the Lemon Squeezy customer portal, without penalty. Cancellation takes effect at the end of the paid period (monthly or annual), without pro-rata refund except as required by law (notably the 14-day right of withdrawal for first purchases — see below).

### 12.4 Right of withdrawal (EU)

In accordance with article L. 221-18 of the French Consumer Code, the consumer User residing in the European Union has a right of withdrawal of **14 days** from subscription, **except** where the User has expressly consented to immediate execution of the Service (in which case the right of withdrawal is purged from the first use).

---

## 13. Trademark and visual identity

"Lexena" and the associated logo are trademarks of the Publisher. Any reproduction, modification, or commercial use without prior written authorization is strictly forbidden.

Use of the trademark in editorial contexts (articles, tutorials, podcasts, videos) is permitted without prior agreement, provided the visual identity is respected (no modification of the logo, no misleading contextualization).

---

## 14. Applicable law and jurisdiction

These Terms are governed by **French law**.

In case of dispute, and **after a mandatory prior amicable resolution attempt** (contact at `<contact@DOMAIN>`), the competent courts are:

- For **consumer** Users: the courts of the User's domicile, in accordance with the provisions of the Consumer Code.
- For **professional** Users: the **Commercial Court of `<HEADQUARTERS_CITY>`** has exclusive jurisdiction.

The consumer User may also resort free of charge to a consumer mediator: `<MEDIATOR_OR_NA>`.

---

## 15. Miscellaneous provisions

### 15.1 Partial nullity

If any provision of these Terms were judged null or inapplicable by a competent court, the other provisions would remain in force.

### 15.2 Non-waiver

The Publisher's failure to invoke a provision of the Terms shall not be interpreted as a waiver of subsequent invocation.

### 15.3 Entirety

These Terms, supplemented by the [Privacy Policy](./privacy-policy-en.md), constitute the entirety of the agreement between the User and the Publisher concerning use of the Application.

---

## 16. Contact

| Type of request | Contact |
|---|---|
| General support | `<support@DOMAIN>` |
| Contractual question / dispute | `<contact@DOMAIN>` |
| Security vulnerability report | `security@<DOMAIN>` |
| Data Protection Officer | `<DPO_OR_NA>` |

**Publisher identity**:

- **`<PUBLISHER NAME>`** (legal form: `<sole proprietor / SASU / other>`)
- Address: `<ADDRESS>`
- Email: `<contact@DOMAIN>`
- Company registration: `<SIRET>` (if applicable)
- Legal representative: `<FIRST LAST>`

**Primary hosting**:

- **Supabase, Inc.** — Frankfurt region (Germany)
- **Cloudflare, Inc.** — Global edge network (authentication callback page)

---

*Last updated: `<PUBLICATION_DATE>`.*
