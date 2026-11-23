import test from 'node:test';
import assert from 'node:assert/strict';

import { parseSoulPreset } from '../src/lib/soul-preset.ts';

test('a .soul preset applies Lora weights, avatar, and memory context', () => {
  const preset = parseSoulPreset({
    id: 'sunny-01',
    name: 'Sunny',
    loraWeights: { style: 0.4 },
    avatarModel: 'hermes-pet',
    memoryContext: ['likes yellow'],
    isNSFW: false,
  });

  assert.equal(preset.name, 'Sunny');
  assert.equal(preset.loraWeights.style, 0.4);
  assert.equal(preset.avatarModel, 'hermes-pet');
  assert.deepEqual(preset.memoryContext, ['likes yellow']);
});

test('an NSFW .soul preset is rejected until 21+ is verified', () => {
  const raw = {
    id: 'night-01',
    name: 'Night',
    loraWeights: {},
    avatarModel: 'hermes-pet',
    memoryContext: [],
    isNSFW: true,
  };

  assert.throws(() => parseSoulPreset(raw, { ageVerified: false }), /21\+/);
  assert.equal(parseSoulPreset(raw, { ageVerified: true }).isNSFW, true);
});
