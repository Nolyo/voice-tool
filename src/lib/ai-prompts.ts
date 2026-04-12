import i18n from "@/i18n";

export type AiActionId =
  | "traduire"
  | "ameliorer_mail"
  | "ameliorer_message"
  | "ameliorer_formel"
  | "corriger"
  | "resumer"
  | "reformuler"
  | "custom";

export interface AiAction {
  id: AiActionId;
  label: string;
  systemPrompt: string;
}

export interface AiActionGroup {
  label: string;
  actions?: AiAction[];
  subActions?: AiAction[];
}

function getSuffix(): string {
  return "\n" + i18n.t('ai.prompts.suffix');
}

export function getAI_ACTIONS(): AiActionGroup[] {
  const t = i18n.t;
  const SUFFIX = getSuffix();

  return [
    {
      label: t('ai.groups.translate'),
      actions: [
        {
          id: "traduire",
          label: t('ai.groups.translate'),
          systemPrompt: t('ai.prompts.translate') + SUFFIX,
        },
      ],
    },
    {
      label: t('ai.groups.improve'),
      subActions: [
        {
          id: "ameliorer_mail",
          label: t('ai.groups.improveMail'),
          systemPrompt: t('ai.prompts.improveMail') + SUFFIX,
        },
        {
          id: "ameliorer_message",
          label: t('ai.groups.improveMessage'),
          systemPrompt: t('ai.prompts.improveMessage') + SUFFIX,
        },
        {
          id: "ameliorer_formel",
          label: t('ai.groups.improveFormal'),
          systemPrompt: t('ai.prompts.improveFormal') + SUFFIX,
        },
      ],
    },
    {
      label: t('ai.groups.correct'),
      actions: [
        {
          id: "corriger",
          label: t('ai.groups.correct'),
          systemPrompt: t('ai.prompts.correct') + SUFFIX,
        },
      ],
    },
    {
      label: t('ai.groups.summarize'),
      actions: [
        {
          id: "resumer",
          label: t('ai.groups.summarize'),
          systemPrompt: t('ai.prompts.summarize') + SUFFIX,
        },
      ],
    },
    {
      label: t('ai.groups.rephrase'),
      actions: [
        {
          id: "reformuler",
          label: t('ai.groups.rephrase'),
          systemPrompt: t('ai.prompts.rephrase') + SUFFIX,
        },
      ],
    },
  ];
}

// Keep static reference for components that import AI_ACTIONS directly
export const AI_ACTIONS = getAI_ACTIONS();

export function getCustomPrompt(userPrompt: string): string {
  return userPrompt + getSuffix();
}
