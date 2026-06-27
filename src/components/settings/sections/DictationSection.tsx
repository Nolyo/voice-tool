import { type SettingsSectionId } from "../common/SettingsNav";
import { TranscriptionSection } from "./TranscriptionSection";
import { PostProcessSection } from "./PostProcessSection";
import { VocabularySection } from "./VocabularySection";

interface DictationSectionProps {
  onSectionChange?: (id: SettingsSectionId) => void;
}

/**
 * "Dictée" page — groups everything that turns speech into final text:
 * transcription provider/model, AI post-processing, and the custom vocabulary
 * (snippets, dictionary, prompt). Each former section keeps its own card; they
 * are simply stacked and given anchor ids so legacy deep-links can scroll to
 * the right card (see `resolveSettingsTarget`).
 */
export function DictationSection({ onSectionChange }: DictationSectionProps) {
  return (
    <div className="space-y-5">
      <div id="section-transcription">
        <TranscriptionSection onSectionChange={onSectionChange} />
      </div>
      <div id="section-post-process">
        <PostProcessSection />
      </div>
      <div id="section-vocabulaire">
        <VocabularySection />
      </div>
    </div>
  );
}
