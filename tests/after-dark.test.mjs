// TDD RED: local, age-gated After Dark img2img for Trolly Agent.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import {
  AFTER_DARK_DEFAULT_POSITIVE,
  assertAfterDarkAllowed,
  assertAfterDarkPrompt,
  buildAfterDarkWorkflow,
  imageBytesFromWebsocket,
  resolveAfterDarkOutputDir,
} from '../src/lib/after-dark.ts';

test('After Dark requires both age verification and the adult preference', () => {
  assert.throws(() => assertAfterDarkAllowed({ ageVerified: false, adultContent: false }), /age check/i);
  assert.throws(() => assertAfterDarkAllowed({ ageVerified: true, adultContent: false }), /adult content/i);
  assert.throws(() => assertAfterDarkAllowed({ ageVerified: false, adultContent: true }), /age check/i);
  assert.throws(() => assertAfterDarkAllowed({ ageVerified: true, adultContent: true }, false), /current session/i);
  assert.doesNotThrow(() => assertAfterDarkAllowed({ ageVerified: true, adultContent: true }, true));
});

test('After Dark hard boundaries reject minors, coercion, and gore', () => {
  assert.throws(() => assertAfterDarkPrompt('underage girl'), /adults only/i);
  assert.throws(() => assertAfterDarkPrompt('non-consensual encounter'), /consensual/i);
  assert.throws(() => assertAfterDarkPrompt('bloody gore'), /gore|violence/i);
  assert.doesNotThrow(() => assertAfterDarkPrompt(AFTER_DARK_DEFAULT_POSITIVE));
});

test('After Dark permits clearly legal college adults and consensual fetish dynamics', () => {
  assert.doesNotThrow(() => assertAfterDarkPrompt('22-year-old adult college woman, consensual bondage and power exchange'));
  assert.doesNotThrow(() => assertAfterDarkPrompt('19-year-old adult teen, consensual service and praise'));
});

test('After Dark builds local Pony img2img and never saves through ComfyUI output', () => {
  const graph = buildAfterDarkWorkflow({
    positive: AFTER_DARK_DEFAULT_POSITIVE,
    negative: 'low quality',
    referenceImage: 'trolly-source.png',
    checkpoint: 'ponyDiffusionV6XL_v6StartWithThisOne.safetensors',
    seed: 777,
    denoise: 0.72,
  });
  const nodes = Object.values(graph.prompt);
  const classes = nodes.map((node) => node.class_type);
  for (const expected of ['CheckpointLoaderSimple', 'LoadImage', 'VAEEncode', 'KSampler', 'VAEDecode', 'SaveImageWebsocket']) {
    assert.ok(classes.includes(expected), `missing ${expected}`);
  }
  assert.ok(!classes.includes('SaveImage'), 'explicit output must not land in ComfyUI output history');
  assert.match(String(graph.prompt['5'].inputs.text), /low quality/);
  assert.match(String(graph.prompt['5'].inputs.text), /underage/i, 'immutable safety negative cannot be removed');
  assert.match(String(graph.prompt['5'].inputs.text), /non-consensual/i, 'consent protection is always present');
  assert.match(String(graph.prompt['5'].inputs.text), /bestiality/i, 'exploitation protection is always present');
  assert.equal(graph.prompt['2'].inputs.image, 'trolly-source.png');
  assert.equal(graph.prompt['6'].inputs.seed, 777);
  assert.equal(graph.prompt['6'].inputs.denoise, 0.72);
  assert.equal(graph.prompt['8'].class_type, 'SaveImageWebsocket');

  for (const [id, node] of Object.entries(graph.prompt)) {
    for (const [key, value] of Object.entries(node.inputs)) {
      if (Array.isArray(value) && typeof value[0] === 'string') {
        assert.ok(graph.prompt[value[0]], `node ${id}.${key} references missing node ${value[0]}`);
      }
    }
  }
});

test('After Dark requires a reference and valid denoise', () => {
  assert.throws(() => buildAfterDarkWorkflow({ positive: 'adult', referenceImage: '' }), /reference/i);
  assert.throws(
    () => buildAfterDarkWorkflow({ positive: 'adult', referenceImage: 'x.png', denoise: 0 }),
    /denoise/i,
  );
  assert.throws(
    () => buildAfterDarkWorkflow({ positive: 'adult', referenceImage: 'x.png', denoise: 1.1 }),
    /denoise/i,
  );
});

test('After Dark output defaults to the adult D: lane and rejects C: or repo output', () => {
  const appRoot = path.resolve('D:/Trolly/app');
  const dir = resolveAfterDarkOutputDir({}, appRoot);
  assert.match(dir, /^D:\\/i);
  assert.match(dir, /Trolly/i);
  assert.notEqual(path.resolve(dir), appRoot);
  assert.throws(() => resolveAfterDarkOutputDir({ TROLLY_AFTER_DARK_DIR: 'C:/forbidden' }, appRoot), /D:/i);
  assert.throws(
    () => resolveAfterDarkOutputDir({ TROLLY_AFTER_DARK_DIR: 'D:/Trolly/app/data/adult' }, appRoot),
    /outside/i,
  );
});

test('websocket image extraction strips the eight-byte ComfyUI header', () => {
  const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
  const packet = new Uint8Array(8 + png.length);
  packet.set(png, 8);
  const extracted = imageBytesFromWebsocket(packet.buffer);
  assert.deepEqual(Array.from(extracted), Array.from(png));
  assert.throws(() => imageBytesFromWebsocket(new ArrayBuffer(4)), /too short/i);
  assert.throws(() => imageBytesFromWebsocket(new Uint8Array(12).buffer), /PNG|JPEG/i);
});
