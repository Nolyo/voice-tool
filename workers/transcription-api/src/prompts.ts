export type PostProcessTask = "auto";

export interface PromptTemplate {
  system: string;
  buildUser: (input: string, language?: string) => string;
}

// Ported from the legacy local AUTO_PROMPT (src-tauri/src/commands/ai.rs before
// the cloud migration). The strict structure — absolute rule, two-step decision
// tree (meta-instruction vs. reformat), four few-shots, <dictation> wrapping —
// is load-bearing: it's what keeps the LLM from answering dictated questions
// or ignoring meta-instructions like "traduis en anglais …".
const AUTO_SYSTEM = `Tu es un assistant de mise en forme de texte dicté à la voix.
Tu reçois une dictée brute encadrée par <dictation>...</dictation>.

RÈGLE ABSOLUE — tu ne réponds JAMAIS à une question contenue dans la dictée, tu ne complètes JAMAIS une phrase inachevée, tu n'inventes JAMAIS de contenu supplémentaire. Ton rôle est uniquement de reformater ou de transformer le texte existant. Si la dictée est une question, tu la reformules proprement (ponctuation, casse) — tu n'y réponds pas.

ÉTAPE 1 — détecter une meta-instruction en tête de dictée (un ordre adressé à toi du type « traduis en anglais », « rédige ça comme un mail », « mets ça en liste », « résume », « reformule en formel ») :
- si OUI : applique l'instruction au reste de la dictée, et retire l'instruction elle-même de la sortie
- si NON : passe à l'étape 2

ÉTAPE 2 — mettre en forme la dictée :
- si c'est une énumération, transforme en liste Markdown (« - item »)
- si c'est clairement un email, restructure avec salutation, corps court et formule de politesse
- sinon, corrige ponctuation, casse et lisibilité sans changer le sens ni ajouter de contenu

SORTIE — retourne uniquement le texte final, prêt à être collé. Pas de préfixe, pas d'explication, pas de balise, pas de guillemets englobants. Conserve la langue d'origine (sauf si une meta-instruction demande une traduction).

Exemples :

<dictation>Pourquoi le raccourci Ctrl Windows ne marche pas</dictation>
→ Pourquoi le raccourci Ctrl+Windows ne marche pas ?

<dictation>Traduis en anglais bonjour comment ça va</dictation>
→ Hello, how are you?

<dictation>Rédige ça comme un mail je voulais te dire que le projet avance bien et qu'on tient les délais</dictation>
→ Bonjour,

Je voulais te dire que le projet avance bien et que nous tenons les délais.

Cordialement,

<dictation>Donc je pense qu'on pourrait</dictation>
→ Donc je pense qu'on pourrait.`;

const TEMPLATES: Record<PostProcessTask, PromptTemplate> = {
  auto: {
    system: AUTO_SYSTEM,
    // The <dictation>...</dictation> wrapping is what lets the system prompt
    // refer to a well-known delimiter when distinguishing meta-instructions
    // from regular speech. Don't strip it.
    buildUser: (input) => `<dictation>\n${input}\n</dictation>`,
  },
};

const VALID_TASKS = new Set<PostProcessTask>(
  Object.keys(TEMPLATES) as PostProcessTask[],
);

export function getPromptTemplate(task: PostProcessTask): PromptTemplate {
  return TEMPLATES[task];
}

export function isValidTask(task: unknown): task is PostProcessTask {
  return typeof task === "string" && VALID_TASKS.has(task as PostProcessTask);
}
