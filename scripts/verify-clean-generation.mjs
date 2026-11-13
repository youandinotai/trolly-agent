import fs from 'node:fs';
import { chromium } from 'playwright-core';

const outDir = 'D:/Trolly/data/verification';
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.connectOverCDP('http://127.0.0.1:48702');
const page = browser.contexts().flatMap((context) => context.pages()).find((candidate) => candidate.url().includes('Trolly/app'));
if (!page) throw new Error('Trolly Agent page not found');

try {
  await page.locator('.rail-item', { hasText: 'Artistry' }).click();
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await page.locator('.view:visible > .panel').first().locator('.badge.ok').waitFor({ state: 'visible', timeout: 60_000 });
  await page.getByRole('button', { name: 'Image (SD)', exact: true }).click();
  const panel = page.locator('.view:visible > .panel').nth(1);
  await panel.locator('select').first().selectOption({ label: 'ponyDiffusionV6XL_v6StartWithThisOne.safetensors' });
  await panel.locator('textarea').nth(0).fill('A warmly lit reading room, a comfortable armchair, books, rain on the window, cinematic interior, no people');
  await panel.locator('textarea').nth(1).fill('blurry, low quality, text, watermark, people, nudity');
  const numbers = panel.locator('.grid2 input');
  await numbers.nth(0).fill('44117');
  await numbers.nth(1).fill('12');
  await numbers.nth(2).fill('6.5');
  await numbers.nth(3).fill('640');
  await numbers.nth(4).fill('832');
  await panel.getByRole('button', { name: 'Generate image', exact: true }).click();
  await panel.locator('.scroll-box').waitFor({ state: 'visible', timeout: 360_000 });
  const result = panel.locator('.scroll-box').locator('..');
  await result.locator('.safe-media-cover').waitFor({ state: 'visible' });
  if (await result.locator('img,video').count()) throw new Error('Clean generation mounted a visible image or video');
  const saved = await panel.locator('.scroll-box').innerText();
  console.log(`Clean generation completed: ${saved}`);
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await page.waitForTimeout(1500);
  const libraryCount = await page.locator('.lib-item').count();
  if (!libraryCount) throw new Error('Generated work did not appear in the library');
  if (await page.locator('.lib-grid img,.lib-grid video').count()) throw new Error('Library mounted unreviewed media in Clean');
  if (await page.locator('.lib-grid .safe-media-cover').count() !== libraryCount) throw new Error('Not every library item is covered');
  await page.screenshot({ path: `${outDir}/clean-standard-generation.png`, fullPage: true });
  console.log(`CLEAN GENERATION: PASS — result and ${libraryCount} library item(s) protected without blocking work`);
  process.exit(0);
} catch (error) {
  await page.screenshot({ path: `${outDir}/clean-generation-error.png` }).catch(() => {});
  console.error(error);
  console.error((await page.locator('body').innerText()).slice(-5000));
  process.exit(1);
}
