import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { MediaVault } from '../electron/main/vault.ts';
import { hashVaultPassword, isEncryptedVaultBytes } from '../src/lib/vault-lock.ts';

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'trolly-vault-'));
  const appRoot = path.join(root, 'app');
  const vaultDir = path.join(root, 'user-data', 'vault');
  fs.mkdirSync(appRoot, { recursive: true });
  return { root, appRoot, vaultDir, vault: new MediaVault(vaultDir, appRoot) };
}

test('new Vault files and names are encrypted, and locking drops access', () => {
  const { root, vaultDir, vault } = fixture();
  try {
    vault.setPassword('correct horse battery staple');
    const bytes = Buffer.alloc(32, 65);
    const added = vault.add('private-image.png', bytes.toString('base64'));
    const files = fs.readdirSync(path.join(vaultDir, 'images'));
    assert.deepEqual(files.sort(), ['index.vault', `${added.id}.vault`].sort());
    assert.equal(isEncryptedVaultBytes(fs.readFileSync(path.join(vaultDir, 'images', 'index.vault'))), true);
    assert.equal(isEncryptedVaultBytes(fs.readFileSync(path.join(vaultDir, 'images', `${added.id}.vault`))), true);
    assert.equal(fs.readFileSync(path.join(vaultDir, 'images', 'index.vault')).includes('private-image'), false);
    assert.deepEqual(Buffer.from(vault.read(added.id).dataBase64, 'base64'), bytes);

    vault.lock();
    assert.equal(vault.status().unlocked, false);
    assert.equal(vault.read(added.id), null);
    assert.throws(() => vault.unlock('wrong password'), /did not match/i);
    assert.equal(vault.unlock('correct horse battery staple').unlocked, true);
    assert.equal(vault.list()[0].name, 'private-image.png');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('legacy Vault migration requires explicit confirmation and preserves files', () => {
  const { root, vaultDir, vault } = fixture();
  try {
    const images = path.join(vaultDir, 'images');
    fs.mkdirSync(images, { recursive: true });
    const oldFile = path.join(images, '1700000000000-legacy-image.png');
    const bytes = Buffer.alloc(24, 42);
    fs.writeFileSync(oldFile, bytes);
    fs.writeFileSync(path.join(vaultDir, 'lock.json'), JSON.stringify(hashVaultPassword('legacy-password')));

    assert.equal(vault.status().encryptionVersion, 0);
    assert.throws(() => vault.unlock('legacy-password'), /confirm the encryption migration/i);
    assert.deepEqual(fs.readFileSync(oldFile), bytes);

    assert.equal(vault.unlock('legacy-password', true).encryptionVersion, 1);
    assert.equal(fs.existsSync(oldFile), false);
    const [item] = vault.list();
    assert.equal(item.name, 'legacy-image.png');
    assert.deepEqual(Buffer.from(vault.read(item.id).dataBase64, 'base64'), bytes);
    assert.equal(isEncryptedVaultBytes(fs.readFileSync(path.join(images, 'index.vault'))), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
