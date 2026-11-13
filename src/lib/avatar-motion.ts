/** Pure, renderer-independent avatar performance logic. */

export type AvatarEmotion = 'neutral' | 'happy' | 'sad' | 'angry' | 'relaxed' | 'surprised';

export interface MouthShapes {
  aa: number;
  ee: number;
  ih: number;
  oh: number;
  ou: number;
}

const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value));

/** Deliberately conservative: punctuation alone must not make the avatar act. */
export function detectEmotion(text: string): AvatarEmotion {
  const value = text.toLowerCase();
  if (/\b(furious|angry|annoyed|rage|hate this)\b/.test(value)) return 'angry';
  if (/\b(sorry|sad|unfortunately|grief|miss you|heartbroken)\b/.test(value)) return 'sad';
  if (/\b(wow|really|incredible|no way|whoa|surprised)\b/.test(value)) return 'surprised';
  if (/\b(relax|breathe|calm|peaceful|take it easy)\b/.test(value)) return 'relaxed';
  if (/\b(wonderful|great|love|happy|excited|excellent|amazing|glad|yay)\b/.test(value)) return 'happy';
  return 'neutral';
}

/** Convert RMS microphone/speech amplitude to a stable mouth-opening control. */
export function normalizeAudioLevel(rms: number, sensitivity = 1): number {
  const noiseFloor = 0.012;
  return clamp((Math.max(0, rms) - noiseFloor) * 7 * clamp(sensitivity, 0.1, 4));
}

/** Approximate five VRM visemes using loudness and spectral centroid. */
export function mouthShapes(level: number, spectralCentroid: number): MouthShapes {
  const open = clamp(level);
  if (open === 0) return { aa: 0, ee: 0, ih: 0, oh: 0, ou: 0 };
  const bright = clamp(spectralCentroid);
  const low = 1 - bright;
  return {
    aa: clamp(open * (0.35 + low * 0.65)),
    ee: clamp(open * bright * 0.72),
    ih: clamp(open * (0.22 + bright * 0.42)),
    oh: clamp(open * low * 0.48),
    ou: clamp(open * Math.abs(bright - 0.5) * 0.46),
  };
}

/** One smooth close/open blink. phase is elapsed seconds / blink duration. */
export function blinkEnvelope(phase: number): number {
  if (phase <= 0 || phase >= 1) return 0;
  return Math.sin(phase * Math.PI) ** 1.35;
}

/** Small deterministic idle motion plus bounded cursor-following head movement. */
export function idlePose(
  time: number,
  pointer: { x: number; y: number },
  intensity: number,
  reducedMotion: boolean,
) {
  if (reducedMotion) {
    return { headYaw: 0, headPitch: 0, headRoll: 0, spineRoll: 0, chestScale: 1 };
  }
  const amount = clamp(intensity, 0, 2);
  return {
    headYaw: clamp(clamp(pointer.x, -1, 1) * 0.3 + Math.sin(time * 0.43) * 0.012, -0.3, 0.3) * amount,
    headPitch: clamp(clamp(pointer.y, -1, 1) * 0.2 + Math.sin(time * 0.67) * 0.01, -0.2, 0.2) * amount,
    headRoll: Math.sin(time * 0.52) * 0.018 * amount,
    spineRoll: Math.sin(time * 0.38) * 0.012 * amount,
    chestScale: 1 + Math.sin(time * 1.7) * 0.008 * amount,
  };
}
