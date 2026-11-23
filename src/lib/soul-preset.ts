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
