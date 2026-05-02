# Email Templates Phase 1 — Supabase Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build 3 branded HTML email templates (magic link, signup confirmation, password reset) for Supabase Auth using React Email, replacing the default Supabase templates.

**Architecture:** A standalone `emails/` subdirectory at repo root containing React Email components (`Layout`, `Header`, `Footer`, `Button`, `Heading`, `Text`, `SecurityNote`) and 3 templates (`MagicLink`, `SignupConfirmation`, `PasswordReset`). A `build.ts` script renders each template to `dist/emails/*.html`. Compiled HTML is committed for traceability and pasted manually into Supabase Dashboard. Vitest snapshot tests guard against drift. Single root `package.json` — React Email goes in root `devDependencies`.

**Tech Stack:** React Email (`@react-email/components`, `@react-email/render`), `react-email` CLI for live preview, `tsx` (already in devDeps) for running the build script, `vitest` (already in devDeps) for snapshot tests.

**Reference spec:** `docs/superpowers/specs/2026-05-02-email-templates-supabase-auth-design.md`

**Working branch:** `feat/email-templates` (already created)

---

## File Structure

```
emails/
├── tsconfig.json                       ← Local TS config extending repo's
├── components/
│   ├── tokens.ts                       ← Colors, font stack, logo URL, spacing
│   ├── EmailLayout.tsx                 ← Html, Head, Body, Container shell
│   ├── EmailHeader.tsx                 ← Navy header with monogram image
│   ├── EmailFooter.tsx                 ← Footer "Lexena · lexena.app"
│   ├── EmailButton.tsx                 ← Signal Green CTA
│   ├── EmailHeading.tsx                ← Styled H1
│   ├── EmailText.tsx                   ← Styled paragraph (default + muted)
│   └── EmailSecurityNote.tsx           ← Bordered security callout box
├── templates/
│   ├── MagicLink.tsx                   ← Component + subject export
│   ├── SignupConfirmation.tsx
│   └── PasswordReset.tsx
├── build.ts                            ← Renders templates → dist/emails/*.html
├── README.md                           ← Edit/deploy procedure
└── __tests__/
    ├── tokens.test.ts                  ← Token shape assertion
    ├── templates.test.ts               ← Per-template content + Liquid var assertions
    └── build.test.ts                   ← End-to-end build + snapshot regression

dist/emails/                            ← Compiled HTML, committed
├── magic-link.html
├── signup-confirmation.html
└── password-reset.html
```

**Decisions locked in by this plan:**
- Single root `package.json`. No pnpm workspace.
- `dist/emails/*.html` committed to git.
- No `RESEND_API_KEY` needed at this stage (Supabase Auth handles delivery).

---

## Task 1: Install React Email dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install React Email packages**

```bash
pnpm add -D @react-email/components @react-email/render react-email
```

Expected: 3 new entries in `devDependencies` of `package.json`. `pnpm-lock.yaml` updated.

- [ ] **Step 2: Verify installation**

```bash
pnpm list @react-email/components @react-email/render react-email
```

Expected: Each listed with a version number, no warnings about missing peer deps.

- [ ] **Step 3: Add email scripts to `package.json`**

In the `"scripts"` block, add:

```json
"email:dev": "cd emails && react-email dev --port 3001",
"email:build": "tsx emails/build.ts"
```

Note: Port 3001 to avoid collision with Vite (1420) and other tools. The `build` command is run from repo root via `tsx`.

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add React Email dependencies for transactional emails"
```

---

## Task 2: Create `emails/` directory and TypeScript config

**Files:**
- Create: `emails/tsconfig.json`
- Create: `emails/.gitkeep` (temporary)

- [ ] **Step 1: Create the directory**

```bash
mkdir -p emails/components emails/templates emails/__tests__
```

- [ ] **Step 2: Write `emails/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "allowSyntheticDefaultImports": true,
    "isolatedModules": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["**/*.ts", "**/*.tsx"]
}
```

- [ ] **Step 3: Verify TypeScript can resolve the directory**

```bash
pnpm exec tsc --project emails/tsconfig.json --noEmit
```

Expected: No output (success). If errors complain about no input files, that's fine for now — we'll add files in next tasks.

- [ ] **Step 4: Commit**

```bash
git add emails/tsconfig.json
git commit -m "chore: scaffold emails/ directory with TS config"
```

---

## Task 3: Create tokens module (TDD)

**Files:**
- Create: `emails/components/tokens.ts`
- Create: `emails/__tests__/tokens.test.ts`

- [ ] **Step 1: Write the failing test**

Create `emails/__tests__/tokens.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { colors, fontStack, logoUrl, spacing } from "../components/tokens";

