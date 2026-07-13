import type { CSSProperties } from "react";
import { Folder } from "lucide-react";

interface FolderIconProps {
  icon?: string;
  className?: string;
  style?: CSSProperties;
}

/** Renders a folder's emoji icon when set, the default lucide `Folder` glyph
 * otherwise. The emoji is decorative (the folder name is always adjacent),
 * hence aria-hidden. Callers pass the same sizing classes they used on
 * `<Folder>` (`w-3 h-3` & co); the fixed 11px font keeps the emoji inside
 * that box. */
export function FolderIcon({ icon, className, style }: FolderIconProps) {
  if (icon) {
    return (
      <span
        aria-hidden="true"
        className={`inline-flex items-center justify-center leading-none select-none text-[11px] ${className ?? ""}`}
        style={style}
      >
        {icon}
      </span>
    );
  }
  return <Folder className={className} style={style} />;
}
