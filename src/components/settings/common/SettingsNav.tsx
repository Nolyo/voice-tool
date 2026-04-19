import type { ReactNode, RefObject } from "react";
import { useTranslation } from "react-i18next";
import { AudioWaveform, BookOpen, Keyboard, Mic, RefreshCw, Settings, Sparkles } from "lucide-react";

export interface NavItemDef {
  id: string;
  icon: ReactNode;
  iconBg: string;
  titleKey: string;
  subtitleKey: string;
}

export type SettingsSectionId =
  | "section-transcription"
  | "section-audio"
  | "section-texte"
  | "section-post-process"
  | "section-vocabulaire"
  | "section-systeme"
  | "section-mini-window"
  | "section-raccourcis"
  | "section-mises-a-jour";

export const NAV_ITEM_DEFS: NavItemDef[] = [
  {
    id: "section-transcription",
    icon: <Settings className="w-3.5 h-3.5 text-violet-500" />,
    iconBg: "bg-violet-500/10",
    titleKey: "settings.nav.ai",
    subtitleKey: "settings.nav.aiSubtitle",
  },
  {
    id: "section-audio",
    icon: <Mic className="w-3.5 h-3.5 text-blue-500" />,
    iconBg: "bg-blue-500/10",
    titleKey: "settings.nav.audio",
    subtitleKey: "settings.nav.audioSubtitle",
  },
  {
    id: "section-texte",
    icon: <span className="text-xs font-bold text-emerald-500 leading-none">T</span>,
    iconBg: "bg-emerald-500/10",
    titleKey: "settings.nav.text",
    subtitleKey: "settings.nav.textSubtitle",
  },
  {
    id: "section-post-process",
    icon: <Sparkles className="w-3.5 h-3.5 text-pink-500" />,
    iconBg: "bg-pink-500/10",
    titleKey: "settings.nav.postProcess",
    subtitleKey: "settings.nav.postProcessSubtitle",
  },
  {
    id: "section-vocabulaire",
    icon: <BookOpen className="w-3.5 h-3.5 text-cyan-500" />,
    iconBg: "bg-cyan-500/10",
    titleKey: "settings.nav.vocabulary",
    subtitleKey: "settings.nav.vocabularySubtitle",
  },
  {
    id: "section-systeme",
    icon: <Settings className="w-3.5 h-3.5 text-orange-500" />,
    iconBg: "bg-orange-500/10",
    titleKey: "settings.nav.system",
    subtitleKey: "settings.nav.systemSubtitle",
  },
  {
    id: "section-mini-window",
    icon: <AudioWaveform className="w-3.5 h-3.5 text-fuchsia-500" />,
    iconBg: "bg-fuchsia-500/10",
    titleKey: "settings.nav.miniWindow",
    subtitleKey: "settings.nav.miniWindowSubtitle",
  },
  {
    id: "section-raccourcis",
    icon: <Keyboard className="w-3.5 h-3.5 text-rose-500" />,
    iconBg: "bg-rose-500/10",
    titleKey: "settings.nav.shortcuts",
    subtitleKey: "settings.nav.shortcutsSubtitle",
  },
  {
    id: "section-mises-a-jour",
    icon: <RefreshCw className="w-3.5 h-3.5 text-sky-500" />,
    iconBg: "bg-sky-500/10",
    titleKey: "settings.nav.updates",
    subtitleKey: "settings.nav.updatesSubtitle",
  },
];

// Keep backward compat alias
export const NAV_ITEMS = NAV_ITEM_DEFS;

interface SettingsNavProps {
  activeId: string;
  scrollContainer: RefObject<HTMLDivElement | null>;
}

export function SettingsNav({ activeId, scrollContainer }: SettingsNavProps) {
  const { t } = useTranslation();

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (!el || !scrollContainer.current) return;
    const container = scrollContainer.current;
    const offset = el.offsetTop - container.offsetTop - 16;
    container.scrollTo({ top: offset, behavior: "smooth" });
  };

  return (
    <nav className="w-48 shrink-0 sticky top-0 self-start space-y-0.5 pt-0.5">
      {NAV_ITEM_DEFS.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => scrollTo(item.id)}
          className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-all ${
            activeId === item.id
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
          }`}
        >
          <div
            className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${item.iconBg}`}
          >
            {item.icon}
          </div>
          <div className="min-w-0">
            <p
              className={`text-xs font-semibold leading-none truncate ${
                activeId === item.id ? "text-foreground" : ""
              }`}
            >
              {t(item.titleKey)}
            </p>
            <p className="text-[10px] text-muted-foreground leading-tight mt-0.5 truncate">
              {t(item.subtitleKey)}
            </p>
          </div>
        </button>
      ))}
    </nav>
  );
}