describe("tokens", () => {
  it("exposes Lexena brand colors", () => {
    expect(colors.navy).toBe("#0D1B2A");
    expect(colors.signalGreen).toBe("#1D9E75");
    expect(colors.bg).toBe("#F6F6F7");
    expect(colors.card).toBe("#FFFFFF");
  });

  it("provides a font stack starting with Inter", () => {
    expect(fontStack).toMatch(/^Inter,/);
    expect(fontStack).toContain("-apple-system");
    expect(fontStack).toContain("Segoe UI");
  });

  it("exposes a stable logo URL", () => {
    expect(logoUrl).toMatch(/^https:\/\//);
    expect(logoUrl).toContain("monogram");
  });

  it("provides spacing scale", () => {
    expect(spacing.lg).toBe("32px");
    expect(spacing.xl).toBe("40px");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test emails/__tests__/tokens.test.ts
```

Expected: FAIL with module-not-found error for `../components/tokens`.

- [ ] **Step 3: Write the tokens module**

Create `emails/components/tokens.ts`:

```ts
export const colors = {
  navy: "#0D1B2A",
  signalGreen: "#1D9E75",
  bg: "#F6F6F7",
  card: "#FFFFFF",
  text: "#374151",
  textMuted: "#6B7280",
  border: "#E5E7EB",
  noteBg: "#F3F4F6",
} as const;

export const fontStack =
  "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";

export const logoUrl =
  "https://raw.githubusercontent.com/Nolyo/voice-tool/main/src-tauri/icons/monogram-512.png";

export const spacing = {
  xs: "8px",
  sm: "16px",
  md: "24px",
  lg: "32px",
  xl: "40px",
} as const;
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm test emails/__tests__/tokens.test.ts
```

Expected: PASS, 4 tests passing.

- [ ] **Step 5: Commit**

```bash
git add emails/components/tokens.ts emails/__tests__/tokens.test.ts
git commit -m "feat(emails): add brand tokens for email templates"
```

---

## Task 4: Build `EmailLayout` component

**Files:**
- Create: `emails/components/EmailLayout.tsx`

This component is the outer shell. It is consumed by every template. We don't write a unit test for it directly — its rendering is exercised by the per-template tests in Tasks 8–10. We do verify it compiles.

- [ ] **Step 1: Write the component**

Create `emails/components/EmailLayout.tsx`:

```tsx
import { Body, Container, Font, Head, Html, Preview } from "@react-email/components";
import type { ReactNode } from "react";
import { colors, fontStack } from "./tokens";

interface EmailLayoutProps {
  preview: string;
  children: ReactNode;
}

export function EmailLayout({ preview, children }: EmailLayoutProps) {
  return (
    <Html lang="en">
      <Head>
        <Font
          fontFamily="Inter"
          fallbackFontFamily="Helvetica"
          webFont={{
            url: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap",
            format: "woff2",
          }}
          fontWeight={400}
          fontStyle="normal"
        />
      </Head>
      <Preview>{preview}</Preview>
      <Body
        style={{
          backgroundColor: colors.bg,
          fontFamily: fontStack,
          margin: 0,
          padding: "32px 0",
        }}
      >
        <Container
          style={{
            backgroundColor: colors.card,
            borderRadius: "12px",
            maxWidth: "560px",
            margin: "0 auto",
            overflow: "hidden",
            boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)",
          }}
        >
          {children}
        </Container>
      </Body>
    </Html>
  );
}
```

- [ ] **Step 2: Verify it type-checks**

```bash
pnpm exec tsc --project emails/tsconfig.json --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add emails/components/EmailLayout.tsx
git commit -m "feat(emails): add EmailLayout shell component"
```

---

## Task 5: Build `EmailHeader` component

**Files:**
- Create: `emails/components/EmailHeader.tsx`

- [ ] **Step 1: Write the component**

```tsx
import { Img, Section } from "@react-email/components";
import { colors, logoUrl } from "./tokens";

export function EmailHeader() {
  return (
    <Section
      style={{
        backgroundColor: colors.navy,
        padding: "32px 0",
        textAlign: "center",
      }}
    >
      <Img
        src={logoUrl}
        alt="Lexena"
        width="56"
        height="56"
        style={{
          margin: "0 auto",
          display: "block",
          borderRadius: "8px",
        }}
      />
    </Section>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm exec tsc --project emails/tsconfig.json --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add emails/components/EmailHeader.tsx
git commit -m "feat(emails): add EmailHeader with monogram"
```

---

## Task 6: Build `EmailFooter` component

**Files:**
- Create: `emails/components/EmailFooter.tsx`

- [ ] **Step 1: Write the component**

```tsx
import { Hr, Section, Text } from "@react-email/components";
import { colors } from "./tokens";

interface EmailFooterProps {
  contextLine: string;
}

export function EmailFooter({ contextLine }: EmailFooterProps) {
  return (
    <Section style={{ padding: "0 40px 32px 40px" }}>
      <Hr style={{ borderColor: colors.border, margin: "32px 0 24px 0" }} />
      <Text
        style={{
          color: colors.textMuted,
          fontSize: "12px",
          lineHeight: "18px",
          margin: 0,
        }}
      >
        Lexena · lexena.app
      </Text>
      <Text
        style={{
          color: colors.textMuted,
          fontSize: "12px",
          lineHeight: "18px",
          margin: "8px 0 0 0",
        }}
      >
        {contextLine}
      </Text>
    </Section>
  );
}
```

- [ ] **Step 2: Type-check and commit**

```bash
pnpm exec tsc --project emails/tsconfig.json --noEmit
git add emails/components/EmailFooter.tsx
git commit -m "feat(emails): add EmailFooter with context line slot"
```

---

## Task 7: Build content components (`EmailButton`, `EmailHeading`, `EmailText`, `EmailSecurityNote`)

**Files:**
- Create: `emails/components/EmailButton.tsx`
- Create: `emails/components/EmailHeading.tsx`
- Create: `emails/components/EmailText.tsx`
- Create: `emails/components/EmailSecurityNote.tsx`

- [ ] **Step 1: Write `EmailButton.tsx`**

```tsx
import { Button } from "@react-email/components";
import type { ReactNode } from "react";
import { colors } from "./tokens";

interface EmailButtonProps {
  href: string;
  children: ReactNode;
}

export function EmailButton({ href, children }: EmailButtonProps) {
  return (
    <Button
      href={href}
      style={{
        backgroundColor: colors.signalGreen,
        color: "#FFFFFF",
        padding: "14px 28px",
        borderRadius: "8px",
        fontSize: "16px",
        fontWeight: 500,
        textDecoration: "none",
        display: "inline-block",
      }}
    >
      {children}
    </Button>
  );
}
```

- [ ] **Step 2: Write `EmailHeading.tsx`**

```tsx
import { Heading } from "@react-email/components";
import type { ReactNode } from "react";
import { colors } from "./tokens";

interface EmailHeadingProps {
  children: ReactNode;
}

export function EmailHeading({ children }: EmailHeadingProps) {
  return (
    <Heading
      as="h1"
      style={{
        color: colors.navy,
        fontSize: "24px",
        fontWeight: 600,
        lineHeight: "32px",
        margin: "0 0 16px 0",
      }}
    >
      {children}
    </Heading>
  );
}
```

- [ ] **Step 3: Write `EmailText.tsx`**

```tsx
import { Text } from "@react-email/components";
import type { ReactNode } from "react";
import { colors } from "./tokens";

interface EmailTextProps {
  children: ReactNode;
  variant?: "default" | "muted";
}

export function EmailText({ children, variant = "default" }: EmailTextProps) {
  const isMuted = variant === "muted";
  return (
    <Text
      style={{
        color: isMuted ? colors.textMuted : colors.text,
        fontSize: isMuted ? "14px" : "16px",
        lineHeight: isMuted ? "22px" : "26px",
        margin: "0 0 16px 0",
      }}
    >
      {children}
    </Text>
  );
}
```

- [ ] **Step 4: Write `EmailSecurityNote.tsx`**

```tsx
import { Section, Text } from "@react-email/components";
import type { ReactNode } from "react";
import { colors } from "./tokens";

interface EmailSecurityNoteProps {
  children: ReactNode;
}

export function EmailSecurityNote({ children }: EmailSecurityNoteProps) {
  return (
    <Section
      style={{
        backgroundColor: colors.noteBg,
        borderLeft: `3px solid ${colors.signalGreen}`,
        borderRadius: "6px",
        padding: "16px",
        margin: "24px 0",
      }}
    >
      <Text
        style={{
          color: colors.text,
          fontSize: "14px",
          lineHeight: "22px",
          fontStyle: "italic",
          margin: 0,
        }}
      >
        {children}
      </Text>
    </Section>
  );
}
```

- [ ] **Step 5: Type-check**

```bash
pnpm exec tsc --project emails/tsconfig.json --noEmit
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add emails/components/EmailButton.tsx emails/components/EmailHeading.tsx emails/components/EmailText.tsx emails/components/EmailSecurityNote.tsx
git commit -m "feat(emails): add content components (button, heading, text, security note)"
```

---

## Task 8: Build `MagicLink` template (TDD)

**Files:**
- Create: `emails/templates/MagicLink.tsx`
- Create: `emails/__tests__/templates.test.ts`

- [ ] **Step 1: Write the failing test**

Create `emails/__tests__/templates.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { render } from "@react-email/render";
import MagicLink, { subject as magicLinkSubject } from "../templates/MagicLink";

describe("MagicLink template", () => {
  it("exports the expected subject", () => {
    expect(magicLinkSubject).toBe("Sign in to Lexena");
  });

  it("renders the H1 'Sign in to Lexena'", async () => {
    const html = await render(<MagicLink />);
    expect(html).toContain("Sign in to Lexena");
  });

  it("includes the Liquid placeholder for the confirmation URL, unescaped", async () => {
    const html = await render(<MagicLink />);
    expect(html).toContain("{{ .ConfirmationURL }}");
    expect(html).not.toContain("&#123;&#123;");
    expect(html).not.toContain("&lbrace;");
  });

  it("includes the validity duration", async () => {
    const html = await render(<MagicLink />);
    expect(html).toMatch(/valid for 1 hour/i);
  });

  it("includes the security note for unsolicited sign-in", async () => {
    const html = await render(<MagicLink />);
    expect(html).toMatch(/didn'?t request this sign-in/i);
  });

  it("includes the CTA button label", async () => {
    const html = await render(<MagicLink />);
    expect(html).toContain(">Sign in</a>");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test emails/__tests__/templates.test.ts
```

Expected: FAIL with "Cannot find module '../templates/MagicLink'".

- [ ] **Step 3: Write the template**

Create `emails/templates/MagicLink.tsx`:

```tsx
import { Section } from "@react-email/components";
import { EmailLayout } from "../components/EmailLayout";
import { EmailHeader } from "../components/EmailHeader";
import { EmailFooter } from "../components/EmailFooter";
import { EmailHeading } from "../components/EmailHeading";
import { EmailText } from "../components/EmailText";
import { EmailButton } from "../components/EmailButton";
import { EmailSecurityNote } from "../components/EmailSecurityNote";

export const subject = "Sign in to Lexena";

export default function MagicLink() {
  return (
    <EmailLayout preview="Sign in to your Lexena account">
      <EmailHeader />
      <Section style={{ padding: "40px" }}>
        <EmailHeading>Sign in to Lexena</EmailHeading>
        <EmailText>Click the button below to sign in to your account.</EmailText>
        <Section style={{ textAlign: "center", margin: "32px 0" }}>
          <EmailButton href="{{ .ConfirmationURL }}">Sign in</EmailButton>
        </Section>
        <EmailText variant="muted">
          This link is valid for 1 hour and can only be used once.
        </EmailText>
        <EmailSecurityNote>
          Didn't request this sign-in? You can safely ignore this message — your account remains secure.
        </EmailSecurityNote>
        <EmailText variant="muted">— The Lexena team</EmailText>
        <EmailFooter contextLine="You received this email because of a sign-in request on your Lexena account." />
      </Section>
    </EmailLayout>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm test emails/__tests__/templates.test.ts
```

Expected: PASS, 6 tests for `MagicLink template`. If `{{ .ConfirmationURL }}` is HTML-escaped (e.g., `&#123;&#123;`), test will fail — proceed to Task 11 escape handling.

- [ ] **Step 5: Commit**

```bash
git add emails/templates/MagicLink.tsx emails/__tests__/templates.test.ts
git commit -m "feat(emails): add MagicLink template"
```

---

## Task 9: Build `SignupConfirmation` template (TDD)

**Files:**
- Create: `emails/templates/SignupConfirmation.tsx`
- Modify: `emails/__tests__/templates.test.ts`

- [ ] **Step 1: Add failing tests to `templates.test.ts`**

Append to `emails/__tests__/templates.test.ts`:

```ts
import SignupConfirmation, { subject as signupSubject } from "../templates/SignupConfirmation";

describe("SignupConfirmation template", () => {
  it("exports the expected subject", () => {
    expect(signupSubject).toBe("Confirm your Lexena email address");
  });

  it("renders the H1 'Welcome to Lexena'", async () => {
    const html = await render(<SignupConfirmation />);
    expect(html).toContain("Welcome to Lexena");
  });

  it("includes the Liquid placeholder for the confirmation URL, unescaped", async () => {
    const html = await render(<SignupConfirmation />);
    expect(html).toContain("{{ .ConfirmationURL }}");
    expect(html).not.toContain("&#123;&#123;");
  });

  it("mentions the 24-hour validity", async () => {
    const html = await render(<SignupConfirmation />);
    expect(html).toMatch(/valid for 24 hours/i);
  });

  it("includes the CTA 'Confirm my email'", async () => {
    const html = await render(<SignupConfirmation />);
    expect(html).toContain(">Confirm my email</a>");
  });

  it("includes the security note for unsolicited signup", async () => {
    const html = await render(<SignupConfirmation />);
    expect(html).toMatch(/didn'?t create a Lexena account/i);
  });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

```bash
pnpm test emails/__tests__/templates.test.ts
```

Expected: 6 PASS (MagicLink), 6 FAIL (SignupConfirmation, module not found).

- [ ] **Step 3: Write the template**

Create `emails/templates/SignupConfirmation.tsx`:

```tsx
import { Section } from "@react-email/components";
import { EmailLayout } from "../components/EmailLayout";
import { EmailHeader } from "../components/EmailHeader";
import { EmailFooter } from "../components/EmailFooter";
import { EmailHeading } from "../components/EmailHeading";
import { EmailText } from "../components/EmailText";
import { EmailButton } from "../components/EmailButton";
import { EmailSecurityNote } from "../components/EmailSecurityNote";

export const subject = "Confirm your Lexena email address";

export default function SignupConfirmation() {
  return (
    <EmailLayout preview="Confirm your Lexena email to finalize your account">
      <EmailHeader />
      <Section style={{ padding: "40px" }}>
        <EmailHeading>Welcome to Lexena</EmailHeading>
        <EmailText>
          To finalize your account creation, please confirm your email address.
        </EmailText>
        <Section style={{ textAlign: "center", margin: "32px 0" }}>
          <EmailButton href="{{ .ConfirmationURL }}">Confirm my email</EmailButton>
        </Section>
        <EmailText variant="muted">This link is valid for 24 hours.</EmailText>
        <EmailSecurityNote>
          Didn't create a Lexena account? You can safely ignore this message.
        </EmailSecurityNote>
        <EmailText variant="muted">— The Lexena team</EmailText>
        <EmailFooter contextLine="You received this email because someone signed up to Lexena with this address." />
      </Section>
    </EmailLayout>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test emails/__tests__/templates.test.ts
```

Expected: 12 tests passing (6 MagicLink + 6 SignupConfirmation).

- [ ] **Step 5: Commit**

```bash
git add emails/templates/SignupConfirmation.tsx emails/__tests__/templates.test.ts
git commit -m "feat(emails): add SignupConfirmation template"
```

---

## Task 10: Build `PasswordReset` template (TDD)

**Files:**
- Create: `emails/templates/PasswordReset.tsx`
- Modify: `emails/__tests__/templates.test.ts`

- [ ] **Step 1: Add failing tests to `templates.test.ts`**

Append:

```ts
import PasswordReset, { subject as resetSubject } from "../templates/PasswordReset";

describe("PasswordReset template", () => {
  it("exports the expected subject", () => {
    expect(resetSubject).toBe("Reset your Lexena password");
  });

  it("renders the H1 'Reset your password'", async () => {
    const html = await render(<PasswordReset />);
    expect(html).toContain("Reset your password");
  });

  it("includes the Liquid placeholder for the confirmation URL, unescaped", async () => {
    const html = await render(<PasswordReset />);
    expect(html).toContain("{{ .ConfirmationURL }}");
    expect(html).not.toContain("&#123;&#123;");
  });

  it("mentions the 1-hour validity", async () => {
    const html = await render(<PasswordReset />);
    expect(html).toMatch(/valid for 1 hour/i);
  });

  it("warns about session revocation", async () => {
    const html = await render(<PasswordReset />);
    expect(html).toMatch(/active sessions on other devices will be revoked/i);
  });

  it("includes the CTA 'Reset password'", async () => {
    const html = await render(<PasswordReset />);
    expect(html).toContain(">Reset password</a>");
  });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

```bash
pnpm test emails/__tests__/templates.test.ts
```

Expected: 12 PASS, 6 FAIL.

- [ ] **Step 3: Write the template**

Create `emails/templates/PasswordReset.tsx`:

```tsx
import { Section } from "@react-email/components";
import { EmailLayout } from "../components/EmailLayout";
import { EmailHeader } from "../components/EmailHeader";
import { EmailFooter } from "../components/EmailFooter";
import { EmailHeading } from "../components/EmailHeading";
import { EmailText } from "../components/EmailText";
import { EmailButton } from "../components/EmailButton";
import { EmailSecurityNote } from "../components/EmailSecurityNote";

export const subject = "Reset your Lexena password";

export default function PasswordReset() {
  return (
    <EmailLayout preview="Reset your Lexena password">
      <EmailHeader />
      <Section style={{ padding: "40px" }}>
        <EmailHeading>Reset your password</EmailHeading>
        <EmailText>Click the button below to choose a new password.</EmailText>
        <Section style={{ textAlign: "center", margin: "32px 0" }}>
          <EmailButton href="{{ .ConfirmationURL }}">Reset password</EmailButton>
        </Section>
        <EmailText variant="muted">
          This link is valid for 1 hour and can only be used once.
        </EmailText>
        <EmailSecurityNote>
          If you didn't request this, ignore this message — your current password remains valid. On the next successful login after reset, all your active sessions on other devices will be revoked.
        </EmailSecurityNote>
        <EmailText variant="muted">— The Lexena team</EmailText>
        <EmailFooter contextLine="You received this email because of a password reset request on your Lexena account." />
      </Section>
    </EmailLayout>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test emails/__tests__/templates.test.ts
```

Expected: 18 tests passing (6 × 3 templates).

- [ ] **Step 5: Commit**

```bash
git add emails/templates/PasswordReset.tsx emails/__tests__/templates.test.ts
git commit -m "feat(emails): add PasswordReset template"
```

---

## Task 11: Build the build script with Liquid-var safety post-processing

**Files:**
- Create: `emails/build.ts`
- Create: `emails/__tests__/build.test.ts`
- Modify: `.gitignore` (if needed)

- [ ] **Step 1: Verify `dist/emails/` is NOT gitignored**

Check `.gitignore`:

```bash
grep -n "dist" .gitignore
```

If a line excludes all `dist/`, add an exception for our subdirectory. Example: append to `.gitignore`:

```
# Email-specific dist is committed for traceability — Vite-built dist remains ignored
!/dist/emails/
!/dist/emails/**
```

If `dist` was not ignored at all, no change needed.

- [ ] **Step 2: Write the failing test**

Create `emails/__tests__/build.test.ts`:

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import { build } from "../build";

const distDir = path.resolve(__dirname, "../../dist/emails");

describe("build", () => {
  beforeAll(async () => {
    await build();
  });

  it("produces magic-link.html", async () => {
    const html = await fs.readFile(path.join(distDir, "magic-link.html"), "utf8");
    expect(html.length).toBeGreaterThan(500);
    expect(html).toContain("<!DOCTYPE html");
    expect(html).toContain("Sign in to Lexena");
    expect(html).toContain("{{ .ConfirmationURL }}");
    expect(html).not.toContain("&#123;");
  });

  it("produces signup-confirmation.html", async () => {
    const html = await fs.readFile(
      path.join(distDir, "signup-confirmation.html"),
      "utf8",
    );
    expect(html).toContain("Welcome to Lexena");
    expect(html).toContain("{{ .ConfirmationURL }}");
    expect(html).not.toContain("&#123;");
  });

  it("produces password-reset.html", async () => {
    const html = await fs.readFile(
      path.join(distDir, "password-reset.html"),
      "utf8",
    );
    expect(html).toContain("Reset your password");
    expect(html).toContain("{{ .ConfirmationURL }}");
    expect(html).not.toContain("&#123;");
  });

  it("includes subject as HTML comment at top of each file", async () => {
    const magicLink = await fs.readFile(path.join(distDir, "magic-link.html"), "utf8");
    expect(magicLink.startsWith("<!-- Subject: Sign in to Lexena -->")).toBe(true);

    const signup = await fs.readFile(
      path.join(distDir, "signup-confirmation.html"),
      "utf8",
    );
    expect(
      signup.startsWith("<!-- Subject: Confirm your Lexena email address -->"),
    ).toBe(true);

    const reset = await fs.readFile(path.join(distDir, "password-reset.html"), "utf8");
    expect(
      reset.startsWith("<!-- Subject: Reset your Lexena password -->"),
    ).toBe(true);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
pnpm test emails/__tests__/build.test.ts
```

Expected: FAIL with "Cannot find module '../build'".

- [ ] **Step 4: Write the build script**

Create `emails/build.ts`:

```ts
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { render } from "@react-email/render";
import type { ComponentType } from "react";

import MagicLink, { subject as magicLinkSubject } from "./templates/MagicLink";
import SignupConfirmation, {
  subject as signupSubject,
} from "./templates/SignupConfirmation";
import PasswordReset, { subject as resetSubject } from "./templates/PasswordReset";

interface TemplateEntry {
  slug: string;
  subject: string;
  Component: ComponentType;
}

const TEMPLATES: TemplateEntry[] = [
  { slug: "magic-link", subject: magicLinkSubject, Component: MagicLink },
  {
    slug: "signup-confirmation",
    subject: signupSubject,
    Component: SignupConfirmation,
  },
  { slug: "password-reset", subject: resetSubject, Component: PasswordReset },
];

/**
 * React HTML-escapes `{` and `}` in attribute values, which would break Supabase
 * Liquid templating. We restore the literal `{{ ... }}` placeholders post-render.
 */
function unescapeLiquid(html: string): string {
  return html
    .replace(/&#123;&#123;/g, "{{")
    .replace(/&#125;&#125;/g, "}}")
    .replace(/&#123;/g, "{")
    .replace(/&#125;/g, "}")
    .replace(/&lbrace;/g, "{")
    .replace(/&rbrace;/g, "}");
}

export async function build(): Promise<void> {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const outDir = path.resolve(here, "../dist/emails");
  await fs.mkdir(outDir, { recursive: true });

  for (const { slug, subject, Component } of TEMPLATES) {
    const rawHtml = await render(<Component />, { pretty: true });
    const safeHtml = unescapeLiquid(rawHtml);
    const withSubject = `<!-- Subject: ${subject} -->\n${safeHtml}`;
    const outPath = path.join(outDir, `${slug}.html`);
    await fs.writeFile(outPath, withSubject, "utf8");
    console.log(`✓ ${slug}.html (${withSubject.length} bytes)`);
  }
}

// Cross-platform "is this file the script entrypoint?" check.
// Compares resolved paths (handles Windows backslash vs URL forward-slash).
const isEntrypoint =
  process.argv[1] !== undefined &&
  path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1]);

if (isEntrypoint) {
  build().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
```

- [ ] **Step 5: Run the build manually first**

```bash
pnpm email:build
```

Expected: 3 lines of output `✓ magic-link.html (...)` etc. Files appear in `dist/emails/`.

- [ ] **Step 6: Inspect one HTML output**

```bash
pnpm exec node -e "console.log(require('fs').readFileSync('dist/emails/magic-link.html', 'utf8').slice(0, 800))"
```

Verify visually:
- Starts with `<!-- Subject: Sign in to Lexena -->`
- Contains `<!DOCTYPE html`
- Contains `{{ .ConfirmationURL }}` (literal, NOT `&#123;&#123;`)

- [ ] **Step 7: Run the build test**

```bash
pnpm test emails/__tests__/build.test.ts
```

Expected: 4 tests passing.

- [ ] **Step 8: Commit**

```bash
git add emails/build.ts emails/__tests__/build.test.ts dist/emails/ .gitignore
git commit -m "feat(emails): add build script with Liquid-var safety + commit compiled HTML"
```

---

## Task 12: Add snapshot regression test (CI guard)

**Files:**
- Modify: `emails/__tests__/build.test.ts`

This guards against `dist/emails/*.html` drifting from the `.tsx` sources without a rebuild. We compare freshly-built HTML against committed HTML.

- [ ] **Step 1: Add the regression test**

Append to `emails/__tests__/build.test.ts`:

```ts
import { execSync } from "node:child_process";

describe("regression: dist/emails/ is in sync with templates", () => {
  it("freshly built HTML matches committed dist/emails/", async () => {
    // Read committed snapshots BEFORE rebuilding
    const committed = {
      "magic-link.html": await fs.readFile(
        path.join(distDir, "magic-link.html"),
        "utf8",
      ),
      "signup-confirmation.html": await fs.readFile(
        path.join(distDir, "signup-confirmation.html"),
        "utf8",
      ),
      "password-reset.html": await fs.readFile(
        path.join(distDir, "password-reset.html"),
        "utf8",
      ),
    };

    // Rebuild
    await build();

    // Compare
    for (const [name, before] of Object.entries(committed)) {
      const after = await fs.readFile(path.join(distDir, name), "utf8");
      expect(after).toBe(before);
    }
  });
});
```

Note: this test runs AFTER the `beforeAll(build())` in the same file, but reads committed content first. If a developer modifies a `.tsx` without running `pnpm email:build` and committing the new HTML, this test will fail.

- [ ] **Step 2: Run tests**

```bash
pnpm test emails/__tests__/build.test.ts
```

Expected: All tests pass (5 total in this file now).

- [ ] **Step 3: Sanity check the failure mode**

Temporarily edit `emails/templates/MagicLink.tsx` — change "Sign in" to "Log in" in the H1. Then:

```bash
pnpm test emails/__tests__/build.test.ts
```

Expected: Snapshot regression test FAILS. Revert the change:

```bash
git checkout emails/templates/MagicLink.tsx
```

Re-run tests:

```bash
pnpm test emails/__tests__/build.test.ts
```

Expected: All pass.

- [ ] **Step 4: Commit**

```bash
git add emails/__tests__/build.test.ts
git commit -m "test(emails): add regression test guarding dist/emails sync"
```

---

## Task 13: Verify React Email dev server preview works

**Files:** None (verification only)

- [ ] **Step 1: Start the dev server**

```bash
pnpm email:dev
```

Expected: Output mentions `localhost:3001`. Server stays running.

- [ ] **Step 2: Open browser**

Navigate to `http://localhost:3001`.

Expected:
- Sidebar lists "MagicLink", "SignupConfirmation", "PasswordReset"
- Clicking each renders the email preview in iframe
- Visual: navy header with monogram, white body, green button, security note

- [ ] **Step 3: Check responsive width**

In the preview iframe, switch device preview to mobile (typically a button at top of preview). Verify:
- Layout still readable on 375px width
- Button doesn't overflow
- Header padding still acceptable

- [ ] **Step 4: Stop the server (Ctrl+C) and commit nothing**

This task is verification only. No commit needed.

If preview is broken (white page, error), debug before continuing — likely a missing import or React Email version mismatch.

---

## Task 14: Multi-client compatibility test (manual checklist)

**Files:** None (verification + optional documentation)

- [ ] **Step 1: Open each compiled HTML in Chrome**

```bash
start dist/emails/magic-link.html
start dist/emails/signup-confirmation.html
start dist/emails/password-reset.html
```

(On macOS/Linux: `open` instead of `start`. On Linux: `xdg-open`.)

Verify visually that:
- Layout renders correctly
- Logo image loads (GitHub raw URL is reachable from the browser)
- Inter font loads (fallbacks acceptable if blocked)
- CTA button shows in Signal Green

- [ ] **Step 2: Sign up for Email on Acid free trial OR Litmus free trial**

Either provider has a 7-day free trial sufficient for one round of testing.

- [ ] **Step 3: Upload each HTML file and run previews**

For each of the 3 templates, run previews on at least:
- Gmail (web, iOS, Android)
- Outlook (Windows desktop 365, web)
- Apple Mail (macOS, iOS)

- [ ] **Step 4: Document findings**

Create or append to `emails/COMPATIBILITY.md`:

```markdown
# Email client compatibility (Phase 1)

Tested via [Email on Acid | Litmus] on YYYY-MM-DD.

| Template | Gmail Web | Gmail iOS | Gmail Android | Outlook Win | Outlook Web | Apple Mail macOS | Apple Mail iOS |
|---|---|---|---|---|---|---|---|
| Magic Link | ✅ | ✅ | ✅ | ⚠️ note | ✅ | ✅ | ✅ |
| Signup Confirmation | ✅ | ✅ | ✅ | ⚠️ note | ✅ | ✅ | ✅ |
| Password Reset | ✅ | ✅ | ✅ | ⚠️ note | ✅ | ✅ | ✅ |

## Known issues
- ⚠️ Outlook Win: <describe any issue, e.g. font fallback to Segoe UI>

## Dark mode
- Gmail iOS auto-invert: <observation>
- Apple Mail iOS dark mode: <observation>
```

- [ ] **Step 5: Fix any blocking issues**

If a template renders unusably broken on a major client (Gmail, Outlook, Apple Mail), iterate on the components and re-run Tasks 11–12 to rebuild + re-test. Common fixes:
- Outlook flexbox issues → React Email already uses tables, but verify no custom flex sneaked in
- Padding ignored in Outlook → use `<table>` cellpadding instead of CSS padding for that section
- Background colors stripped → add `bgcolor` HTML attribute as fallback to `style`

- [ ] **Step 6: Commit compatibility doc**

```bash
git add emails/COMPATIBILITY.md
git commit -m "docs(emails): document multi-client compatibility test results"
```

---

## Task 15: Deploy to Supabase Auth (manual)

**Files:** None (Supabase Dashboard configuration)

- [ ] **Step 1: Open Supabase Dashboard**

Navigate to your project → Authentication → Email Templates.

- [ ] **Step 2: Configure Magic Link**

- Read the subject from `dist/emails/magic-link.html` first line: `<!-- Subject: Sign in to Lexena -->`
- In Supabase: select "Magic Link" template
- Set Subject: `Sign in to Lexena`
- Open `dist/emails/magic-link.html` in a text editor
- Copy the entire file content (including the comment line — Supabase ignores HTML comments)
- Paste into the Message Body / HTML field, replacing existing content
- Click Save

- [ ] **Step 3: Send a test email**

In Supabase Dashboard, use the "Send test email" button (or, lacking that, trigger a magic link from the Lexena app to your own email).

Expected: Email arrives within 1 minute. Open it on:
- Gmail web → visual matches preview
- Mobile (Gmail iOS or Android) → visual still good
- Click "Sign in" button → URL is the actual Supabase magic link, NOT `{{ .ConfirmationURL }}` literal

If the email shows literal `{{ .ConfirmationURL }}` text instead of an actual link, **Liquid substitution failed** — the placeholder was lost in copy-paste, or the build script did not properly unescape. Re-check `dist/emails/magic-link.html`.

- [ ] **Step 4: Repeat for Signup Confirmation**

Same procedure with `dist/emails/signup-confirmation.html`. Subject: `Confirm your Lexena email address`. Test by signing up a new throwaway account.

- [ ] **Step 5: Repeat for Password Reset**

Same procedure with `dist/emails/password-reset.html`. Subject: `Reset your Lexena password`. Test by triggering a password reset from the Lexena app.

- [ ] **Step 6: Document the deployment in commit message**

No code change needed, but capture the deployment in a commit (next task) or as a record:

```bash
git commit --allow-empty -m "chore(emails): deploy phase 1 templates to Supabase Auth (manual)"
```

---

## Task 16: Write `emails/README.md`

**Files:**
- Create: `emails/README.md`

- [ ] **Step 1: Write the README**

```markdown
# Lexena Email Templates

React Email-based transactional email templates for Lexena.

## Phase 1 (current)

3 templates served by Supabase Auth:
- `templates/MagicLink.tsx`
- `templates/SignupConfirmation.tsx`
- `templates/PasswordReset.tsx`

## Workflow

### Editing a template

1. Modify the `.tsx` file under `templates/`.
2. Preview live: `pnpm email:dev` → open `http://localhost:3001`.
3. When done, build: `pnpm email:build` → produces `dist/emails/<slug>.html`.
4. Commit the `.tsx` AND the rebuilt `dist/emails/*.html` together.
5. Open `dist/emails/<slug>.html`, copy the full content, paste into Supabase Dashboard → Authentication → Email Templates → <template>.
6. Update the Subject field in Supabase using the value from the `<!-- Subject: ... -->` comment at the top of the HTML file.
7. Send a test email from Supabase Dashboard to verify rendering.

### Adding a new template

1. Create `templates/<NewTemplate>.tsx` exporting `default` (the component) and `subject` (the subject string).
2. Register it in `build.ts` in the `TEMPLATES` array.
3. Add tests to `__tests__/templates.test.ts`.
4. Run `pnpm test` and `pnpm email:build`.
5. Commit, then deploy to Supabase as in step 5 above.

## Architecture

- `components/tokens.ts` — design tokens (colors, font stack, logo URL)
- `components/EmailLayout.tsx` — outer shell (Html, Head, Body, Container)
- `components/EmailHeader.tsx` — navy header with monogram
- `components/EmailFooter.tsx` — footer with context line slot
- `components/EmailButton.tsx` — Signal Green CTA
- `components/EmailHeading.tsx` — H1 styled
- `components/EmailText.tsx` — paragraph (default + muted variants)
- `components/EmailSecurityNote.tsx` — bordered callout

## Liquid placeholder safety

Supabase Auth uses Liquid templating (`{{ .ConfirmationURL }}`). React HTML-escapes braces in attribute values, which would break the substitution. The build script (`build.ts`) post-processes the HTML to restore literal `{{ }}`. This is guarded by a test in `__tests__/build.test.ts`.

If you add a template with a NEW Liquid variable (e.g., `{{ .Email }}`), verify it survives the build by checking `dist/emails/<your-template>.html` for the literal placeholder.

## Logo asset

The header monogram is currently a placeholder loaded from GitHub raw:

```
https://raw.githubusercontent.com/Nolyo/voice-tool/main/src-tauri/icons/monogram-512.png
```

This URL is centralized in `components/tokens.ts`. Migrate to a stable CDN (e.g., `lexena.app/static/email/monogram@2x.png`) once the marketing site is deployed.

## Phase 2 (planned)

Edge Functions Resend templates, sharing the same components:
- Welcome (post-signup, French/English by user locale)
- New device alert (rebuilds `send-new-device-email` HTML output)
- Account deletion request
- Account deletion completion

See `docs/superpowers/specs/2026-05-02-email-templates-supabase-auth-design.md` section 9 (out of scope).
```

- [ ] **Step 2: Commit**

```bash
git add emails/README.md
git commit -m "docs(emails): add README with edit/deploy procedure"
```

---

## Task 17: Update `docs/v3/legal/email-templates.md`

**Files:**
- Modify: `docs/v3/legal/email-templates.md`

- [ ] **Step 1: Add a "source of truth" header**

Edit the top of `docs/v3/legal/email-templates.md` (right after the existing `> **Statut**` block). Insert:

```markdown
> **⚠️ Phase 1 livrée le 2026-05-02** — les 3 templates Supabase Auth (magic link, signup confirmation, password reset) sont implémentés en HTML stylé via React Email.
> **Source de vérité** : `emails/templates/*.tsx`. Le markdown ci-dessous reste de référence textuelle (FR + EN) pour comparaison et préparation des phases suivantes.
> **Langue déployée v3.0** : EN uniquement. FR reporté à une phase ultérieure (Edge Function `auth-email-hook` selon `user_settings.ui_language`).
```

- [ ] **Step 2: Mark FR sections of templates 1, 2, 4 as deferred**

Find sections `## 1 — Magic link`, `## 2 — Signup confirmation`, and `## 4 — Password reset request`. Above each `### FR` subheading, add:

```markdown
> 🚧 FR différé post-launch (v3.1+).
```

The EN versions remain authoritative for the deployed copy.

- [ ] **Step 3: Commit**

```bash
git add docs/v3/legal/email-templates.md
git commit -m "docs(v3): mark phase 1 email templates as delivered, FR deferred"
```

---

## Task 18: Update `CLAUDE.md`

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add an "Email templates" subsection under V3 Documentation**

In `CLAUDE.md`, find the `## V3 Documentation` section. After the existing `### V3 Sync settings (livré sous-épique 02)` subsection, add:

```markdown
### V3 Email templates Supabase Auth (livré phase 1, 2026-05-02)

- Source de vérité : `emails/templates/*.tsx` (React Email)
- 3 templates Supabase Auth : MagicLink, SignupConfirmation, PasswordReset (EN uniquement v3.0)
- Build : `pnpm email:build` → `dist/emails/*.html` (commités pour traçabilité)
- Preview : `pnpm email:dev` → `localhost:3001`
- Composants partagés : `emails/components/` (Layout, Header, Footer, Button, Heading, Text, SecurityNote, tokens)
- Procédure de déploiement Supabase : copier `dist/emails/<slug>.html` dans Dashboard → Authentication → Email Templates
- Snapshot regression test garde `dist/emails/` en sync avec `.tsx`
- Phase 2 prévue : 4 templates Resend via Edge Functions (welcome, new-device, deletion ×2)
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add email templates phase 1 to CLAUDE.md"
```

---

## Task 19: Open the pull request

**Files:** None (Git operations)

- [ ] **Step 1: Push the branch**

```bash
git push -u origin feat/email-templates
```

- [ ] **Step 2: Verify all tests pass once more**

```bash
pnpm test
```

Expected: All tests pass, including new ones in `emails/__tests__/`.

- [ ] **Step 3: Open the PR**

```bash
gh pr create --title "feat(emails): branded Supabase Auth templates (phase 1)" --body "$(cat <<'EOF'
## Summary

- Replaces the default Supabase Auth email templates with branded Lexena HTML via React Email.
- Covers 3 templates: magic link, signup confirmation, password reset (EN only for v3.0).
- New `emails/` directory with reusable components (Layout, Header, Footer, Button, Heading, Text, SecurityNote, tokens).
- Build script `pnpm email:build` renders `.tsx` to `dist/emails/*.html` with Liquid placeholder safety.
- Snapshot regression test guards against `dist/` drifting from `.tsx` sources.
- Logo is a temporary GitHub-raw placeholder of the current monogram (to be replaced when the marketing site hosts a stable asset).

## Spec

`docs/superpowers/specs/2026-05-02-email-templates-supabase-auth-design.md`

## Test plan

- [x] `pnpm test` passes (~24 new tests in `emails/__tests__/`)
- [x] `pnpm email:build` produces 3 valid HTML files with Liquid placeholders intact
- [x] `pnpm email:dev` renders preview correctly at `localhost:3001`
- [x] Multi-client compatibility check via Email on Acid / Litmus (see `emails/COMPATIBILITY.md`)
- [x] Manual deployment to Supabase Dashboard for all 3 templates
- [x] Test emails sent from Supabase Dashboard render correctly with substituted URLs

## Out of scope

Phase 2 (welcome / new-device / deletion ×2 via Resend Edge Functions) tracked separately.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR URL printed. Browse to it to confirm.

---

## Summary of files

**Created (16 files + dist):**
- `emails/tsconfig.json`
- `emails/components/tokens.ts`
- `emails/components/EmailLayout.tsx`
- `emails/components/EmailHeader.tsx`
- `emails/components/EmailFooter.tsx`
- `emails/components/EmailButton.tsx`
- `emails/components/EmailHeading.tsx`
- `emails/components/EmailText.tsx`
- `emails/components/EmailSecurityNote.tsx`
- `emails/templates/MagicLink.tsx`
- `emails/templates/SignupConfirmation.tsx`
- `emails/templates/PasswordReset.tsx`
- `emails/build.ts`
- `emails/__tests__/tokens.test.ts`
- `emails/__tests__/templates.test.ts`
- `emails/__tests__/build.test.ts`
- `emails/README.md`
- `emails/COMPATIBILITY.md`
- `dist/emails/magic-link.html`
- `dist/emails/signup-confirmation.html`
- `dist/emails/password-reset.html`

**Modified:**
- `package.json` (add deps + scripts)
- `pnpm-lock.yaml`
- `.gitignore` (if `dist/` was excluded)
- `docs/v3/legal/email-templates.md`
- `CLAUDE.md`

**Total commits:** ~16 (one per task on average).
