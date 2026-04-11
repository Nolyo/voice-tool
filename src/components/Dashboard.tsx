"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, emit, type UnlistenFn } from "@tauri-apps/api/event";
import { toast } from "sonner";
import {
  History,
  NotebookPen,
  Settings2,
  ScrollText,
  PanelLeftClose,
  PanelLeftOpen,
  Mic,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DashboardHeader } from "./dashboard-header";
import { RecordingCard } from "./recording-card";
import { TranscriptionList } from "./transcription-list";
import { TranscriptionDetails } from "./transcription-details";
import { SettingTabs } from "./settings/SettingTabs";
import { LogsTab } from "./logs-tab";
import { NotesTab } from "./notes-tab";
import { useSettings } from "@/hooks/useSettings";
import {
  useTranscriptionHistory,
  type Transcription,
} from "@/hooks/useTranscriptionHistory";
import { useSoundEffects } from "@/hooks/useSoundEffects";
import { useNotes, type NoteMeta } from "@/hooks/useNotes";
import { useAppLogs } from "@/hooks/useAppLogs";
import { useUpdaterContext } from "@/contexts/UpdaterContext";
import { NotesEditor } from "./notes-editor";
import { UpdateModal } from "./update-modal";

const NAV_ITEMS = [
  { id: "historique", label: "Historique", icon: History },
  { id: "notes", label: "Notes", icon: NotebookPen },
  { id: "parametres", label: "Paramètres", icon: Settings2 },
  { id: "logs", label: "Logs", icon: ScrollText },
] as const;

type TranscriptionInvokeResult = {
  text: string;
  audioPath: string;
};

type RecordingResult = {
  audio_data: number[];
  sample_rate: number;
  avg_rms: number;
  is_silent: boolean;
};

