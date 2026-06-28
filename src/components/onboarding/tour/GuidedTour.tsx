import type { CSSProperties } from "react";
import { useLayoutEffect, useState } from "react";
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

function readRect(anchor: string): Rect | null {
  const el = document.querySelector<HTMLElement>(`[data-tour="${anchor}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

function bubbleStyle(
  placement: TourStep["placement"],
  spot: Rect | null,
): CSSProperties {
  if (!spot || placement === "center") {
    return { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };
  }
  switch (placement) {
    case "right":
      return { top: spot.top, left: spot.left + spot.width + BUBBLE_GAP };
    case "bottom":
      return { top: spot.top + spot.height + BUBBLE_GAP, left: spot.left };
    case "top":
      return { top: Math.max(8, spot.top - BUBBLE_GAP), left: spot.left };
    default:
      return { top: spot.top, left: spot.left };
  }
}

/**
 * One-pass guided tour overlay. Sequencing lives in `useGuidedTour`; this layer
 * resolves each step's `data-tour` anchor into a spotlight rect (a giant
 * box-shadow cuts the dim everywhere except the anchor) and positions the bubble.
 * A missing anchor auto-advances rather than rendering an orphan bubble.
 */
export function GuidedTour({ onFinish }: { onFinish: () => void }) {
  const { t } = useTranslation();
  const { index, total, isFirst, isLast, next, prev } = useGuidedTour(
    TOUR_STEPS.length,
    onFinish,
  );
  const step = TOUR_STEPS[index];
  const [rect, setRect] = useState<Rect | null>(null);

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
    const update = () => setRect(readRect(step.anchor as string));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [step.anchor, next]);

  const spot: Rect | null = rect
    ? {
        top: rect.top - SPOTLIGHT_PAD,
        left: rect.left - SPOTLIGHT_PAD,
        width: rect.width + SPOTLIGHT_PAD * 2,
        height: rect.height + SPOTLIGHT_PAD * 2,
      }
    : null;

  return createPortal(
    <div
      className="vt-app fixed inset-0 z-[60]"
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
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.6)",
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
        className="absolute w-[320px] max-w-[90vw] rounded-xl border p-4 shadow-2xl"
        style={{
          ...bubbleStyle(step.placement, spot),
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
