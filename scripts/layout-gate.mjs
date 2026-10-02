#!/usr/bin/env node
/* THE LAYOUT GATE. No page ships a dead zone: a stretch of blank ground between the last real
 * content a reader sees and the next thing on the page, with nothing painted in it.
 *
 *   node scripts/layout-gate.mjs [baseUrl]
 *
 * ⛔ WHY THIS EXISTS. 2026-09-21, every one of `/`, `/kinds` and `/method` shipped roughly 140px
 * of unbroken black between the last table row and the first line of the footer, with the
 * frame's own full-height divider lines running straight through it, so it read as an empty
 * box rather than as spacing. Two separate defects stacked into it:
 *   1. `.rail`/`.rail--r` had no `align-self` or `position`, so the frame's default CSS Grid
 *      stretch pulled each rail's box up to match `.track`, the tallest column, even though a
 *      rail's own content is a few hundred px. Fixed by pinning the rail (`position: sticky`)
 *      and letting its box end where its content ends (`align-self: start`).
 *   2. `.track`'s own 72px bottom padding stacked with `.foot`'s 40px margin-top and 30px
 *      `.in` padding-top into one long unbroken gap. Fixed by matching track's bottom padding
 *      to its top padding, 26px, since `.foot` already owns the separation from there down.
 *
 * A regex over the CSS cannot see either of these: both are about what actually RENDERS, which
 * is why this is a browser-driven gate and not another rule in check-register.mjs. It measures
 * two things, on every route this site has:
 *
 *   A. THE GAP BEFORE THE NEXT THING. From the bottom of the last element that paints real
 *      content on the page to the top of the first element that paints real content in
 *      whatever comes next (here, always the footer). Over MAX_GAP is a finding.
 *   B. A STRETCHED COLUMN. Any CSS Grid or flex child whose own box is taller than its content
 *      by more than MAX_DEAD_SPACE, with nothing of its own painted in the difference. This is
 *      the general shape of defect 1 above, so a rail regression, or a new page that reuses
 *      `.frame` badly, is caught the same way rather than only on the three routes that exist
 *      today.
 *
 * Wired into scripts/deploy.sh, right after verify-cf.mjs confirms the routes answer, so a
 * regression fails the deploy rather than getting written up afterward.
 *
 * EXIT CODES. 0 = clean. 1 = at least one dead zone. 2 = could not run, which BLOCKS too: a
 * gate that cannot answer must never report clean.
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const MAX_GAP = 90; // px, last real content to the next thing's first real content
const MAX_DEAD_SPACE = 150; // px, a column's own box height minus its content height

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = (process.argv[2] || 'http://localhost:3320').replace(/\/$/, '');
const ROUTES = ["/"];

let launchSafe, puppeteer;
try {
  ({ launchSafe } = await import('/Users/admin/CompoundLabs/compound-ops/tools/lib/safe-chrome.mjs'));
  puppeteer = createRequire('/Users/admin/CompoundLabs/compound-ops/package.json')('puppeteer-core');
} catch (err) {
  console.error(`layout-gate: could not load the shared browser driver, so nothing was measured: ${err.message}`);
  process.exit(2);
}

/* Runs inside the page. Returns plain data, no DOM references cross the boundary. */
const PROBE = `(() => {
  const MAX_GAP = ${MAX_GAP};
  const MAX_DEAD_SPACE = ${MAX_DEAD_SPACE};

  const label = (el) => {
    const bits = [el.tagName.toLowerCase()];
    if (el.id) bits.push('#' + el.id);
    for (const c of (el.getAttribute('class') || '').trim().split(/\\s+/).filter(Boolean).slice(0, 3)) bits.push('.' + c);
    return bits.join('');
  };

  const paintsSomething = (el) => {
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1;
  };

  /* The real bottom edge of whatever a block actually paints: text, an image, a border. Not
     the box, which can be padded or stretched past its content. */
  function contentBottom(el) {
    let bottom = el.getBoundingClientRect().top;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!(n.textContent || '').trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      for (const r of Array.from(range.getClientRects())) {
        if (r.width > 0 && r.height > 0) bottom = Math.max(bottom, r.bottom);
      }
    }
    for (const child of el.querySelectorAll('img, svg, video, canvas, table, iframe, hr')) {
      const r = child.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) bottom = Math.max(bottom, r.bottom);
    }
    return bottom;
  }
  function contentTop(el) {
    let top = el.getBoundingClientRect().bottom;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!(n.textContent || '').trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      for (const r of Array.from(range.getClientRects())) {
        if (r.width > 0 && r.height > 0) top = Math.min(top, r.top);
      }
    }
    for (const child of el.querySelectorAll('img, svg, video, canvas, table, iframe, hr')) {
      const r = child.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) top = Math.min(top, r.top);
    }
    return top;
  }

  const findings = [];

  /* A. THE GAP INTO THE FOOTER. */
  const main = document.querySelector('main') || document.querySelector('.track');
  const foot = document.querySelector('footer');
  if (main && foot) {
    const lastContentBottom = contentBottom(main);
    const footFirstTop = contentTop(foot);
    const gap = footFirstTop - lastContentBottom;
    if (gap > MAX_GAP) {
      findings.push({
        kind: 'footer-gap',
        gap: Math.round(gap),
        detail: 'from the last painted content in <main> to the first painted content in <footer>',
      });
    }
  }

  /* B. A STRETCHED COLUMN. Every direct child of a grid or flex container, compared against
     its own content's real extent. */
  for (const parent of document.querySelectorAll('body *')) {
    const pcs = getComputedStyle(parent);
    if (pcs.display !== 'grid' && pcs.display !== 'flex') continue;
    for (const child of parent.children) {
      if (!paintsSomething(child)) continue;
      const ccs = getComputedStyle(child);
      if (ccs.position === 'sticky' || ccs.position === 'fixed') continue; // pinned, not stretched
      const box = child.getBoundingClientRect();
      const padTop = parseFloat(ccs.paddingTop) || 0;
      const padBottom = parseFloat(ccs.paddingBottom) || 0;
      const bottom = contentBottom(child);
      const dead = box.bottom - bottom - padBottom;
      if (dead > MAX_DEAD_SPACE && box.height > 200) {
        findings.push({
          kind: 'stretched-column',
          sel: label(child),
          parentSel: label(parent),
          boxHeight: Math.round(box.height),
          dead: Math.round(dead),
          detail: 'this column\\'s box runs well past its own content, with the parent grid/flex stretching it to match a taller sibling',
        });
      }
    }
  }

  return findings;
})()`;

