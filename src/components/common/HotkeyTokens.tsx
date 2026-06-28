import { Fragment } from "react";
import { KeyBadge } from "@/components/settings/common/KeyBadge";

/** Renders a hotkey string ("Ctrl+F11") as a row of key badges joined by "+". */
export function HotkeyTokens({ shortcut }: { shortcut: string }) {
  const tokens = shortcut
    .split("+")
    .map((s) => s.trim())
    .filter(Boolean);

  return (
    <span className="inline-flex items-center gap-0.5">
      {tokens.map((tok, i) => (
        <Fragment key={`${tok}-${i}`}>
          {i > 0 && (
            <span className="text-[var(--vt-fg-3)] text-[11px]">+</span>
          )}
          <KeyBadge token={tok} />
        </Fragment>
      ))}
    </span>
  );
}
