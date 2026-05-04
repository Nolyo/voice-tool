import { useEffect, useRef } from "react";

interface OtpInputProps {
  value: string;
  onChange: (next: string) => void;
  length?: number;
  disabled?: boolean;
  autoFocus?: boolean;
  ariaLabel?: string;
}

export function OtpInput({
  value,
  onChange,
  length = 6,
  disabled = false,
  autoFocus = false,
  ariaLabel,
}: OtpInputProps) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const cells = Array.from({ length }, (_, i) => value[i] ?? "");

  useEffect(() => {
    if (autoFocus) inputRefs.current[0]?.focus();
  }, [autoFocus]);

  function setCell(i: number, ch: string) {
    const next = cells.slice();
    next[i] = ch;
    onChange(next.join(""));
  }

  function handleChange(i: number, raw: string) {
    if (!/^\d?$/.test(raw)) return;
    setCell(i, raw);
    if (raw && i < length - 1) inputRefs.current[i + 1]?.focus();
  }

  function handleKey(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !cells[i] && i > 0) {
      inputRefs.current[i - 1]?.focus();
    } else if (e.key === "ArrowLeft" && i > 0) {
      e.preventDefault();
      inputRefs.current[i - 1]?.focus();
    } else if (e.key === "ArrowRight" && i < length - 1) {
      e.preventDefault();
      inputRefs.current[i + 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    if (!pasted) return;
    e.preventDefault();
    onChange(pasted);
    inputRefs.current[Math.min(pasted.length, length - 1)]?.focus();
  }

  const midSeparator = Math.floor(length / 2);

  return (
    <div className="flex items-center gap-2 justify-center my-6">
      {cells.map((c, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            ref={(el) => {
              inputRefs.current[i] = el;
            }}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={c}
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKey(i, e)}
            onPaste={i === 0 ? handlePaste : undefined}
            maxLength={1}
            disabled={disabled}
            aria-label={ariaLabel ? `${ariaLabel} ${i + 1}` : undefined}
            className="w-11 h-[52px] rounded-[10px] text-center vt-mono text-[22px] font-semibold transition disabled:opacity-50"
            style={{
              background: c
                ? "oklch(from var(--vt-accent) l c h / 0.08)"
                : "var(--vt-surface)",
              border:
                "1px solid " +
                (c
                  ? "oklch(from var(--vt-accent) l c h / 0.4)"
                  : "var(--vt-border)"),
              color: "var(--vt-fg)",
              caretColor: "var(--vt-accent)",
              outline: "none",
            }}
            onFocus={(e) => {
              e.currentTarget.style.boxShadow =
                "0 0 0 3px oklch(from var(--vt-accent) l c h / 0.25)";
              e.currentTarget.style.borderColor = "var(--vt-accent)";
            }}
            onBlur={(e) => {
              e.currentTarget.style.boxShadow = "none";
              e.currentTarget.style.borderColor = c
                ? "oklch(from var(--vt-accent) l c h / 0.4)"
                : "var(--vt-border)";
            }}
          />
          {i === midSeparator - 1 && length > 2 && (
            <span className="text-[20px]" style={{ color: "var(--vt-fg-4)" }}>
              —
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
