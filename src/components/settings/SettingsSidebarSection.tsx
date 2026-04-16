import { useTranslation } from "react-i18next";
import { NAV_ITEM_DEFS, type SettingsSectionId } from "./common/SettingsNav";

interface SettingsSidebarSectionProps {
  activeSection: SettingsSectionId;
  onSectionChange: (id: SettingsSectionId) => void;
}

export function SettingsSidebarSection({
  activeSection,
  onSectionChange,
}: SettingsSidebarSectionProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col border-t border-border overflow-y-auto flex-1 min-h-0 p-2 gap-0.5">
      {NAV_ITEM_DEFS.map((item) => {
        const isActive = activeSection === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSectionChange(item.id as SettingsSectionId)}
            className={`w-full flex items-center gap-2.5 px-2 py-2 rounded-md text-left transition-colors cursor-pointer ${
              isActive
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
            }`}
          >
            <div
              className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${item.iconBg}`}
            >
              {item.icon}
            </div>
            <div className="min-w-0 flex-1">
              <p
                className={`text-xs font-semibold leading-none truncate ${
                  isActive ? "text-foreground" : ""
                }`}
              >
                {t(item.titleKey)}
              </p>
              <p className="text-[10px] text-muted-foreground leading-tight mt-0.5 truncate">
                {t(item.subtitleKey)}
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
