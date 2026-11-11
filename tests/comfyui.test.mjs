// TDD RED: ComfyUI workflow payload builder + response parsing.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildTxt2ImgWorkflow,
  parseComfyHistoryImage,
} from '../src/lib/comfyui.ts';

test('buildTxt2ImgWorkflow produces a valid prompt graph', () => {
  const graph = buildTxt2ImgWorkflow({
    positive: 'a cozy cabin in the woods, cinematic',
    negative: 'blurry, low quality',
    seed: 12345,
    width: 832,
    height: 1216,
    steps: 20,
    cfg: 6.5,
    checkpoint: 'model.safetensors',
    vae: 'vae.safetensors',
    sampler: 'euler',
    scheduler: 'normal',
  });

  assert.ok(graph, 'must return a graph');
  // A ComfyUI /prompt body is { prompt: { "<nodeId>": {class_type, inputs} } }
  const nodes = Object.values(graph.prompt);
  assert.ok(nodes.length >= 4, 'graph must contain the core node chain');

  const classes = nodes.map((n) => n.class_type);
  assert.ok(classes.includes('CheckpointLoaderSimple'), 'needs a checkpoint loader');
  assert.ok(classes.includes('CLIPTextEncode'), 'needs text encoders');
  assert.ok(classes.includes('KSampler'), 'needs a sampler');
  assert.ok(classes.includes('EmptyLatentImage'), 'needs a latent source');
  assert.ok(classes.includes('VAEDecode'), 'needs a decode step');
  assert.ok(classes.includes('SaveImage'), 'needs a save step');

  // every link target must exist
  for (const node of nodes) {
    for (const [key, value] of Object.entries(node.inputs ?? {})) {
      if (Array.isArray(value)) {
        const [target] = value;
        assert.ok(
          graph.prompt[target],
          `input "${key}" references missing node ${target}`,
        );
      }
    }
  }
});

test('buildTxt2ImgWorkflow seeds the KSampler with the requested seed', () => {
  const graph = buildTxt2ImgWorkflow({ positive: 'x', seed: 777, width: 512, height: 512 });
  const sampler = Object.values(graph.prompt).find((n) => n.class_type === 'KSampler');
  assert.ok(sampler, 'KSampler must exist');
  assert.equal(sampler.inputs.seed, 777);
  // ComfyUI keeps resolution on EmptyLatentImage, not on the KSampler.
  const latent = Object.values(graph.prompt).find((n) => n.class_type === 'EmptyLatentImage');
  assert.ok(latent, 'EmptyLatentImage must exist');
  assert.equal(latent.inputs.width, 512);
  assert.equal(latent.inputs.height, 512);
});

test('buildTxt2ImgWorkflow rejects non-positive dimensions', () => {
  assert.throws(
    () => buildTxt2ImgWorkflow({ positive: 'x', width: 0, height: 512 }),
    /width/i,
  );
  assert.throws(
    () => buildTxt2ImgWorkflow({ positive: 'x', width: 512, height: -1 }),
    /height/i,
  );
});

test('buildTxt2ImgWorkflow requires a positive prompt', () => {
  assert.throws(
    () => buildTxt2ImgWorkflow({ positive: '   ' }),
    /prompt/i,
  );
});

test('parseComfyHistoryImage finds the saved image filename', () => {
  const history = {
    'abc-123': {
      outputs: {
        '9': {
          images: [{ filename: 'trolly_00001_.png', subfolder: 'sub', type: 'output' }],
        },
      },
    },
  };
  const found = parseComfyHistoryImage(history, 'abc-123');
  assert.ok(found, 'must find the image');
  assert.equal(found.filename, 'trolly_00001_.png');
  assert.equal(found.subfolder, 'sub');
  assert.equal(found.type, 'output');
});

test('parseComfyHistoryImage returns null when nothing was saved', () => {
  assert.equal(parseComfyHistoryImage({}, 'missing'), null);
  assert.equal(parseComfyHistoryImage({ 'x': { outputs: {} } }, 'x'), null);
});

test('buildZImageWorkflow produces a valid Z-Image Turbo graph', async () => {
  const { buildZImageWorkflow } = await import('../src/lib/comfyui.ts');
  const graph = buildZImageWorkflow({
    positive: 'a lone lighthouse on a storm-battered cliff',
    seed: 7,
    width: 1024,
    height: 1024,
  });

  assert.ok(graph?.prompt, 'must return a prompt graph');
  const p = graph.prompt;
  assert.equal(p['1'].class_type, 'UNETLoader');
  assert.equal(p['1'].inputs.unet_name, 'z_image_turbo_bf16.safetensors');
  assert.equal(p['2'].class_type, 'CLIPLoader');
  assert.equal(p['2'].inputs.type, 'lumina2');
  assert.equal(p['3'].class_type, 'VAELoader');
  assert.equal(p['5'].class_type, 'ConditioningZeroOut');
  assert.equal(p['6'].class_type, 'ModelSamplingAuraFlow');
  assert.equal(p['6'].inputs.shift, 3);
  assert.equal(p['7'].class_type, 'EmptySD3LatentImage');
  assert.equal(p['8'].class_type, 'KSampler');
  assert.equal(p['8'].inputs.sampler_name, 'res_multistep');
  assert.equal(p['8'].inputs.steps, 8, 'distilled model wants few steps');
  assert.equal(p['10'].class_type, 'SaveImage');

  // Every node reference must point at a node that exists.
  for (const [id, node] of Object.entries(p)) {
    for (const [key, value] of Object.entries(node.inputs)) {
      if (Array.isArray(value) && typeof value[0] === 'string') {
        assert.ok(p[value[0]], `node ${id}.${key} references missing node ${value[0]}`);
      }
    }
  }
});

test('buildZImageWorkflow rejects an empty prompt', async () => {
  const { buildZImageWorkflow } = await import('../src/lib/comfyui.ts');
  assert.throws(() => buildZImageWorkflow({ positive: '   ' }), /positive prompt/i);
});
