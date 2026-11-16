// Queue-safe watcher: submit a fresh legal-adult image job and save the first result.
import fs from 'node:fs';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
const runp = promisify(execFile);

const BASE = 'http://192.168.0.8:8188';
const OUT = process.env.OUT_DIR || 'D:/Trolly/data/gates-media';
fs.mkdirSync(OUT, { recursive: true });

const { stdout } = await runp(process.execPath, ['--experimental-strip-types', 'scripts/submit-img.mjs'], { cwd: 'D:/Trolly/app' });
const id = stdout.match(/prompt_id:\s*([0-9a-f-]+)/)?.[1];
if (!id) { console.log('no prompt id'); process.exit(1); }
console.log('watching', id);

const ok = await new Promise((resolve) => {
  const poll = spawn(process.execPath, ['scripts/poll-comfy.mjs', id], { cwd: 'D:/Trolly/app', env: { ...process.env, OUT_DIR: OUT } });
  poll.stdout.on('data', (d) => process.stdout.write(d));
  poll.stderr.on('data', (d) => process.stderr.write(d));
  poll.on('exit', (code) => resolve(code === 0));
});
console.log(ok ? 'IMAGE_SAVED' : 'IMAGE_FAILED');
process.exit(ok ? 0 : 1);
