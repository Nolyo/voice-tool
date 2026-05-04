export type PostProcessTask = "reformulate" | "correct" | "email" | "summarize";

export interface PromptTemplate {
  system: string;
  buildUser: (input: string, language?: string) => string;
}

const langClause = (lang?: string) =>
  lang ? `\n\nLangue de réponse : ${lang}.` : "";

const TEMPLATES: Record<PostProcessTask, PromptTemplate> = {
  reformulate: {
    system:
      "Tu es un assistant qui reformule un texte pour le rendre plus clair, concis et naturel, en conservant strictement le sens et l'intention de l'auteur. Tu ne rajoutes ni ne retires d'information. Réponds avec uniquement le texte reformulé, sans préambule.",
    buildUser: (input, lang) =>
      `Texte à reformuler :\n\n${input}${langClause(lang)}`,
  },
  correct: {
    system:
      "Tu es un correcteur orthographique et grammatical. Tu corriges les fautes sans modifier le style ni le sens. Réponds avec uniquement le texte corrigé.",
    buildUser: (input, lang) =>
      `Texte à corriger :\n\n${input}${langClause(lang)}`,
  },
  email: {
    system:
      "Tu transformes une note dictée en un email professionnel concis et bien structuré. Tu inclus un objet pertinent, une formule d'appel adaptée et une formule de politesse. Réponds avec uniquement l'email final, format texte brut.",
    buildUser: (input, lang) =>
      `Note à transformer en email :\n\n${input}${langClause(lang)}`,
  },
  summarize: {
    system:
      "Tu résumes un texte en gardant l'essentiel, en 3-5 puces. Réponds avec uniquement les puces, format texte brut.",
    buildUser: (input, lang) =>
      `Texte à résumer :\n\n${input}${langClause(lang)}`,
  },
};

// Set lookup, not `in` operator: avoids prototype-chain hits like "toString".
const VALID_TASKS = new Set<PostProcessTask>([
  "reformulate",
  "correct",
  "email",
  "summarize",
]);

export function getPromptTemplate(task: PostProcessTask): PromptTemplate {
  return TEMPLATES[task];
}

export function isValidTask(task: unknown): task is PostProcessTask {
  return typeof task === "string" && VALID_TASKS.has(task as PostProcessTask);
}
