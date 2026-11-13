import test from 'node:test';
import assert from 'node:assert/strict';

import { SessionMode } from '../src/lib/session-mode.ts';

const adultPrefs = { ageVerified: true, adultContent: true };

test('saved adult preferences never restore adult visuals at launch', () => {
  const mode = new SessionMode();
  const state = mode.restore(adultPrefs);
  assert.equal(state.adult, false);
  assert.equal(state.ageVerified, true);
  assert.equal(state.visuals, 'protected');
  assert.equal(state.agentAvailable, true);
});

test('Adult requires age verification and a deliberate current-session unlock', () => {
  const mode = new SessionMode();
  mode.restore({ ageVerified: true, adultContent: false });
  assert.throws(() => mode.unlock({ ageVerified: true, adultContent: false }), /adult content/i);
  assert.throws(() => mode.unlock({ ageVerified: false, adultContent: true }), /age check/i);
  assert.equal(mode.unlock(adultPrefs).adult, true);
  assert.equal(mode.snapshot().visuals, 'adult');
});

test('Clean protects visuals without disabling chat, tools, tasks, or navigation', () => {
  const mode = new SessionMode();
  mode.unlock(adultPrefs);
  const state = mode.clean(adultPrefs);
  assert.equal(state.adult, false);
  assert.equal(state.visuals, 'protected');
  assert.equal(state.agentAvailable, true);
  assert.equal(state.speechAction, 'stop');
});

test('an adult render that finishes after Clean returns no pixels or file URL', () => {
  const mode = new SessionMode();
  mode.unlock(adultPrefs);
  const ticket = mode.beginAdultWork(adultPrefs);
  mode.clean(adultPrefs);
  const completion = mode.finishAdultWork(ticket, { url: 'file:///D:/private.png', file: 'D:/private.png' });
  assert.deepEqual(completion, { kind: 'suppressed' });
  assert.equal(mode.snapshot().agentAvailable, true);
});

test('stale tickets cannot reveal content after a later Adult unlock', () => {
  const mode = new SessionMode();
  mode.unlock(adultPrefs);
  const oldTicket = mode.beginAdultWork(adultPrefs);
  mode.clean(adultPrefs);
  mode.unlock(adultPrefs);
  assert.deepEqual(mode.finishAdultWork(oldTicket, { url: 'private' }), { kind: 'suppressed' });
  const current = mode.beginAdultWork(adultPrefs);
  const completion = mode.finishAdultWork(current, { url: 'private' });
  assert.equal(completion.kind, 'visible');
  if (completion.kind === 'visible') assert.equal(completion.result.url, 'private');
});
