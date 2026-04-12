import { useTranslation } from "react-i18next";
import { Minus, Plus, Settings } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSettings } from "@/hooks/useSettings";
import { useAutostart } from "@/hooks/useAutostart";
import { changeLanguage } from "@/i18n";
import { SectionCard } from "../common/SectionCard";
import { Divider } from "../common/Divider";

export function SystemSection() {
  const { t } = useTranslation();
  const { settings, updateSetting } = useSettings();
  const { enabled: autoStartEnabled, isUpdating: isUpdatingAutostart, toggle } =
    useAutostart();

  return (
    <SectionCard
      id="section-systeme"
      icon={<Settings className="w-3.5 h-3.5 text-orange-500" />}
      iconBg="bg-orange-500/10"
      title={t('settings.system.title')}
      subtitle={t('settings.system.subtitle')}
    >
      <div className="space-y-5">
        {/* Language selector */}
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {t('settings.system.language')}
          </Label>
          <Select
            value={settings.ui_language}
            onValueChange={async (value) => {
              await updateSetting("ui_language", value as "fr" | "en");
              changeLanguage(value);
            }}
          >
            <SelectTrigger className="h-9 bg-background/50 w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="fr">Français</SelectItem>
              <SelectItem value="en">English</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {t('settings.system.languageDesc')}
          </p>
        </div>

        <Divider />

        {/* Autostart */}
        <div className="space-y-1">
          <div className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/30 transition-colors">
            <Checkbox
              id="auto-start"
              checked={autoStartEnabled}
              disabled={isUpdatingAutostart}
              onCheckedChange={(checked) => toggle(checked as boolean)}
            />
            <Label
              htmlFor="auto-start"
              className="text-sm text-foreground cursor-pointer flex-1"
            >
              {t('settings.system.startWithWindows')}
              {isUpdatingAutostart && (
                <span className="text-muted-foreground ml-1 text-xs">
                  {t('settings.system.updating')}
                </span>
              )}
            </Label>
          </div>

          {autoStartEnabled && (
            <div className="flex items-center gap-3 p-2.5 pl-10 rounded-lg hover:bg-muted/30 transition-colors">
              <Checkbox
                id="start-minimized"
                checked={settings.start_minimized_on_boot}
                onCheckedChange={(checked) =>
                  updateSetting("start_minimized_on_boot", checked as boolean)
                }
              />
              <Label
                htmlFor="start-minimized"
                className="text-sm text-muted-foreground cursor-pointer flex-1"
              >
                {t('settings.system.startMinimized')}
              </Label>
            </div>
          )}
        </div>

        <Divider />

        {/* Hide recording panel */}
        <div
          className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/30 transition-colors cursor-pointer"
          onClick={() =>
            updateSetting("hide_recording_panel", !settings.hide_recording_panel)
          }
        >
          <Checkbox
            id="hide-recording-panel"
            checked={settings.hide_recording_panel}
            onCheckedChange={(checked) =>
              updateSetting("hide_recording_panel", checked as boolean)
            }
          />
          <Label
            htmlFor="hide-recording-panel"
            className="text-sm text-foreground cursor-pointer flex-1"
          >
            {t('settings.system.hideRecordingPanel')}
          </Label>
        </div>

        <Divider />

        {/* Keep recordings */}
        <div className="space-y-1.5">
          <Label
            htmlFor="keep-recordings"
            className="text-sm font-medium text-foreground"
          >
            {t('settings.system.recordingsKeep')}
          </Label>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() =>
                updateSetting(
                  "recordings_keep_last",
                  Math.max(0, settings.recordings_keep_last - 1),
                )
              }
              className="h-9 w-9 shrink-0"
            >
              <Minus className="w-3.5 h-3.5" />
            </Button>
            <Input
              id="keep-recordings"
              type="number"
              value={settings.recordings_keep_last}
              onChange={(e) =>
                updateSetting(
                  "recordings_keep_last",
                  Number.parseInt(e.target.value) || 0,
                )
              }
              className="h-9 text-center font-mono bg-background/50 w-20"
            />
            <Button
              variant="outline"
              size="icon"
              onClick={() =>
                updateSetting(
                  "recordings_keep_last",
                  settings.recordings_keep_last + 1,
                )
              }
              className="h-9 w-9 shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {t('settings.system.recordingsKeepHelp')}
          </p>
        </div>
      </div>
    </SectionCard>
  );
}