const browser = await launchSafe(puppeteer, { headless: true });
let bad = 0;
for (const route of ROUTES) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  let findings;
  try {
    await page.goto(BASE + route, { waitUntil: 'networkidle2', timeout: 60000 });
    await page.evaluate(() => document.fonts.ready);
    await new Promise((r) => setTimeout(r, 300));
    findings = await page.evaluate(PROBE);
  } catch (err) {
    console.error(`layout-gate: ${route} threw and was not measured: ${err.message}`);
    bad++;
    await page.close();
    continue;
  }
  if (findings.length) {
    bad += findings.length;
    console.error(`\nlayout-gate: ${route}`);
    for (const f of findings) {
      if (f.kind === 'footer-gap') {
        console.error(`  FAIL  footer-gap  ${f.gap}px (max ${MAX_GAP}px)  ${f.detail}`);
      } else {
        console.error(
          `  FAIL  stretched-column  ${f.sel} inside ${f.parentSel}  box ${f.boxHeight}px, ${f.dead}px dead (max ${MAX_DEAD_SPACE}px)  ${f.detail}`,
        );
      }
    }
  } else {
    console.log(`  ok    ${route}`);
  }
  await page.close();
}
await browser.close();

if (bad) {
  console.error(`\nlayout-gate: ${bad} finding(s). Nothing ships.`);
  process.exit(1);
}
console.log(`\nlayout-gate: ${ROUTES.length} route(s) measured, no dead zones.`);
