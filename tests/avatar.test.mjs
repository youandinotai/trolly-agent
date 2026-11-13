import test from 'node:test';
import assert from 'node:assert/strict';

import {
  blinkEnvelope,
  detectEmotion,
  idlePose,
  mouthShapes,
  normalizeAudioLevel,
} from '../src/lib/avatar-motion.ts';

test('reply emotion detection chooses a performable VRM expression', () => {
  assert.equal(detectEmotion('That is wonderful, I love it!'), 'happy');
  assert.equal(detectEmotion('I am sorry that happened.'), 'sad');
  assert.equal(detectEmotion('Wait, really?!'), 'surprised');
  assert.equal(detectEmotion('That makes me furious.'), 'angry');
  assert.equal(detectEmotion('Take a breath and relax.'), 'relaxed');
  assert.equal(detectEmotion('The file is in D:\\mira.'), 'neutral');
});

test('audio normalization ignores silence and responds to sensitivity', () => {
  assert.equal(normalizeAudioLevel(0, 1), 0);
  assert.equal(normalizeAudioLevel(0.005, 2), 0);
  assert.equal(normalizeAudioLevel(2, 1), 1);
  assert.ok(normalizeAudioLevel(0.08, 2) > normalizeAudioLevel(0.08, 1));
});

test('mouth shapes stay bounded and silent audio closes every viseme', () => {
  assert.deepEqual(mouthShapes(0, 0.5), { aa: 0, ee: 0, ih: 0, oh: 0, ou: 0 });
  for (const centroid of [0, 0.25, 0.75, 1]) {
    const shapes = mouthShapes(0.8, centroid);
    assert.ok(Object.values(shapes).every((value) => value >= 0 && value <= 1));
    assert.ok(Object.values(shapes).some((value) => value > 0.2));
  }
});

test('blink envelope closes and opens without drifting outside valid weights', () => {
  assert.equal(blinkEnvelope(-1), 0);
  assert.equal(blinkEnvelope(0), 0);
  assert.ok(blinkEnvelope(0.45) > 0.9);
  assert.equal(blinkEnvelope(1), 0);
  assert.equal(blinkEnvelope(2), 0);
});

test('idle movement is bounded and reduced-motion mode stays still', () => {
  const pose = idlePose(3, { x: 2, y: -2 }, 1, false);
  assert.ok(Math.abs(pose.headYaw) <= 0.31);
  assert.ok(Math.abs(pose.headPitch) <= 0.21);
  assert.ok(Math.abs(pose.spineRoll) < 0.03);
  assert.deepEqual(idlePose(3, { x: 1, y: 1 }, 1, true), {
    headYaw: 0,
    headPitch: 0,
    headRoll: 0,
    spineRoll: 0,
    chestScale: 1,
  });
});
