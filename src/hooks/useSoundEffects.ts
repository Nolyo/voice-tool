import { useCallback, useEffect, useMemo, useRef } from "react"

type SoundKey = "start" | "stop" | "success"

const SOUND_PATHS: Record<SoundKey, string> = {
  start: "/sounds/start_recording.wav",
  stop: "/sounds/stop_recording.wav",
  success: "/sounds/success.wav",
}

/**
 * Simple helper to play legacy sound effects when enabled in settings.
 */
export function useSoundEffects(enabled: boolean) {
  const audioMapRef = useRef<Record<SoundKey, HTMLAudioElement | null>>({
    start: null,
    stop: null,
    success: null,
  })

  useEffect(() => {
    const entries = Object.entries(SOUND_PATHS) as [SoundKey, string][]
    for (const [key, path] of entries) {
      const audio = new Audio(path)
      audio.preload = "auto"
      audioMapRef.current[key] = audio
    }

    return () => {
      for (const audio of Object.values(audioMapRef.current)) {
        if (audio) {
          audio.pause()
        }
      }
      audioMapRef.current = { start: null, stop: null, success: null }
    }
  }, [])

  const play = useCallback(
    (key: SoundKey) => {
      if (!enabled) {
        return
      }

      const audio = audioMapRef.current[key]
      if (!audio) {
        return
      }

      audio.pause()
      audio.currentTime = 0
      const maybePromise = audio.play()
      if (maybePromise && typeof maybePromise.catch === "function") {
        maybePromise.catch((err) => {
          console.warn(`Unable to play ${key} sound`, err)
        })
      }
    },
    [enabled],
  )

  const playStart = useCallback(() => play("start"), [play])
  const playStop = useCallback(() => play("stop"), [play])
  const playSuccess = useCallback(() => play("success"), [play])

  return useMemo(
    () => ({
      playStart,
      playStop,
      playSuccess,
    }),
    [playStart, playStop, playSuccess],
  )
}
