// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { renderSharedNoteHtml } from "./render-html";

describe("renderSharedNoteHtml", () => {
  it("flattens wiki-links to plain text", () => {
    const html = `<p>See <a data-note-link="true" data-note-id="x" data-note-title="Other">Other</a> too</p>`;
    const out = renderSharedNoteHtml(html);
    expect(out).not.toContain("data-note-link");
    expect(out).not.toContain("<a");
    expect(out).toContain("Other");
  });

  it("strips script tags", () => {
    const out = renderSharedNoteHtml(`<p>ok</p><script>alert(1)</script>`);
    expect(out).not.toContain("<script");
    expect(out).toContain("ok");
  });

  it("strips inline event handlers", () => {
    const out = renderSharedNoteHtml(`<img src="data:image/png;base64,AAA" onerror="alert(1)">`);
    expect(out).not.toContain("onerror");
  });

  it("keeps base64 images", () => {
    const out = renderSharedNoteHtml(`<img src="data:image/png;base64,AAAA">`);
    expect(out).toContain("data:image/png;base64,AAAA");
  });

  it("keeps a normal external https link", () => {
    const out = renderSharedNoteHtml(`<p><a href="https://example.com">x</a></p>`);
    expect(out).toContain('href="https://example.com"');
  });

  it("strips javascript: from <a href>", () => {
    const out = renderSharedNoteHtml(`<a href="javascript:alert(1)">x</a>`);
    expect(out).not.toContain("javascript:");
    expect(out).toContain("x");
  });

  it("strips data:text/html from <a href>", () => {
    const out = renderSharedNoteHtml(
      `<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">x</a>`
    );
    expect(out).not.toContain("data:text/html");
    expect(out).toContain("x");
  });

  it("strips data:image/svg+xml from <img src> (only raster base64 allowed)", () => {
    const out = renderSharedNoteHtml(
      `<img src="data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=">`
    );
    expect(out).not.toContain("data:image/svg+xml");
  });

  it("renders wiki-link with markup in label inert (no live onerror attribute)", () => {
    const out = renderSharedNoteHtml(
      `<a data-note-link="true" data-note-id="x" data-note-title="t">&lt;img src=x onerror=alert(1)&gt;</a>`
    );
    // The label text is entity-encoded (safe plain text). Verify no live <img … onerror …> tag exists.
    expect(out).not.toMatch(/<img[^>]*onerror/i);
  });
});
