"use client"

import { useEffect, useRef } from "react"
import { listen } from "@tauri-apps/api/event"

interface AudioVisualizerProps {
  isRecording: boolean
  size?: number
}

export function AudioVisualizer({ isRecording, size = 120 }: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const audioLevelRef = useRef<number>(0)
  const animationFrameRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (!isRecording) {
      audioLevelRef.current = 0
      return
    }

    // Listen to audio level events from Rust backend
    const unlisten = listen<number>("audio-level", (event) => {
      audioLevelRef.current = event.payload
    })

    return () => {
      unlisten.then((fn) => fn())
    }
  }, [isRecording])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const draw = () => {
      const width = canvas.width
      const height = canvas.height
      const centerX = width / 2
      const centerY = height / 2

      // Clear canvas
      ctx.clearRect(0, 0, width, height)

      if (isRecording) {
        // Draw waveform bars that react to audio
        const numBars = 40
        const angleStep = (Math.PI * 2) / numBars
        const buttonRadius = size * 0.5 // Increased from 0.35 to be more visible
        const barWidth = 4
        const audioLevel = audioLevelRef.current

        for (let i = 0; i < numBars; i++) {
          const angle = i * angleStep - Math.PI / 2

          // Vary bar height based on audio level and some randomness for visual effect
          const baseHeight = 15 // Minimum visible size
          const maxHeight = size * 0.3 // Increased max height
          const randomFactor = 0.7 + Math.random() * 0.3
          const barHeight = baseHeight + (audioLevel * maxHeight * randomFactor)

          const x1 = centerX + Math.cos(angle) * buttonRadius
          const y1 = centerY + Math.sin(angle) * buttonRadius
          const x2 = centerX + Math.cos(angle) * (buttonRadius + barHeight)
          const y2 = centerY + Math.sin(angle) * (buttonRadius + barHeight)

          // Color intensity based on audio level - more vibrant
          const opacity = 0.6 + (audioLevel * 0.4)
          const red = 239
          const green = 68 + (audioLevel * 150)
          const blue = 68 + (audioLevel * 150)

          ctx.strokeStyle = `rgba(${red}, ${green}, ${blue}, ${opacity})`
          ctx.lineWidth = barWidth
          ctx.lineCap = "round"
          ctx.beginPath()
          ctx.moveTo(x1, y1)
          ctx.lineTo(x2, y2)
          ctx.stroke()
        }

        // Draw outer glow circle
        const glowRadius = buttonRadius + (audioLevel * size * 0.15)
        const gradient = ctx.createRadialGradient(centerX, centerY, buttonRadius, centerX, centerY, glowRadius)
        gradient.addColorStop(0, `rgba(239, 68, 68, ${audioLevel * 0.3})`)
        gradient.addColorStop(1, "rgba(239, 68, 68, 0)")

        ctx.fillStyle = gradient
        ctx.beginPath()
        ctx.arc(centerX, centerY, glowRadius, 0, Math.PI * 2)
        ctx.fill()
      } else {
        // Draw static circle when not recording
        const radius = size / 3

        ctx.fillStyle = "rgba(100, 116, 139, 0.2)"
        ctx.beginPath()
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2)
        ctx.fill()
      }

      animationFrameRef.current = requestAnimationFrame(draw)
    }

    draw()

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [isRecording, size])

  return (
    <canvas
      ref={canvasRef}
      width={size * 2}
      height={size * 2}
      style={{ width: size, height: size }}
      className="absolute inset-0 m-auto"
    />
  )
}
