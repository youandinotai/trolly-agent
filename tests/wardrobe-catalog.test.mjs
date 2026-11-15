import test from 'node:test';
import assert from 'node:assert/strict';

import { WARDROBE_CATALOG, WARDROBE_SHOP_URL, wardrobePicks } from '../src/lib/wardrobe-catalog.ts';

test('wardrobe keeps a small modern sfw set and a smaller adult set', () => {
  const sfw = wardrobePicks('sfw');
  const nsfw = wardrobePicks('nsfw');
  assert.ok(sfw.length >= 6 && sfw.length <= 12);
  assert.ok(nsfw.length >= 2 && nsfw.length <= 6);
  assert.ok(sfw.some((item) => item.name === 'Cyan turtleneck' && item.category === 'top'));
  assert.ok(nsfw.every((item) => item.category === 'bikini' || item.category === 'underwear'));
});

test('shop links are the public booth search and carry no affiliate code', () => {
  for (const item of WARDROBE_CATALOG) {
    assert.equal(item.shopUrl, WARDROBE_SHOP_URL);
    assert.equal(item.shopUrl.includes('aff') || item.shopUrl.includes('tag='), false);
    assert.match(item.shopUrl, /^https:\/\/booth\.pm\//);
  }
});
