import test from 'node:test';
import assert from 'node:assert/strict';

import { agencyDivisions, fallbackSpecialist } from '../src/lib/agency-roster.ts';
import { customEndpointOrEmpty, harnessById, HARNESSES } from '../src/lib/harness.ts';
import { pandaAgencyRequest } from '../src/lib/panda-route.ts';

test('agency routing drops healthcare and stays local', () => {
  const names = agencyDivisions(['engineering', 'healthcare', 'healthcare-support', 'design']);
  assert.deepEqual(names, ['engineering', 'design']);
  const request = pandaAgencyRequest('review the login', names);
  assert.equal(request.constraints.local_only, true);
  assert.equal(request.pool.some((card) => /health/i.test(card.id)), false);
  assert.equal(fallbackSpecialist('fix the typescript bug'), 'engineering');
});

test('harness choices keep keys out of the app', () => {
  assert.deepEqual(HARNESSES.map((item) => item.id), ['local', 'omniroute', 'opencode', 'hermes', 'custom']);
  assert.equal(harnessById('hermes').endpoint, 'http://127.0.0.1:8645/v1');
  assert.equal(harnessById('omniroute').endpoint, 'http://127.0.0.1:20128/v1');
  assert.equal(customEndpointOrEmpty('http://127.0.0.1:9119/'), 'http://127.0.0.1:9119');
  assert.equal(customEndpointOrEmpty('https://api.example.test/v1?api_key=secret'), '');
  assert.equal(customEndpointOrEmpty('https://user:pass@example.test/v1'), '');
});
