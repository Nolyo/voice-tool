/** Extract the first grapheme cluster (user-perceived character) of a string.
 * Used to clamp the folder-icon free input to a single emoji: grapheme
 * segmentation keeps ZWJ sequences (👨‍👩‍👧‍👦) and flag pairs (🇫🇷) whole where a
 * naive code-point slice would split them. Returns null for empty or
 * whitespace-only input. Falls back to the first code point when
 * Intl.Segmenter is unavailable (very old WebViews). */
export function firstGrapheme(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed === "") return null;
  // Use dynamic Intl.Segmenter if available (newer browsers)
  // @ts-expect-error - Intl.Segmenter is not in older TypeScript lib
  if (typeof Intl !== "undefined" && typeof Intl.Segmenter === "function") {
    // @ts-expect-error
    const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    const first = segmenter.segment(trimmed)[Symbol.iterator]().next();
    return first.done ? null : first.value.segment;
  }
  return Array.from(trimmed)[0] ?? null;
}
