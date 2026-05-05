import type { Env } from "./types";

const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";

export type OpenAIModelTier = "mini" | "full";

const MODEL_BY_TIER: Record<OpenAIModelTier, string> = {
  mini: "gpt-4o-mini",
  full: "gpt-4o",
};

export interface OpenAIChatResult {
  text: string;
  tokens_in: number;
  tokens_out: number;
  model: string;
  request_id?: string;
}

export class OpenAIError extends Error {
  constructor(message: string, public status: number, public retryable: boolean) {
    super(message);
    this.name = "OpenAIError";
  }
}

export async function chatCompletion(
  systemPrompt: string,
  userPrompt: string,
  env: Env,
  tier: OpenAIModelTier = "mini",
): Promise<OpenAIChatResult> {
  const model = MODEL_BY_TIER[tier];
  const res = await fetch(OPENAI_CHAT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
    }),
  });

  const requestId = res.headers.get("x-request-id") ?? undefined;

  if (!res.ok) {
    const text = await res.text().catch(() => "<no body>");
    const retryable = res.status >= 500 || res.status === 429;
    throw new OpenAIError(`openai ${res.status}: ${text.slice(0, 256)}`, res.status, retryable);
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };

  const text = json.choices?.[0]?.message?.content;
  const tokens_in = json.usage?.prompt_tokens;
  const tokens_out = json.usage?.completion_tokens;

  if (typeof text !== "string" || typeof tokens_in !== "number" || typeof tokens_out !== "number") {
    throw new OpenAIError("malformed openai response", 502, true);
  }

  return { text, tokens_in, tokens_out, model, request_id: requestId };
}
