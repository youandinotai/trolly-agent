import { buildTxt2ImgWorkflow } from '../src/lib/comfyui.ts';
import { safetyVerdict } from '../src/lib/safety-gate.ts';

const BASE = 'http://192.168.0.8:8188';
const OUT = 'D:/Trolly/data/gates-media';

// The judge route: an explicit legal adult, legal and consensual, with the
// locked negative floor. This is a dev-case test, not a shipped product.
const POSITIVE = 'one 25-year-old woman, nude, studio, soft light, natural pose, detailed skin, photographic, solo, kind expression, high quality';
const NEGATIVE =
  'nsfw censored, deformed, mutated, extra fingers, bad hands, bad anatomy, watermark, text, logo, jpeg artifacts, blurry';

await import('node:fs').then(fs => fs.mkdirSync(OUT, { recursive: true }));

// Reuse the app's workflow builder so the safety negative stays locked.
const flow = buildTxt2ImgWorkflow({
  positive: POSITIVE,
  negative: NEGATIVE,
  checkpoint: 'ponyDiffusionV6XL_v6StartWithThisOne.safetensors',
  filenamePrefix: 'gates-legal-adult',
  width: 832,
  height: 1216,
  steps: 20,
  seed: 777001,
});

const verdict = safetyVerdict(POSITIVE);
console.log('safetyVerdict:', verdict.pass, verdict.reason);
if (!verdict.pass) throw new Error('the subject did not pass the legal-adult gate');

const submit = await fetch(`${BASE}/prompt`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(flow),
});
const resp = await submit.json();
console.log('submit', submit.status, 'prompt_id', resp?.prompt_id ?? JSON.stringify(resp).slice(0, 200));
if (!resp?.prompt_id) process.exit(1);

const id = resp.prompt_id;
let history;
for (let i = 0; i < 240; i++) {
  await new Promise((r) => setTimeout(r, 5000));
  const h = await (await fetch(`${BASE}/history/${id}`)).json();
  if (h[id]) { history = h[id]; break; }
  if (i % 6 === 0) console.log('still running', i * 5, 's');
}
if (!history) { console.log('TIMEOUT no result in 20 min'); process.exit(2); }
const outputs = Object.values(history.outputs ?? {});
const imgs = outputs.flatMap((o) => o?.images ?? []);
console.log('done', imgs.map((i) => i.filename).join(', '), 'count', imgs.length);
const first = imgs[0];
if (first) {
  const url = `${BASE}/view?filename=${encodeURIComponent(first.filename)}&subfolder=${encodeURIComponent(first.subfolder || '')}&type=${first.type}`;
  const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
  const fs = await import('node:fs');
  const p = `${OUT}/${first.filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  fs.writeFileSync(p, buf);
  console.log('saved', p, buf.length, 'bytes');
}
