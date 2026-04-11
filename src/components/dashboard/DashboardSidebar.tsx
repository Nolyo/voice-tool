import {
  History,
  Mic,
  NotebookPen,
  PanelLeftClose,
  PanelLeftOpen,
  ScrollText,
  Settings2,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export const DASHBOARD_NAV_ITEMS = [
  { id: "historique", label: "Historique", icon: History },
  { id: "notes", label: "Notes", icon: NotebookPen },
  { id: "parametres", label: "Paramètres", icon: Settings2 },
  { id: "logs", label: "Logs", icon: ScrollText },
] as const;

export type DashboardTabId = (typeof DASHBOARD_NAV_ITEMS)[number]["id"];

interface DashboardSidebarProps {
  activeTab: string;
  onTabChange: (id: DashboardTabId) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

export function DashboardSidebar({
  activeTab,
  onTabChange,
  collapsed,
  onToggleCollapsed,
}: DashboardSidebarProps) {
  return (
    <aside
      className={`flex flex-col border-r border-border shrink-0 transition-all duration-200 ${
        collapsed ? "w-[52px]" : "w-[180px]"
      }`}
    >
      {/* Logo */}
      <div
        className={`flex items-center border-b border-border h-[61px] px-3 ${
          collapsed ? "justify-center" : "gap-2"
        }`}
      >
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10 shrink-0">
          <Mic className="w-4 h-4 text-primary" />
        </div>
        {!collapsed && (
          <span className="font-semibold text-sm truncate">Voice Tool</span>
        )}
      </div>

      {/* Nav items */}
      <nav className="flex flex-col gap-1 p-2 flex-1">
        {DASHBOARD_NAV_ITEMS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => onTabChange(id)}
            title={collapsed ? label : undefined}
            className={`flex items-center gap-3 rounded-md transition-colors cursor-pointer ${
              collapsed ? "justify-center p-2" : "px-3 py-2"
            } ${
              activeTab === id
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
            }`}
          >
            <Icon className="w-4 h-4 shrink-0" />
            {!collapsed && (
              <span className="text-sm font-medium truncate">{label}</span>
            )}
          </button>
        ))}
      </nav>

      {/* Toggle button at bottom */}
      <div
        className={`p-2 border-t border-border ${
          collapsed ? "flex justify-center" : "flex justify-end"
        }`}
      >
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-foreground cursor-pointer"
          onClick={onToggleCollapsed}
          title={collapsed ? "Déplier le menu" : "Replier le menu"}
        >
          {collapsed ? (
            <PanelLeftOpen className="w-4 h-4" />
          ) : (
            <PanelLeftClose className="w-4 h-4" />
          )}
        </Button>
      </div>
    </aside>
  );
}
