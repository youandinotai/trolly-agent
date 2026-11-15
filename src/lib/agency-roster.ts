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

export function agencyDivisions(names: string[] = [...AGENCY_DIVISIONS]): string[] {
  return names.filter((name) => name && !/health/i.test(name));
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
