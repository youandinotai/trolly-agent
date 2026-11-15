import test from 'node:test';
import assert from 'node:assert/strict';

import { hashVaultPassword, vaultPasswordMatches } from '../src/lib/vault-lock.ts';

test('vault password hash matches only the same password', () => {
  const record = hashVaultPassword('walk-away');
  assert.equal(vaultPasswordMatches('walk-away', record.salt, record.hash), true);
  assert.equal(vaultPasswordMatches('wrong', record.salt, record.hash), false);
});

test('vault password rejects a short secret', () => {
  assert.throws(() => hashVaultPassword('no'), /4 characters/i);
});
