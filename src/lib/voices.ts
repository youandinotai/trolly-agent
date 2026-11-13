export interface SpeechVoice {
  id: string;
  name: string;
  culture: string;
  gender: 'female';
  engine: 'kokoro';
  description: string;
}

/** Kokoro's free female English presets. The second letter is the gender. */
export const FEMALE_VOICES: readonly SpeechVoice[] = [
  { id: 'af_heart', name: 'Heart', culture: 'en-US', gender: 'female', engine: 'kokoro', description: 'Warm and natural' },
  { id: 'af_bella', name: 'Bella', culture: 'en-US', gender: 'female', engine: 'kokoro', description: 'Rich and expressive' },
  { id: 'af_nicole', name: 'Nicole', culture: 'en-US', gender: 'female', engine: 'kokoro', description: 'Soft and clear' },
  { id: 'af_sarah', name: 'Sarah', culture: 'en-US', gender: 'female', engine: 'kokoro', description: 'Friendly and bright' },
  { id: 'af_alloy', name: 'Alloy', culture: 'en-US', gender: 'female', engine: 'kokoro', description: 'Smooth and balanced' },
  { id: 'af_aoede', name: 'Aoede', culture: 'en-US', gender: 'female', engine: 'kokoro', description: 'Light and lyrical' },
  { id: 'af_jessica', name: 'Jessica', culture: 'en-US', gender: 'female', engine: 'kokoro', description: 'Bright and casual' },
  { id: 'af_kore', name: 'Kore', culture: 'en-US', gender: 'female', engine: 'kokoro', description: 'Clear and youthful' },
  { id: 'af_nova', name: 'Nova', culture: 'en-US', gender: 'female', engine: 'kokoro', description: 'Energetic and open' },
  { id: 'af_river', name: 'River', culture: 'en-US', gender: 'female', engine: 'kokoro', description: 'Relaxed and gentle' },
  { id: 'af_sky', name: 'Sky', culture: 'en-US', gender: 'female', engine: 'kokoro', description: 'Airy and soft' },
  { id: 'bf_alice', name: 'Alice', culture: 'en-GB', gender: 'female', engine: 'kokoro', description: 'Bright British English' },
  { id: 'bf_emma', name: 'Emma', culture: 'en-GB', gender: 'female', engine: 'kokoro', description: 'Natural British English' },
  { id: 'bf_isabella', name: 'Isabella', culture: 'en-GB', gender: 'female', engine: 'kokoro', description: 'Warm British English' },
  { id: 'bf_lily', name: 'Lily', culture: 'en-GB', gender: 'female', engine: 'kokoro', description: 'Gentle British English' },
] as const;

export const DEFAULT_VOICE = 'af_heart';

export function isNaturalVoice(id: string): boolean {
  return FEMALE_VOICES.some((voice) => voice.id === id);
}
