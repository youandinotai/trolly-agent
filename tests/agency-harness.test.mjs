import test from 'node:test';
import assert from 'node:assert/strict';

import { agencyDivisions, fallbackSpecialist } from '../src/lib/agency-roster.ts';
import { customEndpointOrEmpty, harnessById } from '../src/lib/harness.ts';
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
  assert.equal(harnessById('hermes-local').endpoint, 'http://192.168.0.8:9119');
  assert.equal(harnessById('hermes-omni').endpoint, 'http://192.168.0.8:20128/v1');
  assert.equal(customEndpointOrEmpty('http://192.168.0.8:9119'), 'http://192.168.0.8:9119');
  assert.equal(customEndpointOrEmpty('https://api.example.test/v1?api_key=secret'), '');
});
