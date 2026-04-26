import { useEffect, useState } from "react";

const COMPACT_THRESHOLD_COLLAPSED = 1080;
const COMPACT_THRESHOLD_EXPANDED = 1250;

/**
 * Returns true when the window is too narrow to comfortably show the
 * transcriptions list and the details panel side-by-side. The threshold
 * depends on whether the main dashboard sidebar is collapsed.
 */
export function useIsCompactLayout(sidebarCollapsed: boolean): boolean {
  const threshold = sidebarCollapsed
    ? COMPACT_THRESHOLD_COLLAPSED
    : COMPACT_THRESHOLD_EXPANDED;

  const [isCompact, setIsCompact] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth < threshold;
  });

  useEffect(() => {
    const update = () => setIsCompact(window.innerWidth < threshold);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [threshold]);

  return isCompact;
}
