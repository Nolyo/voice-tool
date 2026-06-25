import DOMPurify from "dompurify";

/**
 * Prepares a note's raw TipTap HTML for public display:
 *  1. Flatten wiki-links (`<a data-note-link>`) to plain text — the target note
 *     is not shared, so the link must not be clickable or leak structure.
 *  2. Sanitize with DOMPurify — allow base64 images, strip scripts/handlers.
 */
export function renderSharedNoteHtml(rawHtml: string): string {
  const doc = new DOMParser().parseFromString(rawHtml, "text/html");
  doc.querySelectorAll("a[data-note-link]").forEach((el) => {
    el.replaceWith(doc.createTextNode(el.textContent ?? ""));
  });
  const flattened = doc.body.innerHTML;

  return DOMPurify.sanitize(flattened, {
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|data:image\/(?:png|jpeg|jpg|gif|webp);base64,)/i,
    ADD_ATTR: ["target", "rel"],
    FORBID_TAGS: ["style", "script", "iframe", "object", "embed"],
  });
}
