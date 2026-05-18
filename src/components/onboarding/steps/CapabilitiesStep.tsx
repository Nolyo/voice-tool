import { useTranslation } from "react-i18next";
import { ArrowLeft, ArrowRight, Keyboard, Sparkles, ClipboardPaste } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSettings } from "@/hooks/useSettings";
import { PostProcessBeforeAfter } from "../illustrations/PostProcessBeforeAfter";

interface CapabilitiesStepProps {
  onContinue: () => void;
  onBack: () => void;
}

export function CapabilitiesStep({ onContinue, onBack }: CapabilitiesStepProps) {
  const { t } = useTranslation("billing");
  const { settings } = useSettings();
  const hotkey = settings.record_hotkey || "Ctrl+F11";

  return (
    <div className="vt-anim-fade-up flex flex-col gap-7">
      <div className="text-center space-y-2">
        <h2
          className="vt-display text-2xl md:text-3xl font-semibold tracking-tight"
          style={{ color: "var(--vt-fg)" }}
        >
          {t("welcome.capabilities.title")}
        </h2>
        <p className="text-sm" style={{ color: "var(--vt-fg-2)" }}>
          {t("welcome.capabilities.subtitle")}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {/* Card 1 — Hotkey */}
        <article
          className="flex flex-col gap-3 rounded-lg border p-4"
          style={{
            background: "var(--vt-panel-2)",
            borderColor: "var(--vt-border)",
          }}
        >
          <div
            className="flex h-9 w-9 items-center justify-center rounded-md"
            style={{
              background: "oklch(from var(--vt-accent) l c h / 0.14)",
              color: "var(--vt-accent-2)",
            }}
          >
            <Keyboard className="h-4 w-4" />
          </div>
          <div>
            <h3
              className="text-sm font-semibold"
              style={{ color: "var(--vt-fg)" }}
            >
              {t("welcome.capabilities.hotkey.title")}
            </h3>
            <p
              className="mt-1 text-xs leading-relaxed"
              style={{ color: "var(--vt-fg-2)" }}
            >
              {t("welcome.capabilities.hotkey.description")}
            </p>
          </div>
          <kbd
            className="self-start rounded border px-2 py-0.5 text-[11px] font-mono"
            style={{
              background: "var(--vt-panel)",
              borderColor: "var(--vt-border-strong)",
              color: "var(--vt-fg-2)",
            }}
          >
            {hotkey}
          </kbd>
        </article>

        {/* Card 2 — AI post-process (featured) */}
        <article
          className="relative flex flex-col gap-3 rounded-lg border p-4"
          style={{
            background:
              "linear-gradient(135deg, oklch(from var(--vt-violet) l c h / 0.12), oklch(from var(--vt-violet) l c h / 0.04))",
            borderColor: "oklch(from var(--vt-violet) l c h / 0.4)",
          }}
        >
          <span
            className="absolute -top-2 right-3 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
            style={{
              background: "var(--vt-violet)",
              color: "var(--vt-fg-on-violet, white)",
            }}
          >
            {t("welcome.capabilities.ai.badge")}
          </span>
          <div
            className="flex h-9 w-9 items-center justify-center rounded-md"
            style={{
              background: "oklch(from var(--vt-violet) l c h / 0.18)",
              color: "var(--vt-violet)",
            }}
          >
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <h3
              className="text-sm font-semibold"
              style={{ color: "var(--vt-fg)" }}
            >
              {t("welcome.capabilities.ai.title")}
            </h3>
            <p
              className="mt-1 text-xs leading-relaxed"
              style={{ color: "var(--vt-fg-2)" }}
            >
              {t("welcome.capabilities.ai.description")}
            </p>
          </div>
          <PostProcessBeforeAfter />
        </article>

        {/* Card 3 — Paste anywhere */}
        <article
          className="flex flex-col gap-3 rounded-lg border p-4"
          style={{
            background: "var(--vt-panel-2)",
            borderColor: "var(--vt-border)",
          }}
        >
          <div
            className="flex h-9 w-9 items-center justify-center rounded-md"
            style={{
              background: "oklch(from var(--vt-accent) l c h / 0.14)",
              color: "var(--vt-accent-2)",
            }}
          >
            <ClipboardPaste className="h-4 w-4" />
          </div>
          <div>
            <h3
              className="text-sm font-semibold"
              style={{ color: "var(--vt-fg)" }}
            >
              {t("welcome.capabilities.paste.title")}
            </h3>
            <p
              className="mt-1 text-xs leading-relaxed"
              style={{ color: "var(--vt-fg-2)" }}
            >
              {t("welcome.capabilities.paste.description")}
            </p>
          </div>
          <p
            className="text-[11px] font-medium"
            style={{ color: "var(--vt-fg-3)" }}
          >
            {t("welcome.capabilities.paste.examples")}
          </p>
        </article>
      </div>

      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" onClick={onBack} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          {t("welcome.capabilities.cta_back")}
        </Button>
        <Button onClick={onContinue} size="lg" className="gap-2">
          {t("welcome.capabilities.cta_continue")}
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
