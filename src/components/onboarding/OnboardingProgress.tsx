import { cn } from "@/lib/utils";

interface OnboardingProgressProps {
  current: number;
  total: number;
  onStepClick?: (step: number) => void;
}

export function OnboardingProgress({
  current,
  total,
  onStepClick,
}: OnboardingProgressProps) {
  return (
    <div
      className="flex items-center justify-center gap-2"
      role="progressbar"
      aria-valuemin={1}
      aria-valuemax={total}
      aria-valuenow={current}
    >
      {Array.from({ length: total }, (_, i) => i + 1).map((step) => {
        const isActive = step === current;
        const isPast = step < current;
        const isClickable = isPast && !!onStepClick;
        return (
          <button
            key={step}
            type="button"
            disabled={!isClickable}
            onClick={isClickable ? () => onStepClick?.(step) : undefined}
            aria-label={`Step ${step}`}
            aria-current={isActive ? "step" : undefined}
            className={cn(
              "h-1.5 rounded-full transition-all duration-200",
              isActive ? "w-8" : "w-2",
              isClickable ? "cursor-pointer hover:opacity-80" : "cursor-default",
            )}
            style={{
              background: isActive
                ? "var(--vt-violet)"
                : isPast
                  ? "oklch(from var(--vt-violet) l c h / 0.4)"
                  : "var(--vt-border)",
            }}
          />
        );
      })}
    </div>
  );
}
