/**
 * Plain-text helpers for note bodies. Notes are stored as HTML (content_html);
 * the home screen needs a short one-line snippet and a word count without
 * mounting the editor. Kept dependency-free and side-effect-free so it stays
 * cheap and unit-testable.
 */

/** Strip HTML tags + decode the few entities our editor emits, collapse space. */
export function htmlToText(html: string): string {
  if (!html) return "";
  const stripped = html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/(p|div|h[1-6]|li|tr|blockquote|pre)>/gi, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "");
  const decoded = stripped
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"');
  return decoded.replace(/\s+/g, " ").trim();
}

/** Count words in plain text. Empty/whitespace-only → 0. */
export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

const LEADING_EMOJI =
  /^(\p{Extended_Pictographic}(?:‍\p{Extended_Pictographic})*)/u;

/** Return the emoji a note title starts with, if any (used as its tile icon). */
export function leadingEmoji(title: string): string | null {
  const match = title.trim().match(LEADING_EMOJI);
  return match ? match[1] : null;
}

/** Title with a leading emoji (and the space after it) removed. */
export function stripLeadingEmoji(title: string): string {
  return title.trim().replace(LEADING_EMOJI, "").trim();
}
