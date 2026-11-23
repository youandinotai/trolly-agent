import test from 'node:test';
import assert from 'node:assert/strict';

import { assertAgeVerified, assertVaultAccess } from '../src/lib/access-policy.ts';

test('MCP actions require the 21+ verification state', () => {
  assert.throws(() => assertAgeVerified(false, 'calling an MCP tool'), /21\+ age check/i);
  assert.doesNotThrow(() => assertAgeVerified(true, 'calling an MCP tool'));
});

test('Vault access requires both 21+ verification and Adult mode', () => {
  assert.throws(() => assertVaultAccess(false, true), /21\+ age check/i);
  assert.throws(() => assertVaultAccess(true, false), /21\+ age check/i);
  assert.doesNotThrow(() => assertVaultAccess(true, true));
});
