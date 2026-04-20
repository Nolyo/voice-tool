"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import { DashboardHeader } from "./common/DashboardHeader";
import {
  DashboardSidebar,
  type DashboardTabId,
} from "./dashboard/DashboardSidebar";
import { HistoriqueTab } from "./dashboard/tabs/HistoriqueTab";
import { SettingTabs } from "./settings/SettingTabs";
import { type SettingsSectionId } from "./settings/common/SettingsNav";
import { LogsTab } from "./logs/LogsTab";
import { NotesEditor } from "./notes/NotesEditor/NotesEditor";
import { UpdateModal } from "./common/UpdateModal";
import { OnboardingWizard } from "./OnboardingWizard";
import { SelectedModelMissingBanner } from "./SelectedModelMissingBanner";
import { useSettings } from "@/hooks/useSettings";
import { useOnboardingCheck } from "@/hooks/useOnboardingCheck";
import {
  useTranscriptionHistory,
  type Transcription,
} from "@/hooks/useTranscriptionHistory";
import { useNotes, type NoteMeta } from "@/hooks/useNotes";
import { useFolders } from "@/hooks/useFolders";
import { useAppLogs } from "@/hooks/useAppLogs";
import { useUpdaterContext } from "@/contexts/UpdaterContext";
import { useRecordingWorkflow } from "@/hooks/useRecordingWorkflow";
import { useNotesWorkflow } from "@/hooks/useNotesWorkflow";

