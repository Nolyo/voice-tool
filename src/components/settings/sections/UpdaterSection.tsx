import { useTranslation } from "react-i18next";
import { RefreshCw } from "lucide-react";
import { UpdaterTab } from "@/components/settings/UpdaterTab";
import { SectionCard } from "../common/SectionCard";

export function UpdaterSection() {
  const { t } = useTranslation();

  return (
    <SectionCard
      id="section-mises-a-jour"
      icon={<RefreshCw className="w-3.5 h-3.5 text-sky-500" />}
      iconBg="bg-sky-500/10"
      title={t('settings.updater.title')}
      subtitle={t('settings.updater.subtitle')}
    >
      <UpdaterTab />
    </SectionCard>
  );
}
