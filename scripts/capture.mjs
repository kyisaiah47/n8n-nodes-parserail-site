#!/usr/bin/env node
/* CAPTURE THE OPERATION SURFACE. Nothing about the catalogue is typed into this site.
 *
 *   npm run capture
 *
 * Two primary sources, joined on the request path, and both are files on disk rather than a
 * description of them:
 *
 *   1. ~/CompoundLabs/n8n-nodes-compound/nodes/ParseRail/description.ts
 *      The node's own generated description. It is what n8n reads, so it is the only honest
 *      answer to "what operations does this node put in a workflow". Every operation's display
 *      name, its `operation` value, its action, its one line and its HTTP request come from
 *      here, and so do the per operation input fields.
 *
 *   2. ~/CompoundLabs/parserail/src/lib/platform/constants.ts
 *      ParseRail's own BURN_RATES, CREDIT_USD, COLLECTIONS and ENDPOINTS. That is where a
 *      credit price, a group, a unit, a per key throttle and a paused endpoint are declared.
 *
 * A typed catalogue drifts from the package the first time a generator runs, and nothing errors
 * when it does: the table still looks like a table. This file refuses to write a catalogue that
 * came back short, that lost a price, or whose two sources disagree about which paths exist.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NODE = process.env.NODE_PKG || '/Users/admin/CompoundLabs/n8n-nodes-compound';
const RAIL = process.env.PARSERAIL || '/Users/admin/CompoundLabs/parserail';

const desc = readFileSync(resolve(NODE, 'nodes/ParseRail/description.ts'), 'utf8');
const cred = readFileSync(resolve(NODE, 'credentials/ParseRailApi.credentials.ts'), 'utf8');
const pkg = JSON.parse(readFileSync(resolve(NODE, 'package.json'), 'utf8'));
const consts = readFileSync(resolve(RAIL, 'src/lib/platform/constants.ts'), 'utf8');

/* ---- 1. the operations, out of the node's own generated description ---- */
const OP = /\{\s*"name": "([^"]+)",\s*"value": "([^"]+)",\s*"action": "([^"]+)",\s*"description": "((?:[^"\\]|\\.)*)",\s*"routing": \{\s*"request": \{\s*"method": "([A-Z]+)",\s*"url": "([^"]+)"/g;
const ops = [];
for (const m of desc.matchAll(OP)) {
  ops.push({
    value: m[2],
    name: m[1],
    action: m[3],
    line: JSON.parse(`"${m[4]}"`),
    method: m[5],
    path: m[6],
    fields: [],
  });
}
const actions = (desc.match(/"action":/g) || []).length;
if (!ops.length) throw new Error('no operations parsed out of description.ts');
if (ops.length !== actions) throw new Error(`${ops.length} operations parsed but ${actions} action keys exist, so the pattern missed one`);

/* The per operation input fields. Every field object carries a displayOptions.show.operation, so
 * the field belongs to exactly the operations named there. */
const FIELD = /\{\s*"displayName": "([^"]+)",\s*"name": "([^"]+)",\s*"type": "([^"]+)",([\s\S]{0,1400}?)"displayOptions": \{\s*"show": \{\s*"operation": \[\s*((?:\s*"[^"]+",?)+)\s*\]/g;
let fieldCount = 0;
for (const m of desc.matchAll(FIELD)) {
  const owners = [...m[5].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
  const required = /"required": true/.test(m[4]);
  const hint = /"description": "((?:[^"\\]|\\.)*)"/.exec(m[4]);
  for (const o of owners) {
    const op = ops.find((x) => x.value === o);
    if (!op) continue;
    op.fields.push({
      label: m[1],
      name: m[2].replace(new RegExp(`^${o.replace(/[-]/g, '\\-')}_`), ''),
      type: m[3],
      required,
      hint: hint ? JSON.parse(`"${hint[1]}"`) : '',
    });
    fieldCount++;
  }
}

/* ---- 2. the prices, the groups and the pause, out of ParseRail's own constants ---- */
const creditUsd = Number(/export const CREDIT_USD = ([\d.]+);/.exec(consts)?.[1]);
if (!creditUsd) throw new Error('CREDIT_USD not found in ParseRail constants');

const burnBlock = /export const BURN_RATES = \{([\s\S]*?)\n\} as const;|export const BURN_RATES = \{([\s\S]*?)\n\};/.exec(consts);
const burn = {};
for (const m of (burnBlock?.[1] ?? burnBlock?.[2] ?? '').matchAll(/^\s*"?([a-z-]+)"?:\s*(\d+),/gm)) burn[m[1]] = Number(m[2]);
if (Object.keys(burn).length < ops.length) throw new Error(`only ${Object.keys(burn).length} burn rates read for ${ops.length} operations`);

const groups = [];
for (const m of consts.matchAll(/\{ key: "([a-z]+)", title: "([^"]+)", blurb: "([^"]+)" \}/g)) {
  groups.push({ key: m[1], title: m[2], blurb: m[3] });
}
if (groups.length !== 7) throw new Error(`${groups.length} collections read, not the 7 ParseRail declares`);

