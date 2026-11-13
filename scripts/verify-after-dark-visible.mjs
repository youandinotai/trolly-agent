import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const outDir = 'D:/Grindroid/trolly-agent/verification';
const adultDir = 'D:/Grindroid/trolly-agent/after-dark';
const referenceFile = fs.readdirSync(adultDir).filter((name) => name.endsWith('.png')).sort().at(-1);
if (!referenceFile) throw new Error('No local reference image');
const browser = await chromium.connectOverCDP('http://127.0.0.1:48702');
const page = browser.contexts().flatMap((context) => context.pages()).find((candidate) => candidate.url().includes('trolly-agent'));
if (!page) throw new Error('Trolly Agent page not found');
const modeButton = (name) => page.locator('.mode-btn', { hasText: name });
const activeMode = async (name) => page.waitForFunction((label) => {
  const button = [...document.querySelectorAll('.mode-btn')].find((item) => item.textContent.trim() === label);
  return button?.classList.contains('active');
}, name, { timeout: 15_000 });

try {
  await page.locator('.rail-item', { hasText: 'Artistry' }).click();
  await modeButton('Adult').click();
  await activeMode('Adult');
  await page.locator('.after-dark-tab').click();
  await page.locator('.reference-drop input').setInputFiles(path.join(adultDir, referenceFile));
  await page.locator('.reference-drop img').waitFor({ state: 'visible' });
  await page.locator('#adult-steps').fill('16');
  await page.locator('#adult-width').fill('640');
  await page.locator('#adult-height').fill('832');
  await page.locator('#adult-seed').fill('73119');
  await page.getByRole('button', { name: 'Generate After Dark', exact: true }).click();
  const image = page.locator('.after-dark-result img');
  await image.waitFor({ state: 'visible', timeout: 360_000 });
  await page.waitForFunction(() => {
    const img = document.querySelector('.after-dark-result img');
    return img instanceof HTMLImageElement && img.complete && img.naturalWidth > 0;
  }, undefined, { timeout: 30_000 });
  const saved = await page.locator('.after-dark-result code').innerText();
  if (!saved.startsWith('D:\\') || !fs.existsSync(saved)) throw new Error(`Adult output was not saved in the private D: lane: ${saved}`);
  await page.screenshot({ path: `${outDir}/after-dark-visible-regression.png` });
  await modeButton('Clean').click();
  await activeMode('Clean');
  await page.locator('.after-dark-panel').waitFor({ state: 'hidden' });
  if (await page.locator('.after-dark-result img').count()) throw new Error('Adult result survived Clean');
  await page.screenshot({ path: `${outDir}/after-dark-visible-then-clean.png` });
  console.log('AFTER DARK NORMAL PATH: PASS — real image displayed in Adult, saved on D:, removed by Clean');
  console.log(saved);
  process.exit(0);
} catch (error) {
  await page.screenshot({ path: `${outDir}/after-dark-visible-error.png` }).catch(() => {});
  console.error(error);
  console.error((await page.locator('body').innerText()).slice(-5000));
  process.exit(1);
}
