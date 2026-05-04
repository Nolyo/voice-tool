import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import type { SlashCommandItem } from "./slashCommandItems";

export interface SlashCommandListRef {
  onKeyDown: (event: KeyboardEvent) => boolean;
}

interface SlashCommandListProps {
  items: SlashCommandItem[];
  command: (item: SlashCommandItem) => void;
}

export const SlashCommandList = forwardRef<SlashCommandListRef, SlashCommandListProps>(
  function SlashCommandList({ items, command }, ref) {
    const { t } = useTranslation();
    const [selected, setSelected] = useState(0);

    useEffect(() => {
      setSelected(0);
    }, [items]);

    useImperativeHandle(ref, () => ({
      onKeyDown: (event) => {
        if (event.key === "ArrowUp") {
          event.preventDefault();
          setSelected((i) => (i - 1 + items.length) % items.length);
          return true;
        }
        if (event.key === "ArrowDown") {
          event.preventDefault();
          setSelected((i) => (i + 1) % items.length);
          return true;
        }
        if (event.key === "Enter") {
          event.preventDefault();
          const item = items[selected];
          if (item) command(item);
          return true;
        }
        return false;
      },
    }));

    if (items.length === 0) {
      return (
        <div
          className="vt-slash-menu vt-app rounded-md shadow-md p-1 min-w-[220px]"
          style={{
            background: "var(--vt-panel-2)",
            border: "1px solid var(--vt-border)",
            color: "var(--vt-fg)",
          }}
        >
          <div className="px-2 py-1.5 text-xs" style={{ color: "var(--vt-fg-3)" }}>
            {t("notes.slashMenu.noMatch", { defaultValue: "Aucune commande" })}
          </div>
        </div>
      );
    }

    return (
      <div
        className="vt-slash-menu vt-app rounded-md shadow-md p-1 min-w-[220px] max-h-[280px] overflow-y-auto"
        style={{
          background: "var(--vt-panel-2)",
          border: "1px solid var(--vt-border)",
          color: "var(--vt-fg)",
        }}
      >
        {items.map((item, idx) => {
          const Icon = item.icon;
          const isActive = idx === selected;
          return (
            <button
              key={item.titleKey}
              onClick={() => command(item)}
              onMouseEnter={() => setSelected(idx)}
              className="flex items-center gap-2 w-full px-2 py-1.5 text-left text-xs rounded-sm transition-colors"
              style={
                isActive
                  ? {
                      background: "var(--vt-accent-soft)",
                      color: "var(--vt-accent-2)",
                    }
                  : undefined
              }
              onMouseOver={(e) => {
                if (!isActive) e.currentTarget.style.background = "var(--vt-hover)";
              }}
              onMouseOut={(e) => {
                if (!isActive) e.currentTarget.style.background = "";
              }}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span>{t(item.titleKey)}</span>
            </button>
          );
        })}
      </div>
    );
  },
);
