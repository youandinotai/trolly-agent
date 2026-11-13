import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { StudioStore } from '../electron/main/studio.ts';

function tmpDir() {
  fs.mkdirSync('D:/Grindroid/trolly-agent/test-tmp', { recursive: true });
  return fs.mkdtempSync('D:/Grindroid/trolly-agent/test-tmp/studio-');
}

test('studio refuses output outside the D: adult lane', () => {
  assert.throws(() => new StudioStore('C:/forbidden', { seedDefaults: false }), /D:/i);
  assert.throws(() => new StudioStore('D:/mira/trolly-agent/data/studio', { seedDefaults: false }), /outside/i);
});

test('actors, garments, and scenes round-trip through the admin store', () => {
  const dir = tmpDir();
  const store = new StudioStore(dir, { seedDefaults: false });
  assert.deepEqual(store.read(), { actors: [], garments: [], scenes: [], activeActorId: null });

  const garment = store.saveGarment({ name: 'Scarlet bikini', category: 'bikini', color: '#e11d48', scale: 1 });
  const scene = store.saveScene({ name: 'Neon stage', background: '#0d0714', accent: '#67e8f9', lightIntensity: 1.2 });
  const actor = store.saveActor({
    name: 'Trolly', role: 'actress', modelPath: 'D:/models/trolly.vrm',
    hair: { color: '#f3f5f7', length: 1.2, volume: 1 }, smile: 0.5,
    garmentIds: [garment.id], sceneId: scene.id,
  });
  const duplicate = store.saveGarment({ name: 'Scarlet bikini', category: 'bikini', color: '#e11d48', scale: 1 });
  assert.equal(duplicate.id, garment.id, 'same named garment updates rather than duplicates');
  assert.equal(store.read().garments.length, 1);

  const reopened = new StudioStore(dir, { seedDefaults: false }).read();
  assert.equal(reopened.actors.length, 1);
  assert.equal(reopened.garments.length, 1);
  assert.equal(reopened.scenes.length, 1);
  assert.equal(reopened.actors[0].garmentIds[0], garment.id);
  assert.equal(reopened.activeActorId, actor.id);
});

test('uploaded artwork and VRM files stay inside the studio asset folder', () => {
  const dir = tmpDir();
  const store = new StudioStore(dir, { seedDefaults: false });
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
  const uploaded = store.uploadAsset({ name: 'bikini.png', dataBase64: png.toString('base64'), kind: 'image' });
  assert.match(uploaded.path, /^D:/i);
  assert.ok(uploaded.path.startsWith(path.resolve(dir)));
  assert.equal(fs.readFileSync(uploaded.path).length, png.length);
  const read = store.readAsset(uploaded.path);
  assert.equal(Buffer.from(read.dataBase64, 'base64').length, png.length);
  assert.throws(() => store.uploadAsset({ name: 'bad.exe', dataBase64: png.toString('base64'), kind: 'image' }), /image/i);
});
