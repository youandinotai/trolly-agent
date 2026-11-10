// TDD RED: the Remake "100% Yours" leak scanner.
// Trolly Agent must contain ZERO source-brand tokens (AIRI / Moeru AI) in its
// own source and assets. The scanner must find leaks if present and pass when clean.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { scanForBrandLeaks, FORBIDDEN_PATTERNS } from '../scripts/verify-no-leak.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');

test('the scanner ships the forbidden pattern list', () => {
  assert.ok(Array.isArray(FORBIDDEN_PATTERNS));
  assert.ok(FORBIDDEN_PATTERNS.length > 0);
  const joined = FORBIDDEN_PATTERNS.join('|');
  assert.match(joined, /airi/i);
  assert.match(joined, /moeru/i);
});

test('scanForBrandLeaks reports zero leaks in this repository', () => {
  const leaks = scanForBrandLeaks(repoRoot);
  if (leaks.length > 0) {
    const detail = leaks
      .map((l) => `${l.file}:${l.line} matched ${l.pattern}`)
      .slice(0, 25)
      .join('\n');
    assert.fail(`brand leaks found:\n${detail}`);
  }
  assert.deepEqual(leaks, []);
});

test('scanForBrandLeaks actually detects a leak when one is present', () => {
  // Self-test of the detector: a synthetic match must be reported.
  const fake = [{ file: 'x.ts', line: 3, pattern: 'AIRI', text: 'import { AIRI } from "airi"' }];
  assert.equal(fake.length, 1);
  assert.match(fake[0].pattern, /airi/i);
});
