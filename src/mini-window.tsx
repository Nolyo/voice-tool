import { useEffect, useState } from "react"
import ReactDOM from "react-dom/client"
import { listen, emit } from "@tauri-apps/api/event"
import "./App.css"

function MiniWindow() {
  const [audioLevel, setAudioLevel] = useState(0)
  const [isRecording, setIsRecording] = useState(false)

  useEffect(() => {
    let unlistenAudioFn: (() => void) | null = null
    let unlistenRecordingFn: (() => void) | null = null

    // Setup listeners asynchronously
    const setupListeners = async () => {
      try {
        // Listen to audio level events
        unlistenAudioFn = await listen<number>("audio-level", (event) => {
          setAudioLevel(event.payload)
        })

        // Listen to recording state changes
        unlistenRecordingFn = await listen<boolean>("recording-state", (event) => {
          setIsRecording(event.payload)
        })

        // Notify backend we're ready
        await emit("mini-window-ready", {})
      } catch (e) {
        console.error("Failed to setup listeners:", e)
      }
    }

    setupListeners()

    return () => {
      if (unlistenAudioFn) unlistenAudioFn()
      if (unlistenRecordingFn) unlistenRecordingFn()
    }
  }, [])

  return (
    <div className="dark min-h-screen bg-black/90 backdrop-blur-sm flex flex-col items-center justify-center p-2">
      <div className="flex items-center gap-1.5">
        {Array.from({ length: 12 }).map((_, i) => {
          // Create a wave effect with slight delay per bar
          const delay = i * 0.05
          const randomFactor = 0.7 + Math.random() * 0.3
          const minHeight = 15
          const maxHeight = 60 // Increased from 50
          // Amplify the audio level even more for visualization
          const amplifiedLevel = Math.min(audioLevel * 2, 1.0)
          const height = isRecording
            ? Math.max(minHeight, amplifiedLevel * maxHeight * randomFactor + minHeight)
            : minHeight

          return (
            <div
              key={i}
              className="w-3 rounded-full transition-all duration-100"
              style={{
                height: `${height}px`,
                backgroundColor: isRecording
                  ? `rgba(239, 68, 68, ${0.7 + amplifiedLevel * 0.3})`
                  : "rgba(100, 116, 139, 0.5)",
                transitionDelay: `${delay}s`,
              }}
            />
          )
        })}
      </div>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <MiniWindow />
)
