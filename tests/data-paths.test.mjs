import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { resolveTrollyDataPaths } from '../electron/main/data-paths.ts';

test('local data paths default under Electron userData', () => {
  const userDataPath = path.join(path.parse(process.cwd()).root, 'users', 'test-profile', 'Trolly');
  const paths = resolveTrollyDataPaths(userDataPath, {});
  const dataDir = path.join(userDataPath, 'data');

  assert.equal(paths.dataDir, dataDir);
  assert.equal(paths.vaultDir, path.join(dataDir, 'vault'));
  assert.equal(paths.studioDir, path.join(dataDir, 'studio'));
});

test('local data path overrides remain supported', () => {
  const paths = resolveTrollyDataPaths('unused-user-data', {
    TROLLY_DATA_DIR: 'custom-data',
    TROLLY_VAULT_DIR: 'custom-vault',
    TROLLY_STUDIO_DIR: 'custom-studio',
  });

  assert.equal(paths.dataDir, path.resolve('custom-data'));
  assert.equal(paths.vaultDir, path.resolve('custom-vault'));
  assert.equal(paths.studioDir, path.resolve('custom-studio'));
});
