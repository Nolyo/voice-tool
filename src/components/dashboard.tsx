"use client"

import { useState } from "react"
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

  const handleToggleRecording = () => {
    setIsRecording(!isRecording)
  }

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader />

      <div className="container mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            <RecordingCard isRecording={isRecording} onToggleRecording={handleToggleRecording} />

            <TranscriptionList
              transcriptions={transcriptions}
              selectedId={selectedTranscription?.id}
              onSelectTranscription={setSelectedTranscription}
              onCopy={handleCopy}
            />
          </div>

          {/* Sidebar - Details */}
          <div className="lg:col-span-1">
            <TranscriptionDetails transcription={selectedTranscription} onCopy={handleCopy} />
          </div>
        </div>
      </div>
    </div>
  )
}
