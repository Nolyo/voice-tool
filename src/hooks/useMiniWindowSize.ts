import { useEffect, useState } from "react";

export type MiniLayout = "compact" | "standard" | "extended";

const COMPACT_MAX = 50;
const STANDARD_MAX = 100;

function computeLayout(height: number): MiniLayout {
  if (height < COMPACT_MAX) return "compact";
  if (height < STANDARD_MAX) return "standard";
  return "extended";
}

/**
 * Tracks the mini-window's current inner height and returns a semantic
 * breakpoint so child components can adapt their content density.
 *
 * Thresholds (inner height in CSS pixels):
 *   < 50  : compact  — visualizer + timer only
 *   50-99 : standard — + language badge, larger status dot
 *   ≥ 100 : extended — + transcript preview row
 */
export function useMiniWindowSize(): MiniLayout {
  const [layout, setLayout] = useState<MiniLayout>(() =>
    computeLayout(typeof window !== "undefined" ? window.innerHeight : 42),
  );

  useEffect(() => {
    const root = document.documentElement;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const h = entry.contentRect.height;
        setLayout((prev) => {
          const next = computeLayout(h);
          return prev === next ? prev : next;
        });
      }
    });
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  return layout;
}
