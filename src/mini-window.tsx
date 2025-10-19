import { useEffect, useMemo, useState } from "react"
import ReactDOM from "react-dom/client"
import { listen, emit } from "@tauri-apps/api/event"
import "./App.css"

function MiniWindow() {
  const [audioLevel, setAudioLevel] = useState(0)
  const [isRecording, setIsRecording] = useState(false)
  const barModifiers = useMemo(
    () => Array.from({ length: 16 }, () => 0.7 + Math.random() * 0.3),
    []
  )

  useEffect(() => {
    const rootEl = document.documentElement
    const bodyEl = document.body
    const previousRootBg = rootEl.style.backgroundColor
    const previousBodyBg = bodyEl.style.backgroundColor

    bodyEl.classList.add("mini-window-body")
    rootEl.style.backgroundColor = "transparent"
    bodyEl.style.backgroundColor = "transparent"

    return () => {
      bodyEl.classList.remove("mini-window-body")
      if (previousRootBg) {
        rootEl.style.backgroundColor = previousRootBg
      } else {
        rootEl.style.removeProperty("background-color")
      }

      if (previousBodyBg) {
        bodyEl.style.backgroundColor = previousBodyBg
      } else {
        bodyEl.style.removeProperty("background-color")
      }
    }
  }, [])

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

  const bars = useMemo(() => {
    const BAR_COUNT = barModifiers.length
    const MIN_HEIGHT = 6
    const MAX_HEIGHT = 36
    const AMPLIFICATION = 2.4

    return Array.from({ length: BAR_COUNT }).map((_, i) => {
      const delay = i * 0.03
      const modifier = barModifiers[i]
      const easedLevel = Math.pow(Math.min(audioLevel * AMPLIFICATION, 1.0), 0.75)
      const dynamicHeight = easedLevel * (MAX_HEIGHT - MIN_HEIGHT) * modifier + MIN_HEIGHT
      const height = isRecording ? dynamicHeight : MIN_HEIGHT

      const color = isRecording
        ? `linear-gradient(180deg, rgba(248, 113, 113, 0.95) 0%, rgba(248, 113, 113, 0.6) 100%)`
        : `linear-gradient(180deg, rgba(148, 163, 184, 0.4) 0%, rgba(148, 163, 184, 0.2) 100%)`

      return (
        <div
          key={i}
          className="rounded-full transition-all duration-150 ease-out"
          style={{
            width: "3px",
            height: `${height}px`,
            backgroundImage: color,
            transitionDelay: `${delay}s`,
          }}
        />
      )
    })
  }, [audioLevel, barModifiers, isRecording])

  return (
    <div className="dark flex min-h-screen w-full items-center justify-center bg-transparent">
      <div className="mini-shell flex items-center gap-3">
        <span
          className={`h-2.5 w-2.5 rounded-full ${isRecording ? "bg-red-400 animate-pulse" : "bg-slate-500/70"}`}
        />
        <div className="flex items-end gap-[3px] h-9">
          {bars}
        </div>
      </div>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <MiniWindow />
)
