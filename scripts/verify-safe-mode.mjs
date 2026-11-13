import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright-core';

const outDir = 'D:/Trolly/data/verification';
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.connectOverCDP('http://127.0.0.1:48702');
const page = browser.contexts().flatMap((context) => context.pages()).find((candidate) => candidate.url().includes('Trolly/app'));
if (!page) throw new Error('Trolly Agent page not found');
const results = [];
const record = (name, detail = true) => { results.push({ name, detail }); console.log(`PASS ${name}`, typeof detail === 'string' ? detail : ''); };
const modeButton = (name) => page.locator('.mode-btn', { hasText: name });
const activeMode = async (name) => {
  await page.waitForFunction((label) => {
    const button = [...document.querySelectorAll('.mode-btn')].find((item) => item.textContent.trim() === label);
    return button?.classList.contains('active');
  }, name, { timeout: 15_000 });
};
const canvasHash = async () => createHash('sha256').update(await page.locator('.studio-preview canvas').screenshot()).digest('hex');
const openStudio = async (clean = true) => {
  await page.locator('.rail-item', { hasText: 'Studio' }).click();
  await page.locator('.studio-preview .model-overlay strong').waitFor({ state: 'visible', timeout: 120_000 });
  if (clean) {
    await page.locator('.studio-preview canvas[data-presentation="clean"][data-safe-ready="true"]').waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('.studio-preview .avatar-safety-cover').waitFor({ state: 'hidden', timeout: 30_000 });
  }
};

try {
  // Force a known starting state; leftover interactive sessions may be Adult.
  await page.waitForFunction(() => window.trolly?.mode, undefined, { timeout: 30_000 });
  await page.evaluate(() => window.trolly.mode.clean());
  await page.locator('.clean-status').waitFor({ state: 'visible', timeout: 30_000 });
  if (await page.locator('.clean-display-lock').count()) throw new Error('Whole-app Clean lock still exists');
  if (await page.locator('.rail-item').count() !== 6) throw new Error('Navigation is not available in Clean');
  await page.locator('.rail-item', { hasText: 'Stage' }).click();
  await page.locator('.chat-input textarea').waitFor({ state: 'visible' });
  record('Clean keeps navigation and chat available');
  await page.screenshot({ path: `${outDir}/safe-mode-clean-stage.png` });

  await openStudio(true);
  if (await page.locator('.scene-backdrop-image').count()) throw new Error('Unreviewed scene image remained visible in Clean');
  record('Clean Studio loads the avatar with a confirmed safe outfit');
  await page.screenshot({ path: `${outDir}/safe-mode-clean-studio.png` });

  await modeButton('Adult').click();
  await activeMode('Adult');
  await page.locator('.studio-preview canvas[data-presentation="adult"]').waitFor({ state: 'visible' });
  await page.locator('.studio-tabs button', { hasText: 'Wardrobe' }).click();
  await page.locator('.library-item').first().waitFor({ state: 'visible', timeout: 30_000 });
  const beforeHat = await canvasHash();
  await page.locator('.library-main', { hasText: 'Midnight cap' }).click();
  await page.waitForTimeout(900);
  const afterHat = await canvasHash();
  if (beforeHat === afterHat) throw new Error('Wardrobe click did not change the rendered canvas');
  record('Wardrobe changes the real WebGL canvas', `${beforeHat.slice(0, 12)} -> ${afterHat.slice(0, 12)}`);
  await page.screenshot({ path: `${outDir}/safe-mode-adult-studio.png` });

  await modeButton('Clean').click();
  await activeMode('Clean');
  await page.locator('.studio-preview canvas[data-presentation="clean"][data-safe-ready="true"]').waitFor({ state: 'visible' });
  await page.locator('.studio-preview .avatar-safety-cover').waitFor({ state: 'hidden' });
  record('Adult to Clean restores the dressed safe avatar');
  await page.screenshot({ path: `${outDir}/safe-mode-clean-restored.png` });

  await modeButton('Adult').click();
  await activeMode('Adult');
  await page.keyboard.press('Control+Alt+C');
  await activeMode('Clean');
  await page.locator('.studio-preview canvas[data-presentation="clean"]').waitFor({ state: 'visible' });
  record('Ctrl+Alt+C triggers Clean protection while the app is focused');

  await page.locator('.rail-item', { hasText: 'Stage' }).click();
  await modeButton('Adult').click();
  await activeMode('Adult');
  await page.locator('input[type="file"][accept="image/*"]').setInputFiles(`${outDir}/studio-cloth-pattern.png`);
  await page.locator('.attach-chip .safe-media-content').waitFor({ state: 'visible' });
  await modeButton('Clean').click();
  await activeMode('Clean');
  if (await page.locator('.attach-chip img').count()) throw new Error('Attached image remained mounted in Clean');
  await page.locator('.attach-chip .safe-media-cover').waitFor({ state: 'visible' });
  record('Clean hides image attachments without disabling the composer');
  await page.locator('.attach-chip button', { hasText: 'Remove' }).click();

  await page.locator('.rail-item', { hasText: 'Artistry' }).click();
  await modeButton('Adult').click();
  await activeMode('Adult');
  await page.locator('.after-dark-tab').click();
  await page.locator('.reference-drop input').setInputFiles(`${outDir}/studio-cloth-pattern.png`);
  await page.locator('.reference-drop img').waitFor({ state: 'visible' });
  await modeButton('Clean').click();
  await activeMode('Clean');
  await page.locator('.after-dark-panel').waitFor({ state: 'hidden' });
  if (await page.locator('.after-dark-panel img').count()) throw new Error('After Dark reference remained mounted in Clean');
  record('Clean removes the After Dark reference and result surface');

  await modeButton('Adult').click();
  await activeMode('Adult');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('.clean-status').waitFor({ state: 'visible', timeout: 30_000 });
  await activeMode('Clean');
  await page.locator('.chat-input textarea').waitFor({ state: 'visible' });
  record('Reload never restores Adult visuals from saved preferences');

  const gateError = await page.evaluate(async () => {
    try { await window.trolly.comfy.generateAfterDark({}); return ''; }
    catch (error) { return String(error?.message ?? error); }
  });
  if (!/current session|adult content/i.test(gateError)) throw new Error(`Main-process session gate failed: ${gateError}`);
  record('Electron main rejects After Dark work while Clean');

  await openStudio(true);
  await page.screenshot({ path: `${outDir}/safe-mode-after-reload.png` });
  console.log(JSON.stringify({ ok: true, results }, null, 2));
  process.exit(0);
} catch (error) {
  await page.screenshot({ path: `${outDir}/safe-mode-error.png` }).catch(() => {});
  console.error(error);
  console.error((await page.locator('body').innerText()).slice(-6000));
  process.exit(1);
}
