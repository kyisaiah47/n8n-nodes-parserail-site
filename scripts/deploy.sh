#!/bin/bash
# scripts/deploy.sh for n8n-nodes-compound. Cloudflare Workers.
#
# The estate deploys to Cloudflare Workers through opennextjs-cloudflare. Nothing here targets
# Vercel and this repo carries no vercel.json: measured 2026-09-19, all 57 Vercel projects read
# live:false and hitting a Vercel origin directly returns 402 DEPLOYMENT_DISABLED.
#
# ⛔ THE ORDER IS check, build, deploy, populateCache, verify, AND TWO PARTS OF IT ARE
# COUNTERINTUITIVE.
#
#   The GATE RUNS FIRST, in front of the build, not after the deploy. A deploy script that runs
#   its checks after the promote has already landed turns every finding into something to write
#   up, because by then the work is live and annotating it is the only remaining move. That is
#   the exact failure the package this site is about was built against, so the site would be
#   arguing with its own subject if it ran the gate anywhere else.
#
#   populateCache RUNS AFTER THE DEPLOY. Populating before it leaves the shipped Worker reading
#   an empty cache. Measured on stacktab: four ISR-only routes answered 404 straight after a
#   green deploy, and the identical populate run afterwards turned all four green with nothing
#   else changed.
#
# ⛔ IT ENDS ON A GATE THAT CAN FAIL. An early rulestack run reported exit 0 while no Worker
# existed on the account at all, so every later run would have read as a success while the site
# stayed on the old host. verify-cf.mjs reads the routes back over the network.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

WORKER="https://n8n-nodes-compound.kyisaiah47.workers.dev"
HOST="n8n-nodes-compound.thecompound.tech"

. "$HOME/CompoundLabs/compound-ops/tools/deploy-lock.sh" || { echo "deploy gate missing, refusing to deploy" >&2; exit 1; }
deploy_gate "n8n-nodes-compound"

echo "==> the register gate, before anything is built"
npm run check

echo "==> build"
npx opennextjs-cloudflare build

echo "==> deploy"
npx opennextjs-cloudflare deploy

echo "==> make sure this custom domain has its own exact zone route, or the *.thecompound.tech wildcard will 307 it forever"
node "$HOME/CompoundLabs/compound-ops/tools/cloudflare/sync-worker-routes.mjs" --apply --only "$HOST"

echo "==> populate the incremental cache the deployed build reads"
npx opennextjs-cloudflare populateCache remote

echo "==> verify the worker"
node scripts/verify-cf.mjs "$WORKER"

echo "==> the layout gate, against the worker"
node scripts/layout-gate.mjs "$WORKER"

echo "==> the studio credit gate, against the worker"
node "$HOME/CompoundLabs/compound-ops/tools/gates/studio-credit-gate.mjs" "$WORKER"

# Once the subdomain points at the Worker, prove the real host too. Until then this is skipped,
# so the script does not fail on a domain nothing has been pointed at yet.
if [ -n "$HOST" ]; then
  SERVED=$(curl -s -o /dev/null -w '%{header_json}' -m 15 "https://$HOST/" 2>/dev/null | tr 'A-Z' 'a-z' | grep -c cloudflare || true)
  if [ "$SERVED" != "0" ]; then
    echo "==> verify $HOST"
    node scripts/verify-cf.mjs "https://$HOST"
    echo "==> the layout gate, against $HOST"
    node scripts/layout-gate.mjs "https://$HOST"
  else
    echo "==> $HOST is not on the Worker yet, skipping its verify"
  fi
fi

echo "n8n-nodes-compound: deployed and verified"
