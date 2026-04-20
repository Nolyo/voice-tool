import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useSettings } from "@/hooks/useSettings";
import { useAudioDevices } from "@/hooks/useAudioDevices";
import { Callout, Row, SectionHeader, Toggle, VtIcon } from "../vt";

const ACCENT = "oklch(0.72 0.17 220)";
const BAR_COUNT = 24;

export function AudioSection() {
  const { t } = useTranslation();
  const { settings, updateSetting } = useSettings();
  const {
    devices,
    isLoading: devicesLoading,
    error: devicesError,
    refresh,
  } = useAudioDevices();

  const [isTesting, setIsTesting] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [bars, setBars] = useState<number[]>(() => Array(BAR_COUNT).fill(0));

  useEffect(() => {
    if (!isTesting) return;

    let unlisten: (() => void) | null = null;
    let cancelled = false;

    listen<number>("audio-level", (e) => setAudioLevel(e.payload)).then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    });

    return () => {
      cancelled = true;
      unlisten?.();
      invoke("stop_audio_monitor").catch(() => {});
      setAudioLevel(0);
    };
  }, [isTesting]);

  // Drive the 24-bar visualizer from the single level reading, shifting left.
  useEffect(() => {
    if (!isTesting) {
      setBars(Array(BAR_COUNT).fill(0));
      return;
    }
    setBars((prev) => {
      const next = prev.slice(1);
      next.push(Math.min(1, audioLevel));
      return next;
    });
  }, [audioLevel, isTesting]);

  const handleToggleTest = async () => {
    if (isTesting) {
      setIsTesting(false);
      return;
    }
    try {
      await invoke("start_audio_monitor", {
        deviceIndex: settings.input_device_index ?? null,
      });
      setIsTesting(true);
    } catch (err) {
      console.error("Failed to start mic test:", err);
    }
  };

  const levelDb = useMemo(() => {
    if (!isTesting || audioLevel <= 0) return null;
    return Math.round(audioLevel * 100);
  }, [audioLevel, isTesting]);

  return (
    <div className="vt-fade-up space-y-5">
      <div className="vt-card-sectioned" style={{ overflow: "hidden" }}>
        <SectionHeader
          color={ACCENT}
          icon={<VtIcon.mic />}
          title={t("settings.audio.title")}
          description={t("settings.audio.subtitle")}
          trailing={
            <button
              type="button"
              onClick={refresh}
              disabled={devicesLoading}
              className="vt-btn"
              style={{ height: 30 }}
            >
              <VtIcon.refresh
                className={devicesLoading ? "animate-spin" : undefined}
              />
              {t("common.refresh", { defaultValue: "Actualiser" })}
            </button>
          }
        />

        {/* Device selector */}
        <Row
          label={t("settings.audio.inputDevice")}
          hint={
            devicesError
              ? `${t("settings.audio.errorPrefix")} ${devicesError}`
              : t("settings.audio.selectDevice")
          }
        >
          <div className="flex gap-2 items-center">
            <div className="relative flex-1">
              <span
                className="absolute left-3 top-1/2 -translate-y-1/2"
                style={{ color: "var(--vt-fg-3)" }}
              >
                <VtIcon.plug />
              </span>
              <select
                className="vt-select"
                style={{ paddingLeft: 36 }}
                value={settings.input_device_index?.toString() ?? "null"}
                onChange={(e) =>
                  updateSetting(
                    "input_device_index",
                    e.target.value === "null" ? null : Number.parseInt(e.target.value),
                  )
                }
                disabled={devicesLoading || !!devicesError}
              >
                <option value="null">{t("settings.audio.defaultDevice")}</option>
                {devices.map((device) => (
                  <option key={device.index} value={device.index.toString()}>
                    {device.name}
                    {device.is_default ? ` ${t("settings.audio.defaultSuffix")}` : ""}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className="vt-btn"
              onClick={refresh}
              disabled={devicesLoading}
              data-tip={t("common.refresh", { defaultValue: "Actualiser" })}
            >
              <VtIcon.refresh
                className={devicesLoading ? "animate-spin" : undefined}
              />
            </button>
          </div>
        </Row>

        {/* Mic test */}
        <Row
          label={t("settings.audio.testMic")}
          hint={t("settings.audio.inputLevel")}
        >
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleToggleTest}
              disabled={devicesLoading || !!devicesError}
              className="vt-btn"
              style={
                isTesting
                  ? {
                      borderColor: "oklch(from var(--vt-danger) l c h / 0.5)",
                      color: "var(--vt-danger)",
                      background: "oklch(from var(--vt-danger) l c h / 0.08)",
                    }
                  : undefined
              }
            >
              {isTesting ? (
                <>
                  <VtIcon.stop /> {t("settings.audio.stopTest")}
                </>
              ) : (
                <>
                  <VtIcon.play /> {t("settings.audio.testMic")}
                </>
              )}
            </button>
            <div
              className="flex-1 h-9 px-3 flex items-center gap-[3px] rounded-lg"
              style={{ background: "var(--vt-surface)", border: "1px solid var(--vt-border)" }}
            >
              {bars.map((v, i) => {
                const h = Math.max(3, v * 22);
                const hot = v > 0.6;
                return (
                  <div
                    key={i}
                    className="vt-meter-bar"
                    data-on={v > 0.05 ? "true" : "false"}
                    style={{
                      height: h,
                      background:
                        v < 0.05
                          ? "var(--vt-border)"
                          : hot
                            ? "var(--vt-warn)"
                            : "var(--vt-accent)",
                    }}
                  />
                );
              })}
            </div>
            <span
              className="vt-mono text-[11px] w-10 text-right"
              style={{ color: isTesting ? "var(--vt-accent-2)" : "var(--vt-fg-4)" }}
            >
              {levelDb !== null ? `${levelDb}%` : "—"}
            </span>
          </div>
        </Row>

        {/* Silence threshold */}
        <Row
          label={t("settings.audio.silenceThreshold")}
          hint={t("settings.audio.silenceThresholdHelp")}
        >
          <div className="flex items-center gap-4">
            <input
              type="range"
              min={0.001}
              max={0.05}
              step={0.001}
              value={settings.silence_threshold}
              onChange={(e) =>
                updateSetting("silence_threshold", parseFloat(e.target.value))
              }
              className="vt-range flex-1"
              style={
                {
                  "--val": `${(settings.silence_threshold / 0.05) * 100}%`,
                } as React.CSSProperties
              }
            />
            <div
              className="flex items-center gap-1 vt-mono text-[12px] px-2.5 h-7 rounded-md"
              style={{
                background: "var(--vt-surface)",
                border: "1px solid var(--vt-border)",
                minWidth: 64,
              }}
            >
              <span style={{ color: "var(--vt-fg)" }}>
                {(settings.silence_threshold * 100).toFixed(1)}
              </span>
              <span style={{ color: "var(--vt-fg-4)" }}>%</span>
            </div>
          </div>
        </Row>

        {/* Trim silence */}
        <Row
          label={t("settings.audio.trimSilence")}
          hint={t("settings.audio.trimSilenceHelp")}
        >
          <Toggle
            on={settings.trim_silence}
            onClick={() => updateSetting("trim_silence", !settings.trim_silence)}
            label={t("settings.audio.trimSilence")}
          />
        </Row>

        {/* Toggles */}
        <Row
          label={t("settings.audio.interfaceSounds")}
          hint={t("settings.audio.historyAudioPreview")}
        >
          <div className="flex flex-col gap-3">
            <Toggle
              on={settings.enable_sounds}
              onClick={() => updateSetting("enable_sounds", !settings.enable_sounds)}
              label={t("settings.audio.interfaceSounds")}
            />
            <Toggle
              on={settings.enable_history_audio_preview}
              onClick={() =>
                updateSetting(
                  "enable_history_audio_preview",
                  !settings.enable_history_audio_preview,
                )
              }
              label={t("settings.audio.historyAudioPreview")}
            />
          </div>
        </Row>
      </div>

      <Callout
        kind="info"
        icon={<VtIcon.info />}
        title={t("settings.audio.privacyTitle", { defaultValue: "Confidentialité" })}
      >
        {t("settings.audio.privacyBody", {
          defaultValue:
            "Les enregistrements ne quittent pas ta machine sauf si tu actives une transcription cloud dans la section IA.",
        })}
      </Callout>
    </div>
  );
}
