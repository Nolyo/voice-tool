# Privacy Policy — Lexena

> **Version**: v3.0 — draft 2026-05-01.
> **To publish**: after replacing the `<placeholders>` (publisher identity, final domain, DPO contact).
> **To review**: by a lawyer prior to public release. This draft mirrors `docs/v3/legal/privacy-policy-fr.md` and is based on the internal processing register (`docs/v3/compliance/registre-traitements.md`) and legal basis document (`docs/v3/compliance/base-legale.md`).

---

## 1. Preamble

Lexena is an AI-assisted voice transcription application, distributed as a desktop app for Windows, macOS, and Linux. It is published by **`<PUBLISHER NAME>`**, based in France.

This privacy policy describes what data Lexena collects, why, on what legal basis, who we share it with, and how you can exercise your rights over that data.

This policy applies only to the **account-based features** introduced in version 3.0. **The 100 % local mode without an account is subject to no server-side collection whatsoever**: all your data stays on your device.

---

## 2. Our stance in one sentence

> You stay in control of your voice data and API keys. We sync only what you choose to sync, on European servers, and you can export everything or delete everything at any time.

### What we never see

- **Your API keys** (OpenAI, Groq, etc.) — they remain stored on your device, in your operating system's secure keyring. They never leave your machine.
- **Your audio recordings** — they remain on your device. No audio is uploaded to our servers in v3.0.
- **Your transcription history** — it remains on your device. No transcription is synchronized in v3.0.
- **Your text notes** — they remain on your device in v3.0. Notes synchronization is planned for version 3.1 and will require your explicit consent.

### What we see (only if you create an account)

- Your email address.
- Your application settings: theme, UI language, keyboard shortcuts, insertion options, transcription engine choice.
- Your personal dictionary and replacement snippets.
- The list of your connected devices (name, OS, app version, last activity).

---

## 3. Data collected and purposes

The following table details **each category of data collected**, the purpose, the legal basis (within the meaning of Article 6 GDPR), and the retention period.

| Data collected | Purpose | Legal basis | Retention |
|---|---|---|---|
| Email | Account identifier, security (new device notifications, password reset) | Performance of contract (art. 6.1.b) | Lifetime of account + 30 days after deletion request |
| Password hash (bcrypt) | Authentication | Performance of contract | Same |
| Active sessions (refresh tokens) | Maintain login without password re-entry | Performance of contract | Until logout or revocation |
| TOTP secret (if you enable 2FA) | Two-factor authentication | Performance of contract | As long as 2FA is enabled |
| Hashed recovery codes (if you enable 2FA) | Recovery in case of lost authenticator device | Performance of contract | As long as 2FA is enabled |
| Application settings (theme, language, shortcuts, etc.) | Multi-device synchronization | Performance of contract | Lifetime of account + 30 days |
| Personal dictionary (words, replacement expressions) | Multi-device synchronization | Performance of contract | Same |
| Snippets (voice triggers + replacement texts) | Multi-device synchronization | Performance of contract | Same |
| Connected device list (OS name, app version, last activity) | Security (new device alert, session management) | Performance of contract (security, art. 32 GDPR) | While device is active + 90 days |
| Server logs (timestamp, endpoint, pseudonymized user_id, HTTP code) | Security, debug, rate limiting | Legitimate interest (art. 6.1.f) | 30 days |
| Email canonicalization metadata (anti-duplicate) | Prevent abusive multi-account creation via Gmail aliasing | Legitimate interest | Lifetime of account |

**We do not collect**:
- Your audio recordings.
- Your transcriptions.
- Your text notes (in v3.0).
- Your third-party API keys (OpenAI, Groq, etc.).
- Your IP address (beyond the duration of a single request, not persisted).
- Advertising identifiers, tracking cookies, or third-party analytics.

---

## 4. Sub-processors

We entrust the processing of your data to the following sub-processors. Each is bound to us by a Data Processing Agreement (DPA) compliant with the GDPR.

