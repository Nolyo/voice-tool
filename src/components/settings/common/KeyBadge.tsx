export function KeyBadge({ token }: { token: string }) {
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 text-[11px] font-mono font-semibold bg-background border border-border rounded-md leading-none shadow-[0_2px_0_0_hsl(var(--border))]">
      {token}
    </span>
  );
}
