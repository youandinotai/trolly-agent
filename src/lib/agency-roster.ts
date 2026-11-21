/** Divisions on disk. Healthcare is not a router option. */
export const AGENCY_DIVISIONS = [
  'academic',
  'design',
  'engineering',
  'finance',
  'game-development',
  'gis',
  'marketing',
  'paid-media',
  'product',
  'project-management',
  'research',
  'sales',
  'security',
  'spatial-computing',
  'specialized',
  'support',
  'testing',
] as const;

export interface AgentProfile {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
}

export function agencyDivisions(names: string[] = [...AGENCY_DIVISIONS]): string[] {
  return names.filter((name) => name && !/health/i.test(name));
}

export function defaultAgentProfiles(): AgentProfile[] {
  return agencyDivisions().map((id) => {
    const name = id
      .split('-')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
    return {
      id,
      name,
      description: `Focused Trolly profile for ${name.toLowerCase()} work.`,
      systemPrompt: `Act as Trolly's ${name} specialist. Be accurate, stay within this role, state uncertainty, and never claim tools or results you did not use. Do not execute actions without the user's explicit Run approval.`,
    };
  });
}

export function fallbackSpecialist(prompt: string): string {
  const text = String(prompt ?? '').toLowerCase();
  if (/\b(code|bug|typescript|api|test)\b/.test(text)) return 'engineering';
  if (/\b(draw|design|logo|wardrobe|clothes)\b/.test(text)) return 'design';
  if (/\b(security|threat|auth)\b/.test(text)) return 'security';
  if (/\b(research|paper|source)\b/.test(text)) return 'research';
  if (/\b(sale|price|shop)\b/.test(text)) return 'sales';
  return 'product';
}
