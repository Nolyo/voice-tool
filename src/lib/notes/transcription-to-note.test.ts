import { describe, it, expect } from "vitest";
import {
  escapeNoteHtml,
  transcriptionToHtml,
  appendTranscriptionToHtml,
} from "./transcription-to-note";

describe("escapeNoteHtml", () => {
  it("escapes the three HTML-significant characters", () => {
    expect(escapeNoteHtml("a & b < c > d")).toBe("a &amp; b &lt; c &gt; d");
  });

  it("escapes & first so angle brackets are not double-escaped", () => {
    expect(escapeNoteHtml("<tag>")).toBe("&lt;tag&gt;");
    expect(escapeNoteHtml("a & <b>")).toBe("a &amp; &lt;b&gt;");
  });

  it("leaves accented plain text untouched", () => {
    expect(escapeNoteHtml("Bonjour, ça va ?")).toBe("Bonjour, ça va ?");
  });
});

describe("transcriptionToHtml", () => {
  it("wraps a single line in a paragraph", () => {
    expect(transcriptionToHtml("Bonjour le monde")).toBe(
      "<p>Bonjour le monde</p>",
    );
  });

  it("escapes HTML within the text", () => {
    expect(transcriptionToHtml("1 < 2 & 3 > 0")).toBe(
      "<p>1 &lt; 2 &amp; 3 &gt; 0</p>",
    );
  });

  it("creates one paragraph per non-empty line", () => {
    expect(transcriptionToHtml("ligne 1\nligne 2")).toBe(
      "<p>ligne 1</p><p>ligne 2</p>",
    );
  });

  it("drops blank lines and trims surrounding whitespace", () => {
    expect(transcriptionToHtml("  a  \n\n   \n b ")).toBe("<p>a</p><p>b</p>");
  });

  it("handles CRLF line endings", () => {
    expect(transcriptionToHtml("a\r\nb")).toBe("<p>a</p><p>b</p>");
  });

  it("returns an empty paragraph for empty / whitespace-only input", () => {
    expect(transcriptionToHtml("")).toBe("<p></p>");
    expect(transcriptionToHtml("   \n  ")).toBe("<p></p>");
  });
});

describe("appendTranscriptionToHtml", () => {
  it("appends paragraphs after existing content", () => {
    expect(appendTranscriptionToHtml("<p>déjà là</p>", "nouveau")).toBe(
      "<p>déjà là</p><p>nouveau</p>",
    );
  });

  it("returns only the addition when the note is empty", () => {
    expect(appendTranscriptionToHtml("", "premier")).toBe("<p>premier</p>");
    expect(appendTranscriptionToHtml("   ", "premier")).toBe("<p>premier</p>");
  });

  it("preserves order across multiple appends", () => {
    let html = appendTranscriptionToHtml("", "un");
    html = appendTranscriptionToHtml(html, "deux");
    html = appendTranscriptionToHtml(html, "trois");
    expect(html).toBe("<p>un</p><p>deux</p><p>trois</p>");
  });

  it("escapes appended text", () => {
    expect(appendTranscriptionToHtml("<p>x</p>", "a & b")).toBe(
      "<p>x</p><p>a &amp; b</p>",
    );
  });
});
