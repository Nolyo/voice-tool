# Email client compatibility (Phase 1)

Multi-client rendering tests for the 3 Supabase Auth templates.

## Status

**Pending operator action.** The matrix below is empty until tested via [Email on Acid](https://emailonacid.com) or [Litmus](https://litmus.com) (free trial sufficient for one round).

## How to run the test

1. Start a free trial at Email on Acid OR Litmus (7-day windows are typically enough).
2. For each of the 3 HTML files in `dist/emails/`, upload it as a campaign / test, OR paste its contents into the in-browser HTML editor of the chosen tool.
3. Run the multi-client preview against at least the clients listed below.
4. Update the matrix in this file with ✅ / ⚠️ / ❌ per cell.
5. Commit the updated `COMPATIBILITY.md`.

If a client renders unusably broken on a major target (Gmail, Outlook desktop, Apple Mail), iterate on the components and re-run `pnpm email:build` + `pnpm test` before re-testing.

## Matrix (to fill in)

Tested via [tool] on YYYY-MM-DD.

| Template | Gmail Web | Gmail iOS | Gmail Android | Outlook Win | Outlook Web | Apple Mail macOS | Apple Mail iOS |
|---|---|---|---|---|---|---|---|
| Magic Link | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ |
| Signup Confirmation | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ |
| Password Reset | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ |

Legend: ✅ renders correctly · ⚠️ minor issue (still acceptable) · ❌ blocker · ⏳ not tested yet

## Known issues

(Populate after testing. Common categories: Outlook flexbox quirks, padding stripped on certain clients, font fallbacks, CTA button spacing.)

## Dark mode

(Populate after testing.)

- Gmail iOS auto-invert: …
- Apple Mail iOS dark mode: …

## Built-in safeguards

These mitigations are already in place from Phase 1:

- **Inter font**: served via Google Fonts `<link>` with `-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif` fallback. Outlook desktop will use Segoe UI (visually very close to Inter).
- **Tables-based layout**: handled by React Email's components (no flex/grid).
- **Inline styles**: all styles inline; no `<style>` blocks beyond the Google Fonts `@font-face` declaration React Email injects.
- **Liquid placeholders preserved**: `unescapeLiquid()` post-processing in `build.ts` ensures `{{ .ConfirmationURL }}` is never HTML-escaped.
