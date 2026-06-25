import DOMPurify from "dompurify";

const ALLOWED_URI_REGEXP =
  /^(?:https?:|mailto:|data:image\/(?:png|jpeg|jpg|gif|webp);base64,)/i;

// Strip non-raster data: URIs from src attributes (e.g. data:image/svg+xml bypasses
// ALLOWED_URI_REGEXP for img src in DOMPurify ≤3.x). Registered once at module load.
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  const src = (node as Element).getAttribute?.("src") ?? "";
  if (src.startsWith("data:") && !ALLOWED_URI_REGEXP.test(src)) {
    (node as Element).removeAttribute("src");
  }
});

/**
 * Prepares a note's raw TipTap HTML for public display:
 *  1. Flatten wiki-links (`<a data-note-link>`) to plain text — the target note
 *     is not shared, so the link must not be clickable or leak structure.
 *  2. Sanitize with DOMPurify — allow base64 images, strip scripts/handlers.
 */
// Browser-only: requires a DOM environment (DOMParser + DOMPurify). Do NOT import in SSR/Node contexts.
export function renderSharedNoteHtml(rawHtml: string): string {
  const doc = new DOMParser().parseFromString(rawHtml, "text/html");
  doc.querySelectorAll("a[data-note-link]").forEach((el) => {
    el.replaceWith(doc.createTextNode(el.textContent ?? ""));
  });
  const flattened = doc.body.innerHTML;

  return DOMPurify.sanitize(flattened, {
    ALLOWED_URI_REGEXP,
    ADD_ATTR: ["target", "rel"],
    FORBID_TAGS: ["style", "script", "iframe", "object", "embed"],
  });
}
