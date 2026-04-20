import { useTranslation } from "react-i18next";
import { useSettings } from "@/hooks/useSettings";
import { Row, SectionHeader, VtIcon } from "../vt";

const ACCENT = "oklch(0.72 0.17 295)";

export function VocabularySection() {
  const { t } = useTranslation();
  const { settings, updateSetting } = useSettings();

  const snippets = settings.snippets ?? [];
  const dict = settings.dictionary ?? [];
  const prompt = settings.whisper_initial_prompt ?? "";
  const wordCount = prompt.trim().split(/\s+/).filter(Boolean).length;

  const icon = (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 4h12a4 4 0 0 1 0 8H4z" />
      <path d="M4 12h14a4 4 0 0 1 0 8H4z" />
    </svg>
  );

  return (
    <div className="vt-fade-up space-y-5">
      <div className="vt-card-sectioned" style={{ overflow: "hidden" }}>
        <SectionHeader
          color={ACCENT}
          icon={icon}
          title={t("settings.vocabulary.title")}
          description={t("settings.vocabulary.subtitle")}
        />

        <Row
          label={t("settings.vocabulary.snippets")}
          hint={t("settings.vocabulary.snippetsDesc")}
          align="start"
        >
          <div className="space-y-2">
            {snippets.map((snippet, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  value={snippet.trigger}
                  onChange={(e) => {
                    const n = [...snippets];
                    n[i] = { ...n[i], trigger: e.target.value };
                    updateSetting("snippets", n);
                  }}
                  placeholder={t("settings.vocabulary.triggerPlaceholder")}
                  className="vt-mono flex-1 h-9 px-3 rounded-md text-[12.5px]"
                  style={{
                    background: "var(--vt-surface)",
                    border: "1px solid var(--vt-border)",
                    color: "var(--vt-fg)",
                  }}
                />
                <span style={{ color: "var(--vt-fg-4)" }}>→</span>
                <input
                  value={snippet.replacement}
                  onChange={(e) => {
                    const n = [...snippets];
                    n[i] = { ...n[i], replacement: e.target.value };
                    updateSetting("snippets", n);
                  }}
                  placeholder={t("settings.vocabulary.replacementPlaceholder")}
                  className="h-9 px-3 rounded-md text-[13px]"
                  style={{
                    flex: "2",
                    background: "var(--vt-surface)",
                    border: "1px solid var(--vt-border)",
                    color: "var(--vt-fg)",
                  }}
                />
                <button
                  type="button"
                  onClick={() =>
                    updateSetting(
                      "snippets",
                      snippets.filter((_, j) => j !== i),
                    )
                  }
                  className="w-9 h-9 rounded-md flex items-center justify-center"
                  style={{ color: "var(--vt-fg-3)" }}
                >
                  <VtIcon.close />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                updateSetting("snippets", [
                  ...snippets,
                  { trigger: "", replacement: "" },
                ])
              }
              className="w-full h-9 rounded-md flex items-center justify-center gap-1.5 text-[12px] transition"
              style={{
                border: "1px dashed var(--vt-border-strong)",
                color: "var(--vt-fg-3)",
              }}
            >
              <VtIcon.plus />
              {t("settings.vocabulary.addSnippet")}
            </button>
          </div>
        </Row>

        <Row
          label={t("settings.vocabulary.dictionary")}
          hint={t("settings.vocabulary.dictionaryDesc")}
          align="start"
        >
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1.5 min-h-[32px]">
              {dict.map((w, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[12.5px]"
                  style={{
                    background: "var(--vt-surface)",
                    border: "1px solid var(--vt-border)",
                  }}
                >
                  {w}
                  <button
                    type="button"
                    onClick={() =>
                      updateSetting(
                        "dictionary",
                        dict.filter((_, j) => j !== i),
                      )
                    }
                    style={{ color: "var(--vt-fg-4)" }}
                  >
                    <VtIcon.close />
                  </button>
                </span>
              ))}
            </div>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const input = e.currentTarget.elements.namedItem(
                  "dict-word",
                ) as HTMLInputElement;
                const value = input.value.trim();
                if (value && !dict.includes(value)) {
                  updateSetting("dictionary", [...dict, value]);
                  input.value = "";
                }
              }}
            >
              <input
                name="dict-word"
                placeholder={t("settings.vocabulary.addWordPlaceholder")}
                className="flex-1 h-9 px-3 rounded-md text-[13px]"
                style={{
                  background: "var(--vt-surface)",
                  border: "1px solid var(--vt-border)",
                  color: "var(--vt-fg)",
                }}
              />
              <button type="submit" className="vt-btn">
                <VtIcon.plus />
                {t("settings.vocabulary.addWord")}
              </button>
            </form>
          </div>
        </Row>

        <Row
          label={t("settings.vocabulary.initialPrompt")}
          hint={t("settings.vocabulary.initialPromptDesc")}
          align="start"
        >
          <div
            className="rounded-lg overflow-hidden"
            style={{
              border: "1px solid var(--vt-border)",
              background: "var(--vt-surface)",
            }}
          >
            <textarea
              value={prompt}
              onChange={(e) => updateSetting("whisper_initial_prompt", e.target.value)}
              placeholder={t("settings.vocabulary.initialPromptPlaceholder")}
              className="w-full p-3 bg-transparent focus:outline-none text-[13px] resize-none"
              rows={4}
              style={{ color: "var(--vt-fg)" }}
            />
            <div
              className="flex items-center justify-between px-3 py-1.5 border-t"
              style={{ borderColor: "var(--vt-border)" }}
            >
              <span className="text-[11px]" style={{ color: "var(--vt-fg-4)" }}>
                {t("settings.vocabulary.initialPromptHint", {
                  defaultValue: "Max ~200 tokens recommandé.",
                })}
              </span>
              <span
                className="vt-mono text-[11px]"
                style={{ color: "var(--vt-fg-3)" }}
              >
                {t("settings.vocabulary.initialPromptWordCount", { count: wordCount })}
              </span>
            </div>
          </div>
        </Row>
      </div>
    </div>
  );
}
