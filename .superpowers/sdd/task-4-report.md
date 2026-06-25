# Task 4 Report: Public render util (flatten wiki-links + sanitize)

## Status
DONE

## Dependencies Added
- `dompurify@^3.4.11` → devDependencies
- `@types/dompurify@^3.2.0` → devDependencies (stub; dompurify ships its own types — pnpm warned, non-blocking)

`jsdom` was already present in devDependencies (`^29.1.1`) so no additional install was needed.

## Files Created
- `src/lib/sharing/render-html.ts` — `renderSharedNoteHtml(rawHtml)` implementation
- `src/lib/sharing/render-html.test.ts` — 5 unit tests, `// @vitest-environment jsdom` pragma

## TDD Evidence

### RED (before `render-html.ts` existed)
```
 FAIL  src/lib/sharing/render-html.test.ts [ src/lib/sharing/render-html.test.ts ]
Error: Failed to resolve import "./render-html" from "src/lib/sharing/render-html.test.ts". Does the file exist?

 Test Files  1 failed (1)
      Tests  no tests
   Duration  1.97s
```

### GREEN (after implementation)
```
 RUN  v4.1.5 C:/Users/nolyo/www/voice-tool

 Test Files  1 passed (1)
      Tests  5 passed (5)
   Start at  10:19:33
   Duration  1.89s (transform 56ms, setup 0ms, import 86ms, tests 45ms, environment 1.46s)
```

### All sharing tests (regression check)
```
 RUN  v4.1.5 C:/Users/nolyo/www/voice-tool

 Test Files  3 passed (3)
      Tests  12 passed (12)
   Start at  10:19:46
   Duration  1.96s (transform 170ms, setup 0ms, import 282ms, tests 80ms, environment 1.52s)
```

## Implementation Notes

Wiki-link serialization confirmed from `NoteLinkExtension.ts`: `<a data-note-link="true" data-note-id="{uuid}" data-note-title="{title}">{title}</a>` — no `href` attribute. The `querySelectorAll("a[data-note-link]")` selector correctly targets these.

DOMPurify config:
- `ALLOWED_URI_REGEXP` allows `https?:`, `mailto:`, and `data:image/(png|jpeg|jpg|gif|webp);base64,` — blocks all other `data:` URIs
- `ADD_ATTR` preserves `target` and `rel` on links
- `FORBID_TAGS` explicitly bans `style`, `script`, `iframe`, `object`, `embed`

## Concerns

Minor: `@types/dompurify` is now a stub package (dompurify ships its own `.d.ts`). pnpm warned during install but it is non-blocking — types resolve correctly via dompurify's own bundled definitions. The brief specified adding `@types/dompurify` so it was added as instructed.

---

# Task 4 Review Fixes

## Status
DONE

## Commit
`a126022` — `fix(sharing): block svg data URIs in img src, add XSS bypass-vector tests`

## Changes

### 1. XSS bypass-vector tests added (`src/lib/sharing/render-html.test.ts`)
Four new tests added (total: 9, up from 5):
- `javascript:` in `<a href>` is stripped
- `data:text/html` in `<a href>` is stripped
- `data:image/svg+xml` in `<img src>` is stripped
- Wiki-link with markup in label renders inert (no live `onerror` attribute)

**Investigation note — wiki-link label test:** The original spec assertion was `not.toContain("onerror")`. Investigation revealed the output is `&lt;img src=x onerror=alert(1)&gt;` — safely entity-encoded plain text (not a live tag). The string `onerror` is present in the output but as HTML-escaped text, which is inert. The assertion was refined to `not.toMatch(/<img[^>]*onerror/i)` — this verifies the actual security property (no live `<img … onerror …>` tag) without falsely rejecting safe entity-encoded content.

**Investigation note — SVG bypass (real bug found):** The `data:image/svg+xml;base64,` case was NOT being stripped by DOMPurify 3.4.11. `ALLOWED_URI_REGEXP` controls URI-like attributes (href, action, etc.) but DOMPurify has a separate allowance path for `data:image/` URIs in `img src`. This was a genuine security gap.

### 2. Production fix: block SVG data URIs in img src (`src/lib/sharing/render-html.ts`)
Added a module-level `DOMPurify.addHook("afterSanitizeAttributes", ...)` to strip any `data:` URI from `src` attributes that doesn't match the `ALLOWED_URI_REGEXP`. Also:
- Extracted `ALLOWED_URI_REGEXP` as a named constant (shared between hook and sanitize call)
- Added browser-only comment above `renderSharedNoteHtml`

### 3. Removed `@types/dompurify` (`package.json` + `pnpm-lock.yaml`)
`pnpm remove @types/dompurify` — dompurify 3.x ships its own `.d.ts`. Types continue to resolve correctly via bundled definitions.

## Test Results

### render-html.test.ts (9/9)
```
pnpm vitest run src/lib/sharing/render-html.test.ts

 Test Files  1 passed (1)
      Tests  9 passed (9)
   Start at  10:27:40
   Duration  2.62s (transform 92ms, setup 0ms, import 130ms, tests 70ms, environment 2.00s)
```

### All sharing tests (16/16)
```
pnpm vitest run src/lib/sharing

 Test Files  3 passed (3)
      Tests  16 passed (16)
   Start at  10:27:40
   Duration  2.65s (transform 195ms, setup 0ms, import 325ms, tests 95ms, environment 2.03s)
```
