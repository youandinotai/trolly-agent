import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'data', 'verification');
fs.mkdirSync(output, { recursive: true });
const testModel = process.env.TROLLY_TEST_VRM || 'D:\\sow\\app-w64\\Soul-of-Waifu-v2.5.1\\assets\\emotions\\vrm\\AvatarSample_K.vrm';

const app = await electron.launch({
  executablePath: path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe'),
  args: [root],
  cwd: root,
  env: { ...process.env, TROLLY_DATA_DIR: path.join(root, 'data', 'smoke') },
});
const errors = [];

try {
  console.log('Electron launched; waiting for the stage window…');
  const page = await app.firstWindow({ timeout: 30_000 });
  console.log(`Stage window: ${page.url()}`);
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.waitForSelector('.avatar-welcome', { timeout: 30_000 });
  await page.screenshot({ path: path.join(output, 'avatar-empty.png') });

  if (fs.existsSync(testModel)) {
    await page.locator('.stage .avatar-studio input[type=file][accept=".vrm,.glb"]').setInputFiles(testModel);
    await page.locator('.stage .model-overlay').waitFor({ timeout: 60_000 });
    await page.waitForTimeout(1800);
    await page.getByRole('button', { name: 'Happy', exact: true }).click();
    await page.screenshot({ path: path.join(output, 'avatar-loaded.png') });
    await page.getByRole('button', { name: 'Motion', exact: true }).click();
    await page.getByText('Cursor gaze', { exact: false }).waitFor();
    await page.getByRole('tablist', { name: 'Avatar controls' }).getByRole('button', { name: 'Stage', exact: true }).click();
    await page.getByRole('button', { name: 'Save PNG snapshot' }).waitFor();
    await page.getByRole('button', { name: 'Speak', exact: true }).click();
    await page.waitForFunction(() => {
      const button = [...document.querySelectorAll('button')].find((item) => item.textContent === 'Speak');
      return button && !button.disabled;
    }, undefined, { timeout: 30_000 });
  }

  const fatal = errors.filter((message) => !/Autofill|dbus|gpu_process_host/i.test(message));
  if (fatal.length) throw new Error(`Renderer errors:\n${fatal.join('\n')}`);
  console.log(`AVATAR SMOKE: PASS${fs.existsSync(testModel) ? ' (empty stage + VRM load + expressions + controls)' : ' (empty stage)'}`);
  console.log(`Screenshots: ${output}`);
} finally {
  await app.close();
}
