import { useTranslation } from "react-i18next";
import { ArrowDown } from "lucide-react";

/**
 * Static before/after card showing a raw transcription getting polished by
 * AI. Stacked vertically so the text panels keep a readable line length even
 * when the parent card is narrow (3-col grid on the Capabilities step).
 */
export function PostProcessBeforeAfter() {
  const { t } = useTranslation("billing");

  return (
    <div className="flex flex-col items-stretch gap-1.5">
      <div
        className="rounded-md border px-2.5 py-2 text-left"
        style={{
          background: "var(--vt-panel-2)",
          borderColor: "var(--vt-border)",
        }}
      >
        <div
          className="text-[10px] uppercase tracking-wide mb-0.5"
          style={{ color: "var(--vt-fg-3)" }}
        >
          {t("welcome.capabilities.ai.before_label")}
        </div>
        <p
          className="text-xs leading-snug"
          style={{ color: "var(--vt-fg-2)" }}
        >
          {t("welcome.capabilities.ai.before_example")}
        </p>
      </div>

      <div className="flex items-center justify-center">
        <div
          className="flex h-6 w-6 items-center justify-center rounded-full"
          style={{
            background: "oklch(from var(--vt-violet) l c h / 0.18)",
            color: "var(--vt-violet)",
          }}
          aria-hidden
        >
          <ArrowDown className="h-3.5 w-3.5" />
        </div>
      </div>

      <div
        className="rounded-md border px-2.5 py-2 text-left"
        style={{
          background: "oklch(from var(--vt-violet) l c h / 0.08)",
          borderColor: "oklch(from var(--vt-violet) l c h / 0.35)",
        }}
      >
        <div
          className="text-[10px] uppercase tracking-wide mb-0.5"
          style={{ color: "var(--vt-violet)" }}
        >
          {t("welcome.capabilities.ai.after_label")}
        </div>
        <p
          className="text-xs leading-snug"
          style={{ color: "var(--vt-fg)" }}
        >
          {t("welcome.capabilities.ai.after_example")}
        </p>
      </div>
    </div>
  );
}
