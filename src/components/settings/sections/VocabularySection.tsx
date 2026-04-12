import { useTranslation } from "react-i18next";
import { BookOpen, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSettings } from "@/hooks/useSettings";
import { SectionCard } from "../common/SectionCard";
import { Divider } from "../common/Divider";

export function VocabularySection() {
  const { t } = useTranslation();
  const { settings, updateSetting } = useSettings();

  return (
    <SectionCard
      id="section-vocabulaire"
      icon={<BookOpen className="w-3.5 h-3.5 text-cyan-500" />}
      iconBg="bg-cyan-500/10"
      title={t('settings.vocabulary.title')}
      subtitle={t('settings.vocabulary.subtitle')}
    >
      <div className="space-y-5">
        {/* Snippets */}
        <div className="space-y-3">
          <div>
            <h4 className="text-sm font-medium text-foreground">{t('settings.vocabulary.snippets')}</h4>
            <p className="text-xs text-muted-foreground">
              {t('settings.vocabulary.snippetsDesc')}
            </p>
          </div>

          {(settings.snippets ?? []).map((snippet, index) => (
            <div key={index} className="flex items-center gap-2">
              <Input
                value={snippet.trigger}
                placeholder={t('settings.vocabulary.triggerPlaceholder')}
                className="flex-1 text-sm"
                onChange={(e) => {
                  const updated = [...(settings.snippets ?? [])];
                  updated[index] = { ...updated[index], trigger: e.target.value };
                  updateSetting("snippets", updated);
                }}
              />
              <span className="text-muted-foreground text-xs shrink-0">&rarr;</span>
              <Input
                value={snippet.replacement}
                placeholder={t('settings.vocabulary.replacementPlaceholder')}
                className="flex-1 text-sm"
                onChange={(e) => {
                  const updated = [...(settings.snippets ?? [])];
                  updated[index] = {
                    ...updated[index],
                    replacement: e.target.value,
                  };
                  updateSetting("snippets", updated);
                }}
              />
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0 h-8 w-8 text-muted-foreground hover:text-destructive"
                onClick={() => {
                  const updated = (settings.snippets ?? []).filter(
                    (_, i) => i !== index,
                  );
                  updateSetting("snippets", updated);
                }}
              >
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
          ))}

          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => {
              const updated = [
                ...(settings.snippets ?? []),
                { trigger: "", replacement: "" },
              ];
              updateSetting("snippets", updated);
            }}
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            {t('settings.vocabulary.addSnippet')}
          </Button>
        </div>

        <Divider />

        {/* Dictionnaire */}
        <div className="space-y-3">
          <div>
            <h4 className="text-sm font-medium text-foreground">{t('settings.vocabulary.dictionary')}</h4>
            <p className="text-xs text-muted-foreground">
              {t('settings.vocabulary.dictionaryDesc')}
            </p>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {(settings.dictionary ?? []).map((word, index) => (
              <span
                key={index}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-sm bg-muted rounded-md"
              >
                {word}
                <button
                  className="text-muted-foreground hover:text-destructive transition-colors"
                  onClick={() => {
                    const updated = (settings.dictionary ?? []).filter(
                      (_, i) => i !== index,
                    );
                    updateSetting("dictionary", updated);
                  }}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>

          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const input = e.currentTarget.elements.namedItem(
                "dict-word",
              ) as HTMLInputElement;
              const value = input.value.trim();
              if (value && !(settings.dictionary ?? []).includes(value)) {
                updateSetting("dictionary", [...(settings.dictionary ?? []), value]);
                input.value = "";
              }
            }}
          >
            <Input
              name="dict-word"
              placeholder={t('settings.vocabulary.addWordPlaceholder')}
              className="flex-1 text-sm"
            />
            <Button type="submit" variant="outline" size="sm">
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              {t('settings.vocabulary.addWord')}
            </Button>
          </form>
        </div>
      </div>
    </SectionCard>
  );
}
