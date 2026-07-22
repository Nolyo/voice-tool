import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSettings } from "@/hooks/useSettings";
import { useCloud } from "@/hooks/useCloud";
import {
  Callout,
  Row,
  SectionHeader,
  Toggle,
  VtIcon,
} from "../vt";

const ACCENT = "var(--vt-pin)";
const INSTRUCTIONS_MAX_CHARS = 1000;
const INSTRUCTIONS_PERSIST_DEBOUNCE_MS = 600;

export function PostProcessSection() {
  const { t } = useTranslation();
  const { settings, updateSetting } = useSettings();
  const { isCloudEligible } = useCloud();

  // Local draft for the textarea. updateSetting awaits Tauri Store IPC before
  // setSettings, so a controlled input bound directly to settings gets its DOM
  // value restored asynchronously by React — the cursor jumps to the end on
  // every mid-text edit. Type into synchronous local state instead; persist
  // debounced and flush on blur/unmount (same family as the snippets rows).
  const [draft, setDraft] = useState(settings.post_process_custom_instructions);
  const draftRef = useRef(draft);
  const persistTimer = useRef<number | null>(null);
  const isFocused = useRef(false);

  // Follow external changes (initial async store load, profile switch, reset)
  // as long as the user isn't actively typing in the field.
  useEffect(() => {
    if (
      !isFocused.current &&
      settings.post_process_custom_instructions !== draftRef.current
    ) {
      draftRef.current = settings.post_process_custom_instructions;
      setDraft(settings.post_process_custom_instructions);
    }
  }, [settings.post_process_custom_instructions]);

  const persistDraft = (value: string) => {
    if (persistTimer.current !== null) {
      window.clearTimeout(persistTimer.current);
      persistTimer.current = null;
    }
    void updateSetting("post_process_custom_instructions", value);
  };

  const handleDraftChange = (value: string) => {
    const capped = value.slice(0, INSTRUCTIONS_MAX_CHARS);
    draftRef.current = capped;
    setDraft(capped);
    if (persistTimer.current !== null) window.clearTimeout(persistTimer.current);
    persistTimer.current = window.setTimeout(
      () => persistDraft(capped),
      INSTRUCTIONS_PERSIST_DEBOUNCE_MS,
    );
  };

  // A pending timer means unsaved keystrokes: flush them if the section
  // unmounts before blur (e.g. dialog closed while the field has focus).
  useEffect(() => {
    return () => {
      if (persistTimer.current !== null) {
        window.clearTimeout(persistTimer.current);
        void updateSetting(
          "post_process_custom_instructions",
          draftRef.current,
        );
      }
    };
  }, [updateSetting]);

  return (
    <div className="vt-anim-fade-up space-y-5">
      <div className="vt-card-sectioned" style={{ overflow: "hidden" }}>
        <SectionHeader
          color={ACCENT}
          icon={<VtIcon.wand />}
          title={t("settings.postProcess.title")}
          description={t("settings.postProcess.subtitle")}
          trailing={
            settings.post_process_enabled && isCloudEligible ? (
              <div
                className="flex items-center gap-2 text-[11px] px-2.5 h-7 rounded-md vt-mono"
                style={{
                  background: "oklch(from var(--vt-accent) l c h / 0.1)",
                  color: "var(--vt-accent-2)",
                  border: "1px solid oklch(from var(--vt-accent) l c h / 0.25)",
                }}
              >
                <span
                  className="vt-anim-pulse-dot w-1.5 h-1.5 rounded-full"
                  style={{
                    background: "var(--vt-accent-2)",
                    boxShadow: "0 0 8px currentColor",
                  }}
                />
                {t("common.active", { defaultValue: "Actif" })}
              </div>
            ) : null
          }
        />

        <Row
          label={t("settings.postProcess.enable")}
          hint={t("settings.postProcess.enableDesc")}
        >
          <Toggle
            on={settings.post_process_enabled && isCloudEligible}
            disabled={!isCloudEligible}
            onClick={() => {
              if (!isCloudEligible) return;
              updateSetting(
                "post_process_enabled",
                !settings.post_process_enabled,
              );
            }}
            label={
              !isCloudEligible
                ? t("common.disabled", { defaultValue: "Désactivé" })
                : settings.post_process_enabled
                  ? t("common.enabled", { defaultValue: "Activé" })
                  : t("common.disabled", { defaultValue: "Désactivé" })
            }
          />
        </Row>

        {!isCloudEligible && (
          <div className="vt-row">
            <Callout
              kind="info"
              icon={<VtIcon.sparkle />}
              title={t("settings.postProcess.cloudUpsellTitle")}
            >
              {t("settings.postProcess.cloudUpsellBody")}
            </Callout>
          </div>
        )}

        {isCloudEligible && settings.post_process_enabled && (
          <>
            <div className="vt-row" style={{ background: "var(--vt-hover-soft)" }}>
              <Callout
                kind="warn"
                icon={<VtIcon.clock />}
                title={t("settings.postProcess.delayWarningTitle", {
                  defaultValue: "Latence supplémentaire",
                })}
              >
                {t("settings.postProcess.delayWarning")}
              </Callout>
            </div>

            <div className="vt-row">
              <Callout
                kind="info"
                icon={<VtIcon.wand />}
                title={t("settings.postProcess.autoTitle", {
                  defaultValue: "Mode automatique",
                })}
              >
                {t("settings.postProcess.autoBody")}
              </Callout>
            </div>

            <Row
              label={t("settings.postProcess.customInstructions")}
              hint={t("settings.postProcess.customInstructionsDesc")}
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
                  value={draft}
                  onChange={(e) => handleDraftChange(e.target.value)}
                  onFocus={() => {
                    isFocused.current = true;
                  }}
                  onBlur={() => {
                    isFocused.current = false;
                    persistDraft(draftRef.current);
                  }}
                  placeholder={t("settings.postProcess.customInstructionsPlaceholder")}
                  className="w-full p-3 bg-transparent focus:outline-none text-[13px] resize-none"
                  rows={4}
                  style={{ color: "var(--vt-fg)" }}
                />
                <div
                  className="flex items-center justify-end px-3 py-1.5 border-t"
                  style={{ borderColor: "var(--vt-border)" }}
                >
                  <span
                    className="vt-mono text-[11px]"
                    style={{ color: "var(--vt-fg-3)" }}
                  >
                    {t("settings.postProcess.customInstructionsCount", {
                      count: draft.length,
                    })}
                  </span>
                </div>
              </div>
            </Row>
          </>
        )}
      </div>
    </div>
  );
}
