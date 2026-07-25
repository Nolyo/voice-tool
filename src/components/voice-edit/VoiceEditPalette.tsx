import { useTranslation } from "react-i18next";
import type { VoiceEditAction } from "@/lib/voice-edit/actions";

interface VoiceEditPaletteProps {
  actions: VoiceEditAction[];
  onPick: (index: number) => void;
}

/**
 * The digit-keyed action list. Rendered while the mic is open: the user either
 * speaks a free-form instruction or picks one of these, whichever comes first.
 */
export function VoiceEditPalette({ actions, onPick }: VoiceEditPaletteProps) {
  const { t } = useTranslation();

  return (
    <div className="voice-edit-palette">
      <p className="voice-edit-palette__hint">{t("voiceEdit.overlay.orChoose")}</p>
      <ul className="voice-edit-palette__list">
        {actions.slice(0, 9).map((action, index) => (
          <li key={action.id}>
            <button
              type="button"
              className="voice-edit-palette__item"
              onClick={() => onPick(index + 1)}
              aria-label={action.label}
            >
              <kbd className="voice-edit-palette__key">{index + 1}</kbd>
              <span>{action.label}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
