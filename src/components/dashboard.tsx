"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"
import { DashboardHeader } from "./dashboard-header"
import { RecordingCard } from "./recording-card"
import { TranscriptionList } from "./transcription-list"
import { TranscriptionDetails } from "./transcription-details"
import { useSettings } from "@/hooks/useSettings"
import { useTranscriptionHistory, type Transcription } from "@/hooks/useTranscriptionHistory"
import { useSoundEffects } from "@/hooks/useSoundEffects"

type TranscriptionInvokeResult = {
  text: string
  audioPath: string
}

export default function Dashboard() {
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [selectedTranscription, setSelectedTranscription] = useState<Transcription | null>(null)
  const { settings } = useSettings()
  const { playStart, playStop, playSuccess } = useSoundEffects(settings.enable_sounds)
  const {
    transcriptions,
    addTranscription,
    deleteTranscription,
    clearHistory
  } = useTranscriptionHistory()
  const previousRecordingRef = useRef(isRecording)

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  const handleDelete = async (id: string) => {
    // If deleting the selected transcription, deselect it
    if (selectedTranscription?.id === id) {
      setSelectedTranscription(null)
    }
    await deleteTranscription(id)
  }

  const handleClearAll = async () => {
    setSelectedTranscription(null)
    await clearHistory()
  }

  // Function to transcribe audio (used by both button and keyboard shortcuts)
  const transcribeAudio = useCallback(async (audioData: number[], sampleRate: number) => {
    setIsTranscribing(true)
    try {
      const result = await invoke<TranscriptionInvokeResult>("transcribe_audio", {
        audioSamples: audioData,
        sampleRate: sampleRate,
        apiKey: settings.openai_api_key,
        language: settings.language,
        keepLast: settings.recordings_keep_last
      })

      console.log("Transcription:", result.text)

      // Add to history
      if (result.text && result.text.trim()) {
        await addTranscription(result.text, 'whisper', result.audioPath)
        playSuccess()
      }

      // Copy to clipboard and paste if enabled
      if (settings.paste_at_cursor && result.text) {
        // Use clipboard plugin to write text
        const { writeText } = await import("@tauri-apps/plugin-clipboard-manager")
        await writeText(result.text)

        // Simulate Ctrl+V
        await invoke("paste_text_to_active_window", { text: result.text })
      }
    } catch (error) {
      console.error("Transcription error:", error)
      alert(`Erreur de transcription: ${error}`)
    } finally {
      setIsTranscribing(false)
    }
  }, [settings, addTranscription, playSuccess])

  // Listen for audio captured from keyboard shortcuts
  useEffect(() => {
    const unlisten = listen<{ samples: number[], sampleRate: number }>("audio-captured", (event) => {
      console.log("Audio captured from keyboard shortcut")
      transcribeAudio(event.payload.samples, event.payload.sampleRate)
    })

    return () => {
      unlisten.then(fn => fn())
    }
  }, [transcribeAudio]) // Re-create listener when transcribeAudio changes

  useEffect(() => {
    const unlisten = listen<boolean>("recording-state", (event) => {
      setIsRecording(event.payload)
    })

    return () => {
      unlisten.then(fn => fn())
    }
  }, [])

  useEffect(() => {
    const previous = previousRecordingRef.current
    if (previous !== isRecording) {
      if (isRecording) {
        playStart()
      } else {
        playStop()
      }
    }
    previousRecordingRef.current = isRecording
  }, [isRecording, playStart, playStop])

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
            onDelete={handleDelete}
            onClearAll={handleClearAll}
          />
        </div>
      </div>
    </div>
  )
}
