import { useDeepgramStreaming } from "@/hooks/useDeepgramStreaming";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

export function TranscriptionLive() {
  const { interimText, finalText, currentUtterance, isConnected, error } = useDeepgramStreaming();

  // Don't render if not connected and no text
  if (!isConnected && !finalText && !currentUtterance && !interimText) {
    return null;
  }

  // Combine completed utterances (finalText) with current utterance being built
  const displayText = finalText && currentUtterance
    ? `${finalText} ${currentUtterance}`
    : finalText || currentUtterance;

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${
              isConnected ? "bg-green-500 animate-pulse" : "bg-gray-400"
            }`}
          />
          <span className="text-sm font-medium">
            {isConnected ? "Transcription en temps réel" : "Déconnecté"}
          </span>
        </CardTitle>
      </CardHeader>

      <CardContent className="min-h-[120px] space-y-3">
        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-sm text-red-900 dark:text-red-100">
              <strong>Erreur:</strong> {error}
            </p>
          </div>
        )}

        {/* Interim text (partial, gray, italic) */}
        {interimText && (
          <p className="text-base text-gray-500 dark:text-gray-400 italic transition-opacity duration-200">
            {interimText}
          </p>
        )}

        {/* Final text (confirmed, white, bold) - shows accumulated + current utterance */}
        {displayText && (
          <p className="text-lg font-medium text-gray-900 dark:text-white leading-relaxed">
            {displayText}
          </p>
        )}

        {/* Placeholder when nothing */}
        {!interimText && !displayText && !error && (
          <p className="text-gray-400 dark:text-gray-600 text-center py-8 italic">
            En attente de transcription...
          </p>
        )}
      </CardContent>
    </Card>
  );
}
