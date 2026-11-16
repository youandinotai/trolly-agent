import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';

const run = promisify(execFile);

export interface GateResult {
  command: string;
  passed: boolean;
  detail: string;
}

/**
 * The locked negative is a base safety floor, not a style comment. Judges and
 * the image path share it. Intended subjects are always legal adults; this
 * scan refuses material that points at or depicts a minor, coercion, or harm.
 * It returns a verdict only — it does not retype the blocked words anywhere.
 */
export function safetyVerdict(text: string): { pass: boolean; reason: string } {
  const source = String(text ?? '').replace(/[\s\u{1F600}-\u{1FAFF}]/gu, ' ').toLowerCase();
  const minors = /\b(?:18|17|16|15|14|13)-year|\bminor\b|\bchild\b|\bteen\b|\bschoolgirl\b|\bunder ?18\b|\bloli\b|\bshotacon\b/i;
  const nonconsent = /\b(?:non-?consent|coer\w+|sa|assault|forc\w+)\b/i;
  const harm = /\bgore\b|\bdying\b|\bdead\b|\bcorpse\b/i;
  if (minors.test(source)) return { pass: false, reason: 'minor' };
  if (nonconsent.test(source)) return { pass: false, reason: 'non-consent' };
  if (harm.test(source)) return { pass: false, reason: 'harm' };
  return { pass: true, reason: 'legal adults only' };
}

export function lockedNegative(): string {
  return [
    'nsfw censored blurred',
    'out of frame, cut off, cropped',
    'deformed, mutated, disfigured, malformed limbs',
    'extra fingers, extra hands, broken fingers, fused fingers, missing fingers',
    'extra limbs, asymmetrical eyes, bad anatomy, bad hands',
    'blurry, jpeg artifacts, low quality, watermark, text, logo, signature',
  ].join(', ');
}

export const MANDATORY_REPOSITORY_RULES = [
  'single branch on GitHub: feature/initial-build',
  'only the final merge judge pushes a merge; other judges push earlier work to feature/initial-build',
  'no other tool opens a branch or a pull request on that account',
  'adult or test media is never committed to the repo; it lives on D:',
] as const;
