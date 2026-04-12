import {
  History,
  Mic,
  PanelLeftClose,
  PanelLeftOpen,
  ScrollText,
  Settings2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { NotesSidebarSection } from "@/components/notes/NotesSidebarSection";
import { type NoteMeta } from "@/hooks/useNotes";
import { ProfileSwitcher } from "./ProfileSwitcher";

export const DASHBOARD_NAV_ITEMS = [
  { id: "historique", labelKey: "sidebar.history", icon: History },
  { id: "parametres", labelKey: "sidebar.settings", icon: Settings2 },
  { id: "logs", labelKey: "sidebar.logs", icon: ScrollText },
] as const;

export type DashboardTabId =
  | (typeof DASHBOARD_NAV_ITEMS)[number]["id"]
  | "notes";

interface DashboardSidebarProps {
  activeTab: string;
  onTabChange: (id: DashboardTabId) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  notes: NoteMeta[];
  activeNoteId: string | null;
  onOpenNote: (note: NoteMeta) => void;
  onCreateNote: () => void;
  onToggleFavorite: (id: string) => void;
  onDeleteNote: (id: string) => void;
  searchNotes: (query: string) => Promise<NoteMeta[]>;
}

export function DashboardSidebar({
  activeTab,
  onTabChange,
  collapsed,
  onToggleCollapsed,
  notes,
  activeNoteId,
  onOpenNote,
  onCreateNote,
  onToggleFavorite,
  onDeleteNote,
  searchNotes,
}: DashboardSidebarProps) {
  const { t } = useTranslation();

  return (
    <aside
      className={`flex flex-col border-r border-border shrink-0 transition-all duration-200 ${
        collapsed ? "w-[52px]" : "w-[260px]"
      }`}
    >
      {/* Logo + collapse button (expanded: both in header / collapsed: only mic) */}
      <div className="flex items-center border-b border-border h-[61px] px-3 gap-2 shrink-0">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10 shrink-0">
          <Mic className="w-4 h-4 text-primary" />
        </div>
        {!collapsed && (
          <>
            <span className="font-semibold text-sm truncate flex-1">{t('header.title')}</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground cursor-pointer shrink-0"
              onClick={onToggleCollapsed}
              title={t('sidebar.collapseMenu')}
            >
              <PanelLeftClose className="w-4 h-4" />
            </Button>
          </>
        )}
      </div>

      {/* Nav items + collapse button (collapsed: button is first nav item) */}
      <nav className="flex flex-col gap-1 p-2 shrink-0">
        {collapsed && (
          <button
            onClick={onToggleCollapsed}
            title={t('sidebar.expandMenu')}
            className="flex items-center justify-center p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors cursor-pointer"
          >
            <PanelLeftOpen className="w-4 h-4 shrink-0" />
          </button>
        )}
        {DASHBOARD_NAV_ITEMS.map(({ id, labelKey, icon: Icon }) => (
          <button
            key={id}
            onClick={() => onTabChange(id)}
            title={collapsed ? t(labelKey) : undefined}
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
              <span className="text-sm font-medium truncate">{t(labelKey)}</span>
            )}
          </button>
        ))}
      </nav>

      {/* Notes section (only when expanded) */}
      {!collapsed && (
        <NotesSidebarSection
          notes={notes}
          activeNoteId={activeNoteId}
          onOpenNote={onOpenNote}
          onCreateNote={onCreateNote}
          onToggleFavorite={onToggleFavorite}
          onDeleteNote={onDeleteNote}
          searchNotes={searchNotes}
        />
      )}

      {/* Spacer to push profile to bottom */}
      <div className="flex-1" />

      {/* Profile switcher — always at the very bottom */}
      <div className="border-t border-border shrink-0 p-2">
        <ProfileSwitcher collapsed={collapsed} />
      </div>
    </aside>
  );
}
