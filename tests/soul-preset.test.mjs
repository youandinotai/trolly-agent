import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { loadSoulPresetFile, parseSoulPreset } from '../src/lib/soul-preset.ts';

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

test('a .soul file loads only from inside the data directory', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trolly-souls-'));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'trolly-outside-'));
  const preset = {
    id: 'sunny-01',
    name: 'Sunny',
    loraWeights: { style: 0.4 },
    avatarModel: 'hermes-pet',
    memoryContext: ['likes yellow'],
    isNSFW: false,
  };
  fs.writeFileSync(path.join(dataDir, 'sunny.soul'), JSON.stringify(preset));
  fs.writeFileSync(path.join(outside, 'sunny.soul'), JSON.stringify(preset));

  assert.equal(loadSoulPresetFile(dataDir, 'sunny.soul').name, 'Sunny');
  assert.throws(() => loadSoulPresetFile(dataDir, path.join(outside, 'sunny.soul')), /inside the data directory/);
});
