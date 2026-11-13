import test from 'node:test';
import assert from 'node:assert/strict';

import { sanitizeHermesReviewPacket } from '../src/lib/hermes-review.ts';

test('Hermes review packets contain only sanitized feature facts and counts', () => {
  const packet = sanitizeHermesReviewPacket({
    feature: 'Studio wardrobe',
    checks: ['avatar loaded', 'garment visible', 'save/reload passed'],
    counts: { actors: 1, garments: 3 },
    prompt: 'private prompt',
    imageBase64: 'private image',
    nested: { path: 'D:/private/file.png' },
  });
  assert.deepEqual(packet, {
    feature: 'Studio wardrobe',
    checks: ['avatar loaded', 'garment visible', 'save/reload passed'],
    counts: { actors: 1, garments: 3 },
  });
  assert.equal(JSON.stringify(packet).includes('private'), false);
});

test('Hermes review rejects empty or malformed evidence instead of inventing a review', () => {
  assert.throws(() => sanitizeHermesReviewPacket({ feature: '', checks: [] }), /feature|checks/i);
  assert.throws(() => sanitizeHermesReviewPacket({ feature: 'Studio', checks: ['x'.repeat(400)] }), /200/i);
});
