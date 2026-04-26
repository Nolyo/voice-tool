import { useTranslation } from "react-i18next";

interface Props {
  score: 0 | 1 | 2 | 3;  // 0=empty, 1=weak, 2=medium, 3=strong
}

export function PasswordStrengthMeter({ score }: Props) {
  const { t } = useTranslation();
  const labels = [
    "",
    t("auth.signup.strengthWeak"),
    t("auth.signup.strengthMedium"),
    t("auth.signup.strengthStrong"),
  ];
  const colors = ["bg-gray-300", "bg-red-500", "bg-amber-500", "bg-emerald-500"];
  return (
    <div className="space-y-1">
      <div className="flex gap-1 h-1">
        {[1, 2, 3].map((i) => (
          <div key={i} className={`flex-1 rounded-full ${i <= score ? colors[score] : "bg-gray-200"}`} />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{labels[score]}</p>
    </div>
  );
}
