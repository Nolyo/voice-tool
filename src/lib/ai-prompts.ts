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

const SUFFIX = "\nRetourne uniquement le texte traité, sans explication ni commentaire.";

export const AI_ACTIONS: AiActionGroup[] = [
  {
    label: "Traduire (FR ↔ EN)",
    actions: [
      {
        id: "traduire",
        label: "Traduire (FR ↔ EN)",
        systemPrompt:
          "Tu es un traducteur professionnel. Si le texte est en français, traduis-le en anglais. Si le texte est en anglais, traduis-le en français. Conserve le ton et le style du texte original." +
          SUFFIX,
      },
    ],
  },
  {
    label: "Améliorer",
    subActions: [
      {
        id: "ameliorer_mail",
        label: "Pour un mail",
        systemPrompt:
          "Tu es un assistant d'écriture. Améliore ce texte pour un email professionnel. Garde le même sens et le même ton général, en rendant le texte plus clair et structuré." +
          SUFFIX,
      },
      {
        id: "ameliorer_message",
        label: "Pour un message",
        systemPrompt:
          "Tu es un assistant d'écriture. Améliore ce texte pour un message informel (chat, SMS). Garde le même sens en rendant le texte plus fluide et naturel." +
          SUFFIX,
      },
      {
        id: "ameliorer_formel",
        label: "Ton formel",
        systemPrompt:
          "Tu es un assistant d'écriture. Améliore ce texte en adoptant un ton formel et soutenu, adapté à un contexte officiel ou administratif. Garde le même sens." +
          SUFFIX,
      },
    ],
  },
  {
    label: "Corriger",
    actions: [
      {
        id: "corriger",
        label: "Corriger",
        systemPrompt:
          "Tu es un correcteur orthographique et grammatical. Corrige toutes les fautes d'orthographe, de grammaire et de ponctuation dans ce texte sans changer le style ni le sens." +
          SUFFIX,
      },
    ],
  },
  {
    label: "Résumer",
    actions: [
      {
        id: "resumer",
        label: "Résumer",
        systemPrompt:
          "Tu es un assistant. Résume ce texte de manière concise en gardant les points essentiels et les informations clés." +
          SUFFIX,
      },
    ],
  },
  {
    label: "Reformuler",
    actions: [
      {
        id: "reformuler",
        label: "Reformuler",
        systemPrompt:
          "Tu es un assistant d'écriture. Reformule ce texte différemment tout en gardant exactement le même sens. Utilise des synonymes et une structure de phrase différente." +
          SUFFIX,
      },
    ],
  },
];

export function getCustomPrompt(userPrompt: string): string {
  return userPrompt + SUFFIX;
}
