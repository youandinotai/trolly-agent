const ADULT_TEXT_PATTERNS = [
  /\bnsfw\b/i,
  /\bporn(?:ography|ographic)?\b/i,
  /\berotic\b/i,
  /\bnudes?\b/i,
  /\bnudity\b/i,
  /\bnaked\b/i,
  /\btopless\b/i,
  /\blingerie\b/i,
  /\bunderwear\b/i,
  /\bbikini\b/i,
  /\bfetish\b/i,
  /\bbondage\b/i,
  /\bsexually explicit\b/i,
  /\bexplicit sexual\b/i,
  /\bsexual(?:ized|ise|ize)\b/i,
  /\bsexual\b/i,
  /\bsex\b/i,
  /\bsex scene\b/i,
];
const UNDER_21_TEXT = /\b(?:underage|minor|child|teen|preteen|schoolgirl|schoolboy|under\s*21)\b/i;
const AGE_MENTIONS = /\b(\d{1,3})[-\s]+years?[-\s]+old\b/gi;
const STANDARD_MEDIA_RESTRICTIONS = [
  ...ADULT_TEXT_PATTERNS,
  /\b(?:underage|minor|child|children|teen|preteen|schoolgirl|schoolboy)\b/i,
  /\b(?:gore|gory|bloodshed|bloody|mutilation|dismemberment|snuff|corpse|self[-\s]?harm|suicide)\b/i,
];
const RESTRICTED_TOOL_OUTPUT = /\b(?:rape|rapist|non[-\s]?consensual|forced sex|sexual assault|coerc(?:ion|ive)|incest|bestiality|gore|gory|bloodshed|mutilation|dismemberment|snuff|self[-\s]?harm|suicide)\b/i;

export function containsAdultText(value: string): boolean {
  return ADULT_TEXT_PATTERNS.some((pattern) => pattern.test(value));
}

export function assertAdultContent21Plus(value: string): void {
  if (!containsAdultText(value)) return;
  const ages = [...value.matchAll(AGE_MENTIONS)].map((match) => Number(match[1]));
  if (UNDER_21_TEXT.test(value) || !ages.length || ages.some((age) => age < 21)) {
    throw new Error('Adult content requires clearly stated ages of 21 or older for every person.');
  }
}

export function assertCleanPrompt(value: string): void {
  if (containsAdultText(value)) {
    throw new Error(
      'Clean mode blocked this request because it matched a sexual-content filter. Revise it or complete the 21+ check and switch to Adult mode.',
    );
  }
}

export function assertStandardMediaPrompt(value: string): void {
  if (STANDARD_MEDIA_RESTRICTIONS.some((pattern) => pattern.test(value))) {
    throw new Error(
      'Standard image/video generation blocks adult, under-21, and gore prompts. Use After Dark for verified 21+ image-to-image work.',
    );
  }
}

export function assertCleanResponse(value: string): void {
  if (containsAdultText(value)) {
    throw new Error(
      'Clean mode suppressed a response that matched its sexual-content filter. No response was shown.',
    );
  }
}

export function assertCleanToolOutput(value: string): void {
  if (containsAdultText(value)) {
    throw new Error(
      'Clean mode blocked tool output that matched its sexual-content filter. No output was shown.',
    );
  }
}

export function assertMcpToolOutput(value: string, adult: boolean): void {
  if (RESTRICTED_TOOL_OUTPUT.test(value)) {
    throw new Error('Trolly blocked MCP text matching restricted sexual harm, coercion, gore, or extreme violence.');
  }
  if (adult) assertAdultContent21Plus(value);
  else assertCleanToolOutput(value);
}
