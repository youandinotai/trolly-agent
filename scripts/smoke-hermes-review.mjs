import fs from 'node:fs';
import { chromium } from 'playwright-core';

const outDir = 'D:/Grindroid/trolly-agent/verification';
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.connectOverCDP('http://127.0.0.1:48702');
const page = browser.contexts().flatMap((context) => context.pages()).find((candidate) => candidate.url().includes('trolly-agent'));
if (!page) throw new Error('Trolly Agent page not found');

try {
  await page.locator('.rail-item', { hasText: 'Studio' }).click();
  await page.locator('.hermes-button').waitFor({ state: 'visible' });
  await page.locator('.hermes-button').click();
  await page.locator('.hermes-review').waitFor({ state: 'visible', timeout: 180_000 });
  const review = await page.locator('.hermes-review').innerText();
  if (!review.includes('PASS') && !review.includes('NEEDS_WORK')) throw new Error(`Unexpected Hermes review: ${review}`);
  await page.screenshot({ path: `${outDir}/studio-hermes-review.png` });
  console.log(JSON.stringify({ ok: true, review, screenshot: `${outDir}/studio-hermes-review.png` }, null, 2));
  process.exit(0);
} catch (error) {
  await page.screenshot({ path: `${outDir}/studio-hermes-error.png` }).catch(() => {});
  console.error(error);
  console.error((await page.locator('body').innerText()).slice(-4000));
  process.exit(1);
}
