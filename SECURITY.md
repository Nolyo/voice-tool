# Security Policy

Voice Tool takes security seriously. This document describes how to report vulnerabilities and the security posture of the project.

## Reporting a Vulnerability

If you believe you have found a security vulnerability in Voice Tool, please report it privately. **Do not open a public GitHub issue.**

- **Email**: security@voice-tool.app _(to be confirmed when the domain is registered)_
- **Subject line**: `[SECURITY] <short description>`
- **PGP**: not available for v3.0, planned for v3.x

### What to include

- A description of the vulnerability and its potential impact
- Steps to reproduce (proof of concept if possible)
- The affected version(s) of Voice Tool
- Your contact information if you wish to be credited

### Our commitments

- **Acknowledgement**: within **5 business days** of your report
- **Status update**: within **15 business days**
- **Fix timeline target**: within **30 days** for HIGH/CRITICAL findings, **90 days** for MEDIUM
- **Safe harbor**: we will not pursue legal action against researchers acting in good faith under this policy
- **Credit**: if you wish, we will credit you in the release notes of the fixed version

## Scope

### In-scope

- Voice Tool desktop application (Windows, macOS, Linux builds)
- Backend API (Supabase project, Edge Functions) — once v3 is live
- Marketing website and auth-callback page — once live
- Auto-updater infrastructure (update manifest, signature verification)

### Out-of-scope

- Device compromise (malware, physical access to an unlocked machine)
- Social engineering targeting users or maintainers
- Denial of service attacks
- Clones, forks, or unofficial distributions of Voice Tool
- Third-party services we depend on (Supabase, Lemon Squeezy, Google OAuth) — please report to them directly
- Vulnerabilities in end-user-supplied credentials (OpenAI keys, etc.) that never leave the user's device

## Our Security Posture

Voice Tool v3 introduces user accounts and cloud synchronization. The following applies:

- **API keys stay on your device.** Third-party API keys (OpenAI, Groq, etc.) are stored locally only and never transmitted to our servers.
- **Transport encryption.** All communication uses TLS.
- **At-rest encryption.** Synchronized data is stored in Postgres with at-rest encryption enabled.
- **Server-side encryption model.** We can access synchronized content (notes, settings) to operate the service — we are not an end-to-end encrypted product. See our privacy policy for details.
- **Two-factor authentication.** TOTP-based 2FA is available and recommended, especially for paid accounts.
- **Local mode remains free.** Voice Tool can be used entirely offline, without an account, for the free feature set.

For the detailed threat model and security decisions, see [`docs/v3/00-threat-model.md`](docs/v3/00-threat-model.md) and the ADRs in [`docs/v3/decisions/`](docs/v3/decisions/).

## Responsible Disclosure

We ask that researchers:

- Give us a reasonable amount of time to fix a vulnerability before public disclosure (we aim for 30 days on HIGH/CRITICAL)
- Do not access, modify, or delete data that is not yours
- Do not perform actions that degrade the service for other users (DoS, mass-scanning authenticated endpoints)
- Do not leverage the vulnerability beyond what is necessary to demonstrate it

## Historical Advisories

No advisories at this time.

---

_Last updated: 2026-04-22._
