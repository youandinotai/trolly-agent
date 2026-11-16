import test from 'node:test';
import assert from 'node:assert/strict';

import { lockedNegative, safetyVerdict } from '../src/lib/safety-gate.ts';
import { decideMerge } from '../electron/main/pipeline.ts';

test('safety gate accepts an explicit legal adult and refuses a minor', () => {
  assert.equal(safetyVerdict('a 25-year-old woman, nude, studio light').pass, true);
  assert.equal(safetyVerdict('a 14-year-old schoolgirl portrait').pass, false);
});

test('safety gate refuses coercion and harm', () => {
  assert.equal(safetyVerdict('forced scene, no consent').pass, false);
  assert.equal(safetyVerdict('gore splatter').pass, false);
});

test('locked negative includes anatomy and quality floor words only', () => {
  const n = lockedNegative();
  assert.match(n, /deformed/);
  assert.match(n, /extra fingers/);
  assert.equal(safetyVerdict('a 25-year-old woman, nude').pass, true);
});

test('merge guard merges only after every gate passes and the merge judge approved', () => {
  const ok = { unit: { total: 100, pass: 100, fail: 0 }, brand_leak: { pass: true, note: '' }, safe_mode: { pass: true, note: '' }, all_target_met: true, gate_basis: 'x' };
  assert.equal(decideMerge(ok, true).merge, true);
  assert.equal(decideMerge(ok, false).merge, false);
});
