import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

export type AiProcessState = "idle" | "loading" | "preview" | "error";

export function useAiProcess() {
  const [state, setState] = useState<AiProcessState>("idle");
  const [result, setResult] = useState("");
  const [error, setError] = useState("");

  const processText = useCallback(
    async (text: string, systemPrompt: string, apiKey: string) => {
      if (!apiKey.trim()) {
        setState("error");
        setError(
          "Clé API OpenAI non configurée. Configurez-la dans les paramètres.",
        );
        return;
      }

      if (!text.trim()) {
        return;
      }

      setState("loading");
      setError("");

      try {
        const response = await invoke<string>("ai_process_text", {
          apiKey,
          systemPrompt,
          userText: text,
        });
        setResult(response);
        setState("preview");
      } catch (e) {
        setState("error");
        setError(typeof e === "string" ? e : "Erreur lors du traitement.");
      }
    },
    [],
  );

  const accept = useCallback(() => {
    const text = result;
    setState("idle");
    setResult("");
    setError("");
    return text;
  }, [result]);

  const dismiss = useCallback(() => {
    setState("idle");
    setResult("");
    setError("");
  }, []);

  return { state, result, error, processText, accept, dismiss };
}
