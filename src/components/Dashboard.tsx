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
    createNote,
    readNote,
    updateNote,
    deleteNote,
    searchNotes,
    toggleFavorite,
  } = useNotes();
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
  } = useNotesWorkflow({ createNote, deleteNote });

  const handleOpenNoteFromSidebar = useCallback(
    (note: NoteMeta) => {
      handleOpenNote(note);
      setActiveTab("notes");
    },
    [handleOpenNote],
  );

  const handleCreateNoteFromSidebar = useCallback(async () => {
    await handleCreateNote();
    setActiveTab("notes");
  }, [handleCreateNote]);

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
        activeNoteId={activeNoteId}
        onOpenNote={handleOpenNoteFromSidebar}
        onCreateNote={handleCreateNoteFromSidebar}
        onToggleFavorite={toggleFavorite}
        onDeleteNote={handleDeleteNote}
        searchNotes={searchNotes}
        activeSettingsSection={activeSettingsSection}
        onSettingsSectionChange={setActiveSettingsSection}
      />

      {/* Main area */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <DashboardHeader
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
              openNotes={notes.filter((n) => openNoteIds.includes(n.id))}
              activeNoteId={activeNoteId}
              onActivateNote={setActiveNoteId}
              onCloseNote={handleCloseNoteTab}
              onDeleteNote={handleDeleteNote}
              onUpdateNote={updateNote}
              onCreateNote={handleCreateNoteFromSidebar}
              onCopyContent={handleCopy}
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
                    isRecording={isRecording}
                    isTranscribing={isTranscribing}
                    onToggleRecording={handleToggleRecording}
                    hideRecordingPanel={settings.hide_recording_panel}
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
