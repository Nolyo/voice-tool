import { useTranslation } from "react-i18next";
import type { TopWord } from "@/hooks/useStatistics";

interface TopWordsProps {
  words: TopWord[];
}

export function TopWords({ words }: TopWordsProps) {
  const { t } = useTranslation();

  if (words.length === 0) {
    return (
      <div className="vt-card-elevated p-5">
        <h3 className="text-[14px] font-semibold text-[var(--vt-fg)]">
          {t("statistics.topWordsTitle")}
        </h3>
        <p className="text-[12px] text-[var(--vt-fg-3)] mt-3">
          {t("statistics.topWordsEmpty")}
        </p>
      </div>
    );
  }

  const max = words[0]?.count ?? 1;

  return (
    <div className="vt-card-elevated p-5">
      <h3 className="text-[14px] font-semibold text-[var(--vt-fg)]">
        {t("statistics.topWordsTitle")}
      </h3>
      <p className="text-[12px] text-[var(--vt-fg-3)] mt-0.5 mb-4">
        {t("statistics.topWordsSubtitle")}
      </p>

      <div className="flex flex-wrap gap-1.5">
        {words.map((w) => {
          const ratio = w.count / max;
          const fontSize = 11 + ratio * 6;
          return (
            <span
              key={w.word}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border"
              style={{
                fontSize: `${fontSize}px`,
                background: `oklch(0.7 0.17 264 / ${0.06 + ratio * 0.18})`,
                borderColor: `oklch(0.7 0.17 264 / ${0.18 + ratio * 0.4})`,
                color: "var(--vt-fg)",
              }}
            >
              <span className="font-medium">{w.word}</span>
              <span className="text-[10.5px] vt-mono text-[var(--vt-fg-3)]">
                {w.count}
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
