import { describe, it, expect } from "vitest";
import { render } from "@react-email/render";
import MagicLink, { subject as magicLinkSubject } from "../templates/MagicLink";
import SignupConfirmation, { subject as signupSubject } from "../templates/SignupConfirmation";

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
    // Button may wrap text — use the same split-assertion pattern as MagicLink test
    expect(html).toContain(">Confirm my email<");
    expect(html).toContain("</a>");
  });

  it("includes the security note for unsolicited signup", async () => {
    const html = await render(<SignupConfirmation />);
    // apostrophe may be HTML-entity-encoded
    expect(html).toMatch(/didn(?:&#x27;|')?t create a Lexena account/i);
  });
});
