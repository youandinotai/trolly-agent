import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { AgentRegistry } from '../electron/main/agent-registry.ts';
import { AGENCY_DIVISIONS } from '../src/lib/agency-roster.ts';

test('registry loads every approved profile and persists the first-run roster', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'trolly-agents-'));
  const profiles = new AgentRegistry(dir).load();
  assert.deepEqual(profiles.map((profile) => profile.id), [...AGENCY_DIVISIONS]);
  assert.equal(profiles.some((profile) => /health/i.test(profile.id)), false);
  assert.ok(fs.existsSync(path.join(dir, 'agent-profiles.json')));
  assert.deepEqual(new AgentRegistry(dir).load(), profiles);
});

test('registry reports invalid profiles and falls back to the safe default roster', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'trolly-agents-'));
  fs.writeFileSync(path.join(dir, 'agent-profiles.json'), JSON.stringify([
    { id: 'healthcare', name: 'Healthcare', description: 'blocked', systemPrompt: 'blocked' },
  ]));
  const registry = new AgentRegistry(dir);
  const profiles = registry.load();
  assert.equal(registry.error().includes('invalid or unsupported'), true);
  assert.equal(profiles.some((profile) => /health/i.test(profile.id)), false);
});
