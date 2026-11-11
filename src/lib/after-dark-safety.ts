/** Parse the local vision inspector's verdict. Anything ambiguous fails closed. */
export function parseAfterDarkSafetyVerdict(answer: string): boolean {
  const text = String(answer ?? '').trim();
  if (!text) throw new Error('Local safety inspection returned no verdict.');
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed?.safe !== 'boolean') throw new Error('Local safety inspection was ambiguous.');
    return parsed.safe;
  } catch (error: any) {
    if (error?.message === 'Local safety inspection was ambiguous.') throw error;
    throw new Error('Local safety inspection returned an invalid verdict.');
  }
}
