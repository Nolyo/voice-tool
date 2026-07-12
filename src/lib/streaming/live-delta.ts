/** Split of the visible live-transcript tail into settled and fresh parts. */
export interface LiveDelta {
  /** True when the full text was truncated on the left to fit the tail. */
  truncated: boolean;
  /** Part of the visible tail that was already displayed before this update. */
  stable: string;
  /** Newly arrived suffix — the words just transcribed, to be animated in. */
  fresh: string;
}

/**
 * Computes what changed between two versions of the assembled live transcript,
 * clipped to the last `tailChars` characters (what the mini window can show).
 *
 * The boundary is the longest common prefix of the two full texts: the
 * assembler can insert a late chunk in the middle, in which case everything
 * from the insertion point onwards counts as fresh — visually acceptable, and
 * it keeps the split exact without tracking chunk indices.
 */
export function splitLiveDelta(
  previous: string,
  next: string,
  tailChars: number,
): LiveDelta {
  let common = 0;
  const max = Math.min(previous.length, next.length);
  while (common < max && previous[common] === next[common]) common++;

  const tailStart = Math.max(0, next.length - tailChars);
  const freshStart = Math.max(common, tailStart);

  return {
    truncated: tailStart > 0,
    stable: next.slice(tailStart, freshStart),
    fresh: next.slice(freshStart),
  };
}
