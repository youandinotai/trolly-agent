import test from 'node:test';
import assert from 'node:assert/strict';

import { parseTaskRoute, planRouteSteps, routeTaskDeterministic } from '../src/lib/task-router.ts';

test('deterministic router separates image, video, edit, avatar, and chat', () => {
  assert.equal(routeTaskDeterministic('make an image of a cabin').task, 'image');
  assert.equal(routeTaskDeterministic('animate this into a five second video').task, 'video');
  assert.equal(routeTaskDeterministic('edit this reference and change the lighting').task, 'edit');
  assert.equal(routeTaskDeterministic('load a VRM avatar on stage').task, 'avatar');
  assert.equal(routeTaskDeterministic('what is the capital of France?').task, 'chat');
});

test('media routes choose only local backends and useful models', () => {
  const image = routeTaskDeterministic('generate a picture');
  const video = routeTaskDeterministic('create a video clip');
  const edit = routeTaskDeterministic('img2img this portrait');
  const avatar = routeTaskDeterministic('use a VRM avatar');
  assert.equal(image.backend, 'comfyui-image');
  assert.match(image.model, /pony/i);
  assert.equal(video.backend, 'comfyui-ltxv');
  assert.match(video.model, /ltx/i);
  assert.equal(edit.backend, 'comfyui-img2img');
  assert.equal(avatar.backend, 'stage-vrm');
});

test('JEV route parser accepts a valid local route and tags its source', () => {
  const route = parseTaskRoute('{"task":"image","reason":"explicit still image request"}', 'draw a lighthouse');
  assert.equal(route.task, 'image');
  assert.equal(route.backend, 'comfyui-image');
  assert.equal(route.source, 'jev');
  assert.equal(route.prompt, 'draw a lighthouse');
});

test('JEV parser rejects invalid or ambiguous output instead of guessing', () => {
  assert.throws(() => parseTaskRoute('probably an image', 'draw something'), /route|JSON/i);
  assert.throws(() => parseTaskRoute('{"task":"sing"}', 'sing something'), /route|task/i);
});

test('Director plan names the choice and holds the model call', () => {
  const route = routeTaskDeterministic('draw a cabin');
  const steps = planRouteSteps(route, 'eve-v2');
  assert.match(steps[0], /Director chose/);
  assert.match(steps.join('\n'), /No image, video, or edit job starts until you press Run/);
  assert.doesNotMatch(steps.join('\n'), /healthcare/i);
});
