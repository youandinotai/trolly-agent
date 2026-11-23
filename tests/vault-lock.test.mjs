import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createVaultLock,
  decryptVaultBytes,
  encryptVaultBytes,
  hashVaultPassword,
  unlockVaultKey,
  vaultPasswordMatches,
} from '../src/lib/vault-lock.ts';

test('vault password hash matches only the same password', () => {
  const record = hashVaultPassword('walk-away');
  assert.equal(vaultPasswordMatches('walk-away', record.salt, record.hash), true);
  assert.equal(vaultPasswordMatches('wrong', record.salt, record.hash), false);
});

test('vault password rejects a short secret', () => {
  assert.throws(() => hashVaultPassword('no'), /4 characters/i);
});

test('vault encryption authenticates file bytes and wraps a random key', () => {
  const key = Buffer.alloc(32, 7);
  const lock = createVaultLock('correct horse battery staple', key);
  const recovered = unlockVaultKey('correct horse battery staple', lock);
  assert.deepEqual(recovered, key);
  assert.equal(unlockVaultKey('wrong password', lock), null);

  const clear = Buffer.from('synthetic vault fixture');
  const encrypted = encryptVaultBytes(clear, key);
  assert.deepEqual(decryptVaultBytes(encrypted, key), clear);
  encrypted[encrypted.length - 1] ^= 1;
  assert.throws(() => decryptVaultBytes(encrypted, key), /authentication failed/i);
});

test('new vault passwords require twelve characters', () => {
  assert.throws(
    () => createVaultLock('short-pass', Buffer.alloc(32)),
    /12 characters/i,
  );
});
