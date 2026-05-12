import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/lib/supabase";
import { notesAssistCloud } from "@/lib/cloud/api";
import { CloudApiError } from "@/lib/cloud/errors";

export type AiProcessState = "idle" | "loading" | "preview" | "error";

/**
 * Cloud-only AI helper used by the Notes editor bubble menu. Authenticates
 * with the user's Supabase session JWT and routes through the managed worker
 * (no BYOK). The bubble menu UI is responsible for gating itself on
 * `useCloud().isCloudEligible`; this hook still surfaces clear errors when a
 * call lands on the worker without an active trial / subscription.
 */
export function useAiProcess() {
  const { t } = useTranslation();
  const [state, setState] = useState<AiProcessState>("idle");
  const [result, setResult] = useState("");
  const [error, setError] = useState("");

  const processText = useCallback(
    async (text: string, systemPrompt: string) => {
      if (!text.trim()) {
        return;
      }

      setState("loading");
      setError("");

      try {
        const { data } = await supabase.auth.getSession();
        const jwt = data.session?.access_token;
        if (!jwt) {
          setState("error");
          setError(t("cloud:errors.signin_required"));
          return;
        }

        const response = await notesAssistCloud({
          systemPrompt,
          userText: text,
          jwt,
        });
        setResult(response.text);
        setState("preview");
      } catch (e) {
        setState("error");
        if (e instanceof CloudApiError) {
          if (e.isQuotaIssue()) {
            setError(t("cloud:errors.quota_exhausted"));
          } else if (e.isAuthIssue()) {
            setError(t("cloud:errors.auth_expired"));
          } else if (e.isProviderUnavailable()) {
            setError(t("cloud:errors.provider_unavailable"));
          } else {
            setError(e.message || t("errors.aiProcessError"));
          }
        } else {
          setError(typeof e === "string" ? e : t("errors.aiProcessError"));
        }
      }
    },
    [t],
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
