import { useState } from "react";
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
  const { settings, updateSettings } = useSettings();
  const [open, setOpen] = useState(false);
  const [apiKeys, setApiKeys] = useState({
    openai_api_key: settings.openai_api_key,
    deepgram_api_key: settings.deepgram_api_key,
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
        deepgram_api_key: settings.deepgram_api_key,
        google_api_key: settings.google_api_key,
      });
    }
    setOpen(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full bg-transparent">
          Configurer les accès API...
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[525px]">
        <DialogHeader>
          <DialogTitle>Configuration des accès API</DialogTitle>
          <DialogDescription>
            Entrez vos clés API pour les services de transcription. Ces clés
            sont stockées localement de manière sécurisée.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="openai" className="text-sm font-medium">
              OpenAI API Key
            </Label>
            <Input
              id="openai"
              type="password"
              placeholder="sk-..."
              value={apiKeys.openai_api_key}
              onChange={(e) =>
                setApiKeys({ ...apiKeys, openai_api_key: e.target.value })
              }
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Obtenir une clé sur{" "}
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

          <div className="grid gap-2">
            <Label htmlFor="deepgram" className="text-sm font-medium">
              Deepgram API Key
            </Label>
            <Input
              id="deepgram"
              type="password"
              placeholder="..."
              value={apiKeys.deepgram_api_key}
              onChange={(e) =>
                setApiKeys({ ...apiKeys, deepgram_api_key: e.target.value })
              }
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Obtenir une clé sur{" "}
              <button
                type="button"
                className="text-blue-500 underline hover:text-blue-400 cursor-pointer inline"
                onClick={async (e) => {
                  e.preventDefault();
                  const { openUrl } = await import("@tauri-apps/plugin-opener");
                  await openUrl("https://console.deepgram.com/");
                }}
              >
                console.deepgram.com
              </button>
            </p>
          </div>

          {/* <div className="grid gap-2">
            <Label htmlFor="google" className="text-sm font-medium">
              Google Cloud API Key
            </Label>
            <Input
              id="google"
              type="password"
              placeholder="..."
              value={apiKeys.google_api_key}
              onChange={(e) =>
                setApiKeys({ ...apiKeys, google_api_key: e.target.value })
              }
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Obtenir une clé sur{" "}
              <a
                href="https://console.cloud.google.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-foreground"
              >
                console.cloud.google.com
              </a>
            </p>
          </div> */}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Annuler
          </Button>
          <Button onClick={handleSave}>Enregistrer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
