// Poll the ComfyUI queue continuously and save the FIRST finished image from any job
// whose prefix includes 'gates-'. Runs detached (no tty), so stdout to a file is fine.
import fs from 'node:fs';

const BASE = 'http://192.168.0.8:8188';
const OUT = process.env.OUT_DIR || 'D:/Trolly/data/gates-media';
fs.mkdirSync(OUT, { recursive: true });

for (let i = 0; i < 900; i++) {
  await new Promise((r) => setTimeout(r, 15000)); // poll every 15s
  let history = {};
  try { history = await (await fetch(`${BASE}/history`)).json(); } catch { continue; }
  let saved = null;
  for (const id of Object.keys(history)) {
    const rec = history[id];
    if (!rec?.outputs) continue;
    const ims = Object.values(rec.outputs).flatMap((o) => o?.images ?? []);
    for (const im of ims) {
      if (!/gates-/.test(im.filename)) continue;
      const u = `${BASE}/view?filename=${encodeURIComponent(im.filename)}&type=${im.type || 'output'}&subfolder=${encodeURIComponent(im.subfolder || '')}`;
      try {
        const buf = Buffer.from(await (await fetch(u)).arrayBuffer());
        const p = `${OUT}/${im.filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        fs.writeFileSync(p, buf);
        saved = p + ' ' + buf.length;
      } catch { /* keep polling */ }
    }
  }
  if (saved) { console.log('SAVED ' + saved); process.exit(0); }
  if (i % 12 === 0) console.log('waiting ' + (i * 15) + 's');
}
console.log('TIMEOUT');
process.exit(3);
