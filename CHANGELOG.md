# Changelog

All notable changes to Lexena (formerly Voice Tool) are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> ⚠️ **Versions older than 3.0 are unsupported.** Please upgrade to the latest 3.x release.
> Full historical release notes for the 2.x line are available on the [GitHub Releases page](https://github.com/Nolyo/lexena/releases).

---

## [3.0.0] - 2026-05-XX (in preparation)

> Major release. Voice Tool becomes **Lexena**. User accounts and cloud sync of settings, vocabulary and snippets land. The trust promise stays intact: **the fully local, account-less mode remains free and fully functional, and your API keys never leave your device**.

### Added — Visual identity
- Full **Voice Tool → Lexena** rebrand: binary, application identifier (`com.nolyo.lexena`), AppData folder (`%APPDATA%/com.nolyo.lexena/`), deep-link scheme (`lexena://`)
- New Lexena visual identity: icons, color palette, OKLCH-based design tokens, scoped under `.vt-app`

### Added — User accounts (sub-epic 01)
- Sign up via **magic link**, **email + password**, or **Google OAuth**
- **Optional 2FA (TOTP)** — toggle from Settings → Security, compatible with Google Authenticator, Authy, Bitwarden, 1Password
- **10 recovery codes** generated when 2FA is enabled, hashed server-side (SHA-256), single-use
- **Cloudflare Turnstile captcha** at signup and magic-link request to throttle abuse
- **Pwned-password check**: passwords found in the embedded top-10k SHA-256 leak list are rejected (offline check, no network round-trip)
- **Live password-strength meter** at signup
- **Anti-enumeration**: identical responses for known and unknown accounts at every signup / reset / magic-link path
- **Anti-Gmail-aliasing**: `user+tag@gmail.com` and `u.s.e.r@gmail.com` are recognized as a single account (Postgres trigger + immutable canonicalization function)
- **Disposable-domain blocklist** at signup (embedded list, client-side check)
- Sessions stored in the **OS keyring** (Windows Credential Manager / macOS Keychain / Linux Secret Service) with a memory-only fallback when the keyring is unavailable
- **Connected devices view** in Settings → Security: OS, app version, last activity, revoke
- **Rust-side deep-link validation**: anti-CSRF nonce, anti-replay window, strict JWT-shape parsing
- New screens: `AuthModal`, `SignInPanel`, `SignupView`, `ResetPasswordRequest/Confirm`, `TwoFactorActivationFlow`, `TwoFactorChallengeView`, `RecoveryCodesPanel`

### Added — Cloud sync (sub-epic 02)
- **Opt-in sync** of settings, personal dictionary and snippets through Supabase EU
- **9 syncable scalar settings**: theme, UI language, 3 hotkeys, insertion mode, sounds, transcription provider, local model size
- **Last-Write-Wins per item** to resolve multi-device conflicts via the server timestamp
- **Soft-delete with tombstones** so deletions propagate cleanly across devices
- **Automatic local backup** taken before the first sync activation
- **Persistent offline queue**: changes made offline are FIFO-queued and flushed automatically on reconnect
- **Backoff + dead-letter queue** after 5 failed retries — never blocks the queue on a permanent error
- **Quota-exceeded UI banner** + DLQ management screen
- **Legacy migration**: snippets and dictionary entries that were stored in the legacy Tauri Store are migrated automatically the first time the recording workflow mounts
- **Edge Functions**: `sync-push` (Zod validation + per-user quota), `account-export` (GDPR Art. 20 export)
- **Runtime payload validation** (Zod) on every cloud read — malformed data is rejected before reaching the UI
- Settings → Account: sync activation toggle, real-time sync status, local backup list, export shortcut

### Added — Account deletion (GDPR)
- **"Delete my account" button** in Settings → Security with a strong confirmation step
- **30-day grace period**: a tombstone is recorded, global sign-out fires immediately, and any subsequent login lands on `DeletionPendingScreen` with an "undo" button
- **AAL2 required** when MFA is on: deletion and undo both demand a fresh TOTP elevation
- **Daily Postgres cron** (`pg_cron`, 03:00 UTC) invokes the `purge-account-deletions` Edge Function which performs the actual purge after 30 days (FK cascade across every user-owned table)
- **Local data scrubbed** at request time: sync caches, local backups, recovery codes
- Strictly local data (recordings, transcription history, notes) is intentionally **kept** — it never reached our servers

### Added — GDPR data export
- "Export my data" button in Settings → Account
- Generates a JSON containing `user_settings`, `user_dictionary_words`, `user_snippets`, `user_devices`
- Compliant with GDPR Art. 20 (data portability)

### Added — Security foundations (sub-epic 00)
- **CI workflow `security-audit.yml`**: `pnpm audit` + `cargo audit` blocking on HIGH/CRITICAL (PRs and daily cron)
- **CI workflow `secret-scan.yml`**: regex scanner for leaked secrets (`sb_secret_*`, `service_role` JWTs, PEM blocks, `lsq_*`) running on both frontend bundles **and** Tauri binaries at every release
- **CI workflow `ci.yml`**: Vitest + cargo test + Deno test + pgtap RLS (90 + 30 + Deno + RLS)
- **Cross-tenant pgtap tests** on the 5 sync tables, `recovery_codes` and `user_devices`
- **Operational runbooks**: secret rotation, restore-from-backup drill, GDPR <72h incident response, account-deletion purge, device-fingerprint investigation
- **GDPR processing register** + lawful basis per processing activity
- **Bootstrap docs**: Supabase EU setup, Cloudflare Pages, ops 2FA enrollment checklist

### Added — Notes (continuation of 2.x)
- **Tiptap tables** with a floating toolbar
- **Code blocks with syntax highlighting** via `lowlight` and a per-block language selector
- **Slash command menu** (`/`) to insert blocks
- **Drag & drop** for moving notes between folders
- Custom **folder-creation dialog** (replaces the native browser `prompt()`)
- Note-to-note linking (`@`) + backlinks panel + broken-link detection (carried over from 2.10.1)

### Added — History
- **Pin transcriptions** to keep important entries at the top of the list
- **Advanced export + filters**: text search, date range, format
- **Statistics dashboard**: usage-statistics tab

### Added — Audio
- **Auto-trim silence** at the start and end of recordings (adaptive threshold, detailed logging)

### Added — UI / UX
- **Compact layout mode** for narrow windows
- Logs tab is now **gated behind developer mode** (Settings → System)
- Advanced log filters (level + source)
- Unified copy-to-clipboard feedback (`useCopyToClipboard`) on every copy button
- Title preview / inline edit in the mini window, settings refresh on startup
- Slash menu and table-toolbar polish

### Changed
- **AppData layout**: per-profile data is now consistently rooted at `%APPDATA%/com.nolyo.lexena/profiles/<profile_id>/` (settings, recordings, transcriptions, notes). Profile isolation was introduced in 2.9.0; this release finalizes the layout under the new application identifier.
- Settings sections reorganized — new **Account** and **Security** tabs (only visible when signed in)
- Post-process mode selector simplified
- Sidebar dashboard: tinted slate icons
- Removed redundant note icon from sidebar / tabs

### Security
- **Edge Function CORS** locked down to the official Tauri origins (was wildcard during early development)
- **Deno unit tests** on the critical Edge Functions
- **2FA hardening**: AAL2 elevation + a fresh TOTP challenge are required to disable 2FA
- **Atomic 2FA activation** + pinned `search_path` on `pgcrypto`
- **PKCE flow** for magic link / signup / recovery
- **Rate limiting**: Postgres table + `check_rate_limit` RPC, daily purge job, revoked from the `anon` role
- **New-device trigger**: `notified_at` column + payload ready for an Edge Function email send (actual delivery is a follow-up)
- **Turnstile hardening**: prod-build guard, theme alignment, submit UX
- `.gitattributes` enforces LF line endings (eliminates cross-OS CRLF warnings)
- Pinned transitive deps via `pnpm overrides` for CVE patches
- Targeted log filter `lexena_lib=info,warn` (no PII reaches Edge Function logs)

### Fixed
- **Recovery codes are actually consumable**: `consume_recovery_code` RPC now elevates the session to AAL2 (was unreachable before the `20260601000500` migration)
- **2FA recovery flow**: `userId` correctly forwarded to `admin.mfa.deleteFactor`
- **Sync queue**: dequeue by ID after partial-success batches (operations were being lost)
- **Sync queue**: respects backoff and moves to DLQ after 5 retries
- **Account deletion**: only removes the tombstone if `deleteUser` succeeded
- **Account deletion**: global sign-out is now error-tolerant + a confirmation alert + a11y polish
- **Deletion cron**: switched from GUCs to `supabase_vault`, `pg_net` enabled, `verify_jwt=false`
- **Notes**: placeholder body hidden once the note is non-empty
- **i18n**: reset-password confirmation phrase translated (was hard-coded French)
- **Deletion-pending screen**: CLDR plural keys + back-to-local-mode button + a11y
- **AuthContext**: `deletionPending` fetch protected against stale async writes
- **Slash suggestion**: distinct `PluginKey` to avoid collision with NoteLink
- **Light mode**: full support across the `vt-app` design system
- **CI**: 4 jobs fixed (pnpm conflict, deno lockfile, cargo target-dir, pgtap aal)
- **CI**: Linux libs added for `cpal`/`enigo`/`reqwest` (alsa, xdo, ssl)

### Documentation
- 12 v3 ADRs frozen (`docs/v3/decisions/0001-0012`)
- 3 sub-epics frozen (00 security, 01 auth, 02 sync) each with a closure ADR
- Implementation plans for sub-epic 00, 01, 02, account deletion, post-review fixes, auth hardening
- 3 manual end-to-end checklists (auth, sync, account deletion)
- 5 operational runbooks
- GDPR register + lawful basis + bootstrap guides
- Threat model + per-measure implementation matrix (delivered 2026-05-01)

### Internal
- Library crate renamed `lexena_lib`
- `.gitignore` covers `.mcp.json` and intermediate plan files
- Removed unused dependencies: `tauri-plugin-fs`, `tauri-plugin-shell`
- Added: `bstr`, `normpath`, `opener`, `keyring`, `zod`, `vitest`, `supabase-cli`, `tauri-plugin-deep-link`

### Migration notes
- **Profile data**: existing 2.x users keep their `profiles/<id>/` layout untouched. Fresh 3.0 installs land directly in `%APPDATA%/com.nolyo.lexena/profiles/default/`.
- **Pre-rebrand installs** (`%APPDATA%/voice-tool/` or `%APPDATA%/com.nolyo.voice-tool/`): no automatic AppData migration across application identifiers — users coming from those installs need to copy their `profiles/` folder manually into `%APPDATA%/com.nolyo.lexena/`. A clean reinstall from 3.0 is the recommended path.
- **Legacy snippets / dictionary** stored in the old Tauri Store keys (`settings.snippets`, `settings.dictionary`) are migrated automatically the first time the recording workflow mounts.

### Removed
- Post Process section removed from settings
- Redundant stats row removed from history
- Redundant note icon removed from sidebar / tabs
- MSI and portable installers (single NSIS installer is the only artifact — already since 2.10.0)

### Notes
- v3.0 ships as **"Public Beta"** during the soft launch
- Supabase is on the **Free** plan (Pro upgrade deferred until traction per the v3.0 launch posture)
- **External security audit** scheduled post-traction (>50 sync users); not blocking for soft launch
- **Privacy Policy / Terms of Service / Legal mentions**: FR + EN drafts shipped under `docs/v3/legal/` — public publication depends on the final domain (sub-epic 06)
- **Supabase Pro upgrade** is the prerequisite for PITR + signed DPA + time-boxed sessions

---

## [2.10.1] - 2026-04-22

### Added
- New system of dark / light themes with automatic switching based on system preferences
- Settings now lets you delete your data (recordings, transcriptions, notes) without uninstalling the app
- Note-to-note linking: type `@` in any note to link to another note, with auto-complete by title
- Broken links (when the target note is deleted) are shown in red with a one-click dialog to recreate the missing note
- Backlinks panel at the bottom of each note ("Mentioned in") listing all notes that reference it
- Middle-click to close tabs in notes

### Fixed
- Markdown handling in the AI assistant via Turndown + Marked (preserves line breaks, supports tables, code blocks, lists)

### Changed
- Improved layout and styling of transcription history

---

## [2.0.0 — 2.10.0] — Historical (2025-10-22 → 2026-04-18)

The 2.x line introduced the original Voice Tool app and grew it into a full transcription suite.
**These versions are unsupported as of 3.0.** Highlights:

- **2.10.0** — Universal GPU acceleration via Vulkan (NVIDIA / AMD / Intel) with automatic CPU fallback; settings sub-navigation; first-launch onboarding wizard; translation mode on the local Whisper engine; streamlined NSIS-only installer
- **2.9.0** — Profile system (multiple independent profiles with isolated settings, notes, history, recordings); Tiptap rich-text notes editor with bubble menu, color picker, highlights and inline code
- **2.8.0** — Stable / Beta release channels; direct cursor insertion mode that no longer touches the clipboard; collapsible sidebar navigation
- **2.7.x** — Notes feature (integrated editor, favorites, image paste); single-instance enforcement; dedicated logs file
- **2.6.x** — Local Whisper transcription (free, unlimited, offline); custom vocabulary (snippets + personal dictionary); background model preloading
- **2.2.0–2.5.x** — Mini-window streaming modes (Deepgram), real-time interim/final transcription overlay
- **2.1.0** — Auto-update infrastructure
- **2.0.0** — Initial Tauri release: real-time recording, audio level visualization (main + floating mini), OpenAI Whisper integration, configurable global hotkeys, system tray, transcription history (IndexedDB), auto-paste, structured logging, NSIS / MSI / portable installers

For per-version release notes (Added / Changed / Fixed) of any 2.x version, see the [GitHub Releases page](https://github.com/Nolyo/lexena/releases).
