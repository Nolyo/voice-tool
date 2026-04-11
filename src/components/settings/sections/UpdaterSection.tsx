import { RefreshCw } from "lucide-react";
import { UpdaterTab } from "@/components/updater-tab";
import { SectionCard } from "../common/SectionCard";

export function UpdaterSection() {
  return (
    <SectionCard
      id="section-mises-a-jour"
      icon={<RefreshCw className="w-3.5 h-3.5 text-sky-500" />}
      iconBg="bg-sky-500/10"
      title="Mises à jour"
      subtitle="Vérification et installation des nouvelles versions"
    >
      <UpdaterTab />
    </SectionCard>
  );
}
