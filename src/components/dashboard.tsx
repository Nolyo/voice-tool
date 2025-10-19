"use client"

import { useState, useEffect } from "react"
import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"
import { DashboardHeader } from "./dashboard-header"
import { RecordingCard } from "./recording-card"
import { TranscriptionList, type Transcription } from "./transcription-list"
import { TranscriptionDetails } from "./transcription-details"
import { useSettings } from "@/hooks/useSettings"

export default function Dashboard() {
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [selectedTranscription, setSelectedTranscription] = useState<Transcription | null>(null)
  const { settings } = useSettings()

  // Sample data - replace with real data
  const transcriptions: Transcription[] = [
    {
      id: "1",
      date: "2025-10-17",
      time: "13:07:10",
      text: "Des applications, des bases de données, etc. C'est très moderne.",
    },
    {
      id: "2",
      date: "2025-10-17",
      time: "13:06:49",
      text: "C'est une application open source qui permet de gérer plusieurs services dans son site web.",
    },
    {
      id: "3",
      date: "2025-10-17",
      time: "13:06:09",
      text: "C'est une application open source qui permet.",
    },
  ]

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  // Function to transcribe audio (used by both button and keyboard shortcuts)
  const transcribeAudio = async (audioData: number[], sampleRate: number) => {
    setIsTranscribing(true)
    try {
      const transcription = await invoke<string>("transcribe_audio", {
        audioSamples: audioData,
        sampleRate: sampleRate,
        apiKey: settings.openai_api_key,
        language: settings.language,
        keepLast: settings.recordings_keep_last
      })

      console.log("Transcription:", transcription)

      // Copy to clipboard and paste if enabled
      if (settings.paste_at_cursor && transcription) {
        // Use clipboard plugin to write text
        const { writeText } = await import("@tauri-apps/plugin-clipboard-manager")
        await writeText(transcription)

        // Simulate Ctrl+V
        await invoke("paste_text_to_active_window", { text: transcription })
      }

      // TODO: Add to history
    } catch (error) {
      console.error("Transcription error:", error)
      alert(`Erreur de transcription: ${error}`)
    } finally {
      setIsTranscribing(false)
    }
  }

  // Listen for audio captured from keyboard shortcuts
  useEffect(() => {
    const unlisten = listen<{ samples: number[], sampleRate: number }>("audio-captured", (event) => {
      console.log("Audio captured from keyboard shortcut")
      transcribeAudio(event.payload.samples, event.payload.sampleRate)
    })

    return () => {
      unlisten.then(fn => fn())
    }
  }, [settings]) // Re-create listener when settings change

  const handleToggleRecording = async () => {
    try {
      if (isRecording) {
        // Stop recording
        const [audioData, sampleRate] = await invoke<[number[], number]>("stop_recording")
        console.log("Audio data captured:", audioData.length, "samples at", sampleRate, "Hz")
        setIsRecording(false)

        // Transcribe audio
        if (audioData.length > 0) {
          await transcribeAudio(audioData, sampleRate)
        }
      } else {
        // Start recording with selected device from settings
        await invoke("start_recording", { deviceIndex: settings.input_device_index })
        setIsRecording(true)
      }
    } catch (error) {
      console.error("Recording error:", error)
      alert(`Erreur d'enregistrement: ${error}`)
      setIsRecording(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader />

      <div className="container mx-auto px-6 py-8">
        <div className="space-y-6">
          {/* First row: Recording and Details side by side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <RecordingCard
              isRecording={isRecording}
              isTranscribing={isTranscribing}
              onToggleRecording={handleToggleRecording}
            />
            <TranscriptionDetails transcription={selectedTranscription} onCopy={handleCopy} />
          </div>

          {/* Second row: Transcription list full width */}
          <TranscriptionList
            transcriptions={transcriptions}
            selectedId={selectedTranscription?.id}
            onSelectTranscription={setSelectedTranscription}
            onCopy={handleCopy}
          />
        </div>
      </div>
    </div>
  )
}
