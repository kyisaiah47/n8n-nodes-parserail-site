#!/usr/bin/env node
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";
const ROOT = resolve(new URL("..", import.meta.url).pathname);
const OUT = resolve(ROOT, "review");
const BASE = process.argv.find((arg) => arg.startsWith("http")) || "http://localhost:3320";
rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: '/Users/admin/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
await page.goto(BASE, { waitUntil: "networkidle" }); await page.evaluate(() => document.fonts.ready);
const height = await page.evaluate(() => document.documentElement.scrollHeight); const tiles = Math.ceil(height / 900);
for (let i = 0; i < tiles; i++) { await page.evaluate((y) => window.scrollTo(0, y), i * 900); await page.screenshot({ path: resolve(OUT, `home-${String(i + 1).padStart(2, "0")}.png`) }); }
const shape = await page.evaluate(() => ({ clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
writeFileSync(resolve(OUT, "ledger.json"), JSON.stringify({ base: BASE, viewport: 1440, height, tiles, ...shape }, null, 2));
await browser.close(); console.log(`shot ${tiles} tile(s), ${height}px tall, ${shape.scrollWidth} in ${shape.clientWidth}`);
if (shape.scrollWidth > shape.clientWidth + 1) process.exit(1);