export default function Dashboard() {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [selectedTranscription, setSelectedTranscription] =
    useState<Transcription | null>(null);
  const [activeTab, setActiveTab] = useState<string>("historique");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { settings } = useSettings();
  const { updateAvailable, showUpdateModal, setShowUpdateModal } =
    useUpdaterContext();
  const { playStart, playStop, playSuccess } = useSoundEffects(
    settings.enable_sounds,
  );
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
  const [editorOpen, setEditorOpen] = useState(false);
  const [openNoteIds, setOpenNoteIds] = useState<string[]>([]);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const previousRecordingRef = useRef(isRecording);

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

  const handleTranscriptionFinal = useCallback(
    async (
      text: string,
      provider: "whisper",
      audioPath?: string,
      apiCost?: number,
    ) => {
      const trimmed = text?.trim();
      if (!trimmed) {
        return null;
      }

      let finalText = trimmed;
      const snippetMatch = settings.snippets?.find(
        (s) => s.trigger.trim().toLowerCase() === trimmed.toLowerCase(),
      );
      if (snippetMatch) {
        finalText = snippetMatch.replacement;
      }

      const newEntry = await addTranscription(
        finalText,
        provider,
        audioPath,
        apiCost,
      );
      setSelectedTranscription(newEntry);
      playSuccess();

      if (settings.insertion_mode === "cursor") {
        await invoke("type_text_at_cursor", { text: finalText });
      } else if (settings.insertion_mode === "clipboard") {
        const { writeText } = await import(
          "@tauri-apps/plugin-clipboard-manager"
        );
        await writeText(finalText);
        await invoke("paste_text_to_active_window", { text: finalText });
      }

      return newEntry;
    },
    [addTranscription, playSuccess, settings.insertion_mode, settings.snippets],
  );

  const handleTranscriptionFinalRef = useRef(handleTranscriptionFinal);

  useEffect(() => {
    handleTranscriptionFinalRef.current = handleTranscriptionFinal;
  }, [handleTranscriptionFinal]);

  const transcribeAudio = useCallback(
    async (audioData: number[], sampleRate: number) => {
      setIsTranscribing(true);
      try {
        await emit("transcription-start");
        const result = await invoke<TranscriptionInvokeResult>(
          "transcribe_audio",
          {
            audioSamples: audioData,
            sampleRate: sampleRate,
            apiKey: settings.openai_api_key,
            language: settings.language,
            keepLast: settings.recordings_keep_last,
            provider: settings.transcription_provider,
            localModelSize: settings.local_model_size,
            dictionary: (settings.dictionary ?? []).join(", "),
            translate: settings.translate_mode,
          },
        );

        console.log("Transcription:", result.text);

        const durationSeconds = audioData.length / sampleRate;
        const durationMinutes = durationSeconds / 60;
        const apiCost =
          settings.transcription_provider === "Local"
            ? 0
            : durationMinutes * 0.006;

        await handleTranscriptionFinal(
          result.text,
          "whisper",
          result.audioPath,
          apiCost,
        );

        await emit("transcription-success", { text: result.text });
        await invoke("log_separator");
      } catch (error) {
        console.error("Transcription error:", error);
        await emit("transcription-error", { error: String(error) });
        alert(`Erreur de transcription: ${error}`);
        await invoke("log_separator");
      } finally {
        setIsTranscribing(false);
      }
    },
    [settings, handleTranscriptionFinal],
  );

  const transcribeAudioRef = useRef(transcribeAudio);

  useEffect(() => {
    transcribeAudioRef.current = transcribeAudio;
  }, [transcribeAudio]);

  useEffect(() => {
    let unlisten: UnlistenFn | null = null;
    let disposed = false;

    const setupListener = async () => {
      try {
        const listener = await listen<{
          samples: number[];
          sampleRate: number;
          avgRms: number;
          isSilent: boolean;
        }>("audio-captured", async (event) => {
          console.log(
            "Audio captured from keyboard shortcut",
            `(RMS: ${event.payload.avgRms.toFixed(4)}, silent: ${event.payload.isSilent})`,
          );

          if (event.payload.isSilent) {
            console.log("Enregistrement vide détecté, transcription annulée");
            toast.info("Aucun son détecté dans l'enregistrement", {
              description:
                "Le niveau sonore est trop faible pour être transcrit",
            });
            await emit("transcription-error", { error: "Son trop faible" });
            return;
          }

          const callback = transcribeAudioRef.current;
          if (callback) {
            callback(event.payload.samples, event.payload.sampleRate);
          }
        });

        if (disposed) {
          listener();
        } else {
          unlisten = listener;
        }
      } catch (error) {
        console.error("Failed to register audio-captured listener:", error);
      }
    };

    setupListener();

    return () => {
      disposed = true;
      if (unlisten) {
        unlisten();
        unlisten = null;
      }
    };
  }, []);

  useEffect(() => {
    const unlisten = listen<boolean>("recording-state", (event) => {
      setIsRecording(event.payload);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  useEffect(() => {
    const unlisten = listen("recording-cancelled", () => {
      toast.info("Enregistrement annulé");
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  useEffect(() => {
    let unlistenRecordingState: UnlistenFn | null = null;
    let previousState = false;

    const setupListeners = async () => {
      unlistenRecordingState = await listen<boolean>(
        "recording-state",
        async (event) => {
          const isRecording = event.payload;
          if (isRecording === previousState) return;
          previousState = isRecording;

        },
      );
    };

    setupListeners();

    return () => {
      if (unlistenRecordingState) unlistenRecordingState();
    };
  }, [settings.transcription_provider]);

  useEffect(() => {
    const previous = previousRecordingRef.current;
    if (previous !== isRecording) {
      if (isRecording) {
        playStart();
      } else {
        playStop();
      }
    }
    previousRecordingRef.current = isRecording;
  }, [isRecording, playStart, playStop]);

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

  const handleToggleRecording = async () => {
    try {
      if (isRecording) {
        const result = await invoke<RecordingResult>("stop_recording", {
          silenceThreshold: settings.silence_threshold,
        });

        console.log(
          "Audio data captured:",
          result.audio_data.length,
          "samples at",
          result.sample_rate,
          "Hz",
          `(RMS: ${result.avg_rms.toFixed(4)}, silent: ${result.is_silent})`,
        );
        setIsRecording(false);

        if (result.is_silent) {
          console.log("Enregistrement vide détecté, transcription annulée");
          toast.info("Aucun son détecté dans l'enregistrement", {
            description: "Le niveau sonore est trop faible pour être transcrit",
          });
          await emit("transcription-error", { error: "Son trop faible" });
          return;
        }

        if (result.audio_data.length > 0) {
          await transcribeAudio(result.audio_data, result.sample_rate);
        }
      } else {
        await invoke("start_recording", {
          deviceIndex: settings.input_device_index,
        });
        setIsRecording(true);
      }
    } catch (error) {
      console.error("Recording error:", error);
      alert(`Erreur d'enregistrement: ${error}`);
      setIsRecording(false);
      await emit("transcription-error", { error: String(error) });
    }
  };

  const handleCreateNote = async () => {
    const note = await createNote();
    setOpenNoteIds((prev) => [...prev, note.id]);
    setActiveNoteId(note.id);
    setEditorOpen(true);
  };

  const handleOpenNote = (note: NoteMeta) => {
    if (!openNoteIds.includes(note.id)) {
      setOpenNoteIds((prev) => [...prev, note.id]);
    }
    setActiveNoteId(note.id);
    setEditorOpen(true);
  };

  const handleCloseNoteTab = (id: string) => {
    const newIds = openNoteIds.filter((nid) => nid !== id);
    setOpenNoteIds(newIds);
    if (activeNoteId === id) {
      setActiveNoteId(newIds.length > 0 ? newIds[newIds.length - 1] : null);
    }
    if (newIds.length === 0) {
      setEditorOpen(false);
    }
  };

  const handleDeleteNote = async (id: string) => {
    handleCloseNoteTab(id);
    await deleteNote(id);
  };

  const handleUpdateClick = () => {
    setShowUpdateModal(true);
  };

  const handleViewUpdateDetails = () => {
    setActiveTab("parametres");
  };

  return (
    <div className="h-screen flex overflow-hidden bg-background">
      {/* Global sidebar */}
      <aside
        className={`flex flex-col border-r border-border shrink-0 transition-all duration-200 ${
          sidebarCollapsed ? "w-[52px]" : "w-[180px]"
        }`}
      >
        {/* Logo */}
        <div
          className={`flex items-center border-b border-border h-[61px] px-3 ${
            sidebarCollapsed ? "justify-center" : "gap-2"
          }`}
        >
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10 shrink-0">
            <Mic className="w-4 h-4 text-primary" />
          </div>
          {!sidebarCollapsed && (
            <span className="font-semibold text-sm truncate">Voice Tool</span>
          )}
        </div>

        {/* Nav items */}
        <nav className="flex flex-col gap-1 p-2 flex-1">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              title={sidebarCollapsed ? label : undefined}
              className={`flex items-center gap-3 rounded-md transition-colors cursor-pointer ${
                sidebarCollapsed ? "justify-center p-2" : "px-3 py-2"
              } ${
                activeTab === id
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {!sidebarCollapsed && (
                <span className="text-sm font-medium truncate">{label}</span>
              )}
            </button>
          ))}
        </nav>

        {/* Toggle button at bottom */}
        <div
          className={`p-2 border-t border-border ${
            sidebarCollapsed ? "flex justify-center" : "flex justify-end"
          }`}
        >
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground cursor-pointer"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            title={
              sidebarCollapsed ? "Déplier le menu" : "Replier le menu"
            }
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen className="w-4 h-4" />
            ) : (
              <PanelLeftClose className="w-4 h-4" />
            )}
          </Button>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <DashboardHeader
          updateAvailable={updateAvailable}
          onUpdateClick={handleUpdateClick}
        />

        <main className="flex-1 overflow-y-auto">
          <div className="container mx-auto px-6 py-8">
            {/* Historique */}
            {activeTab === "historique" && (
              <div className="space-y-6">
                {!settings.hide_recording_panel && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <RecordingCard
                      isRecording={isRecording}
                      isTranscribing={isTranscribing}
                      onToggleRecording={handleToggleRecording}
                    />
                    <TranscriptionDetails
                      transcription={selectedTranscription}
                      onCopy={handleCopy}
                    />
                  </div>
                )}
                <TranscriptionList
                  transcriptions={transcriptions}
                  selectedId={selectedTranscription?.id}
                  onSelectTranscription={setSelectedTranscription}
                  onCopy={handleCopy}
                  onDelete={handleDelete}
                  onClearAll={handleClearAll}
                />
              </div>
            )}

            {/* Notes */}
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

            {/* Paramètres */}
            {activeTab === "parametres" && (
              <Card className="p-6">
                <SettingTabs />
              </Card>
            )}

            {/* Logs */}
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
          onClose={() => setEditorOpen(false)}
          apiKey={settings.openai_api_key}
          readNote={readNote}
        />
      )}

      <UpdateModal
        open={showUpdateModal}
        onOpenChange={setShowUpdateModal}
        onViewDetails={handleViewUpdateDetails}
      />
    </div>
  );
}
