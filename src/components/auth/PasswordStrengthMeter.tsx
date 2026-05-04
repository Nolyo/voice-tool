import { useTranslation } from "react-i18next";

interface Props {
  score: 0 | 1 | 2 | 3; // 0=empty, 1=weak, 2=medium, 3=strong
}

/**
 * Bars use semantic design tokens:
 *   weak   → var(--vt-danger)
 *   medium → var(--vt-warn)
 *   strong → var(--vt-ok)
 * Empty/inactive bars use --vt-border for low contrast against the panel.
 */
export function PasswordStrengthMeter({ score }: Props) {
  const { t } = useTranslation();
  const labels = [
    "",
    t("auth.signup.strengthWeak"),
    t("auth.signup.strengthMedium"),
    t("auth.signup.strengthStrong"),
  ];
  const colors: Record<1 | 2 | 3, string> = {
    1: "var(--vt-danger)",
    2: "var(--vt-warn)",
    3: "var(--vt-ok)",
  };
  const labelColors: Record<1 | 2 | 3, string> = {
    1: "var(--vt-danger)",
    2: "var(--vt-warn)",
    3: "var(--vt-ok)",
  };
  const activeColor = score >= 1 ? colors[score as 1 | 2 | 3] : "var(--vt-border)";
  const labelColor = score >= 1 ? labelColors[score as 1 | 2 | 3] : "var(--vt-fg-4)";
  return (
    <div className="space-y-1.5">
      <div className="flex gap-1 h-1">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="flex-1 rounded-full transition-colors"
            style={{
              background: i <= score ? activeColor : "var(--vt-border)",
            }}
          />
        ))}
      </div>
      <p
        className="text-[11px] font-medium"
        style={{ color: labelColor }}
        aria-live="polite"
      >
        {labels[score]}
      </p>
    </div>
  );
}
