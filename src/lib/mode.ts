import { reactive } from 'vue';

import type { Preferences } from '../env';

/**
 * Global app modes.
 *
 * `adult` is a content preference and is only ever true when the age check
 * has been passed. It is read from the Mind store on launch and written back
 * through the same gate, so no surface can enable it on its own.
 *
 * `brainstorming` is a thinking mode, not a content mode: it changes how the
 * agent reasons, not what it will or will not discuss.
 */
export const appMode = reactive({
  /** Adult content allowed. Requires age verification. */
  adult: false,
  /** Whether the age check has been passed at all. */
  ageVerified: false,
  /** Brainstorming always: offer options, challenge the brief, give a next step. */
  brainstorming: true,
  /** Persona currently in force, so every surface agrees. */
  persona: '',
  /** Whether the adult gate is currently refusing changes. */
  gateError: '',
});

export async function loadMode(): Promise<void> {
  try {
    const prefs: Preferences = await window.trolly.mind.readPrefs();
    appMode.adult = prefs.adultContent === true && prefs.ageVerified === true;
    appMode.ageVerified = prefs.ageVerified === true;
  } catch {
    appMode.adult = false;
    appMode.ageVerified = false;
  }
  try {
    const persona = await window.trolly.mind.persona();
    appMode.persona = persona?.content ?? '';
  } catch {
    appMode.persona = '';
  }
}

/**
 * Turn adult content on or off. The store refuses when the age check has not
 * been passed, and the refusal is surfaced rather than silently ignored.
 */
export async function setAdultMode(on: boolean): Promise<boolean> {
  appMode.gateError = '';
  try {
    const prefs = await window.trolly.mind.setAdultContent(on);
    appMode.adult = prefs.adultContent === true && prefs.ageVerified === true;
    appMode.ageVerified = prefs.ageVerified === true;
    return appMode.adult;
  } catch (err: any) {
    appMode.gateError = String(err?.message ?? err);
    appMode.adult = false;
    return false;
  }
}

/** The instruction block appended to the system prompt in adult mode. */
export const ADULT_BLOCK = [
  'The user has adult content enabled in their preferences.',
  'You may engage with legal adult content when asked directly.',
  'These limits do not change: legal adults only, never minors,',
  'consensual adults only, no gore or extreme violence.',
].join(' ');

/** The instruction block that turns on the always-on brainstorming frame. */
export const BRAINSTORM_BLOCK = [
  'Think like a collaborator, not a search engine. For anything open-ended:',
  'offer at least three genuinely different options with their trade-offs,',
  'say which one you would pick and why, push back on anything weak in the',
  'brief, and end with one concrete next step small enough to start now.',
  'Do not pad with options you would not recommend.',
].join(' ');

/** Build the system prompt for the current modes. */
export function systemPrompt(): string {
  const base = appMode.persona.trim() || 'You are Trolly, a candid companion on the local machine.';
  const parts = [base];
  if (appMode.brainstorming) parts.push(BRAINSTORM_BLOCK);
  if (appMode.adult) parts.push(ADULT_BLOCK);
  return parts.join(' ');
}
