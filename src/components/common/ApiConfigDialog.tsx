import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSettings } from "@/hooks/useSettings";

export function ApiConfigDialog() {
  const { t } = useTranslation();
  const { settings, updateSettings } = useSettings();
  const [open, setOpen] = useState(false);
  const [apiKeys, setApiKeys] = useState({
    openai_api_key: settings.openai_api_key,
    google_api_key: settings.google_api_key,
  });

  const handleSave = async () => {
    await updateSettings(apiKeys);
    setOpen(false);
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen) {
      // Reset to current settings when opening
      setApiKeys({
        openai_api_key: settings.openai_api_key,
        google_api_key: settings.google_api_key,
      });
    }
    setOpen(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full bg-transparent">
          {t('apiConfig.button')}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[525px]">
        <DialogHeader>
          <DialogTitle>{t('apiConfig.title')}</DialogTitle>
          <DialogDescription>
            {t('apiConfig.description')}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="openai" className="text-sm font-medium">
              {t('apiConfig.openaiKey')}
            </Label>
            <Input
              id="openai"
              type="password"
              placeholder={t('apiConfig.openaiKeyPlaceholder')}
              value={apiKeys.openai_api_key}
              onChange={(e) =>
                setApiKeys({ ...apiKeys, openai_api_key: e.target.value })
              }
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              {t('apiConfig.getHelp')}{" "}
              <button
                type="button"
                className="text-blue-500 underline hover:text-blue-400 cursor-pointer inline"
                onClick={async (e) => {
                  e.preventDefault();
                  const { openUrl } = await import("@tauri-apps/plugin-opener");
                  await openUrl("https://platform.openai.com/api-keys");
                }}
              >
                platform.openai.com
              </button>
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSave}>{t('common.save')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
