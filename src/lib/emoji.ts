/** Minimal local typings for Intl.Segmenter: the project's tsconfig lib is
 * ES2020+DOM, which predates the ES2022.Intl declarations. Scoped here so we
 * don't widen the global lib for one call site. */
interface GraphemeSegmenter {
  segment(input: string): Iterable<{ segment: string }>;
}
interface IntlWithSegmenter {
  Segmenter?: new (
    locales?: string | string[],
    options?: { granularity?: "grapheme" | "word" | "sentence" }
  ) => GraphemeSegmenter;
}

const MAX_ICON_UTF16_UNITS = 32;

/** Extract the first grapheme cluster (user-perceived character) of a string.
 * Used to clamp the folder-icon free input to a single emoji: grapheme
 * segmentation keeps ZWJ sequences (👨‍👩‍👧‍👦) and flag pairs (🇫🇷) whole where a
 * naive code-point slice would split them. Returns null for empty or
 * whitespace-only input. Falls back to the first code point when
 * Intl.Segmenter is unavailable (very old WebViews). */
export function firstGrapheme(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed === "") return null;
  const SegmenterCtor = (Intl as IntlWithSegmenter).Segmenter;
  if (SegmenterCtor) {
    const segmenter = new SegmenterCtor(undefined, { granularity: "grapheme" });
    const first = segmenter.segment(trimmed)[Symbol.iterator]().next();
    if (first.done) return null;
    // Mirror the sync-push cap (icon max 32 UTF-16 units): an over-long
    // cluster (e.g. Zalgo text) would 400 the whole push batch server-side.
    // All legitimate RGI emoji are well under 32 units.
    return first.value.segment.length > MAX_ICON_UTF16_UNITS
      ? null
      : first.value.segment;
  }
  return Array.from(trimmed)[0] ?? null;
}
