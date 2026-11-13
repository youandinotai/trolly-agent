import fs from 'node:fs';
import { chromium } from 'playwright-core';

const outDir = 'D:/Trolly/data/verification';
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.connectOverCDP('http://127.0.0.1:48702');
const page = browser.contexts().flatMap((context) => context.pages()).find((candidate) => candidate.url().includes('Trolly/app'));
if (!page) throw new Error('Trolly Agent page not found');
const prompt = 'create a video of neon rain over a cyberpunk city';

try {
  await page.locator('.chat-input textarea').waitFor({ state: 'visible', timeout: 30_000 });
  const direct = await page.evaluate((value) => window.trolly.router.classify(value), prompt);
  await page.locator('.chat-input textarea').fill(prompt);
  await page.locator('.chat-input .btn.primary').filter({ hasText: 'Send' }).click();
  await page.locator('.route-notice').waitFor({ state: 'visible', timeout: 90_000 });
  const heading = await page.locator('.topbar h1').innerText();
  const notice = await page.locator('.route-notice').innerText();
  const routedPrompt = await page.locator('.field textarea').first().inputValue();
  const videoActive = await page.locator('button.primary').filter({ hasText: 'Video (LTX)' }).count();
  if (heading !== 'Artistry') throw new Error(`Expected Artistry, got ${heading}`);
  if (!videoActive) throw new Error('Video mode was not selected');
  if (routedPrompt !== prompt) throw new Error('Prompt did not reach Artistry');
  await page.screenshot({ path: `${outDir}/jev-router.png` });
  console.log(JSON.stringify({ ok: true, direct, heading, notice, screenshot: `${outDir}/jev-router.png` }, null, 2));
  process.exit(0);
} catch (error) {
  await page.screenshot({ path: `${outDir}/jev-router-error.png` }).catch(() => {});
  console.error(error);
  console.error((await page.locator('body').innerText()).slice(-4000));
  process.exit(1);
}
