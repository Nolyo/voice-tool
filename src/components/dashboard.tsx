"use client"

import { useState } from "react"
import { invoke } from "@tauri-apps/api/core"
import { DashboardHeader } from "./dashboard-header"
import { RecordingCard } from "./recording-card"
import { TranscriptionList, type Transcription } from "./transcription-list"
import { TranscriptionDetails } from "./transcription-details"

export default function Dashboard() {
  const [isRecording, setIsRecording] = useState(false)
  const [selectedTranscription, setSelectedTranscription] = useState<Transcription | null>(null)

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

  const handleToggleRecording = async () => {
    try {
      if (isRecording) {
        // Stop recording
        const audioData = await invoke<number[]>("stop_recording")
        console.log("Audio data captured:", audioData.length, "samples")
        setIsRecording(false)
        // TODO: Process audio data (transcription)
      } else {
        // Start recording
        await invoke("start_recording", { deviceIndex: null })
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
            <RecordingCard isRecording={isRecording} onToggleRecording={handleToggleRecording} />
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
