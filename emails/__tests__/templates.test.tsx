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
    // apostrophe may be rendered as &#x27; by the email renderer
    expect(html).toMatch(/didn(?:&#x27;|')?t request this sign-in/i);
  });

  it("includes the CTA button label", async () => {
    const html = await render(<MagicLink />);
    // @react-email Button wraps text in spans for MSO compatibility
    expect(html).toContain(">Sign in<");
    expect(html).toContain("</a>");
  });
});
