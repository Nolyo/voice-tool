const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const SLUG_LEN = 16;

export function generateSlug(): string {
  const bytes = new Uint8Array(SLUG_LEN);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < SLUG_LEN; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

const SHARE_BASE_URL =
  (import.meta.env.VITE_SHARE_BASE_URL as string | undefined) ?? "https://lexena.app";

export function shareUrl(slug: string): string {
  return `${SHARE_BASE_URL}/s/${slug}`;
}
