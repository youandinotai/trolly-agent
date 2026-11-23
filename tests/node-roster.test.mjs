import test from 'node:test';
import assert from 'node:assert/strict';

import { listNodes } from '../src/lib/node-roster.ts';

test('a node roster lists projects without storing an address or token', () => {
  const nodes = listNodes([
    { id: 'sabretooth', name: 'Sabretooth', projects: ['trolly-agent', 'studio'] },
    { id: 'other', name: 'Other', projects: ['studio', 'studio'] },
  ]);
  assert.equal(nodes[0].projects[0], 'studio');
  assert.deepEqual(nodes[1].projects, ['studio']);
  assert.equal(JSON.stringify(nodes).includes('192.168'), false);
  assert.equal(JSON.stringify(nodes).includes('token'), false);
});
