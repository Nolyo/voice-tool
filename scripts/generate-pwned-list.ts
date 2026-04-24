/**
 * Generates src/lib/pwned-passwords-list.ts from a public list of the most
 * common pwned passwords (SecLists / HaveIBeenPwned top-10k).
 *
 * Source: https://raw.githubusercontent.com/danielmiessler/SecLists/master/Passwords/Common-Credentials/xato-net-10-million-passwords-10000.txt
 * (SecLists renamed the file from 10-million-password-list-top-10000.txt)
 *
 * Run: pnpm run gen:pwned
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const SOURCE_URL =
  "https://raw.githubusercontent.com/danielmiessler/SecLists/master/Passwords/Common-Credentials/xato-net-10-million-passwords-10000.txt";

async function main() {
  console.log(`Fetching ${SOURCE_URL}…`);
  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
  const text = await res.text();
  const passwords = text
    .split(/\r?\n/)
    .map((p) => p.trim())
    .filter((p) => p.length >= 1 && p.length <= 64);
  const unique = Array.from(new Set(passwords));
  console.log(`Got ${unique.length} unique passwords. Hashing…`);

  // Store hex-encoded SHA-256 hashes to avoid shipping raw plaintexts in the bundle.
  const crypto = await import("node:crypto");
  const hashes = unique.map((p) =>
    crypto.createHash("sha256").update(p).digest("hex"),
  );
  hashes.sort();

  const out = `// GENERATED FILE — do not edit.
// Run \`pnpm run gen:pwned\` to regenerate from SecLists top-10k.
// Contains SHA-256 hex digests of the top-10k most-pwned passwords.

export const PWNED_PASSWORD_HASHES: readonly string[] = ${JSON.stringify(hashes, null, 0)};
`;
  const path = resolve("src/lib/pwned-passwords-list.ts");
  writeFileSync(path, out);
  console.log(`Wrote ${path} (${hashes.length} entries).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
