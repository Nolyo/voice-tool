import {
  FileText,
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
import { SettingsSidebarSection } from "@/components/settings/SettingsSidebarSection";
import { type SettingsSectionId } from "@/components/settings/common/SettingsNav";
import { type NoteMeta } from "@/hooks/useNotes";
import { type FolderMeta } from "@/hooks/useFolders";
import { type Transcription } from "@/hooks/useTranscriptionHistory";
import { type AppLog } from "@/hooks/useAppLogs";
import {
  type LevelFilter,
} from "@/components/logs/LogsTab";
import { ProfileSwitcher } from "./ProfileSwitcher";
import { HistoriqueSidebarSection } from "./HistoriqueSidebarSection";
import { LogsSidebarSection } from "./LogsSidebarSection";

export const DASHBOARD_NAV_ITEMS = [
  { id: "historique", labelKey: "sidebar.history", icon: History },
  { id: "notes", labelKey: "sidebar.notes", icon: FileText },
  { id: "parametres", labelKey: "sidebar.settings", icon: Settings2 },
  { id: "logs", labelKey: "sidebar.logs", icon: ScrollText },
] as const;

export type DashboardTabId = (typeof DASHBOARD_NAV_ITEMS)[number]["id"];

interface DashboardSidebarProps {
  activeTab: string;
  onTabChange: (id: DashboardTabId) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  notes: NoteMeta[];
  folders: FolderMeta[];
  activeNoteId: string | null;
  onOpenNote: (note: NoteMeta) => void;
  onCreateNote: (folderId?: string | null) => void;
  onToggleFavorite: (id: string) => void;
  onDeleteNote: (id: string) => void;
  searchNotes: (query: string) => Promise<NoteMeta[]>;
  onCreateFolder: (name: string) => Promise<FolderMeta>;
  onRenameFolder: (id: string, name: string) => Promise<void>;
  onDeleteFolder: (id: string) => Promise<void>;
  onReorderFolders: (ids: string[]) => Promise<void>;
  onReorderNotes: (folderId: string | null, noteIds: string[]) => Promise<void>;
  onMoveNote: (noteId: string, folderId: string | null) => Promise<void>;
  activeSettingsSection: SettingsSectionId;
  onSettingsSectionChange: (id: SettingsSectionId) => void;
  transcriptions: Transcription[];
  logs: AppLog[];
  levelFilter: LevelFilter;
  onLevelFilterChange: (next: LevelFilter) => void;
  sourceFilter: string | null;
  onSourceFilterChange: (next: string | null) => void;
}

export function DashboardSidebar({
  activeTab,
  onTabChange,
  collapsed,
  onToggleCollapsed,
  notes,
  folders,
  activeNoteId,
  onOpenNote,
  onCreateNote,
  onToggleFavorite,
  onDeleteNote,
  searchNotes,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onReorderFolders,
  onReorderNotes,
  onMoveNote,
  activeSettingsSection,
  onSettingsSectionChange,
  transcriptions,
  logs,
  levelFilter,
  onLevelFilterChange,
  sourceFilter,
  onSourceFilterChange,
}: DashboardSidebarProps) {
  const { t } = useTranslation();

  return (
    <aside
      className={`flex flex-col border-r border-border shrink-0 transition-all duration-200 ${
        collapsed ? "w-[52px]" : "w-[260px]"
      }`}
    >
      {/* Header: logo + title (expanded only) + collapse/expand button */}
      <div
        className={`flex items-center border-b border-border h-[61px] shrink-0 ${
          collapsed ? "justify-center px-2" : "px-3 gap-2"
        }`}
      >
        {!collapsed && (
          <>
            <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-primary/10 flex-shrink-0">
              <Mic className="w-3.5 h-3.5 text-primary" />
            </div>
            <span className="font-semibold text-sm truncate flex-1">{t('header.title')}</span>
          </>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-foreground cursor-pointer shrink-0"
          onClick={onToggleCollapsed}
          title={collapsed ? t('sidebar.expandMenu') : t('sidebar.collapseMenu')}
        >
          {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
        </Button>
      </div>

      {/* Nav items */}
      <nav className="flex flex-col gap-1 p-2 shrink-0">
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

      {/* Notes section — visible only when the Notes tab is active */}
      {!collapsed && activeTab === "notes" && (
        <NotesSidebarSection
          notes={notes}
          folders={folders}
          activeNoteId={activeNoteId}
          onOpenNote={onOpenNote}
          onCreateNote={onCreateNote}
          onToggleFavorite={onToggleFavorite}
          onDeleteNote={onDeleteNote}
          searchNotes={searchNotes}
          onCreateFolder={onCreateFolder}
          onRenameFolder={onRenameFolder}
          onDeleteFolder={onDeleteFolder}
          onReorderFolders={onReorderFolders}
          onReorderNotes={onReorderNotes}
          onMoveNote={onMoveNote}
        />
      )}

      {/* Settings sub-navigation — visible when the Settings tab is active (collapsed shows icon-only nav) */}
      {activeTab === "parametres" && (
        <SettingsSidebarSection
          activeSection={activeSettingsSection}
          onSectionChange={onSettingsSectionChange}
          collapsed={collapsed}
        />
      )}

      {/* Historique overview — expanded sidebar only */}
      {!collapsed && activeTab === "historique" && (
        <HistoriqueSidebarSection transcriptions={transcriptions} />
      )}

      {/* Logs level filters — expanded sidebar only */}
      {!collapsed && activeTab === "logs" && (
        <LogsSidebarSection
          logs={logs}
          levelFilter={levelFilter}
          onLevelFilterChange={onLevelFilterChange}
          sourceFilter={sourceFilter}
          onSourceFilterChange={onSourceFilterChange}
        />
      )}

      {/* Spacer to push profile to bottom — only when no sub-nav takes the remaining space */}
      {activeTab !== "parametres" &&
        !(activeTab === "notes" && !collapsed) &&
        !(activeTab === "historique" && !collapsed) &&
        !(activeTab === "logs" && !collapsed) && (
          <div className="flex-1" />
        )}

      {/* Profile switcher — always at the very bottom */}
      <div className="border-t border-border shrink-0 p-2">
        <ProfileSwitcher collapsed={collapsed} />
      </div>
    </aside>
  );
}
