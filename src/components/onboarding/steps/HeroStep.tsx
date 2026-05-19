import { useTranslation } from "react-i18next";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HotkeyToTextDemo } from "../illustrations/HotkeyToTextDemo";

interface HeroStepProps {
  onContinue: () => void;
}

export function HeroStep({ onContinue }: HeroStepProps) {
  const { t } = useTranslation("billing");

  return (
    <div className="vt-anim-fade-up flex flex-col gap-8">
      <div className="text-center space-y-3">
        <h1
          className="vt-display text-3xl md:text-4xl font-semibold tracking-tight"
          style={{ color: "var(--vt-fg)" }}
        >
          {t("welcome.hero.title")}
        </h1>
        <p
          className="mx-auto max-w-xl text-base"
          style={{ color: "var(--vt-fg-2)" }}
        >
          {t("welcome.hero.subtitle")}
        </p>
      </div>

      <HotkeyToTextDemo />

      <div className="flex justify-end">
        <Button onClick={onContinue} size="lg" className="gap-2">
          {t("welcome.hero.cta_discover")}
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
