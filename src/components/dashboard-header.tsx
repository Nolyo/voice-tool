"use client"

import { Mic, Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

interface DashboardHeaderProps {
  updateAvailable?: boolean;
  onUpdateClick?: () => void;
}

export function DashboardHeader({ updateAvailable, onUpdateClick }: DashboardHeaderProps) {
  return (
    <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
      <div className="container mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10">
              <Mic className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-foreground">Voice Tool</h1>
              <p className="text-xs text-muted-foreground">Transcription vocale intelligente</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {updateAvailable && (
              <Button
                variant="default"
                size="sm"
                onClick={onUpdateClick}
                className="bg-blue-600 hover:bg-blue-700 text-white gap-2"
              >
                <Download className="w-4 h-4" />
                <span>Nouvelle version disponible</span>
                <Badge variant="secondary" className="ml-1 bg-white/20 text-white border-0">
                  Nouveau
                </Badge>
              </Button>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
