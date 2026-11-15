/** Quick cover. A public page, not the full SFW swap. */
export const GLANCE_NEWS_URL = 'https://www.theverge.com/ai-artificial-intelligence';

export function isGlanceNewsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'www.theverge.com';
  } catch {
    return false;
  }
}
