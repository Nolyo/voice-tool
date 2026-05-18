import { useTranslation } from "react-i18next";
import { Sparkles } from "lucide-react";

/**
 * Static side-by-side card showing a raw transcription vs the AI-polished
 * version. Used in the Capabilities step to make the cloud-only post-process
 * value tangible without burning an API call.
 */
export function PostProcessBeforeAfter() {
  const { t } = useTranslation("billing");

  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-2">
      <div
        className="rounded-md border p-2.5 text-left"
        style={{
          background: "var(--vt-panel-2)",
          borderColor: "var(--vt-border)",
        }}
      >
        <div
          className="text-[10px] uppercase tracking-wide mb-1"
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
          className="flex h-7 w-7 items-center justify-center rounded-full"
          style={{
            background: "oklch(from var(--vt-violet) l c h / 0.18)",
            color: "var(--vt-violet)",
          }}
        >
          <Sparkles className="h-3.5 w-3.5" />
        </div>
      </div>

      <div
        className="rounded-md border p-2.5 text-left"
        style={{
          background: "oklch(from var(--vt-violet) l c h / 0.08)",
          borderColor: "oklch(from var(--vt-violet) l c h / 0.35)",
        }}
      >
        <div
          className="text-[10px] uppercase tracking-wide mb-1"
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
