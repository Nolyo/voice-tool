import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { useSettings } from "@/hooks/useSettings";
import {
  PickerCardGrid,
  Row,
  SectionHeader,
  Toggle,
  VtIcon,
} from "../vt";

const ACCENT = "oklch(0.72 0.17 175)";
const BAR_COUNT = 16;

type VisualizerMode = "bars" | "waveform";

export function MiniWindowSection() {
  const { t } = useTranslation();
  const { settings, updateSetting } = useSettings();
  const [bars, setBars] = useState<number[]>(() =>
    Array(BAR_COUNT).fill(0).map(() => Math.random() * 0.6 + 0.2),
  );

  useEffect(() => {
    const id = setInterval(() => {
      setBars(
        Array.from({ length: BAR_COUNT }, () => Math.random() * 0.8 + 0.2),
      );
    }, 120);
    return () => clearInterval(id);
  }, []);

  const sectionIcon = (
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
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );

  const viz = settings.mini_visualizer_mode;
  const showTranscript = settings.show_transcription_in_mini_window;

  return (
    <div className="vt-fade-up space-y-5">
      <div className="vt-card-sectioned" style={{ overflow: "hidden" }}>
        <SectionHeader
          color={ACCENT}
          icon={sectionIcon}
          title={t("settings.miniWindow.title")}
          description={t("settings.miniWindow.subtitle")}
        />

        <Row
          label={t("settings.miniWindow.preview", { defaultValue: "Aperçu en direct" })}
          hint={t("settings.miniWindow.previewHint", {
            defaultValue:
              "Voilà à quoi ressemblera la mini fenêtre pendant une dictée.",
          })}
          align="start"
        >
          <div
            className="rounded-2xl p-4 flex items-center justify-center"
            style={{
              background: "oklch(0.1 0.01 264)",
              border: "1px solid var(--vt-border)",
              minHeight: 120,
            }}
          >
            <div
              className="flex items-center gap-3 px-4 py-2.5 rounded-xl"
              style={{
                background: "oklch(0.16 0.02 264 / 0.92)",
                border: "1px solid oklch(1 0 0 / 0.08)",
                backdropFilter: "blur(12px)",
                boxShadow: "0 12px 32px rgba(0,0,0,.45)",
              }}
            >
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center"
                style={{
                  background: "oklch(from var(--vt-accent) l c h / 0.2)",
                  color: "var(--vt-accent-2)",
                }}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="12" cy="12" r="5" />
                </svg>
              </div>
              {viz === "bars" ? (
                <div className="flex items-end gap-[3px] h-5">
                  {bars.map((v, i) => (
                    <div
                      key={i}
                      style={{
                        width: 3,
                        height: Math.max(3, v * 20),
                        borderRadius: 2,
                        background: "var(--vt-accent)",
                        transition: "height .1s",
                      }}
                    />
                  ))}
                </div>
              ) : (
                <svg width="80" height="20" viewBox="0 0 80 20">
                  <path
                    d={`M 0 10 ${bars
                      .map(
                        (v, i) =>
                          `Q ${i * 5 + 2.5} ${10 - v * 8} ${i * 5 + 5} 10 T ${i * 5 + 10} 10`,
                      )
                      .join(" ")}`}
                    fill="none"
                    stroke="var(--vt-accent)"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              )}
              {showTranscript && (
                <span
                  className="text-[12px] max-w-[180px] truncate"
                  style={{ color: "var(--vt-fg-2)" }}
                >
                  {t("settings.miniWindow.previewText", {
                    defaultValue: "Bonjour, je suis en train de dicter…",
                  })}
                </span>
              )}
              <span
                className="vt-mono text-[11px]"
                style={{ color: "var(--vt-fg-4)" }}
              >
                00:04
              </span>
            </div>
          </div>
        </Row>

        <Row
          label={t("settings.miniWindow.visualizer")}
          hint={t("settings.miniWindow.visualizerDesc")}
        >
          <PickerCardGrid<VisualizerMode>
            value={viz}
            onChange={(v) => updateSetting("mini_visualizer_mode", v)}
            options={[
              {
                id: "bars",
                title: t("settings.miniWindow.visualizerBars"),
                sub: t("settings.miniWindow.visualizerBarsSub", {
                  defaultValue: "Spectrogramme en temps réel",
                }),
              },
              {
                id: "waveform",
                title: t("settings.miniWindow.visualizerWaveform"),
                sub: t("settings.miniWindow.visualizerWaveformSub", {
                  defaultValue: "Forme d'onde continue",
                }),
              },
            ]}
            columns={2}
          />
        </Row>

        <Row
          label={t("settings.miniWindow.showTranscript")}
          hint={t("settings.miniWindow.showTranscriptDesc")}
        >
          <Toggle
            on={showTranscript}
            onClick={() =>
              updateSetting(
                "show_transcription_in_mini_window",
                !showTranscript,
              )
            }
            label={
              showTranscript
                ? t("common.enabled", { defaultValue: "Activé" })
                : t("common.disabled", { defaultValue: "Désactivé" })
            }
          />
        </Row>

        <Row
          label={t("settings.miniWindow.position")}
          hint={t("settings.miniWindow.recenterDesc")}
        >
          <button
            type="button"
            className="vt-btn"
            style={{ height: 36 }}
            onClick={async () => {
              try {
                await invoke("recenter_mini_window");
              } catch (e) {
                console.error("Failed to recenter mini window:", e);
              }
            }}
          >
            <VtIcon.centerTarget />
            {t("settings.miniWindow.recenter")}
          </button>
        </Row>
      </div>
    </div>
  );
}
