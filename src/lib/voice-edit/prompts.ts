import i18n from "@/i18n";

/**
 * Shared tail appended to every Voice Edit system prompt.
 *
 * Distinct from the one in `ai-prompts.ts`, which instructs the model to
 * preserve *Markdown*: Voice Edit operates on plain text captured from an
 * arbitrary Windows application, where Markdown syntax would be pasted back
 * verbatim as literal asterisks.
 */
function suffix(): string {
  return "\n" + i18n.t("voiceEdit.prompts.suffix");
}

/**
 * Automatic language toggle: foreign text goes to the primary language,
 * primary-language text goes to the secondary one. Detection is delegated to
 * the model — it already reads the text, and a client-side detector would be
 * one more dependency for a strictly worse result on short selections.
 *
 * `primary` and `secondary` are language *names* ("French"), not codes: the
 * model handles names more reliably than ISO codes in a natural-language
 * instruction.
 */
export function buildTranslatePrompt(primary: string, secondary: string): string {
  return i18n.t("voiceEdit.prompts.translate", { primary, secondary }) + suffix();
}

/**
 * Wrap a dictated instruction into a system prompt.
 *
 * Double quotes in the transcription are downgraded to single quotes so the
 * dictated text cannot close the quoted block and read as a new directive.
 * This is defence in depth, not a security boundary: the instruction and the
 * selection both come from the same user.
 */
export function buildInstructionPrompt(instruction: string): string {
  const sanitized = instruction.trim().replace(/["“”]/g, "'");
  return i18n.t("voiceEdit.prompts.instruction", { instruction: sanitized }) + suffix();
}
