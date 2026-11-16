import fs from 'node:fs';

const BASE = 'http://192.168.0.8:8188';
const OUT = process.env.OUT_DIR || 'D:/Trolly/data/gates-media';

const id = process.argv[2];
if (!id) { console.error('usage: poll-comfy.mjs <prompt_id>'); process.exit(1); }
fs.mkdirSync(OUT, { recursive: true });

for (let i = 0; i < 700; i++) {
  await new Promise((r) => setTimeout(r, 10000));
  let rec;
  try {
    const h = await (await fetch(`${BASE}/history/${id}`)).json();
    rec = h[id];
  } catch { continue; }
  if (!rec) continue;
  if (rec.status?.status_str === 'error') {
    const err = rec.status.messages?.find((m) => m[0] === 'execution_error')?.[1];
    console.log('ERROR', JSON.stringify(err ?? rec.status).slice(0, 500));
    process.exit(2);
  }
  const ims = Object.values(rec.outputs ?? {}).flatMap((o) => o?.images ?? []);
  if (ims.length) {
    const u = `${BASE}/view?filename=${encodeURIComponent(ims[0].filename)}&type=${ims[0].type || 'output'}&subfolder=${encodeURIComponent(ims[0].subfolder || '')}`;
    const buf = Buffer.from(await (await fetch(u)).arrayBuffer());
    const p = `${OUT}/${ims[0].filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    fs.writeFileSync(p, buf);
    console.log('SAVED', p, buf.length, 'bytes');
    process.exit(0);
  }
  if (i % 6 === 0) console.log('running', i * 10, 's');
}
console.log('NOT_DONE');
process.exit(3);
