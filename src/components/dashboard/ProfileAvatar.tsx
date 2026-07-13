import { useEffect, useState } from "react";

/** Initials shown when a profile has no photo. Moved from ProfileSwitcher. */
export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

interface ProfileAvatarProps {
  /** PNG data-URL from `get_profile_avatar`; falsy = initials fallback. */
  avatarUrl?: string | null;
  name: string;
  /** Sizing + font-size classes, e.g. "w-7 h-7 text-[11px]". */
  className?: string;
}

export function ProfileAvatar({
  avatarUrl,
  name,
  className = "",
}: ProfileAvatarProps) {
  // A corrupt avatar.png on disk would render as a broken-image glyph;
  // fall back to initials instead, and retry when the URL changes.
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [avatarUrl]);

  if (avatarUrl && !broken) {
    return (
      <img
        src={avatarUrl}
        alt=""
        aria-hidden="true"
        onError={() => setBroken(true)}
        className={`rounded-md object-cover ring-1 ring-primary/30 shrink-0 ${className}`}
      />
    );
  }
  return (
    <div
      className={`rounded-md bg-primary/15 ring-1 ring-primary/30 flex items-center justify-center font-semibold text-primary shrink-0 ${className}`}
    >
      {getInitials(name)}
    </div>
  );
}
