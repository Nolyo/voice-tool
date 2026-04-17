import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

export interface FloatingMenuItem {
  label: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  active?: boolean;
  separator?: never;
}

export interface FloatingMenuSeparator {
  separator: true;
  label?: never;
  onClick?: never;
}

export type FloatingMenuEntry = FloatingMenuItem | FloatingMenuSeparator;

interface FloatingMenuProps {
  open: boolean;
  x: number;
  y: number;
  onClose: () => void;
  items: FloatingMenuEntry[];
  minWidth?: number;
}

export function FloatingMenu({ open, x, y, onClose, items, minWidth = 180 }: FloatingMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const handleScroll = () => onClose();

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    window.addEventListener("resize", handleScroll);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
      window.removeEventListener("resize", handleScroll);
    };
  }, [open, onClose]);

  if (!open) return null;

  // Clamp position to viewport
  const adjustedX = Math.min(x, window.innerWidth - minWidth - 8);
  const adjustedY = Math.min(y, window.innerHeight - items.length * 32 - 8);

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-50 rounded-md border border-border bg-popover text-popover-foreground shadow-md py-1"
      style={{ left: adjustedX, top: adjustedY, minWidth }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((entry, index) => {
        if ("separator" in entry && entry.separator) {
          return <div key={`sep-${index}`} className="my-1 h-px bg-border" />;
        }
        const item = entry as FloatingMenuItem;
        return (
          <button
            key={index}
            type="button"
            disabled={item.disabled}
            className={`w-full text-left text-xs px-3 py-1.5 transition-colors ${
              item.disabled
                ? "text-muted-foreground/50 cursor-not-allowed"
                : item.danger
                ? "text-destructive hover:bg-destructive/10"
                : item.active
                ? "bg-accent/60 text-foreground"
                : "hover:bg-accent/70"
            }`}
            onClick={() => {
              if (!item.disabled) {
                item.onClick();
                onClose();
              }
            }}
          >
            {item.label}
          </button>
        );
      })}
    </div>,
    document.body,
  );
}
