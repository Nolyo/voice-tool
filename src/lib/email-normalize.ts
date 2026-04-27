import { DISPOSABLE_DOMAINS } from "./disposable-domains";

/**
 * Canonicalizes an email for client-side anti-abuse pre-check.
 * Mirrors public.normalize_email() in Postgres (ADR 0011) — server is source of truth.
 *
 * Strips +suffix for any domain. Strips dots only for gmail.com / googlemail.com. Lowercases.
 */
export function normalizeEmail(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return trimmed;
  const lowered = trimmed.toLowerCase();
  const atPos = lowered.indexOf("@");
  if (atPos === -1) return lowered;
  const localRaw = lowered.slice(0, atPos);
  const domain = lowered.slice(atPos + 1);
  const localNoSuffix = localRaw.split("+")[0];
  const local =
    domain === "gmail.com" || domain === "googlemail.com"
      ? localNoSuffix.replace(/\./g, "")
      : localNoSuffix;
  return `${local}@${domain}`;
}

/**
 * Returns true if the email's domain is in the embedded disposable-domain blocklist.
 * Trims and lowercases input internally — same canonicalization rules as normalizeEmail.
 * Returns false on malformed input (no @).
 */
export function isDisposableDomain(input: string): boolean {
  const trimmed = input.trim().toLowerCase();
  const atPos = trimmed.indexOf("@");
  if (atPos === -1) return false;
  return DISPOSABLE_DOMAINS.has(trimmed.slice(atPos + 1).trim());
}
