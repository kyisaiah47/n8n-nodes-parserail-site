/* THE DEPLOY GATE. A deploy that ships nothing must not exit 0.
 *
 * The shape is the one tools/cloudflare/migrate-product.mjs writes. An early rulestack deploy
 * reported exit 0 while no Worker existed on the account at all, so every later run would have
 * read as a success while the site silently stayed on the old host. This reads the Worker's own
 * routes back over the network and exits non-zero on any status that is not the expected one.
 *
 * Routes are derived from the app router: the page, plus the three files Next serves from
 * src/app. Dynamic segments are skipped, because a real value for one has to come from the
 * product's own data.
 */
const base = (process.argv[2] || '').replace(/\/$/, '');
if (!base) {
  console.error('verify-cf: no base url given');
  process.exit(1);
}

/* ⛔ DO NOT ASSUME 200 WITHOUT READING IT BACK. agentwire's /reference answers 308 in
 * production and a gate that assumed 200 failed a deploy that was perfectly correct. Every
 * status below is what this Worker is expected to serve, corrected by hand against the first
 * real deploy rather than invented. */
const ROUTES = [
  ['/', 200],
  ['/robots.txt', 200],
  ['/sitemap.xml', 200],
  ['/llms.txt', 200],
];

/* ⛔ RETRY BEFORE FAILING. A route whose page lives in the incremental cache can answer 404 for
 * a few seconds after populateCache returns, because the R2 writes have not settled. Measured
 * on cardchase: every route failed the gate and every one answered 200 by hand a moment later.
 * Six tries over about fifteen seconds covers it, and a deploy that is genuinely broken still
 * fails, just fifteen seconds later. */
async function tryOnce(path, want) {
  try {
    const res = await fetch(base + path, { redirect: 'manual' });
    return res.status === want;
  } catch {
    return false;
  }
}

async function checkRoute(path, want) {
  for (let i = 0; i < 6; i++) {
    if (await tryOnce(path, want)) return true;
    await new Promise((r) => setTimeout(r, 2500));
  }
  return false;
}

let failed = 0;
for (const [path, want] of ROUTES) {
  const ok = await checkRoute(path, want);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${base}${path} (want ${want})`);
  if (!ok) failed++;
}
if (failed) {
  console.error(`verify-cf: ${failed} route(s) did not answer as expected`);
  process.exit(1);
}
console.log('verify-cf: all routes answered as expected');
