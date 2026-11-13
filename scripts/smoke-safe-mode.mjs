import fs from 'node:fs';
import { chromium } from 'playwright-core';

const outDir = 'D:/Grindroid/trolly-agent/verification';
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.connectOverCDP('http://127.0.0.1:48702');
const page = browser.contexts().flatMap((context) => context.pages()).find((candidate) => candidate.url().includes('trolly-agent'));
if (!page) throw new Error('Trolly Agent page not found');

await page.screenshot({ path: `${outDir}/safe-mode-before.png` });
const lock = await page.locator('.clean-display-lock').count();
const nav = await page.locator('.rail-item').allTextContents();
console.log(JSON.stringify({ lock, nav }, null, 2));
if (lock) throw new Error('FAIL: Clean mode still replaces the whole application instead of protecting visual surfaces only');
console.log('SAFE MODE BASELINE: PASS');
process.exit(0);
