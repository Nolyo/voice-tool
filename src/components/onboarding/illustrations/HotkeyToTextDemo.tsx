import { useTranslation } from "react-i18next";
import { useSettings } from "@/hooks/useSettings";

/**
 * Decorative animation that loops once on mount: a keyboard shortcut is
 * pressed, a soundwave appears, then text is typed into a mock app input.
 *
 * Pure CSS — no JS timers, no framer-motion dep. Animation is driven by
 * keyframes defined in `App.css` (see `.vt-onboarding-*` rules added there).
 */
export function HotkeyToTextDemo() {
  const { t } = useTranslation("billing");
  const { settings } = useSettings();
  const hotkey = settings.record_hotkey || "Ctrl+F11";

  return (
    <div
      className="vt-onboarding-demo relative w-full overflow-hidden rounded-xl border"
      style={{
        background:
          "linear-gradient(135deg, oklch(from var(--vt-violet) l c h / 0.10), oklch(from var(--vt-accent) l c h / 0.06))",
        borderColor: "oklch(from var(--vt-violet) l c h / 0.25)",
        height: "220px",
      }}
      aria-hidden
    >
      {/* Phase 1 — Hotkey */}
      <div className="vt-onb-phase vt-onb-phase-hotkey absolute inset-x-0 top-1/2 -translate-y-1/2 flex justify-center">
        <kbd
          className="vt-onb-key inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm font-medium shadow-sm"
          style={{
            background: "var(--vt-panel-2)",
            borderColor: "oklch(from var(--vt-violet) l c h / 0.5)",
            color: "var(--vt-fg)",
          }}
        >
          {hotkey}
        </kbd>
      </div>

      {/* Phase 2 — Soundwave */}
      <div className="vt-onb-phase vt-onb-phase-wave absolute inset-x-0 top-1/2 -translate-y-1/2 flex justify-center items-end gap-1.5">
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <span
            key={i}
            className="vt-onb-wave-bar inline-block rounded-full"
            style={{
              width: "4px",
              height: "32px",
              background: "var(--vt-violet)",
              animationDelay: `${i * 80}ms`,
            }}
          />
        ))}
      </div>

      {/* Phase 3 — Mock app input with text being typed */}
      <div className="vt-onb-phase vt-onb-phase-text absolute inset-x-0 top-1/2 -translate-y-1/2 px-8">
        <div
          className="mx-auto max-w-md rounded-lg border p-3"
          style={{
            background: "var(--vt-panel-2)",
            borderColor: "oklch(from var(--vt-accent) l c h / 0.4)",
          }}
        >
          <div className="text-xs mb-1.5" style={{ color: "var(--vt-fg-3)" }}>
            #general
          </div>
          <div className="text-sm" style={{ color: "var(--vt-fg)" }}>
            <span className="vt-onb-typewriter">
              {t("welcome.hero.demo_caption")}
            </span>
            <span className="vt-anim-caret" />
          </div>
        </div>
      </div>
    </div>
  );
}
