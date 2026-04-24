#!/usr/bin/env node
/**
 * Scan release artifacts for leaked secrets.
 * Fails with exit code 1 if any pattern is found.
 *
 * Scanned directories:
 *   - dist/                        (frontend bundles after `pnpm build`)
 *   - src-tauri/target/release/    (Tauri binary + bundles)
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

const ROOTS = ['dist', 'src-tauri/target/release'];

// Patterns sensibles. Toute correspondance = build cassé.
const PATTERNS = [
  // Supabase service role key (nouveau format explicite)
  { name: 'supabase-service-role-key', re: /sb_secret_[A-Za-z0-9_-]{20,}/g },
  // Supabase service role JWT (legacy, détectable via la chaîne "service_role" dans un JWT)
  { name: 'supabase-service-role-jwt', re: /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]*service_role[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+/g },
  // Clé privée PEM
  { name: 'pem-private-key', re: /-----BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g },
  // Lemon Squeezy API key (préfixe documenté)
  { name: 'lemonsqueezy-api-key', re: /lsq_[A-Za-z0-9]{20,}/g },
];

// Extensions à ouvrir en mode texte.
const TEXT_EXTS = new Set(['.js', '.mjs', '.cjs', '.ts', '.html', '.css', '.json', '.map', '.txt', '.md', '.yml', '.yaml']);

let findings = [];

async function walk(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (e) {
    if (e.code === 'ENOENT') return;
    throw e;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      // Ignorer les sous-dirs build intermediaires lourds.
      if (['node_modules', 'deps', 'build', 'incremental', '.fingerprint'].includes(e.name)) continue;
      await walk(p);
    } else if (e.isFile()) {
      await scanFile(p);
    }
  }
}

async function scanFile(p) {
  const ext = p.slice(p.lastIndexOf('.')).toLowerCase();
  const s = await stat(p);
  if (s.size > 50 * 1024 * 1024) return; // skip > 50 MB
  const isText = TEXT_EXTS.has(ext);
  let buf;
  try {
    buf = await readFile(p);
  } catch {
    return;
  }
  // Pour les binaires, on fait un scan ASCII brut (string search).
  const content = isText ? buf.toString('utf8') : buf.toString('binary');
  for (const { name, re } of PATTERNS) {
    re.lastIndex = 0;
    const m = content.match(re);
    if (m) {
      findings.push({ file: p, pattern: name, count: m.length });
    }
  }
}

for (const root of ROOTS) {
  await walk(root);
}

if (findings.length > 0) {
  console.error('❌ Secret leak detected in release artifacts:');
  for (const f of findings) {
    console.error(`  - ${f.file}: pattern "${f.pattern}" (${f.count} match${f.count > 1 ? 'es' : ''})`);
  }
  console.error('\nFail. See docs/v3/00-threat-model.md#mesures-défensives measure #2.');
  process.exit(1);
}

console.log('✅ No secret patterns found in release artifacts.');
process.exit(0);
