import test from 'node:test';
import assert from 'node:assert/strict';

import { applyAgencyChoice, applyPandaChoice, cardIdForModel, chooseLocalSkill, pandaAgencyRequest, pandaRouteRequest } from '../src/lib/panda-route.ts';
import { routeTaskDeterministic } from '../src/lib/task-router.ts';

test('card ids strip the ollama tag colon', () => {
  assert.equal(cardIdForModel('eve-cpu:latest'), 'ollama-eve-cpu-latest');
});

test('route request is local-only and uses installed models as inline cards', () => {
  const request = pandaRouteRequest('help me fix the stage', [
    { name: 'qwen2.5vl:7b', contextLength: 32768 },
    { name: 'kimi:cloud' },
  ]);
  assert.equal(request.constraints.local_only, true);
  assert.equal(request.pool.length, 1);
  assert.equal(request.pool[0].model, 'qwen2.5vl:7b');
  assert.deepEqual(request.pool[0].modalities.input, ['text', 'image']);
});

test('a Panda choice replaces the chat model and leaves a studio route alone', () => {
  const cards = pandaRouteRequest('x', [{ name: 'eve-v2:latest' }]).pool;
  const chat = applyPandaChoice(routeTaskDeterministic('what is the capital of France?'), {
    choice: { model_id: cards[0].id },
  }, cards);
  assert.equal(chat.source, 'panda');
  assert.equal(chat.model, 'eve-v2:latest');
  assert.equal(chat.task, 'chat');

  const image = applyPandaChoice(routeTaskDeterministic('generate a picture of a cabin'), {
    choice: { model_id: cards[0].id },
  }, cards);
  assert.equal(image.source, 'panda');
  assert.equal(image.backend, 'comfyui-image');
  assert.match(image.model, /pony/i);
});

test('ordinary chat is not forced onto engineering', () => {
  const cards = pandaAgencyRequest('what should we eat', ['engineering', 'product']).pool;
  assert.equal(chooseLocalSkill('what should we eat', cards)?.model, 'product');
  assert.equal(chooseLocalSkill('fix the typescript bug', cards)?.model, 'engineering');
});

test('a down Panda server still names an agency skill and does not run it', () => {
  const cards = pandaAgencyRequest('fix the typescript bug', ['engineering', 'product', 'healthcare']).pool;
  const skill = chooseLocalSkill('fix the typescript bug', cards);
  assert.equal(skill?.model, 'engineering');
  const route = applyAgencyChoice(routeTaskDeterministic('fix the typescript bug'), {
    choice: { model_id: skill?.id },
  }, cards);
  assert.equal(route.specialist, 'engineering');
  assert.equal(route.task, 'chat');
});

test('Panda prose or an unknown model is rejected', () => {
  const cards = pandaRouteRequest('x', [{ name: 'eve-v2:latest' }]).pool;
  assert.throws(() => applyPandaChoice(routeTaskDeterministic('hello'), { choice: { model_id: 'claude' } }, cards), /local model/i);
});
