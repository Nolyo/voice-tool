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
  const animationFrameRef = useRef<number>()

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
        // Calculate circle radius based on audio level
        const baseRadius = size / 3
        const maxPulse = size / 6
        const radius = baseRadius + audioLevelRef.current * maxPulse

        // Draw outer glow
        const gradient = ctx.createRadialGradient(centerX, centerY, radius * 0.5, centerX, centerY, radius * 1.2)
        gradient.addColorStop(0, "rgba(239, 68, 68, 0.4)")
        gradient.addColorStop(1, "rgba(239, 68, 68, 0)")

        ctx.fillStyle = gradient
        ctx.beginPath()
        ctx.arc(centerX, centerY, radius * 1.2, 0, Math.PI * 2)
        ctx.fill()

        // Draw main circle
        const mainGradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius)
        mainGradient.addColorStop(0, "rgba(239, 68, 68, 0.8)")
        mainGradient.addColorStop(1, "rgba(220, 38, 38, 0.6)")

        ctx.fillStyle = mainGradient
        ctx.beginPath()
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2)
        ctx.fill()

        // Draw waveform bars
        const numBars = 32
        const angleStep = (Math.PI * 2) / numBars
        const innerRadius = radius * 0.6
        const barWidth = 3

        for (let i = 0; i < numBars; i++) {
          const angle = i * angleStep - Math.PI / 2
          const barHeight = audioLevelRef.current * 20 * (0.5 + Math.random() * 0.5)

          const x1 = centerX + Math.cos(angle) * innerRadius
          const y1 = centerY + Math.sin(angle) * innerRadius
          const x2 = centerX + Math.cos(angle) * (innerRadius + barHeight)
          const y2 = centerY + Math.sin(angle) * (innerRadius + barHeight)

          ctx.strokeStyle = `rgba(255, 255, 255, ${0.3 + audioLevelRef.current})`
          ctx.lineWidth = barWidth
          ctx.lineCap = "round"
          ctx.beginPath()
          ctx.moveTo(x1, y1)
          ctx.lineTo(x2, y2)
          ctx.stroke()
        }
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
