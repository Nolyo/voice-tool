import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  NodeViewContent,
  NodeViewWrapper,
  type NodeViewProps,
} from "@tiptap/react";
import { ChevronDown } from "lucide-react";

/** Static subset of lowlight's `common` bundle, ordered developer-first.
 *  Kept static so we don't query lowlight at render time. */
const COMMON_LANGUAGES: { id: string; label: string }[] = [
  { id: "plaintext", label: "Plain text" },
  { id: "typescript", label: "TypeScript" },
  { id: "javascript", label: "JavaScript" },
  { id: "tsx", label: "TSX" },
  { id: "jsx", label: "JSX" },
  { id: "python", label: "Python" },
  { id: "rust", label: "Rust" },
  { id: "go", label: "Go" },
  { id: "java", label: "Java" },
  { id: "kotlin", label: "Kotlin" },
  { id: "swift", label: "Swift" },
  { id: "c", label: "C" },
  { id: "cpp", label: "C++" },
  { id: "csharp", label: "C#" },
  { id: "php", label: "PHP" },
  { id: "ruby", label: "Ruby" },
  { id: "bash", label: "Bash" },
  { id: "shell", label: "Shell" },
  { id: "powershell", label: "PowerShell" },
  { id: "sql", label: "SQL" },
  { id: "html", label: "HTML" },
  { id: "css", label: "CSS" },
  { id: "scss", label: "SCSS" },
  { id: "json", label: "JSON" },
  { id: "yaml", label: "YAML" },
  { id: "toml", label: "TOML" },
  { id: "xml", label: "XML" },
  { id: "markdown", label: "Markdown" },
  { id: "diff", label: "Diff" },
  { id: "dockerfile", label: "Dockerfile" },
  { id: "makefile", label: "Makefile" },
  { id: "ini", label: "INI" },
  { id: "lua", label: "Lua" },
  { id: "perl", label: "Perl" },
  { id: "scala", label: "Scala" },
];

export function CodeBlockLanguageSelect({
  node,
  updateAttributes,
}: NodeViewProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const current: string = (node.attrs.language as string) ?? "plaintext";

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return COMMON_LANGUAGES;
    return COMMON_LANGUAGES.filter(
      (l) => l.id.includes(q) || l.label.toLowerCase().includes(q),
    );
  }, [query]);

  const currentLabel =
    COMMON_LANGUAGES.find((l) => l.id === current)?.label ?? current;

  return (
    <NodeViewWrapper
      className="vt-code-block-wrapper relative group"
      data-language={current}
    >
      <div
        className="absolute top-1 right-1 z-10 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity"
        contentEditable={false}
      >
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1 px-2 py-0.5 text-[11px] rounded bg-background/80 border border-border hover:bg-accent text-foreground"
          title={t("notes.codeBlock.selectLanguage")}
        >
          <span>{currentLabel}</span>
          <ChevronDown className="w-3 h-3" />
        </button>
        {open && (
          <div className="absolute top-7 right-0 bg-popover text-popover-foreground border rounded-md shadow-md p-1 min-w-[180px] max-h-[260px] overflow-y-auto">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("notes.codeBlock.searchLanguage")}
              className="w-full px-2 py-1 mb-1 text-xs bg-background border rounded focus:outline-none focus:ring-1 focus:ring-ring"
            />
            {filtered.map((lang) => (
              <button
                key={lang.id}
                onClick={() => {
                  updateAttributes({ language: lang.id });
                  setOpen(false);
                  setQuery("");
                }}
                className={
                  "flex w-full items-center px-2 py-1 text-left text-xs rounded-sm " +
                  (lang.id === current
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-accent/50")
                }
              >
                {lang.label}
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="px-2 py-1 text-xs text-muted-foreground">
                {t("notes.slashMenu.noMatch")}
              </div>
            )}
          </div>
        )}
      </div>
      <pre className="vt-code-block">
        <NodeViewContent<"code"> as="code" className={`language-${current}`} />
      </pre>
    </NodeViewWrapper>
  );
}
