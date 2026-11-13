import fs from 'node:fs';
import { chromium } from 'playwright-core';

const outDir = 'D:/Trolly/data/verification';
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.connectOverCDP('http://127.0.0.1:48702');
const page = browser.contexts().flatMap((context) => context.pages()).find((candidate) => candidate.url().includes('Trolly/app'));
if (!page) throw new Error('Trolly Agent page not found');

async function openStudio() {
  await page.locator('.rail-item', { hasText: 'Studio' }).click();
  await page.locator('.studio-preview .model-overlay strong').waitFor({ state: 'visible', timeout: 120_000 });
}

try {
  await openStudio();
  await page.screenshot({ path: `${outDir}/studio-initial.png` });
  await page.locator('.studio-library input[type="file"]').first().setInputFiles(`${outDir}/studio-cloth-pattern.png`);
  await page.locator('.studio-status').filter({ hasText: 'saved to Wardrobe' }).waitFor({ state: 'visible', timeout: 30_000 });

  await page.locator('.studio-tabs button', { hasText: 'Actors / Actress' }).click();
  await page.locator('.studio-properties input[type="color"]').evaluate((input) => {
    input.value = '#67e8f9';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const ranges = page.locator('.studio-properties input[type="range"]');
  await ranges.nth(0).evaluate((input) => { input.value = '1.3'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await ranges.nth(1).evaluate((input) => { input.value = '1.15'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await ranges.nth(2).evaluate((input) => { input.value = '0.8'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.locator('.studio-action', { hasText: 'Save actor' }).click();
  await page.locator('.studio-status').filter({ hasText: 'saved locally' }).waitFor({ state: 'visible' });

  await page.locator('.studio-tabs button', { hasText: 'Stage / Scene' }).click();
  await page.locator('.scene-card', { hasText: 'Soft Studio' }).click();
  await page.locator('.studio-action', { hasText: 'Save scene' }).click();
  await page.locator('.studio-status').filter({ hasText: 'saved to Stage / Scene' }).waitFor({ state: 'visible' });
  await page.locator('.studio-tabs button', { hasText: 'Wardrobe' }).click();
  await page.screenshot({ path: `${outDir}/studio-dressed.png` });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await openStudio();
  const saved = await page.evaluate(() => window.trolly.studio.read());
  const active = saved.actors.find((item) => item.id === saved.activeActorId);
  const uploaded = saved.garments.find((item) => item.name === 'studio-cloth-pattern');
  if (!uploaded) throw new Error('Uploaded garment did not persist');
  if (!active?.garmentIds.includes(uploaded.id)) throw new Error('Uploaded garment is not on the saved actor');
  if (active.hair.color !== '#67e8f9' || active.hair.length !== 1.3 || active.smile !== 0.8) {
    throw new Error(`Actor settings did not persist: ${JSON.stringify(active.hair)} smile=${active.smile}`);
  }
  const softScene = saved.scenes.find((item) => item.id === active.sceneId);
  if (softScene?.name !== 'Soft Studio') throw new Error('Scene selection did not persist');
  await page.screenshot({ path: `${outDir}/studio-reloaded.png` });
  console.log(JSON.stringify({ ok: true, actor: active.name, garment: uploaded.name, hair: active.hair, smile: active.smile, scene: softScene.name, screenshot: `${outDir}/studio-reloaded.png` }, null, 2));
  process.exit(0);
} catch (error) {
  await page.screenshot({ path: `${outDir}/studio-error.png` }).catch(() => {});
  console.error(error);
  console.error((await page.locator('body').innerText()).slice(-5000));
  process.exit(1);
}
