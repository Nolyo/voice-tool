import { useCallback, useState } from "react";

export interface GuidedTourController {
  index: number;
  total: number;
  isFirst: boolean;
  isLast: boolean;
  next: () => void;
  prev: () => void;
  reset: () => void;
}

/**
 * Pure step-sequencing for the guided tour. Holds the current index and clamps
 * at both ends. `next()` past the final step triggers `onFinish` (used both for
 * the "Done" button on the last step and for any auto-advance). All DOM /
 * positioning concerns live in the GuidedTour presentation layer.
 */
export function useGuidedTour(
  total: number,
  onFinish: () => void,
): GuidedTourController {
  const [index, setIndex] = useState(0);

  const next = useCallback(() => {
    setIndex((i) => {
      if (i >= total - 1) {
        onFinish();
        return i;
      }
      return i + 1;
    });
  }, [total, onFinish]);

  const prev = useCallback(() => {
    setIndex((i) => (i <= 0 ? 0 : i - 1));
  }, []);

  const reset = useCallback(() => setIndex(0), []);

  return {
    index,
    total,
    isFirst: index === 0,
    isLast: index === total - 1,
    next,
    prev,
    reset,
  };
}
