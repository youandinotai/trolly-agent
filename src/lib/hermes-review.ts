export interface HermesReviewPacket {
  feature: string;
  checks: string[];
  counts?: Record<string, number>;
}

/** Hard allowlist: private prompts, pixels, base64, and asset paths cannot cross this boundary. */
export function sanitizeHermesReviewPacket(input: any): HermesReviewPacket {
  const feature = String(input?.feature ?? '').trim().slice(0, 100);
  const checks = Array.isArray(input?.checks)
    ? input.checks.slice(0, 40).map((item: any) => String(item).trim()).filter(Boolean)
    : [];
  if (!feature || !checks.length) throw new Error('A feature and at least one evidence check are required.');
  if (checks.some((item: string) => item.length > 200)) throw new Error('Each Hermes evidence check must be 200 characters or fewer.');
  const counts: Record<string, number> = {};
  if (input?.counts && typeof input.counts === 'object') {
    for (const [key, value] of Object.entries(input.counts).slice(0, 20)) {
      if (typeof value === 'number' && Number.isFinite(value)) counts[String(key).slice(0, 40)] = value;
    }
  }
  return { feature, checks, ...(Object.keys(counts).length ? { counts } : {}) };
}
