export type PetId = 'vtuber' | 'hermes' | 'creator' | 'codex' | 'claude';

export interface AgencyPet {
  id: PetId;
  name: string;
  role: string;
  file: string;
}

/** The cast Panda's model pick is shown as. Personas live with the lane, not in the app repo remote. */
export const AGENCY_PETS: AgencyPet[] = [
  { id: 'vtuber', name: 'Stage', role: 'Main live avatar', file: 'D:/Trolly/agency-agents/specialized' },
  { id: 'hermes', name: 'Hermes', role: 'Floating pet', file: 'D:/Trolly/agency-agents/integrations/hermes' },
  { id: 'creator', name: 'Creator', role: 'Makes the work', file: 'D:/Trolly/agency-agents/design' },
  { id: 'codex', name: 'Codex', role: 'Floating pet', file: 'D:/Trolly/agency-agents/engineering' },
  { id: 'claude', name: 'Claude', role: 'Floating pet', file: 'D:/Trolly/agency-agents/engineering' },
];

export const PET_POSES = [
  'idle', 'blink', 'hop', 'sway', 'look-left', 'look-right', 'bounce', 'wave', 'sit', 'sleep',
] as const;

export type PetPose = (typeof PET_POSES)[number];

export function pickPet(text: string): PetId {
  const value = text.toLowerCase();
  if (/\bcodex\b/.test(value)) return 'codex';
  if (/\bclaude\b/.test(value)) return 'claude';
  if (/\bcreator\b|\bdraw\b|\bimage\b|\bvideo\b/.test(value)) return 'creator';
  if (/\bhermes\b|\bpet\b/.test(value)) return 'hermes';
  return 'vtuber';
}
