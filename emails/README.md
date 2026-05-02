# Lexena Email Templates

React Email-based transactional email templates for Lexena.

## Phase 1 (current — delivered 2026-05-02)

3 templates served by Supabase Auth:
- `templates/MagicLink.tsx` — `Sign in to Lexena`
- `templates/SignupConfirmation.tsx` — `Confirm your Lexena email address`
- `templates/PasswordReset.tsx` — `Reset your Lexena password`

Language: **EN only** for v3.0. FR will be added later via a Supabase Auth email-hook keyed on `user_settings.ui_language`.

## Workflow

### Editing a template

1. Modify the `.tsx` under `templates/`.
2. Preview live: `pnpm email:dev` → open `http://localhost:3001`.
3. When done, build: `pnpm email:build` → produces `../dist/emails/<slug>.html`.
4. Run tests: `pnpm test emails/` → 23 tests should pass (4 tokens + 18 templates + 5 build).
5. Commit the `.tsx` AND the rebuilt `dist/emails/*.html` together (snapshot regression test enforces this).
6. Follow `DEPLOY_SUPABASE.md` to paste the new HTML into Supabase Dashboard.

### Adding a new template

1. Create `templates/<NewTemplate>.tsx` exporting `default` (the component) and `subject` (the subject string).
2. Register it in `build.tsx` in the `TEMPLATES` array.
3. Add tests to `__tests__/templates.test.tsx`.
4. Run `pnpm test emails/` and `pnpm email:build`.
5. Commit, then deploy following `DEPLOY_SUPABASE.md`.

## Architecture

- `components/tokens.ts` — design tokens (colors, font stack, logo URL, spacing)
- `components/EmailLayout.tsx` — outer shell (Html, Head, Body, Container) with Google Fonts Inter + fallbacks
- `components/EmailHeader.tsx` — navy header with monogram (56×56)
- `components/EmailFooter.tsx` — footer with `contextLine` slot per template
- `components/EmailButton.tsx` — Signal Green CTA
- `components/EmailHeading.tsx` — H1 styled (24px / 600 / navy)
- `components/EmailText.tsx` — paragraph (default + muted variants)
- `components/EmailSecurityNote.tsx` — bordered callout with Signal Green left-border
- `build.tsx` — render all templates to `../dist/emails/*.html` with Liquid placeholder safety
- `__tests__/` — vitest snapshots, regression tests, per-template content assertions

## Liquid placeholder safety

Supabase Auth uses Liquid templating (`{{ .ConfirmationURL }}`). React HTML-escapes braces in attribute values, which would break the substitution. The build script (`build.tsx`) post-processes the HTML via `unescapeLiquid()` to restore literal `{{ }}`. This is guarded by tests in `__tests__/build.test.ts`.

If you add a template with a NEW Liquid variable (e.g., `{{ .Email }}`), verify it survives the build by checking `dist/emails/<your-template>.html` for the literal placeholder. Add a corresponding assertion in the build test.

## Logo asset

The header monogram is currently a placeholder loaded from GitHub raw:

```
https://raw.githubusercontent.com/Nolyo/voice-tool/main/src-tauri/icons/monogram-512.png
```

This URL is centralized in `components/tokens.ts` (`logoUrl`). Migrate to a stable CDN (e.g., `lexena.app/static/email/monogram@2x.png`) once the marketing site is deployed, OR when the new monogram design lands.

## Phase 2 (planned, separate spec)

Edge Functions Resend templates, sharing the same components:
- Welcome (post-signup, FR/EN by user locale)
- New device alert (rebuilds `send-new-device-email` HTML output)
- Account deletion request
- Account deletion completion

See `docs/superpowers/specs/2026-05-02-email-templates-supabase-auth-design.md` section 9 (out of scope of phase 1).

## Operator runbook

- `DEPLOY_SUPABASE.md` — how to deploy the compiled HTML into Supabase Dashboard.
- `COMPATIBILITY.md` — multi-client rendering matrix (filled by operator after Litmus / Email on Acid run).
