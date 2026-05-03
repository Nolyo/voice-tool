export function KeyBadge({ token }: { token: string }) {
  return (
    <span className="vt-kbd inline-flex items-center leading-none">
      {token}
    </span>
  );
}
