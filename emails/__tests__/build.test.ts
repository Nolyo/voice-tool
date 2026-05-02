import { describe, it, expect, beforeAll } from "vitest";
import { promises as fs } from "node:fs";
import { execSync } from "node:child_process";
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

describe("regression: dist/emails/ is in sync with templates", () => {
  it("freshly built HTML matches committed dist/emails/", async () => {
    // Read committed versions from git
    const slugs = ["magic-link", "signup-confirmation", "password-reset"];
    const committed: Record<string, string> = {};
    for (const slug of slugs) {
      committed[slug] = execSync(`git show HEAD:dist/emails/${slug}.html`, {
        encoding: "utf8",
      });
    }

    // Rebuild
    await build();

    // Compare
    for (const slug of slugs) {
      const fresh = await fs.readFile(
        path.join(distDir, `${slug}.html`),
        "utf8",
      );
      expect(fresh).toBe(committed[slug]);
    }
  });
});
