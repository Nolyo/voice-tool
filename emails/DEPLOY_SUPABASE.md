# Deploy to Supabase Auth — Phase 1

Manual procedure for deploying the 3 compiled HTML templates (`emails/dist/*.html`) into Supabase Auth → Email Templates.

This step is **operator-only** and cannot be automated from CI without giving CI access to the Supabase Dashboard.

## Prerequisites

- Access to the Lexena Supabase project Dashboard (admin role).
- The latest committed `emails/dist/*.html` files on disk.
- An operator email address you can receive test emails on (Gmail recommended for visual confirmation).

## Procedure (per template)

For each of the 3 templates, repeat these steps. Total time: ~5 minutes per template.

### 1. Open the Supabase Dashboard

Navigate to:

```
Supabase Dashboard → [project] → Authentication → Email Templates
```

### 2. Select the template type

| File | Supabase template name |
|---|---|
| `emails/dist/magic-link.html` | **Magic Link** |
| `emails/dist/signup-confirmation.html` | **Confirm signup** |
| `emails/dist/password-reset.html` | **Reset Password** |

### 3. Read the subject from the HTML file

The subject is stored as a literal HTML comment on line 1 of each compiled file:

```html
<!-- Subject: Sign in to Lexena -->
```

Set the **Subject** field in Supabase to the value after `Subject: ` (exclude the comment markers).

| File | Subject to set |
|---|---|
| `magic-link.html` | `Sign in to Lexena` |
| `signup-confirmation.html` | `Confirm your Lexena email address` |
| `password-reset.html` | `Reset your Lexena password` |

### 4. Replace the HTML body

- Open the local file in a text editor (e.g. VS Code).
- Select all content (the HTML comment line is fine to keep — Supabase ignores it).
- Copy.
- In the Supabase template form, click in the **Message Body** / HTML editor.
- Select all existing HTML (defaults from Supabase) and replace.
- Paste your file contents.

### 5. Save

Click **Save** on the Supabase template form.

### 6. Send a test email

In the Supabase Dashboard you may have a "Send test email" affordance, OR trigger the flow from the Lexena app:

| Template | How to trigger |
|---|---|
| Magic Link | Lexena app → Settings → Account → "Sign in with email" → enter your operator address |
| Confirm signup | Sign up a fresh throwaway account (use a `+test` Gmail alias) |
| Reset Password | Lexena app → Sign in screen → "Forgot password?" → enter your operator address |

### 7. Verify in your inbox

Open the email on:

- **Gmail web** (desktop browser): visual matches preview from `pnpm email:dev`
- **Mobile** (Gmail iOS / Android): layout still readable, button tappable
- **Click the CTA**: the URL should be a real Supabase confirmation link, NOT the literal text `{{ .ConfirmationURL }}`. If you see the literal placeholder, the Liquid substitution failed — re-check that you copied the full file content (including the `<!DOCTYPE html…>` and surrounding HTML) and saved.

### 8. Repeat for the next template

Go back to step 1 with the next file in the table.

## Common issues

**"I see literal `{{ .ConfirmationURL }}` in my received email."**
The Liquid substitution didn't fire. Most likely the HTML body field in Supabase contained extra escaping (e.g., the file was pasted into a Markdown form which re-encoded the braces). Fix: paste the file content into a raw HTML field, not a rich-text editor.

**"The Inter font isn't loading."**
Outlook desktop ignores Google Fonts `<link>` tags. The fallback Segoe UI / Helvetica is used instead — this is expected. Check the rendered font weight is still 500 on the CTA button (it should be).

**"The monogram isn't loading."**
The image URL is `https://raw.githubusercontent.com/Nolyo/voice-tool/main/src-tauri/icons/monogram-512.png`. Verify the URL still resolves (the repo may have been renamed). If you're getting CSP / privacy-blocker errors in the email client, that's expected for some users — alt text "Lexena" will display.

## Re-deployment after a template change

After modifying any `.tsx`:

```bash
pnpm email:build
git add emails/
git commit
```

Then re-run the procedure above only for the changed templates.

## After deployment

Once all 3 templates are live, mark this checklist in the PR description:

```markdown
- [ ] Magic Link template deployed and tested
- [ ] Signup Confirmation template deployed and tested
- [ ] Password Reset template deployed and tested
```
