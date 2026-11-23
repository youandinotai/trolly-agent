import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assertAdultContent21Plus,
  assertCleanPrompt,
  assertCleanResponse,
  assertMcpToolOutput,
  assertStandardMediaPrompt,
  assertCleanToolOutput,
  containsAdultText,
} from '../src/lib/content-policy.ts';

test('Clean text guard blocks obvious adult requests and allows ordinary text', () => {
  assert.equal(containsAdultText('Write a short weather report.'), false);
  assert.throws(() => assertCleanPrompt('NSFW'), /Clean mode blocked/i);
  assert.throws(() => assertCleanPrompt('A bikini product photo'), /Clean mode blocked/i);
});

test('Clean response and tool-output guards fail closed before returning text', () => {
  assert.throws(() => assertCleanResponse('This response contains nudity.'), /No response was shown/i);
  assert.throws(() => assertCleanToolOutput('NSFW'), /No output was shown/i);
});

test('Adult text requires every referenced age to be at least 21', () => {
  assert.doesNotThrow(() => assertAdultContent21Plus('A 25-year-old adult discusses relationships.'));
  assert.throws(() => assertAdultContent21Plus('A 20-year-old asks for sexual advice.'), /21 or older/i);
  assert.throws(() => assertAdultContent21Plus('Write an erotic scene.'), /21 or older/i);
});

test('standard media prompts exclude adult, under-21, and gore terms', () => {
  assert.doesNotThrow(() => assertStandardMediaPrompt('A quiet mountain landscape at sunrise.'));
  assert.throws(() => assertStandardMediaPrompt('A child at a birthday party.'), /under-21/i);
  assert.throws(() => assertStandardMediaPrompt('NSFW'), /adult/i);
  assert.throws(() => assertStandardMediaPrompt('gore'), /gore/i);
});

test('MCP text output is screened in both modes and adult text needs 21+ ages', () => {
  assert.doesNotThrow(() => assertMcpToolOutput('A mountain landscape.', false));
  assert.throws(() => assertMcpToolOutput('NSFW', false), /No output was shown/i);
  assert.doesNotThrow(() => assertMcpToolOutput('A 25-year-old adult discusses relationships.', true));
  assert.throws(() => assertMcpToolOutput('An erotic scene.', true), /21 or older/i);
  assert.throws(() => assertMcpToolOutput('A coercive sexual scene.', true), /restricted/i);
  assert.throws(() => assertMcpToolOutput('gore', true), /restricted/i);
});
