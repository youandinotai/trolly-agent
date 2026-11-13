import { reactive } from 'vue';

import type { SessionModeState } from '../env';

/** Shared agent modes. Visual safety never disables chat, tools, or navigation. */
export const appMode = reactive({
  adult: false,
  ageVerified: false,
  brainstorming: true,
  persona: '',
  gateError: '',
});

export function applyModeState(state: SessionModeState): void {
  appMode.adult = state.adult === true;
  appMode.ageVerified = state.ageVerified === true;
  appMode.gateError = '';
  window.dispatchEvent(new CustomEvent('trolly:mode-visuals', { detail: state }));
  // Lift the native shield only after two painted frames of the safe view.
  if (!state.adult) {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      void window.trolly.mode.acknowledgeClean(state.epoch);
    }));
  }
}

export async function loadMode(): Promise<void> {
  try {
    applyModeState(await window.trolly.mode.state());
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

/** Clean is immediate; Adult is a deliberate unlock validated by Electron main. */
export async function setAdultMode(on: boolean): Promise<boolean> {
  appMode.gateError = '';
  if (!on) {
    appMode.adult = false;
    window.dispatchEvent(new Event('trolly:clean-start'));
  }
  try {
    const state = await window.trolly.mode.setAdult(on);
    applyModeState(state);
    return state.adult;
  } catch (err: any) {
    appMode.adult = false;
    appMode.gateError = String(err?.message ?? err);
    window.dispatchEvent(new Event('trolly:clean-start'));
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