| Sub-processor | Purpose | Location | DPA | Certification |
|---|---|---|---|---|
| **Supabase, Inc.** | Database hosting, authentication, server functions | **EU region (Frankfurt, Germany)** | ✅ included with Supabase Pro plan | SOC 2 Type 2 |
| **Cloudflare, Inc.** | Static hosting of the authentication callback page (`<auth.domain>`) | Global edge network, CDN | ✅ Cloudflare public DPA | ISO 27001, SOC 2 Type 2 |
| **Google LLC** (only if you choose Google OAuth) | OAuth authentication | Global | Included in Google API Terms of Service | Standard |

**No data transfer outside the European Union** occurs for the core features (account, settings/dictionary/snippets sync). The only data that transits via sub-processors operating outside the EU is:

- If you use **Google OAuth**: your email and Google identity transit via Google (for the authentication operation only). We do not store any other Google data.
- If you use the **Cloudflare Pages** callback page: only the temporary authentication token transits, immediately consumed and then erased from the browser.

Starting with version 3.2, a fourth sub-processor will be added:

- **Lemon Squeezy** (Merchant of Record), for payment processing. Location: United States. DPA to be signed when billing is enabled.

This policy will be updated before billing is introduced.

---

## 5. Legal bases

In accordance with Article 6 GDPR, we process your data on two main legal bases:

- **Performance of contract** (art. 6.1.b): for everything constituting the service itself — account creation and management, synchronization, security, future billing.
- **Legitimate interest** (art. 6.1.f): for technical logs necessary for service security (rate limiting, anti-fraud, debug). These logs contain **neither your email, nor the content of your notes or settings, nor your password, nor your authentication tokens**.

No processing based on explicit consent (art. 6.1.a) is implemented in v3.0. Should we introduce product analytics in the future, they would be **strictly opt-in**.

---

## 6. Your rights

You have the following rights over your personal data at all times, in accordance with Articles 15 to 22 GDPR:

