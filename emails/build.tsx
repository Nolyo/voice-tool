import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
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
    const rawHtml = await render(React.createElement(Component), { pretty: true });
    const safeHtml = unescapeLiquid(rawHtml);
    const withSubject = `<!-- Subject: ${subject} -->\n${safeHtml}`;
    const outPath = path.join(outDir, `${slug}.html`);
    await fs.writeFile(outPath, withSubject, "utf8");
    console.log(`✓ ${slug}.html (${withSubject.length} bytes)`);
  }
}

// Cross-platform "is this file the script entrypoint?" check.
const isEntrypoint =
  process.argv[1] !== undefined &&
  path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1]);

if (isEntrypoint) {
  build().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
