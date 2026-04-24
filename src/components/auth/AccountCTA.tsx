import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";

export function AccountCTA() {
  const { t } = useTranslation();
  const { status, openAuthModal } = useAuth();

  if (status !== "signed-out") return null;

  return (
    <div className="rounded-lg border border-input bg-background p-4 flex items-center justify-between gap-3">
      <p className="text-sm">{t("auth.cta.dashboardCard")}</p>
      <button
        onClick={openAuthModal}
        className="px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 shrink-0"
      >
        {t("auth.cta.header")}
      </button>
    </div>
  );
}
