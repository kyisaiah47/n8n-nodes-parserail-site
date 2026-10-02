#!/usr/bin/env node
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
const ROOT = resolve(new URL("..", import.meta.url).pathname);
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const files = [];
function walk(dir) { for (const name of readdirSync(dir)) { if (["node_modules", ".next", ".git", "review"].includes(name)) continue; const p = join(dir, name); if (statSync(p).isDirectory()) walk(p); else files.push(p); } }
walk(ROOT);
const text = files.filter((p) => !p.endsWith("/AGENTS.md") && !p.endsWith("/CLAUDE.md")).map((p) => readFileSync(p, "utf8")).join("\n");
const fail = (message) => { console.error(`check-register: FAIL ${message}`); process.exit(1); };
if (/[\u2013\u2014\u2212]/u.test(text)) fail("a wide dash is present");
const css = read("src/app/globals.css");
if (!css.includes("#52CAA6") || !css.includes("#67DDB9")) fail("accent register is missing");
if (!css.includes("estate ring is full")) fail("estate ring note is missing");
if (/\.status[^}]*var\(--accent\)/i.test(css)) fail("accent is assigned to a status selector");
const product = read("src/lib/product.ts");
for (const needed of ["n8n-nodes-compound", "n8n-nodes-compound.thecompound.tech", "0.3.5", "https://github.com/kyisaiah47/n8n-nodes-compound", "SOURCES"]) if (!product.includes(needed)) fail(`product register missing ${needed}`);
if (!product.match(/quote:/g)?.length || !product.match(/url:/g)?.length || !product.match(/read_at:/g)?.length) fail("claims lack source rows");
if (!read("src/components/SmoothScroll.tsx").includes("allowNestedScroll: true") || !read("src/components/SmoothScroll.tsx").includes("lerp: 0.35")) fail("Lenis register is incomplete");
if (!read("src/app/layout.tsx").includes("thecompound.tech/#organization") || !read("src/app/page.tsx").includes("Built by") || !read("src/app/page.tsx").includes("hello@thecompound.tech") || !read("src/app/page.tsx").includes("A Compound Labs product")) fail("studio credit is incomplete");
if (!read("scripts/deploy.sh").includes('deploy_gate "n8n-nodes-compound"') || read("scripts/deploy.sh").indexOf("deploy_gate") > read("scripts/deploy.sh").indexOf("npm run check")) fail("deploy gate does not run first");
for (const file of ["wrangler.jsonc", "open-next.config.ts", "scripts/deploy.sh", "scripts/verify-cf.mjs", "scripts/layout-gate.mjs"]) { try { read(file); } catch { fail(`${file} is missing`); } }
console.log("check-register: 12 register rules passed");
