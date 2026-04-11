import type { ReactNode, RefObject } from "react";
import { BookOpen, Keyboard, Mic, RefreshCw, Settings } from "lucide-react";

export interface NavItem {
  id: string;
  icon: ReactNode;
  iconBg: string;
  title: string;
  subtitle: string;
}

export const NAV_ITEMS: NavItem[] = [
  {
    id: "section-transcription",
    icon: <Settings className="w-3.5 h-3.5 text-violet-500" />,
    iconBg: "bg-violet-500/10",
    title: "IA",
    subtitle: "Transcription & notes intelligentes",
  },
  {
    id: "section-audio",
    icon: <Mic className="w-3.5 h-3.5 text-blue-500" />,
    iconBg: "bg-blue-500/10",
    title: "Audio",
    subtitle: "Enregistrement et sons",
  },
  {
    id: "section-texte",
    icon: <span className="text-xs font-bold text-emerald-500 leading-none">T</span>,
    iconBg: "bg-emerald-500/10",
    title: "Texte",
    subtitle: "Formatage et insertion",
  },
  {
    id: "section-vocabulaire",
    icon: <BookOpen className="w-3.5 h-3.5 text-cyan-500" />,
    iconBg: "bg-cyan-500/10",
    title: "Vocabulaire",
    subtitle: "Snippets et mots",
  },
  {
    id: "section-systeme",
    icon: <Settings className="w-3.5 h-3.5 text-orange-500" />,
    iconBg: "bg-orange-500/10",
    title: "Système",
    subtitle: "Démarrage et fichiers",
  },
  {
    id: "section-raccourcis",
    icon: <Keyboard className="w-3.5 h-3.5 text-rose-500" />,
    iconBg: "bg-rose-500/10",
    title: "Raccourcis",
    subtitle: "Touches de commande",
  },
  {
    id: "section-mises-a-jour",
    icon: <RefreshCw className="w-3.5 h-3.5 text-sky-500" />,
    iconBg: "bg-sky-500/10",
    title: "Mises à jour",
    subtitle: "Nouvelles versions",
  },
];

interface SettingsNavProps {
  activeId: string;
  scrollContainer: RefObject<HTMLDivElement | null>;
}

export function SettingsNav({ activeId, scrollContainer }: SettingsNavProps) {
  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (!el || !scrollContainer.current) return;
    const container = scrollContainer.current;
    const offset = el.offsetTop - container.offsetTop - 16;
    container.scrollTo({ top: offset, behavior: "smooth" });
  };

  return (
    <nav className="w-48 shrink-0 sticky top-0 self-start space-y-0.5 pt-0.5">
      {NAV_ITEMS.map((item) => (
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
              {item.title}
            </p>
            <p className="text-[10px] text-muted-foreground leading-tight mt-0.5 truncate">
              {item.subtitle}
            </p>
          </div>
        </button>
      ))}
    </nav>
  );
}
