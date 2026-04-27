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
      ? localNoSuffix.replaceAll(".", "")
      : localNoSuffix;
  return `${local}@${domain}`;
}

/**
 * Returns true if the email's domain is in the embedded disposable-domain blocklist.
 * Returns false on malformed input (no @).
 */
export function isDisposableDomain(input: string): boolean {
  const atPos = input.indexOf("@");
  if (atPos === -1) return false;
  const domain = input.slice(atPos + 1).trim().toLowerCase();
  return DISPOSABLE_DOMAINS.has(domain);
}
