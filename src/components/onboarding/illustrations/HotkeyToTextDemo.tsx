import { useTranslation } from "react-i18next";
import { ArrowRight, Mic } from "lucide-react";
import { useSettings } from "@/hooks/useSettings";

/**
 * Static 3-step infographic: Press hotkey → Speak → Text appears.
 *
 * Designed so the hotkey is ALWAYS visible — earlier versions used a phased
 * animation where the hotkey faded out before late-arriving users could read
 * it, which is critical info on first launch.
 */
export function HotkeyToTextDemo() {
  const { t } = useTranslation("billing");
  const { settings } = useSettings();
  const hotkey = settings.record_hotkey || "Ctrl+F11";

  return (
    <div
      className="vt-anim-fade-up vt-onboarding-demo relative w-full overflow-hidden rounded-xl border p-5"
      style={{
        background:
          "linear-gradient(135deg, oklch(from var(--vt-violet) l c h / 0.10), oklch(from var(--vt-accent) l c h / 0.06))",
        borderColor: "oklch(from var(--vt-violet) l c h / 0.25)",
      }}
    >
      <div className="flex flex-col items-stretch gap-3 md:flex-row md:items-center md:justify-between md:gap-4">
        {/* Step 1 — Hotkey */}
        <div className="flex flex-1 flex-col items-center gap-2 text-center">
          <kbd
            className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm font-medium shadow-sm"
            style={{
              background: "var(--vt-panel-2)",
              borderColor: "oklch(from var(--vt-violet) l c h / 0.5)",
              color: "var(--vt-fg)",
            }}
          >
            {hotkey}
          </kbd>
          <span className="text-xs font-medium" style={{ color: "var(--vt-fg-2)" }}>
            {t("welcome.hero.demo_step_press")}
          </span>
        </div>

        <ArrowRight
          className="hidden h-4 w-4 shrink-0 md:block"
          style={{ color: "var(--vt-fg-3)" }}
          aria-hidden
        />

        {/* Step 2 — Speak (mic + subtle pulsing bars) */}
        <div className="flex flex-1 flex-col items-center gap-2 text-center">
          <div
            className="vt-onb-mic flex items-center gap-2 rounded-md border px-3 py-1.5"
            style={{
              background: "var(--vt-panel-2)",
              borderColor: "oklch(from var(--vt-violet) l c h / 0.4)",
            }}
          >
            <Mic
              className="h-4 w-4"
              style={{ color: "var(--vt-violet)" }}
              aria-hidden
            />
            <div className="flex items-end gap-0.5">
              {[0, 1, 2, 3].map((i) => (
                <span
                  key={i}
                  className="vt-onb-wave-bar inline-block rounded-full"
                  style={{
                    width: "3px",
                    height: "14px",
                    background: "var(--vt-violet)",
                    animationDelay: `${i * 100}ms`,
                  }}
                />
              ))}
            </div>
          </div>
          <span className="text-xs font-medium" style={{ color: "var(--vt-fg-2)" }}>
            {t("welcome.hero.demo_step_speak")}
          </span>
        </div>

        <ArrowRight
          className="hidden h-4 w-4 shrink-0 md:block"
          style={{ color: "var(--vt-fg-3)" }}
          aria-hidden
        />

        {/* Step 3 — Text appears (mock app input) */}
        <div className="flex flex-1 flex-col items-center gap-2 text-center">
          <div
            className="w-full max-w-[200px] rounded-md border px-3 py-1.5 text-left"
            style={{
              background: "var(--vt-panel-2)",
              borderColor: "oklch(from var(--vt-accent) l c h / 0.4)",
            }}
          >
            <div
              className="text-[10px] uppercase tracking-wide"
              style={{ color: "var(--vt-fg-3)" }}
            >
              #general
            </div>
            <div
              className="text-xs leading-snug truncate"
              style={{ color: "var(--vt-fg)" }}
            >
              {t("welcome.hero.demo_caption")}
            </div>
          </div>
          <span className="text-xs font-medium" style={{ color: "var(--vt-fg-2)" }}>
            {t("welcome.hero.demo_step_text")}
          </span>
        </div>
      </div>
    </div>
  );
}
