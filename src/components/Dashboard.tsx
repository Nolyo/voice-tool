"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { DashboardHeader } from "./common/DashboardHeader";
import {
  DashboardSidebar,
  type DashboardTabId,
} from "./dashboard/DashboardSidebar";
import { HistoriqueTab } from "./dashboard/tabs/HistoriqueTab";
import { SettingTabs } from "./settings/SettingTabs";
import { LogsTab } from "./logs-tab";
import { NotesTab } from "./notes-tab";
import { NotesEditor } from "./notes/NotesEditor/NotesEditor";
import { UpdateModal } from "./update-modal";
import { useSettings } from "@/hooks/useSettings";
import {
  useTranscriptionHistory,
  type Transcription,
} from "@/hooks/useTranscriptionHistory";
import { useNotes } from "@/hooks/useNotes";
import { useAppLogs } from "@/hooks/useAppLogs";
import { useUpdaterContext } from "@/contexts/UpdaterContext";
import { useRecordingWorkflow } from "@/hooks/useRecordingWorkflow";
import { useNotesWorkflow } from "@/hooks/useNotesWorkflow";

export default function Dashboard() {
  const [selectedTranscription, setSelectedTranscription] =
    useState<Transcription | null>(null);
  const [activeTab, setActiveTab] = useState<DashboardTabId>("historique");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const { settings } = useSettings();
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
    reloadNotes,
  } = useNotes();
  const { logs, clearLogs } = useAppLogs();

  const { isRecording, isTranscribing, handleToggleRecording } =
    useRecordingWorkflow({
      settings,
      addTranscription,
      onTranscriptionAdded: setSelectedTranscription,
    });

  const {
    editorOpen,
    openNoteIds,
    activeNoteId,
    setActiveNoteId,
    handleCreateNote,
    handleOpenNote,
    handleCloseNoteTab,
    handleDeleteNote,
    closeEditor,
  } = useNotesWorkflow({ createNote, deleteNote });

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
      />

      {/* Main area */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <DashboardHeader
          updateAvailable={updateAvailable}
          onUpdateClick={() => setShowUpdateModal(true)}
        />

        <main className="flex-1 overflow-y-auto">
          <div className="container mx-auto px-6 py-8">
            {activeTab === "historique" && (
              <HistoriqueTab
                isRecording={isRecording}
                isTranscribing={isTranscribing}
                onToggleRecording={handleToggleRecording}
                hideRecordingPanel={settings.hide_recording_panel}
                transcriptions={transcriptions}
                selectedTranscription={selectedTranscription}
                onSelectTranscription={setSelectedTranscription}
                onCopy={handleCopy}
                onDelete={handleDelete}
                onClearAll={handleClearAll}
              />
            )}

            {activeTab === "notes" && (
              <Card className="p-6">
                <NotesTab
                  notes={notes}
                  onCreateNote={handleCreateNote}
                  onOpenNote={handleOpenNote}
                  onDeleteNote={handleDeleteNote}
                  onToggleFavorite={toggleFavorite}
                  onReload={reloadNotes}
                  searchNotes={searchNotes}
                />
              </Card>
            )}

            {activeTab === "parametres" && (
              <Card className="p-6">
                <SettingTabs />
              </Card>
            )}

            {activeTab === "logs" && (
              <Card className="p-6">
                <LogsTab logs={logs} onClearLogs={clearLogs} />
              </Card>
            )}
          </div>
        </main>
      </div>

      {editorOpen && (
        <NotesEditor
          openNotes={notes.filter((n) => openNoteIds.includes(n.id))}
          activeNoteId={activeNoteId}
          onActivateNote={setActiveNoteId}
          onCloseNote={handleCloseNoteTab}
          onDeleteNote={handleDeleteNote}
          onUpdateNote={updateNote}
          onCreateNote={handleCreateNote}
          onCopyContent={handleCopy}
          onClose={closeEditor}
          apiKey={settings.openai_api_key}
          readNote={readNote}
        />
      )}

      <UpdateModal
        open={showUpdateModal}
        onOpenChange={setShowUpdateModal}
        onViewDetails={() => setActiveTab("parametres")}
      />
    </div>
  );
}
