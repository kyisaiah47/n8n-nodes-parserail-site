/* THE DEPLOY GATE. A deploy that ships nothing must not exit 0.
 *
 * n8n-nodes-compound is now a page on ParseRail. Every path on this host answers 308 with the matching
 * ParseRail page, so each route is checked for the status AND the Location it points to. A static
 * asset path is in the list because asset requests reach the redirect only through
 * run_worker_first. The last route carries a query string, because the redirect keeps it.
 */
const base = (process.argv[2] || '').replace(/\/$/, '');
if (!base) {
  console.error('usage: node scripts/verify-cf.mjs <worker-url>');
  process.exit(1);
}

const PARSERAIL = 'https://parserail.thecompound.tech';
const ROUTES = [
  ['/', 308, PARSERAIL + '/docs/n8n'],
  ['/robots.txt', 308, PARSERAIL + '/robots.txt'],
  ['/sitemap.xml', 308, PARSERAIL + '/sitemap.xml'],
  ['/llms.txt', 308, PARSERAIL + '/llms.txt'],
  ['/favicon.ico', 308, PARSERAIL + '/docs/n8n'],
  ['/?ref=npm&utm_source=readme', 308, PARSERAIL + '/docs/n8n?ref=npm&utm_source=readme'],
];

async function tryOnce(path, want, location) {
  try {
    const res = await fetch(base + path, { redirect: 'manual' });
    return res.status === want && res.headers.get('location') === location;
  } catch {
    return false;
  }
}

async function checkRoute(path, want, location) {
  for (let i = 0; i < 6; i++) {
    if (await tryOnce(path, want, location)) return true;
    await new Promise((r) => setTimeout(r, 2500));
  }
  return false;
}

let failed = 0;
for (const [path, want, location] of ROUTES) {
  const ok = await checkRoute(path, want, location);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${base}${path} (want ${want} to ${location})`);
  if (!ok) failed++;
}
if (failed) {
  console.error(`verify-cf: ${failed} route(s) did not answer as expected`);
  process.exit(1);
}
console.log('verify-cf: all routes answered as expected');