| Right | How to exercise | Response time |
|---|---|---|
| **Access** (art. 15) | Settings > Account > "Export my data" — downloadable JSON | Immediate |
| **Rectification** (art. 16) | Settings > Account > edit fields | Immediate |
| **Erasure** (art. 17) | Settings > Security > "Delete my account" — effective purge within 30 days max | ≤ 30 days |
| **Portability** (art. 20) | Same as "Access" — standard JSON format | Immediate |
| **Restriction** (art. 18) | Email contact | ≤ 30 days |
| **Objection** (art. 21) | Email contact | ≤ 30 days |
| **Complaint** | Your local data protection authority (e.g., CNIL in France — [www.cnil.fr](https://www.cnil.fr)) | — |

### Detail of "Account deletion"

When you request account deletion:

1. **Immediately**: your session is invalidated on all your devices, you are logged out.
2. **For 30 days**: your data remains in our database but is inaccessible; you can **cancel the request** by logging back in.
3. **After 30 days**: an automated job (daily cron at 03:00 UTC) permanently deletes your account from our database: email, password hash, settings, dictionary, snippets, recovery codes, sessions, devices. The deletion is irreversible.

**Intentionally retained after deletion**:
- **100 % local data** (recordings, transcriptions, notes) remains on your device. It was never with us, so it is not affected.

---

## 7. Security

We protect your data through:

- **Encryption in transit** (TLS 1.3 mandatory) on all client ↔ server connections.
- **Encryption at rest** on the Supabase database (native Postgres feature).
- **Strict per-user isolation** at the database level (PostgreSQL Row-Level Security with policies verified by automated tests).
- **Storing sessions in the operating system's secure keyring** (Windows Credential Manager / macOS Keychain / Linux Secret Service).
- **Optional TOTP 2FA** activatable from Settings > Security.
- **Anti-pwned password verification** at signup (rejection of passwords present in the top 10,000 known leaks).
- **Cloudflare Turnstile captcha** at signup to limit abuse.
- **Rate limiting** on sensitive endpoints (signup, magic link, password reset).
- **Daily CI dependency audits** (`pnpm audit`, `cargo audit`).
- **Anti-secret-leak scanner** on every release (verifies no technical key ends up in distributed binaries).

### Acknowledged limits

We adopt a "server-side encryption" stance (Notion, Linear, Slack style) — as opposed to end-to-end encryption (Signal, Proton, Bitwarden style). This means:

- ✅ Your data is encrypted in transit and at rest.
- ✅ No one can access your data over the Internet without your password (and without 2FA if enabled).
- ⚠️ A leak of our database by an external attacker would mean your synchronized parameters (settings, dictionary, snippets) could be read. This is an acknowledged trade-off: the text notes (sub-epic 03, planned for version 3.1) will fall under this stance.
- ⚠️ A Supabase employee with database access could theoretically read your data. We rely on Supabase's contractual commitments and SOC 2 Type 2 certifications (signed DPA).

If this stance does not suit you, **continue using Lexena in 100 % local mode without an account** — it's free, unlimited, and no data leaves your device.

### Breach notification

Should a breach affecting your data occur, we commit to:

- Notifying the relevant data protection authority within **72 hours** of becoming aware, in accordance with Article 33 GDPR.
- Notifying you by email **as soon as possible** if the breach poses a high risk to your rights and freedoms (art. 34).
- Publishing a public information page with a timeline and the measures taken.

Our incident response plan is documented internally (`docs/v3/runbooks/incident-response.md`).

---

## 8. Cookies and trackers

Lexena is a **desktop application**. It uses **no cookies** server-side, **no tracking pixels**, **no third-party analytics tools**.

The web authentication callback page (hosted on Cloudflare Pages) sets **no persistent cookies**. It only uses the browser's `localStorage` temporarily to transmit the authentication token to the desktop application, then erases it immediately.

---

## 9. Minors

Lexena is not intended for persons under **15 years of age** (digital consent age in France; 13–16 depending on jurisdiction). If you are under 15, do not create an account.

If we learn that an account has been created by a person under 15, we will delete it.

---

## 10. Changes to this policy

We may need to modify this policy to reflect changes in the application (e.g., introduction of notes sync in v3.1, billing in v3.2). Any material change will be notified to you:

- By email to the address associated with your account (at least 15 days before entry into force).
- By an in-app notification at the next launch.

The version history of this policy is publicly available at `<FUTURE_DOMAIN_URL>/privacy/changelog`.

---

## 11. Contact

| Type of request | Contact |
|---|---|
| Exercising your GDPR rights (access, rectif, deletion, etc.) | `<contact@DOMAIN>` |
| Question about this policy | `<contact@DOMAIN>` |
| Security vulnerability report | `security@<DOMAIN>` (cf. project `SECURITY.md`) |
| Data Protection Officer (DPO) | `<DPO_NAME_OR_NA_IF_NOT_DESIGNATED>` |
| Supervisory authority | Your local data protection authority — France: CNIL ([www.cnil.fr](https://www.cnil.fr)) |

**Publisher identity**:

- **`<PUBLISHER NAME>`** (legal form: `<sole proprietor / SASU / other>`)
- Address: `<ADDRESS>`
- Email: `<contact@DOMAIN>`
- Company registration: `<SIRET>` (if applicable)
- Legal representative: `<FIRST LAST>`

**Primary hosting**:

- Supabase, Inc. — Frankfurt region (Germany)

---

## 12. Annex — Data processed in 100 % local mode (without an account)

For information, the 100 % local mode of Lexena processes the following data locally, **without any transmission to our servers or to a third party** (except if you explicitly configure a third-party API key such as OpenAI or Groq, in which case recordings are sent to the transcription provider you have chosen, under your own responsibility):

- Audio captured via your microphone (processed by the configured transcription engine: OpenAI Whisper API, Groq, or local `whisper-rs` model).
- Generated transcriptions and associated history.
- Text notes created in the application.
- Application settings stored locally (`%APPDATA%/com.nolyo.lexena/`).

This data remains on your device as long as you do not enable synchronization.

---

*Last updated: `<PUBLICATION_DATE>`.*
