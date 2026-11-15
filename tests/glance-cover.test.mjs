import test from 'node:test';
import assert from 'node:assert/strict';

import { GLANCE_NEWS_URL, isGlanceNewsUrl } from '../src/lib/glance-cover.ts';

test('the quick cover is a public AI news page', () => {
  assert.equal(isGlanceNewsUrl(GLANCE_NEWS_URL), true);
  assert.equal(GLANCE_NEWS_URL.includes('file:'), false);
});
