import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";

export type AiProcessState = "idle" | "loading" | "preview" | "error";

export function useAiProcess() {
  const { t } = useTranslation();
  const [state, setState] = useState<AiProcessState>("idle");
  const [result, setResult] = useState("");
  const [error, setError] = useState("");

  const processText = useCallback(
    async (text: string, systemPrompt: string, apiKey: string) => {
      if (!apiKey.trim()) {
        setState("error");
        setError(t('errors.apiKeyNotConfigured'));
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
        setError(typeof e === "string" ? e : t('errors.aiProcessError'));
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
