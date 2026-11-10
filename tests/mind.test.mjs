// TDD RED: the agent's mind store — persona, long-term memories, recipes.
//
// The store is the agent's persistent identity, so it must survive a reload,
// round-trip every field, and never lose data to a corrupt file.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { MindStore } from '../electron/main/mind.ts';

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'trolly-mind-'));
}

test('a fresh store reports empty, not broken', () => {
  const store = new MindStore(tmpDir());
  const doc = store.read();
  assert.deepEqual(doc.personas, []);
  assert.deepEqual(doc.memories, []);
  assert.deepEqual(doc.recipes, []);
  assert.equal(store.activePersona(), null);
});

test('saving a persona makes it the active one and persists to disk', () => {
  const dir = tmpDir();
  const store = new MindStore(dir);
  const saved = store.savePersona({
    name: 'Trolly',
    content: 'You are sharp, warm and slightly wicked.',
  });

  assert.ok(saved.id, 'persona gets an id');
  assert.equal(store.activePersona()?.content, 'You are sharp, warm and slightly wicked.');

  // A second process reading the same directory must see the same persona.
  const reopened = new MindStore(dir);
  assert.equal(reopened.activePersona()?.content, 'You are sharp, warm and slightly wicked.');
});

test('editing a persona updates in place rather than appending', () => {
  const store = new MindStore(tmpDir());
  const first = store.savePersona({ name: 'A', content: 'one' });
  store.savePersona({ id: first.id, name: 'A', content: 'two' });

  const doc = store.read();
  assert.equal(doc.personas.length, 1, 'no duplicate personas');
  assert.equal(doc.personas[0].content, 'two');
});

test('memories round-trip with tags and can be deleted', () => {
  const dir = tmpDir();
  const store = new MindStore(dir);
  const mem = store.saveMemory({
    title: 'ComfyUI lives on D:',
    content: 'Started with --enable-cors-header so browser apps can reach it.',
    tags: ['setup', 'comfy'],
  });

  assert.deepEqual(mem.tags, ['setup', 'comfy']);
  assert.equal(new MindStore(dir).read().memories.length, 1);

  store.deleteMemory(mem.id);
  assert.equal(store.read().memories.length, 0);
});

test('recipes round-trip and can be deleted', () => {
  const dir = tmpDir();
  const store = new MindStore(dir);
  const rec = store.saveRecipe({ title: 'Summarise', prompt: 'Summarise in five bullets:' });

  assert.equal(new MindStore(dir).read().recipes[0].prompt, 'Summarise in five bullets:');

  store.deleteRecipe(rec.id);
  assert.equal(store.read().recipes.length, 0);
});

test('a corrupt mind file does not crash the app', () => {
  const dir = tmpDir();
  fs.writeFileSync(path.join(dir, 'mind.json'), '{ this is not json', 'utf8');

  const store = new MindStore(dir);
  const doc = store.read();
  assert.deepEqual(doc.personas, [], 'falls back to an empty mind');
  assert.deepEqual(doc.memories, []);
  assert.deepEqual(doc.recipes, []);

  // And it must still be writable afterwards.
  store.saveRecipe({ title: 'ok', prompt: 'still works' });
  assert.equal(store.read().recipes.length, 1);
});

test('adult content cannot be enabled before the age check', () => {
  const store = new MindStore(tmpDir());
  assert.throws(
    () => store.setAdultContent(true),
    /age check/i,
    'the gate must refuse to open without verification',
  );
  assert.equal(store.readPreferences().adultContent, false);
});

test('a birth year under 18 is rejected and the gate stays shut', () => {
  const store = new MindStore(tmpDir());
  const tooYoung = new Date().getFullYear() - 12;
  assert.throws(() => store.verifyAge(tooYoung), /adults only/i);
  assert.equal(store.readPreferences().ageVerified, false);
  assert.throws(() => store.setAdultContent(true), /age check/i);
});

test('a nonsense birth year is rejected', () => {
  const store = new MindStore(tmpDir());
  assert.throws(() => store.verifyAge(0), /valid year/i);
  assert.throws(() => store.verifyAge(NaN), /valid year/i);
  assert.throws(() => store.verifyAge(99999), /valid year/i);
});

test('a legal adult can pass the check and then enable adult content', () => {
  const dir = tmpDir();
  const store = new MindStore(dir);
  const prefs = store.verifyAge(new Date().getFullYear() - 30);
  assert.equal(prefs.ageVerified, true);
  assert.ok(prefs.verifiedAt, 'records when the check happened');

  const after = store.setAdultContent(true);
  assert.equal(after.adultContent, true);

  // Persisted, not just in memory.
  assert.equal(new MindStore(dir).readPreferences().adultContent, true);
});

test('clearing the age check also switches adult content off', () => {
  const store = new MindStore(tmpDir());
  store.verifyAge(new Date().getFullYear() - 30);
  store.setAdultContent(true);

  const prefs = store.resetVerification();
  assert.equal(prefs.ageVerified, false);
  assert.equal(prefs.adultContent, false, 'the preference must not outlive the check');
});