export default function Dashboard() {
  const { t } = useTranslation();
  const [selectedTranscription, setSelectedTranscription] =
    useState<Transcription | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<DashboardTabId>("historique");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeSettingsSection, setActiveSettingsSection] =
    useState<SettingsSectionId>("section-transcription");

  const { settings, isLoaded: settingsLoaded } = useSettings();
  const { showOnboarding, recheck: recheckOnboarding } = useOnboardingCheck(
    settings,
    settingsLoaded,
  );
  const { updateAvailable, showUpdateModal, setShowUpdateModal } =
    useUpdaterContext();
  const {
    transcriptions,
    addTranscription,
    deleteTranscription,
    clearHistory,
  } = useTranscriptionHistory();
  const {
    notes,
    isLoading: notesLoading,
    createNote,
    readNote,
    updateNote,
    deleteNote,
    searchNotes,
    toggleFavorite,
    moveNoteToFolder,
    reorderNotesInFolder,
  } = useNotes();
  const {
    folders,
    createFolder,
    renameFolder,
    deleteFolder,
    reorderFolders,
  } = useFolders();
  const { logs, clearLogs } = useAppLogs();

  const { isRecording, isTranscribing, handleToggleRecording } =
    useRecordingWorkflow({
      settings,
      addTranscription,
      onTranscriptionAdded: setSelectedTranscription,
    });

  const {
    openNoteIds,
    activeNoteId,
    setActiveNoteId,
    handleCreateNote,
    handleOpenNote,
    handleCloseNoteTab,
    handleDeleteNote,
  } = useNotesWorkflow({
    createNote,
    deleteNote,
    notes,
    notesLoaded: !notesLoading,
  });

  const handleOpenNoteFromSidebar = useCallback(
    (note: NoteMeta) => {
      handleOpenNote(note);
      setActiveTab("notes");
    },
    [handleOpenNote],
  );

  const handleCreateNoteFromSidebar = useCallback(
    async (folderId: string | null = null) => {
      await handleCreateNote(folderId);
      setActiveTab("notes");
    },
    [handleCreateNote],
  );

  // Recreate a note from a broken note-link: create + seed with the linked
  // title. Does NOT open a tab — the editor flushes the source note first
  // then calls `handleOpenNote` via the `onOpenNoteInTab` prop.
  const handleRecreateLinkedNote = useCallback(
    async (title: string): Promise<string> => {
      const meta = await createNote(null);
      const safeTitle = title
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      await updateNote(meta.id, `<h1>${safeTitle}</h1><p></p>`, title || meta.title);
      return meta.id;
    },
    [createNote, updateNote],
  );

  const handleOpenNoteInTabById = useCallback(
    (id: string) => {
      const note = notes.find((n) => n.id === id);
      if (note) {
        handleOpenNote(note);
      } else {
        // Fallback for freshly-created notes that haven't propagated to the
        // `notes` array yet — synthesize a minimal meta so the tab opens
        // immediately; the list will refresh on the next tick.
        handleOpenNote({
          id,
          title: "",
          createdAt: "",
          updatedAt: "",
          favorite: false,
          order: 0,
        });
      }
    },
    [notes, handleOpenNote],
  );

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const handleDelete = async (id: string) => {
    if (selectedTranscription?.id === id) {
      setSelectedTranscription(null);
    }
    await deleteTranscription(id);
  };

  const handleClearAll = async () => {
    setSelectedTranscription(null);
    await clearHistory();
  };

  const handleSelectTranscription = useCallback((transcription: Transcription) => {
    setSelectedTranscription(transcription);
    setIsSidebarOpen(true);
  }, []);

  const handleCloseDetails = useCallback(() => {
    setIsSidebarOpen(false);
  }, []);

  // Keep `selectedTranscription` in sync with the history: default to the
  // most recent entry, drop the selection if its row was deleted, and clear
  // it when the history becomes empty.
  useEffect(() => {
    if (!transcriptions.length) {
      if (selectedTranscription !== null) {
        setSelectedTranscription(null);
      }
      return;
    }

    if (!selectedTranscription) {
      setSelectedTranscription(transcriptions[0]);
      return;
    }

    const stillExists = transcriptions.some(
      (item) => item.id === selectedTranscription.id,
    );

    if (!stillExists) {
      setSelectedTranscription(transcriptions[0]);
    }
  }, [transcriptions, selectedTranscription]);

  return (
    <div className="h-screen flex overflow-hidden bg-background">
      <DashboardSidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={() => setSidebarCollapsed(!sidebarCollapsed)}
        notes={notes}
        folders={folders}
        activeNoteId={activeNoteId}
        onOpenNote={handleOpenNoteFromSidebar}
        onCreateNote={handleCreateNoteFromSidebar}
        onToggleFavorite={toggleFavorite}
        onDeleteNote={handleDeleteNote}
        searchNotes={searchNotes}
        onCreateFolder={createFolder}
        onRenameFolder={async (id, name) => { await renameFolder(id, name); }}
        onDeleteFolder={deleteFolder}
        onReorderFolders={reorderFolders}
        onReorderNotes={reorderNotesInFolder}
        onMoveNote={moveNoteToFolder}
        activeSettingsSection={activeSettingsSection}
        onSettingsSectionChange={setActiveSettingsSection}
      />

      {/* Main area */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <DashboardHeader
          isRecording={isRecording}
          isTranscribing={isTranscribing}
          onToggleRecording={handleToggleRecording}
          updateAvailable={updateAvailable}
          onUpdateClick={() => setShowUpdateModal(true)}
        />

        <SelectedModelMissingBanner
          onGoToSettings={() => {
            setActiveTab("parametres");
            setActiveSettingsSection("section-transcription");
          }}
        />

        <main className="flex-1 overflow-hidden">
          {activeTab === "notes" && openNoteIds.length > 0 ? (
            <NotesEditor
              notes={notes}
              openNotes={notes.filter((n) => openNoteIds.includes(n.id))}
              activeNoteId={activeNoteId}
              folders={folders}
              onActivateNote={setActiveNoteId}
              onOpenNoteInTab={handleOpenNoteInTabById}
              onCloseNote={handleCloseNoteTab}
              onDeleteNote={handleDeleteNote}
              onUpdateNote={updateNote}
              onCreateNote={() => handleCreateNoteFromSidebar(null)}
              onRecreateLinkedNote={handleRecreateLinkedNote}
              onCopyContent={handleCopy}
              onMoveNote={moveNoteToFolder}
              onCreateFolder={createFolder}
              apiKey={settings.openai_api_key}
              readNote={readNote}
            />
          ) : activeTab === "notes" ? (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              {t('dashboard.emptyNotes')}
            </div>
          ) : (
            <div className="overflow-y-auto h-full">
              <div className="container mx-auto px-6 py-8">
                {activeTab === "historique" && (
                  <HistoriqueTab
                    transcriptions={transcriptions}
                    selectedTranscription={selectedTranscription}
                    isSidebarOpen={isSidebarOpen}
                    onSelectTranscription={handleSelectTranscription}
                    onCloseDetails={handleCloseDetails}
                    onCopy={handleCopy}
                    onDelete={handleDelete}
                    onClearAll={handleClearAll}
                  />
                )}

                {activeTab === "parametres" && (
                  <Card className="p-6">
                    <SettingTabs activeSection={activeSettingsSection} />
                  </Card>
                )}

                {activeTab === "logs" && (
                  <Card className="p-6">
                    <LogsTab logs={logs} onClearLogs={clearLogs} />
                  </Card>
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      <UpdateModal
        open={showUpdateModal}
        onOpenChange={setShowUpdateModal}
        onViewDetails={() => setActiveTab("parametres")}
      />

      {showOnboarding && <OnboardingWizard onComplete={recheckOnboarding} />}
    </div>
  );
}
