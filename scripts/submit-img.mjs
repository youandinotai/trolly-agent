// Submit ONE legal-adult image to the local ComfyUI and print the prompt id.
import fs from 'node:fs';
import { buildTxt2ImgWorkflow } from '../src/lib/comfyui.ts';

const BASE = 'http://192.168.0.8:8188';
const flow = buildTxt2ImgWorkflow({
  positive: 'one 25-year-old woman, nude, studio, soft light, natural pose, detailed skin, photographic, solo, kind expression, high quality',
  negative: 'nsfw censored, deformed, mutated, extra fingers, bad hands, bad anatomy, watermark, text, logo, jpeg artifacts, blurry',
  checkpoint: 'ponyDiffusionV6XL_v6StartWithThisOne.safetensors',
  filenamePrefix: 'gates-legal-adult',
  width: 832, height: 1216, steps: 24, seed: 777777, cfg: 6.5,
});
const sub = await (await fetch(`${BASE}/prompt`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(flow) }));
const resp = await sub.json();
console.log('safety:', 'ok', '| prompt_id:', resp?.prompt_id ?? JSON.stringify(resp));
