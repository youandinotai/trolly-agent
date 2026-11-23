import fs from 'node:fs';
import path from 'node:path';

import { containsAdultText } from './content-policy.ts';
import { encryptVaultBytes } from './vault-lock.ts';

export interface SoulPreset {
  id: string;
  name: string;
  loraWeights: Record<string, number>;
  avatarModel: string;
  memoryContext: string[];
  isNSFW: boolean;
}

export function parseSoulPreset(raw: SoulPreset, options: { ageVerified?: boolean } = {}): SoulPreset {
  if (raw.isNSFW && !options.ageVerified) {
    throw new Error('21+ verification is required before an NSFW .soul preset can load.');
  }
  return {
    id: raw.id,
    name: raw.name,
    loraWeights: { ...raw.loraWeights },
    avatarModel: raw.avatarModel,
    memoryContext: [...raw.memoryContext],
    isNSFW: raw.isNSFW,
  };
}

export function loadSoulPresetFile(dataDir: string, fileName: string, options: { ageVerified?: boolean } = {}): SoulPreset {
  const root = path.resolve(dataDir);
  const filePath = path.resolve(root, fileName);
  const relative = path.relative(root, filePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('A .soul preset must stay inside the data directory.');
  }
  return parseSoulPreset(JSON.parse(fs.readFileSync(filePath, 'utf8')) as SoulPreset, options);
}

export function saveSoulPresetFile(
  dataDir: string,
  preset: SoulPreset,
  options: { clean?: boolean; adult?: boolean; key?: Buffer } = {},
): void {
  const root = path.resolve(dataDir);
  const filePath = path.resolve(root, `${preset.id}.soul`);
  const memory = options.clean
    ? preset.memoryContext.map((entry) => (containsAdultText(entry) ? '[redacted]' : entry))
    : preset.memoryContext;
  const stored = options.adult
    ? { ...preset, memoryContext: undefined, sealedMemory: encryptVaultBytes(Buffer.from(JSON.stringify(memory)), options.key as Buffer).toString('base64') }
    : { ...preset, memoryContext: memory };
  fs.writeFileSync(filePath, JSON.stringify(stored));
}