const ENDPOINT = /\{ key: "([a-z-]+)", collection: "([a-z]+)", method: "POST", path: "([^"]+)", title: "([^"]+)", unit: "([^"]+)",\s*\n\s*blurb: "((?:[^"\\]|\\.)*)"/g;
const endpoints = {};
for (const m of consts.matchAll(ENDPOINT)) {
  endpoints[m[3]] = { key: m[1], collection: m[2], title: m[4], unit: m[5], blurb: JSON.parse(`"${m[6]}"`) };
}

/* A paused endpoint carries an `unavailable` block. Read the key it sits under by finding the
 * nearest preceding `key:` rather than assuming which endpoint it is. */
const pausedAt = consts.indexOf('unavailable: {\n      since:');
const paused = {};
if (pausedAt > 0) {
  const before = consts.slice(0, pausedAt);
  const key = [...before.matchAll(/\{ key: "([a-z-]+)", collection:/g)].pop()?.[1];
  const since = /since: "([^"]+)"/.exec(consts.slice(pausedAt))?.[1];
  const reason = /reason:\s*\n?\s*"((?:[^"\\]|\\.)*)"/.exec(consts.slice(pausedAt))?.[1];
  if (key) paused[key] = { since, reason: reason ? JSON.parse(`"${reason}"`) : '' };
}

const rates = {};
for (const m of consts.matchAll(/^\s*"?([a-z-]+)"?:\s*\{ limit: (\d+), windowSec: (\d+) \},/gm)) {
  rates[m[1]] = { limit: Number(m[2]), windowSec: Number(m[3]) };
}

/* ---- 3. join, and refuse anything that came back short ---- */
const rows = ops.map((o) => {
  const e = endpoints[o.path];
  if (!e) throw new Error(`the node routes ${o.path} and ParseRail declares no endpoint at that path`);
  const credits = burn[e.key];
  if (!credits) throw new Error(`no credit price for ${e.key}`);
  return {
    ...o,
    key: e.key,
    group: e.collection,
    unit: e.unit,
    blurb: e.blurb,
    credits,
    usd: Number((credits * creditUsd).toFixed(2)),
    rate: rates[e.key] ?? null,
    paused: paused[e.key] ?? null,
    takesFile: o.fields.some((f) => /fileUrl$/i.test(f.name)),
  };
});
const priced = rows.filter((r) => r.credits > 0).length;
if (priced !== rows.length) throw new Error(`${rows.length - priced} operations came back with no price`);
if (rows.some((r) => !r.rate)) throw new Error('an operation came back with no per key throttle');

const packs = [...consts.matchAll(/\{ id: "([a-z]+)", usd: (\d+), credits: ([\d_]+), label: "([^"]+)" \}/g)]
  .map((m) => ({ id: m[1], usd: Number(m[2]), credits: Number(m[3].replace(/_/g, '')), label: m[4] }));
if (!packs.length) throw new Error('no credit packs read');

/* The credential, off the credential class itself. */
const credential = {
  name: /^\s*name = '([^']+)';/m.exec(cred)?.[1],
  displayName: /^\s*displayName = '([^']+)';/m.exec(cred)?.[1],
  docs: /documentationUrl = '([^']+)';/.exec(cred)?.[1],
  header: /Authorization: '=Bearer \{\{\$credentials\.([a-zA-Z]+)\}\}'/.exec(cred) ? 'Authorization: Bearer <apiKey>' : null,
  testBaseUrl: /baseURL: '([^']+)',\n\t\t\turl: '([^']+)'/.exec(cred)?.[1],
  testUrl: /baseURL: '([^']+)',\n\t\t\turl: '([^']+)'/.exec(cred)?.[2],
};
if (!credential.name || !credential.testUrl) throw new Error('the credential class did not read back');

const requestBase = /"baseURL": "([^"]+)"/.exec(desc)?.[1];
const declaredCount = /"description": "(\d+) finished-job AI endpoints/.exec(desc)?.[1];

const out = {
  CAPTURED_AT: new Date().toISOString().slice(0, 10),
  NODE_VERSION: pkg.version,
  NODE_NAME: pkg.name,
  NODE_DISPLAY: /"displayName": "([^"]+)"/.exec(desc)?.[1],
  NODE_INTERNAL: /"name": "(parseRail)"/.exec(desc)?.[1],
  API_VERSION: pkg.n8n?.n8nNodesApiVersion ?? null,
  KEYWORDS: pkg.keywords ?? [],
  LICENCE: pkg.license,
  HOMEPAGE: pkg.homepage,
  REPO: (pkg.repository?.url ?? '').replace(/^git\+/, '').replace(/\.git$/, ''),
  N8N_BLOCK: pkg.n8n ?? null,
  USABLE_AS_TOOL: /"usableAsTool": true/.test(desc),
  REQUEST_BASE: requestBase,
  DECLARED_COUNT: declaredCount ? Number(declaredCount) : null,
  CREDIT_USD: creditUsd,
  FIELD_COUNT: fieldCount,
  CREDENTIAL: credential,
  GROUPS: groups,
  PACKS: packs,
  OPERATIONS: rows,
};

writeFileSync(
  resolve(ROOT, 'src/lib/catalogue.ts'),
  `/* GENERATED by scripts/capture.mjs. Do not edit.\n` +
    ` * Operations, fields and routing: ${NODE}/nodes/ParseRail/description.ts\n` +
    ` * Prices, groups, units, throttles and the pause: ${RAIL}/src/lib/platform/constants.ts\n` +
    ` * Captured ${out.CAPTURED_AT}.\n */\n\n` +
    Object.entries(out)
      .map(([k, v]) => `export const ${k} = ${JSON.stringify(v, null, 1).replace(/[\u2013\u2014\u2212]/g, ',')} as const;`)
      .join('\n\n') +
    '\n',
);

process.stdout.write(
  `${rows.length} operations, ${fieldCount} input fields, ${groups.length} groups, ` +
    `${Object.keys(paused).length} paused, ${packs.length} credit packs\n` +
    `node ${out.NODE_NAME} ${out.NODE_VERSION}, its description declares ${out.DECLARED_COUNT}\n` +
    `wrote src/lib/catalogue.ts\n`,
);
