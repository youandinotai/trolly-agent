import path from 'node:path';

export interface TrollyDataPaths {
  dataDir: string;
  vaultDir: string;
  studioDir: string;
}

export function resolveTrollyDataPaths(
  userDataPath: string,
  env: Record<string, string | undefined>,
): TrollyDataPaths {
  const dataDir = path.resolve(env.TROLLY_DATA_DIR || path.join(userDataPath, 'data'));
  return {
    dataDir,
    vaultDir: path.resolve(env.TROLLY_VAULT_DIR || path.join(dataDir, 'vault')),
    studioDir: path.resolve(env.TROLLY_STUDIO_DIR || path.join(dataDir, 'studio')),
  };
}
