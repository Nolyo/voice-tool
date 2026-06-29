import type { CSSProperties } from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useGuidedTour } from "@/hooks/useGuidedTour";
import { TOUR_STEPS, type TourStep } from "./tourSteps";

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const SPOTLIGHT_PAD = 8;
const BUBBLE_GAP = 16;
const VIEWPORT_MARGIN = 12;

function readRect(anchor: string): Rect | null {
  const el = document.querySelector<HTMLElement>(`[data-tour="${anchor}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

/**
 * Anchor-relative bubble position, then clamped so the whole bubble — and its
 * buttons — always stays inside the viewport (never cut off at an edge).
 */
export function bubblePosition(
  placement: TourStep["placement"],
  spot: Rect | null,
  bubble: { width: number; height: number },
  vw: number,
  vh: number,
): CSSProperties {
  let top: number;
  let left: number;

  if (!spot || placement === "center") {
    top = vh / 2 - bubble.height / 2;
    left = vw / 2 - bubble.width / 2;
  } else if (placement === "right") {
    top = spot.top;
    left = spot.left + spot.width + BUBBLE_GAP;
  } else if (placement === "bottom") {
    top = spot.top + spot.height + BUBBLE_GAP;
    left = spot.left;
  } else if (placement === "top") {
    top = spot.top - bubble.height - BUBBLE_GAP;
    left = spot.left;
  } else {
    top = spot.top;
    left = spot.left;
  }

  const maxLeft = Math.max(VIEWPORT_MARGIN, vw - bubble.width - VIEWPORT_MARGIN);
  const maxTop = Math.max(VIEWPORT_MARGIN, vh - bubble.height - VIEWPORT_MARGIN);
  left = Math.min(Math.max(VIEWPORT_MARGIN, left), maxLeft);
  top = Math.min(Math.max(VIEWPORT_MARGIN, top), maxTop);

  return { top: Math.round(top), left: Math.round(left) };
}

/**
 * One-pass guided tour overlay. Sequencing lives in `useGuidedTour`; this layer
 * resolves each step's `data-tour` anchor into a spotlight rect (a giant
 * box-shadow cuts the dim everywhere except the anchor) and positions the
 * bubble, clamped to the viewport. A missing anchor auto-advances rather than
 * rendering an orphan bubble.
 */
export function GuidedTour({ onFinish }: { onFinish: () => void }) {
  const { t } = useTranslation();
  const { index, total, isFirst, isLast, next, prev } = useGuidedTour(
    TOUR_STEPS.length,
    onFinish,
  );
  const step = TOUR_STEPS[index];
  const [rect, setRect] = useState<Rect | null>(null);
  const [viewport, setViewport] = useState(() => ({
    w: typeof window !== "undefined" ? window.innerWidth : 1280,
    h: typeof window !== "undefined" ? window.innerHeight : 800,
  }));
  const [bubbleSize, setBubbleSize] = useState({ width: 320, height: 200 });
  const bubbleRef = useRef<HTMLDivElement>(null);

  // A Radix dialog (the onboarding wizard) that unmounts while still `open`
  // leaves two things behind: `body { pointer-events: none }`, and — more
  // visibly — its full-screen dim overlay portal node (`[data-onboarding-
  // overlay]`). The tour is a body-level portal sitting ABOVE that leaked z-50
  // veil, so its spotlight "hole" reveals the dark veil instead of the
  // highlighted card — the card looks empty. The tour only ever runs once
  // onboarding has finished, so any onboarding overlay still in the DOM is
  // definitely orphaned: clear the lock and remove the leaked veil on mount,
  // and again on unmount so the dashboard is clean once the tour closes.
  useEffect(() => {
    const cleanup = () => {
      if (document.body.style.pointerEvents === "none") {
        document.body.style.pointerEvents = "";
      }
      document
        .querySelectorAll("[data-onboarding-overlay]")
        .forEach((node) => {
          try {
            node.remove();
          } catch {
            // Node already detached by React/Radix — nothing to do.
          }
        });
    };
    cleanup();
    return cleanup;
  }, []);

  // Track viewport size so positions recompute on resize — including the
  // anchorless centered step, which has no rect to react to.
  useEffect(() => {
    const onResize = () =>
      setViewport({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Resolve the anchor rect for the current step (and on resize). A missing
  // anchor auto-advances rather than rendering an orphan bubble.
  useLayoutEffect(() => {
    if (step.anchor === null) {
      setRect(null);
      return;
    }
    const el = document.querySelector<HTMLElement>(
      `[data-tour="${step.anchor}"]`,
    );
    if (!el) {
      next();
      return;
    }
    el.scrollIntoView({ block: "nearest", inline: "nearest" });
    setRect(readRect(step.anchor));
  }, [step.anchor, next, viewport]);

  const spot: Rect | null = rect
    ? {
        top: rect.top - SPOTLIGHT_PAD,
        left: rect.left - SPOTLIGHT_PAD,
        width: rect.width + SPOTLIGHT_PAD * 2,
        height: rect.height + SPOTLIGHT_PAD * 2,
      }
    : null;

  // Measure the rendered bubble so positioning can clamp it to the viewport.
  useLayoutEffect(() => {
    const el = bubbleRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setBubbleSize((prev) =>
      Math.abs(prev.width - r.width) < 1 && Math.abs(prev.height - r.height) < 1
        ? prev
        : { width: r.width, height: r.height },
    );
  }, [index, rect, viewport]);

  const pos = bubblePosition(
    step.placement,
    spot,
    bubbleSize,
    viewport.w,
    viewport.h,
  );

  return createPortal(
    <div
      className="vt-app fixed inset-0 z-[60] pointer-events-auto"
      role="dialog"
      aria-modal="true"
    >
      {spot ? (
        <div
          className="absolute rounded-xl transition-all duration-200"
          style={{
            top: spot.top,
            left: spot.left,
            width: spot.width,
            height: spot.height,
            boxShadow:
              "0 0 0 2px var(--vt-accent), 0 0 0 9999px rgba(0,0,0,0.6)",
            pointerEvents: "none",
          }}
        />
      ) : (
        <div
          className="absolute inset-0"
          style={{ background: "rgba(0,0,0,0.6)" }}
        />
      )}

      <div
        ref={bubbleRef}
        className="absolute w-[320px] max-w-[90vw] rounded-xl border p-4 shadow-2xl"
        style={{
          ...pos,
          background: "var(--vt-panel)",
          borderColor: "var(--vt-border)",
          color: "var(--vt-fg)",
        }}
      >
        <h3 className="vt-display text-base font-semibold">{t(step.titleKey)}</h3>
        <p className="mt-1.5 text-sm" style={{ color: "var(--vt-fg-2)" }}>
          {t(step.bodyKey)}
        </p>
        <div className="mt-4 flex items-center justify-between">
          <button
            type="button"
            onClick={onFinish}
            className="text-xs underline-offset-4 hover:underline"
            style={{ color: "var(--vt-fg-3)" }}
          >
            {t("tour.skip")}
          </button>
          <div className="flex items-center gap-2">
            <span className="text-xs" style={{ color: "var(--vt-fg-3)" }}>
              {index + 1} / {total}
            </span>
            {!isFirst && (
              <Button variant="outline" size="sm" onClick={prev}>
                {t("tour.prev")}
              </Button>
            )}
            <Button size="sm" onClick={next}>
              {isLast ? t("tour.finish") : t("tour.next")}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
