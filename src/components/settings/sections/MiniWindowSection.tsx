import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { AudioWaveform, Move3D } from "lucide-react";
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
import { SectionCard } from "../common/SectionCard";
import { Divider } from "../common/Divider";

export function MiniWindowSection() {
  const { t } = useTranslation();
  const { settings, updateSetting } = useSettings();

  return (
    <SectionCard
      id="section-mini-window"
      icon={<AudioWaveform className="w-3.5 h-3.5 text-fuchsia-500" />}
      iconBg="bg-fuchsia-500/10"
      title={t("settings.miniWindow.title")}
      subtitle={t("settings.miniWindow.subtitle")}
    >
      <div className="space-y-5">
        {/* Visualizer mode */}
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {t("settings.miniWindow.visualizer")}
          </Label>
          <Select
            value={settings.mini_visualizer_mode}
            onValueChange={(value) =>
              updateSetting(
                "mini_visualizer_mode",
                value as "bars" | "waveform",
              )
            }
          >
            <SelectTrigger className="h-9 bg-background/50 w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="bars">
                {t("settings.miniWindow.visualizerBars")}
              </SelectItem>
              <SelectItem value="waveform">
                {t("settings.miniWindow.visualizerWaveform")}
              </SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {t("settings.miniWindow.visualizerDesc")}
          </p>
        </div>

        <Divider />

        {/* Show transcript preview in extended mode */}
        <div
          className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/30 transition-colors cursor-pointer"
          onClick={() =>
            updateSetting(
              "show_transcription_in_mini_window",
              !settings.show_transcription_in_mini_window,
            )
          }
        >
          <Checkbox
            id="mini-show-transcript"
            checked={settings.show_transcription_in_mini_window}
            onCheckedChange={(checked) =>
              updateSetting(
                "show_transcription_in_mini_window",
                checked as boolean,
              )
            }
          />
          <Label
            htmlFor="mini-show-transcript"
            className="text-sm text-foreground cursor-pointer flex-1"
          >
            <div className="flex flex-col">
              <span>{t("settings.miniWindow.showTranscript")}</span>
              <span className="text-xs text-muted-foreground mt-0.5">
                {t("settings.miniWindow.showTranscriptDesc")}
              </span>
            </div>
          </Label>
        </div>

        <Divider />

        {/* Recenter button */}
        <div className="space-y-1.5">
          <Label className="text-sm font-medium text-foreground">
            {t("settings.miniWindow.position")}
          </Label>
          <Button
            variant="outline"
            className="w-full h-9 justify-start gap-2"
            onClick={async () => {
              try {
                await invoke("recenter_mini_window");
              } catch (e) {
                console.error("Failed to recenter mini window:", e);
              }
            }}
          >
            <Move3D className="w-3.5 h-3.5" />
            {t("settings.miniWindow.recenter")}
          </Button>
          <p className="text-xs text-muted-foreground">
            {t("settings.miniWindow.recenterDesc")}
          </p>
        </div>
      </div>
    </SectionCard>
  );
}
