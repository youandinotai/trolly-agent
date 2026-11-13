import test from 'node:test';
import assert from 'node:assert/strict';

import { buildGarmentSpec, normalizeHairSettings, normalizeHexColor, safeGarmentSpecs, shouldHideBaseCloth, shouldHideBaseShoes } from '../src/lib/avatar-wardrobe.ts';

test('replacement shoes hide only the original footwear', () => {
  assert.equal(shouldHideBaseShoes('N00_008_01_Shoes_01_CLOTH'), true);
  assert.equal(shouldHideBaseShoes('N00_000_Hair_00_HAIR'), false);
  assert.equal(buildGarmentSpec('shoes', 1.6).pieces.length, 2);
  assert.deepEqual(buildGarmentSpec('shoes', 1.6).pieces.map((piece) => piece.bone), ['leftFoot', 'rightFoot']);
});

test('replacement garments hide the dress and tie without removing sleeves, hair, or shoes', () => {
  assert.equal(shouldHideBaseCloth('N00_007_02_Tops_01_CLOTH_01'), false);
  assert.equal(shouldHideBaseCloth('N00_010_01_Onepiece_00_CLOTH'), true);
  assert.equal(shouldHideBaseCloth('N00_000_Hair_00_HAIR'), false);
  assert.equal(shouldHideBaseCloth('N00_008_01_Shoes_01_CLOTH'), false);
});

test('wardrobe supports hats, tops, dresses, bikini, and underwear as fitted primitives', () => {
  assert.equal(buildGarmentSpec('hat', 1.6).pieces.length, 2);
  assert.equal(buildGarmentSpec('top', 1.6).pieces.length, 1);
  assert.equal(buildGarmentSpec('dress', 1.6).pieces.length, 1);
  assert.equal(buildGarmentSpec('bikini', 1.6).pieces.length, 3);
  assert.equal(buildGarmentSpec('underwear', 1.6).pieces.length, 1);
});

test('the Clean look always includes an opaque dress and shoes', () => {
  const safe = safeGarmentSpecs(1.6);
  assert.deepEqual(safe.map((item) => item.shape), ['dress', 'shoes']);
  assert.equal(safe[0].shape, 'dress');
  assert.ok(safe[0].pieces[0].scale[1] >= 0.7, 'safe dress reaches below the hips');
});

test('garment fitting scales with the avatar instead of hardcoded model sizes', () => {
  const small = buildGarmentSpec('bikini', 1.2);
  const tall = buildGarmentSpec('bikini', 1.8);
  assert.ok(tall.pieces[0].scale[0] > small.pieces[0].scale[0]);
  assert.ok(Math.abs(tall.pieces[0].position[1]) > Math.abs(small.pieces[0].position[1]));
});

test('hat brim sits above the eyes instead of across the face', () => {
  const h = 1.6;
  const brim = buildGarmentSpec('hat', h).pieces[1];
  assert.ok(brim.position[1] >= h * 0.1, 'brim must be near the hairline, not the eyes');
});

test('safe dress starts below the shoulders and shoes sit at foot level', () => {
  const h = 1.6;
  const dress = buildGarmentSpec('dress', h).pieces[0];
  const top = dress.position[1] + dress.scale[1] / 2;
  assert.ok(top <= -h * 0.03, `dress top ${top} should sit below the chest bone`);
  for (const shoe of buildGarmentSpec('shoes', h).pieces) assert.ok(shoe.position[1] <= 0);
});

test('hair and garment colors are bounded and normalized', () => {
  assert.equal(normalizeHexColor('#e11d48'), '#e11d48');
  assert.equal(normalizeHexColor('red'), '#fb7185');
  const hair = normalizeHairSettings({ color: '#fff', length: 9, volume: -2 });
  assert.equal(hair.color, '#ffffff');
  assert.equal(hair.length, 1.6);
  assert.equal(hair.volume, 0.7);
});
