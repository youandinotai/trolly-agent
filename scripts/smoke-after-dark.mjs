import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const outDir = 'D:/Grindroid/trolly-agent/verification';
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.connectOverCDP('http://127.0.0.1:48702');
const pages = browser.contexts().flatMap((context) => context.pages());
const page = pages.find((candidate) => candidate.url().includes('trolly-agent'));
if (!page) throw new Error('Trolly Agent page not found');

try {
  await page.locator('.rail-item', { hasText: 'Artistry' }).click();
  await page.locator('.after-dark-tab').click();
  await page.locator('.after-dark-panel').waitFor({ state: 'visible' });
  await page.locator('.after-dark-panel input[type="file"]').setInputFiles('D:/mira/trolly-nsfw/trolly-source.png');
  await page.locator('.reference-drop img').waitFor({ state: 'visible' });
  await page.screenshot({ path: path.join(outDir, 'after-dark-panel.png'), fullPage: true });

  await page.locator('.after-dark-generate').click();
  await Promise.race([
    page.locator('.after-dark-result img').waitFor({ state: 'visible', timeout: 360_000 }),
    page.locator('.after-dark-error').waitFor({ state: 'visible', timeout: 360_000 }).then(async () => {
      throw new Error(await page.locator('.after-dark-error').innerText());
    }),
  ]);
  await page.waitForFunction(() => {
    const image = document.querySelector('.after-dark-result img');
    return image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0;
  }, { timeout: 30_000 });
  await page.locator('.after-dark-result').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(outDir, 'after-dark-result.png'), fullPage: true });
  const result = await page.locator('.result-path code').innerText();
  const dimensions = await page.locator('.after-dark-result img').evaluate((image) => ({
    width: image.naturalWidth,
    height: image.naturalHeight,
  }));
  console.log(JSON.stringify({ ok: true, result, dimensions, screenshot: path.join(outDir, 'after-dark-result.png') }, null, 2));
  process.exit(0);
} catch (error) {
  await page.screenshot({ path: path.join(outDir, 'after-dark-error.png'), fullPage: true }).catch(() => {});
  console.error(error);
  console.error((await page.locator('body').innerText()).slice(-5000));
  process.exit(1);
}
