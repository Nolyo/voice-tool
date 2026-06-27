import { ArrowRight, Check, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

interface SyncReminderCardProps {
  onOpenAccountPage: () => void;
}

/**
 * Reminder shown on the home screen when the user is signed in but has not
 * enabled sync for the current profile. Explains the benefits and routes to
 * the account section (which hosts the sync activation flow). Visibility is
 * decided by the parent (AccueilTab) so the grid layout stays clean.
 */
export function SyncReminderCard({ onOpenAccountPage }: SyncReminderCardProps) {
  const { t } = useTranslation();

  const tint = "var(--vt-violet)";
  const tintSoft = `oklch(from ${tint} l c h / 0.18)`;
  const tintBg = `oklch(from ${tint} l c h / 0.14)`;

  const benefits = [
    t("home.sync.benefit1"),
    t("home.sync.benefit2"),
    t("home.sync.benefit3"),
  ];

  return (
    <div
      className="vt-card-elevated relative overflow-hidden p-5 h-full"
      style={{
        background: `
          radial-gradient(circle at 100% 0%, ${tintSoft} 0, transparent 55%),
          var(--vt-panel-2)
        `,
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="vt-eyebrow">{t("home.sync.eyebrow")}</span>
        <div
          className="flex items-center justify-center w-8 h-8 rounded-lg shrink-0"
          style={{ background: tintBg, color: tint }}
        >
          <RefreshCw className="w-4 h-4" />
        </div>
      </div>

      <h3 className="mt-3 vt-display text-[17px] font-semibold text-[var(--vt-fg)]">
        {t("home.sync.title")}
      </h3>
      <p className="mt-1.5 text-[13px] text-[var(--vt-fg-3)] leading-relaxed">
        {t("home.sync.desc")}
      </p>

      <ul className="mt-3 space-y-1.5">
        {benefits.map((b) => (
          <li
            key={b}
            className="flex items-start gap-2 text-[12.5px] text-[var(--vt-fg-2)]"
          >
            <Check
              className="w-3.5 h-3.5 mt-0.5 shrink-0"
              style={{ color: tint }}
            />
            <span>{b}</span>
          </li>
        ))}
      </ul>

      <Button className="mt-4" size="sm" variant="outline" onClick={onOpenAccountPage}>
        {t("home.sync.cta")}
        <ArrowRight className="w-4 h-4" />
      </Button>
    </div>
  );
}
