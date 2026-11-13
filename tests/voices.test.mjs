import test from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_VOICE, FEMALE_VOICES, isNaturalVoice } from '../src/lib/voices.ts';

test('the natural speech catalog contains female Kokoro voices only', () => {
  assert.ok(FEMALE_VOICES.length >= 15);
  assert.ok(FEMALE_VOICES.every((voice) => voice.engine === 'kokoro'));
  assert.ok(FEMALE_VOICES.every((voice) => voice.gender === 'female'));
  assert.ok(FEMALE_VOICES.every((voice) => voice.id[1] === 'f'));
  assert.equal(new Set(FEMALE_VOICES.map((voice) => voice.id)).size, FEMALE_VOICES.length);
});

test('Heart is the default and unknown voice IDs cannot invoke another engine', () => {
  assert.equal(DEFAULT_VOICE, 'af_heart');
  assert.equal(isNaturalVoice(DEFAULT_VOICE), true);
  assert.equal(isNaturalVoice('am_michael'), false);
  assert.equal(isNaturalVoice('Microsoft Zira Desktop'), false);
  assert.equal(isNaturalVoice('elevenlabs:whatever'), false);
});
