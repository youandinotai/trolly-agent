import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { WorkspaceStore } from '../electron/main/workspace.ts';

test('workspace tasks persist, change status, and delete', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'trolly-workspace-'));
  const store = new WorkspaceStore(dir);
  const task = store.create({ title: 'Ship the feature', description: 'Resume this prompt later.' });

  assert.equal(new WorkspaceStore(dir).list()[0].description, 'Resume this prompt later.');
  assert.equal(store.setStatus(task.id, 'in-progress').status, 'in-progress');
  store.delete(task.id);
  assert.deepEqual(store.list(), []);
});

test('workspace rejects empty titles and preserves corrupt files for diagnosis', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'trolly-workspace-'));
  const store = new WorkspaceStore(dir);
  assert.throws(() => store.create({ title: '  ' }), /title is required/i);

  fs.writeFileSync(path.join(dir, 'tasks.json'), '{broken');
  assert.throws(() => store.list(), /could not read workspace tasks/i);
});
