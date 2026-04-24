import { PWNED_PASSWORD_HASHES } from "./pwned-passwords-list";

/** SHA-256 hex digest of an arbitrary string using the Web Crypto API. */
async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Returns true if the password is in the top-10k pwned list. */
export async function isPwnedPassword(password: string): Promise<boolean> {
  const hash = await sha256Hex(password);
  return binarySearch(PWNED_PASSWORD_HASHES, hash);
}

function binarySearch(sorted: readonly string[], target: string): boolean {
  let lo = 0;
  let hi = sorted.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] === target) return true;
    if (sorted[mid] < target) lo = mid + 1;
    else hi = mid - 1;
  }
  return false;
}
