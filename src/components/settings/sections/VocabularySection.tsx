import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSettings } from "@/hooks/useSettings";
import { useSync } from "@/hooks/useSync";
import {
  loadSnippets,
  upsertSnippet,
  softDeleteSnippet,
} from "@/lib/sync/snippets-store";
import {
  loadDictionary,
  addWord,
  removeWord,
} from "@/lib/sync/dictionary-store";
import type { LocalSnippet } from "@/lib/sync/types";
import { Row, SectionHeader, VtIcon } from "../vt";

const ACCENT = "oklch(0.72 0.17 295)";

// UI row type: persisted snippets have a real id; drafts (new rows not yet saved) have id === null.
interface SnippetRow {
  id: string | null;
  key: string; // stable React key, even before persistence
  label: string;
  content: string;
  shortcut: string | null;
}

export function VocabularySection() {
  const { t } = useTranslation();
  const { settings, updateSetting } = useSettings();
  const sync = useSync();

  const [rows, setRows] = useState<SnippetRow[]>([]);
  const [words, setWords] = useState<string[]>([]);
  const prompt = settings.whisper_initial_prompt ?? "";
  const wordCount = prompt.trim().split(/\s+/).filter(Boolean).length;

  const toRow = (s: LocalSnippet): SnippetRow => ({
    id: s.id,
    key: s.id,
    label: s.label,
    content: s.content,
    shortcut: s.shortcut,
  });

  const refresh = useCallback(async () => {
    const loaded = await loadSnippets();
    setRows(loaded.filter((s) => s.deleted_at === null).map(toRow));
    setWords((await loadDictionary()).words);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleFieldChange = (
    index: number,
    field: "trigger" | "replacement",
    value: string,
  ) => {
    setRows((prev) => {
      const next = [...prev];
      if (field === "trigger") {
        next[index] = { ...next[index], label: value, shortcut: value };
      } else {
        next[index] = { ...next[index], content: value };
      }
      return next;
    });
  };

  const persistRow = async (index: number) => {
    const row = rows[index];
    if (!row) return;
    // Skip empty drafts to avoid creating blank snippets on blur.
    if (!row.label.trim() && !row.content.trim()) return;
    const saved = await upsertSnippet({
      id: row.id ?? undefined,
      label: row.label,
      content: row.content,
      shortcut: row.shortcut,
    });
    // Replace the row in-place with persisted shape (now has stable id).
    setRows((prev) => {
      const next = [...prev];
      next[index] = { ...toRow(saved), key: prev[index].key };
      return next;
    });
    sync.notifySnippetUpserted(saved.id, saved.label, saved.content, saved.shortcut);
  };

  const handleAddSnippet = () => {
    setRows((prev) => [
      ...prev,
      {
        id: null,
        key: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        label: "",
        content: "",
        shortcut: null,
      },
    ]);
  };

  const handleDeleteSnippet = async (index: number) => {
    const row = rows[index];
    if (!row) return;
    if (row.id === null) {
      // Just remove the draft from local state — nothing persisted.
      setRows((prev) => prev.filter((_, i) => i !== index));
      return;
    }
    await softDeleteSnippet(row.id);
    setRows((prev) => prev.filter((_, i) => i !== index));
    sync.notifySnippetDeleted(row.id);
  };

  const handleAddWord = async (raw: string) => {
    const value = raw.trim();
    if (!value) return;
    if (words.includes(value)) return;
    await addWord(value);
    setWords((prev) => (prev.includes(value) ? prev : [...prev, value]));
    sync.notifyDictionaryUpserted(value);
  };

  const handleRemoveWord = async (word: string) => {
    await removeWord(word);
    setWords((prev) => prev.filter((w) => w !== word));
    sync.notifyDictionaryDeleted(word);
  };

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
            {rows.map((row, i) => (
              <div key={row.key} className="flex items-center gap-2">
                <input
                  value={row.label}
                  onChange={(e) => handleFieldChange(i, "trigger", e.target.value)}
                  onBlur={() => {
                    void persistRow(i);
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
                  value={row.content}
                  onChange={(e) => handleFieldChange(i, "replacement", e.target.value)}
                  onBlur={() => {
                    void persistRow(i);
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
                  onClick={() => {
                    void handleDeleteSnippet(i);
                  }}
                  className="w-9 h-9 rounded-md flex items-center justify-center"
                  style={{ color: "var(--vt-fg-3)" }}
                >
                  <VtIcon.close />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={handleAddSnippet}
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
              {words.map((w, i) => (
                <span
                  key={`${w}-${i}`}
                  className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[12.5px]"
                  style={{
                    background: "var(--vt-surface)",
                    border: "1px solid var(--vt-border)",
                  }}
                >
                  {w}
                  <button
                    type="button"
                    onClick={() => {
                      void handleRemoveWord(w);
                    }}
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
                if (value && !words.includes(value)) {
                  void handleAddWord(value);
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
