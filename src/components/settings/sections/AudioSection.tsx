import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Mic, MicOff, RefreshCw } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSettings } from "@/hooks/useSettings";
import { useAudioDevices } from "@/hooks/useAudioDevices";
import { SectionCard } from "../common/SectionCard";
import { Divider } from "../common/Divider";

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

  useEffect(() => {
    if (!isTesting) return;

    let unlisten: (() => void) | null = null;
    let cancelled = false;

    listen<number>("audio-level", (e) => setAudioLevel(e.payload)).then(
      (fn) => {
        if (cancelled) {
          fn();
        } else {
          unlisten = fn;
        }
      },
    );

    return () => {
      cancelled = true;
      unlisten?.();
      invoke("stop_audio_monitor").catch(() => {
        // Ignore: the stream may already be stopped.
      });
      setAudioLevel(0);
    };
  }, [isTesting]);

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

  const levelColor =
    audioLevel > 0.7 ? "#ef4444" : audioLevel > 0.35 ? "#f97316" : "#22c55e";

  return (
    <SectionCard
      id="section-audio"
      icon={<Mic className="w-3.5 h-3.5 text-blue-500" />}
      iconBg="bg-blue-500/10"
      title={t('settings.audio.title')}
      subtitle={t('settings.audio.subtitle')}
    >
      <div className="space-y-5">
        {/* Microphone */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label
              htmlFor="microphone"
              className="text-sm font-medium text-foreground"
            >
              {t('settings.audio.inputDevice')}
            </Label>
            <Button
              variant="ghost"
              size="sm"
              onClick={refresh}
              disabled={devicesLoading}
              className="h-7 px-2 -mr-1"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${devicesLoading ? "animate-spin" : ""}`}
              />
            </Button>
          </div>
          <Select
            value={settings.input_device_index?.toString() ?? "null"}
            onValueChange={(value) =>
              updateSetting(
                "input_device_index",
                value === "null" ? null : Number.parseInt(value),
              )
            }
            disabled={devicesLoading || !!devicesError}
          >
            <SelectTrigger id="microphone" className="h-9 bg-background/50">
              <SelectValue
                placeholder={
                  devicesLoading
                    ? t('settings.audio.loadingDevices')
                    : devicesError
                      ? t('settings.audio.loadError')
                      : t('settings.audio.selectDevice')
                }
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="null">{t('settings.audio.defaultDevice')}</SelectItem>
              {devices.map((device) => (
                <SelectItem key={device.index} value={device.index.toString()}>
                  {device.name} {device.is_default ? t('settings.audio.defaultSuffix') : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {devicesError && (
            <p className="text-xs text-destructive">{t('settings.audio.errorPrefix')} {devicesError}</p>
          )}
        </div>

        {/* Microphone test */}
        <div className="space-y-2">
          <Button
            variant={isTesting ? "destructive" : "outline"}
            size="sm"
            onClick={handleToggleTest}
            disabled={devicesLoading || !!devicesError}
            className="w-full h-8 text-xs"
          >
            {isTesting ? (
              <MicOff className="w-3.5 h-3.5 mr-1.5" />
            ) : (
              <Mic className="w-3.5 h-3.5 mr-1.5" />
            )}
            {isTesting ? t('settings.audio.stopTest') : t('settings.audio.testMic')}
          </Button>
          {isTesting && (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  {t('settings.audio.inputLevel')}
                </p>
                <span className="text-xs font-mono tabular-nums text-muted-foreground">
                  {Math.round(audioLevel * 100)}%
                </span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-100"
                  style={{
                    width: `${Math.min(audioLevel * 100, 100)}%`,
                    backgroundColor: levelColor,
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Silence threshold */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label
              htmlFor="silence-threshold"
              className="text-sm font-medium text-foreground"
            >
              {t('settings.audio.silenceThreshold')}
            </Label>
            <span className="text-sm font-mono font-semibold text-primary tabular-nums">
              {(settings.silence_threshold * 100).toFixed(1)}%
            </span>
          </div>
          <input
            id="silence-threshold"
            type="range"
            min="0.001"
            max="0.05"
            step="0.001"
            value={settings.silence_threshold}
            onChange={(e) =>
              updateSetting("silence_threshold", parseFloat(e.target.value))
            }
            className="w-full h-1.5 bg-muted rounded-full appearance-none cursor-pointer accent-primary"
          />
          <p className="text-xs text-muted-foreground">
            {t('settings.audio.silenceThresholdHelp')}
          </p>
        </div>

        <Divider />

        {/* Audio options */}
        <div className="space-y-1">
          <div
            className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/30 transition-colors cursor-pointer"
            onClick={() => updateSetting("enable_sounds", !settings.enable_sounds)}
          >
            <Checkbox
              id="interface-sounds"
              checked={settings.enable_sounds}
              onCheckedChange={(checked) =>
                updateSetting("enable_sounds", checked as boolean)
              }
            />
            <Label
              htmlFor="interface-sounds"
              className="text-sm text-foreground cursor-pointer flex-1"
            >
              {t('settings.audio.interfaceSounds')}
            </Label>
          </div>

          <div
            className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/30 transition-colors cursor-pointer"
            onClick={() =>
              updateSetting(
                "enable_history_audio_preview",
                !settings.enable_history_audio_preview,
              )
            }
          >
            <Checkbox
              id="show-listen"
              checked={settings.enable_history_audio_preview}
              onCheckedChange={(checked) =>
                updateSetting("enable_history_audio_preview", checked as boolean)
              }
            />
            <Label
              htmlFor="show-listen"
              className="text-sm text-foreground cursor-pointer flex-1"
            >
              {t('settings.audio.historyAudioPreview')}
            </Label>
          </div>
        </div>
      </div>
    </SectionCard>
  );
}
