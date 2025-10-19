import { useEffect, useMemo, useState } from "react"
import ReactDOM from "react-dom/client"
import { listen, emit } from "@tauri-apps/api/event"
import "./App.css"

function MiniWindow() {
  const [audioLevel, setAudioLevel] = useState(0)
  const [isRecording, setIsRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const barModifiers = useMemo(
    () => Array.from({ length: 16 }, () => 0.7 + Math.random() * 0.3),
    []
  )

  // Timer for recording duration
  useEffect(() => {
    let interval: number | null = null

    if (isRecording) {
      setRecordingTime(0)
      interval = window.setInterval(() => {
        setRecordingTime((prev) => prev + 1)
      }, 1000)
    } else {
      setRecordingTime(0)
    }

    return () => {
      if (interval !== null) {
        clearInterval(interval)
      }
    }
  }, [isRecording])

  // Format time as MM:SS
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

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
    const MIN_HEIGHT = 4
    const MAX_HEIGHT = 28
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
            width: "2.5px",
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
        <div className="flex items-end gap-[2.5px] h-7">
          {bars}
        </div>
        {isRecording && (
          <span className="text-sm font-mono text-slate-300 tabular-nums">
            {formatTime(recordingTime)}
          </span>
        )}
      </div>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <MiniWindow />
)
