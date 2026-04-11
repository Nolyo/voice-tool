import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useSettings } from "@/hooks/useSettings";
import { SectionCard } from "../common/SectionCard";

export function TextSection() {
  const { settings, updateSetting } = useSettings();

  return (
    <SectionCard
      id="section-texte"
      icon={<span className="text-xs font-bold text-emerald-500 leading-none">T</span>}
      iconBg="bg-emerald-500/10"
      title="Texte"
      subtitle="Formatage et insertion automatique"
    >
      <div className="space-y-4">
        <div className="space-y-1">
          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Mode d'insertion
          </Label>
          <RadioGroup
            value={settings.insertion_mode}
            onValueChange={(value) =>
              updateSetting("insertion_mode", value as "cursor" | "clipboard" | "none")
            }
            className="gap-0"
          >
            <label
              htmlFor="mode-cursor"
              className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-muted/30 transition-colors cursor-pointer"
            >
              <RadioGroupItem value="cursor" id="mode-cursor" className="mt-0.5" />
              <div className="flex-1">
                <span className="text-sm font-medium text-foreground leading-relaxed">
                  Saisie directe au curseur
                </span>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Le texte est tapé directement, sans utiliser le presse-papiers
                </p>
              </div>
            </label>

            <label
              htmlFor="mode-clipboard"
              className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-muted/30 transition-colors cursor-pointer"
            >
              <RadioGroupItem value="clipboard" id="mode-clipboard" className="mt-0.5" />
              <div className="flex-1">
                <span className="text-sm font-medium text-foreground leading-relaxed">
                  Copier-coller
                </span>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Le texte est copié dans le presse-papiers puis collé (Ctrl+V)
                </p>
              </div>
            </label>

            <label
              htmlFor="mode-none"
              className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-muted/30 transition-colors cursor-pointer"
            >
              <RadioGroupItem value="none" id="mode-none" className="mt-0.5" />
              <div className="flex-1">
                <span className="text-sm font-medium text-foreground leading-relaxed">
                  Aucune insertion
                </span>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Le texte est uniquement ajouté à l'historique
                </p>
              </div>
            </label>
          </RadioGroup>
        </div>

        <div
          className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-muted/30 transition-colors cursor-pointer"
          onClick={() => updateSetting("smart_formatting", !settings.smart_formatting)}
        >
          <Checkbox
            id="smart-formatting"
            checked={settings.smart_formatting}
            onCheckedChange={(checked) =>
              updateSetting("smart_formatting", checked as boolean)
            }
            className="mt-0.5"
          />
          <Label
            htmlFor="smart-formatting"
            className="text-sm text-foreground cursor-pointer leading-relaxed flex-1"
          >
            Formatage intelligent (ponctuation, majuscules, espaces)
          </Label>
        </div>
      </div>
    </SectionCard>
  );
}
