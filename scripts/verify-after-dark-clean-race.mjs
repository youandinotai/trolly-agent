import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { AFTER_DARK_DEFAULT_NEGATIVE, AFTER_DARK_DEFAULT_POSITIVE } from '../src/lib/after-dark-shared.js';

const outDir = 'D:/Trolly/data/verification';
const adultDir = 'D:/Trolly/data/after-dark';
const referenceFile = fs.readdirSync(adultDir).filter((name) => name.endsWith('.png')).sort().at(-1);
if (!referenceFile) throw new Error('No existing local reference image for the race test');
const reference = { name: referenceFile, dataBase64: fs.readFileSync(path.join(adultDir, referenceFile)).toString('base64') };
const browser = await chromium.connectOverCDP('http://127.0.0.1:48702');
const page = browser.contexts().flatMap((context) => context.pages()).find((candidate) => candidate.url().includes('Trolly/app'));
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
  await page.evaluate((payload) => {
    window.__adultRace = { state: 'pending' };
    window.trolly.comfy.generateAfterDark(payload).then(
      (result) => { window.__adultRace = { state: 'settled', result }; },
      (error) => { window.__adultRace = { state: 'error', error: String(error?.message ?? error) }; },
    );
  }, {
    positive: AFTER_DARK_DEFAULT_POSITIVE,
    negative: AFTER_DARK_DEFAULT_NEGATIVE,
    reference,
    checkpoint: 'ponyDiffusionV6XL_v6StartWithThisOne.safetensors',
    seed: 93217,
    width: 640,
    height: 832,
    steps: 12,
    cfg: 6.5,
    sampler: 'dpmpp_2m_sde',
    scheduler: 'karras',
    denoise: 0.62,
  });
  await page.waitForFunction(() => window.__adultRace?.state === 'pending');
  await page.waitForTimeout(1200);
  await modeButton('Clean').click();
  await activeMode('Clean');
  await page.screenshot({ path: `${outDir}/after-dark-clean-inflight.png` });
  await page.waitForFunction(() => window.__adultRace?.state !== 'pending', undefined, { timeout: 360_000 });
  const race = await page.evaluate(() => window.__adultRace);
  console.log(JSON.stringify(race, null, 2));
  if (race.state !== 'settled') throw new Error(`Generation failed before the safety assertion: ${race.error}`);
  if (race.result?.kind !== 'suppressed') throw new Error('Late adult render was not suppressed');
  if ('result' in race.result || 'url' in race.result || 'file' in race.result) throw new Error('Suppressed response leaked a result, URL, or path');
  if (await page.locator('.after-dark-result img').count()) throw new Error('Late adult image appeared in Clean');
  await page.locator('.clean-status').waitFor({ state: 'visible' });
  console.log('AFTER DARK CLEAN RACE: PASS — no pixels, URL, or file path returned after Clean');
  process.exit(0);
} catch (error) {
  await page.screenshot({ path: `${outDir}/after-dark-race-error.png` }).catch(() => {});
  console.error(error);
  process.exit(1);
}
