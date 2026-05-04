import type { Env, AuthenticatedUser } from "./types";
import { chatCompletion, OpenAIError, type OpenAIModelTier } from "./openai";
import { getPromptTemplate, isValidTask } from "./prompts";
import { recordUsageEvent, fetchTrialStatus, fetchSubscriptionState } from "./usage";
import { errorResponse } from "./errors";

const MAX_INPUT_CHARS = 50_000;

interface PostProcessBody {
  task: string;
  text: string;
  language?: string;
  model_tier?: string;
}

export async function handlePostProcess(
  req: Request,
  env: Env,
  user: AuthenticatedUser,
): Promise<Response> {
  const idempotencyKey = req.headers.get("Idempotency-Key") ?? undefined;

  let body: PostProcessBody;
  try {
    body = (await req.json()) as PostProcessBody;
  } catch {
    return errorResponse("internal", "invalid JSON body");
  }

  if (!isValidTask(body.task)) {
    return errorResponse("internal", `unknown task: ${body.task}`);
  }
  if (typeof body.text !== "string" || !body.text.trim()) {
    return errorResponse("internal", "missing or empty 'text'");
  }
  if (body.text.length > MAX_INPUT_CHARS) {
    return errorResponse("audio_too_large", `text too long (max ${MAX_INPUT_CHARS} chars)`);
  }
  const tier: OpenAIModelTier = body.model_tier === "full" ? "full" : "mini";

  // Eligibility: post_process is gated by *any* of trial active OR active subscription.
  const trial = await fetchTrialStatus(env, user.user_id);
  const sub = await fetchSubscriptionState(env, user.user_id);
  const eligible = trial.is_active || sub.status === "active";
  if (!eligible) {
    return errorResponse("quota_exhausted", "no active trial or subscription");
  }
  const source = trial.is_active ? "trial" : "quota";

  const template = getPromptTemplate(body.task);
  const userPrompt = template.buildUser(body.text, body.language);

  let result;
  try {
    result = await chatCompletion(template.system, userPrompt, env, tier);
  } catch (err) {
    if (err instanceof OpenAIError) {
      return errorResponse("provider_unavailable", `openai ${err.status}`);
    }
    throw err;
  }

  const totalTokens = result.tokens_in + result.tokens_out;
  const { event_id } = await recordUsageEvent(env, {
    user_id: user.user_id,
    kind: "post_process",
    units: totalTokens,
    units_unit: "tokens",
    model: result.model,
    provider: "openai",
    provider_request_id: result.request_id,
    idempotency_key: idempotencyKey,
    source,
  });

  return Response.json({
    text: result.text,
    tokens_in: result.tokens_in,
    tokens_out: result.tokens_out,
    request_id: event_id,
    source,
  });
}
