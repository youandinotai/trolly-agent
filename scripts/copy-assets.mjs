#!/usr/bin/env node
/**
 * Copy the preload script and shared runtime JavaScript (not compiled by tsc)
 * into the build output, and copy the app icons.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const copies = [
  ['electron/preload/index.cjs', 'dist/electron/main/preload/index.cjs'],
  ['src/lib/after-dark-shared.js', 'dist/src/lib/after-dark-shared.js'],
  ['assets/icon.png', 'dist/electron/main/assets/icon.png'],
  ['assets/tray.png', 'dist/electron/main/assets/tray.png'],
];

for (const [from, to] of copies) {
  const src = path.join(root, from);
  const dest = path.join(root, to);
  if (!fs.existsSync(src)) {
    console.warn(`skip (missing): ${from}`);
    continue;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  console.log(`copied ${from} -> ${to}`);
}
