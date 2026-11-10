#!/usr/bin/env node
/**
 * Remake "100% Yours" leak scanner.
 *
 * Trolly Agent is a clean-room reimplementation. The original project's brand
 * tokens (the upstream agent product name and its publisher) must not appear
 * anywhere in our own source, assets, or metadata — except inside this file's
 * own pattern table and the excluded paths below.
 *
 * Usage: node scripts/verify-no-leak.mjs [rootDir]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Tokens that must not appear in Trolly Agent's own code or assets. */
export const FORBIDDEN_PATTERNS = [
  '\\bAIRI\\b',
  '\\bairi\\b',
  'moeru',
  'Moeru AI',
  'ai\\.moeru\\.airi',
];

/**
 * The shipped product surface. Only these paths are scanned: the code and
 * assets that actually ship inside the app. Provenance documents (SPEC.md,
 * README) and the test-suite legitimately NAME the source project in order to
 * document what was avoided, so they are not product surface.
 */
const SCAN_SURFACE = ['src', 'electron', 'assets', 'public', 'index.html', 'package.json'];

const EXCLUDE_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'release',
  'rea',
  '.vite',
  'coverage',
  'out',
  'tests',
  'scripts',
]);

const EXCLUDE_FILES = new Set(['package-lock.json', 'verify-no-leak.mjs']);

const TEXT_EXT = new Set([
  '.ts', '.tsx', '.js', '.mjs', '.cjs', '.vue', '.json', '.html', '.css',
  '.scss', '.md', '.txt', '.yml', '.yaml', '.toml', '.svg', '.xml', '.env',
]);

function walk(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (EXCLUDE_DIRS.has(entry.name)) continue;
      walk(full, out);
    } else if (entry.isFile()) {
      if (EXCLUDE_FILES.has(entry.name)) continue;
      out.push(full);
    }
  }
  return out;
}

/**
 * Scan the shipped product surface for forbidden brand tokens.
 * @returns {{file: string, line: number, pattern: string, text: string}[]}
 */
export function scanForBrandLeaks(rootDir) {
  const root = path.resolve(rootDir);
  const files = [];

  for (const entry of SCAN_SURFACE) {
    const full = path.join(root, entry);
    if (!fs.existsSync(full)) continue;
    const stat = fs.statSync(full);
    if (stat.isDirectory()) walk(full, files);
    else files.push(full);
  }

  const leaks = [];

  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    let text;
    try {
      const stat = fs.statSync(file);
      if (stat.size > 4 * 1024 * 1024) continue;
      if (!TEXT_EXT.has(ext)) continue;
      text = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      for (const pattern of FORBIDDEN_PATTERNS) {
        const re = new RegExp(pattern, 'i');
        if (re.test(lines[i])) {
          leaks.push({
            file: path.relative(root, file),
            line: i + 1,
            pattern,
            text: lines[i].trim().slice(0, 160),
          });
        }
      }
    }
  }
  return leaks;
}

// CLI mode
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const root = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(here, '..');
  const leaks = scanForBrandLeaks(root);
  if (leaks.length === 0) {
    console.log('LEAK SCAN: PASS - 0 source-brand tokens found.');
    console.log(`  scanned root: ${root}`);
    process.exit(0);
  }
  console.error(`LEAK SCAN: FAIL - ${leaks.length} source-brand token(s) found.`);
  for (const l of leaks.slice(0, 50)) {
    console.error(`  ${l.file}:${l.line}  [${l.pattern}]  ${l.text}`);
  }
  process.exit(1);
}
