// TDD RED: generated media is inspected locally and fail-closed before delivery.
import test from 'node:test';
import assert from 'node:assert/strict';

import { parseAfterDarkSafetyVerdict } from '../src/lib/after-dark-safety.ts';

test('local output inspector accepts an explicit safe verdict', () => {
  assert.equal(parseAfterDarkSafetyVerdict('{"safe":true,"reason":"adult consensual fictional artwork"}'), true);
});

test('local output inspector rejects an unsafe verdict', () => {
  assert.equal(parseAfterDarkSafetyVerdict('{"safe":false,"reason":"boundary violation"}'), false);
});

test('local output inspector fails closed on missing, ambiguous, or malformed answers', () => {
  for (const answer of ['', 'probably safe', '{"safe":"yes"}', '{}', 'not json']) {
    assert.throws(() => parseAfterDarkSafetyVerdict(answer), /safety/i);
  }
});
