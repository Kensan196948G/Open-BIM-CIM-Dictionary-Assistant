#!/usr/bin/env bash
# One-command Pages full-stack deploy (DEPLOYMENT.md §3.4/§3.5).
# Builds dist + _worker.js + _routes.json, then deploys to the obcda-web
# Pages project. Production deploys are HUMAN-EXECUTED per the runbook —
# this script makes that a single reviewed command.
#
# Usage:
#   ./scripts/deploy-pages.sh preview            # non-prod preview slot
#   ./scripts/deploy-pages.sh main               # PRODUCTION (human only)
#   SKIP_DEPLOY=1 ./scripts/deploy-pages.sh main # build + verify artifact only
#
# Requires: pnpm install done; CLOUDFLARE_API_TOKEN (+ CLOUDFLARE_ACCOUNT_ID)
# in the environment for the actual deploy step.
set -euo pipefail

BRANCH="${1:?branch required: preview | main}"
if [[ "${BRANCH}" != "preview" && "${BRANCH}" != "main" ]]; then
  echo "branch must be 'preview' or 'main'" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${ROOT}/.deploy/pages-${BRANCH}"
rm -rf "${OUT}"
mkdir -p "${OUT}"

echo "📦 1/4 worker bundle (apps/api/src/pages-worker.ts)"
(cd "${ROOT}/apps/api" && pnpm dlx wrangler@latest deploy src/pages-worker.ts \
  --name obcda-pages-worker --compatibility-date 2026-07-01 \
  --dry-run --outdir "${OUT}/.worker")
mv "${OUT}/.worker/pages-worker.js" "${OUT}/_worker.js"
rm -rf "${OUT}/.worker"

echo "📦 2/4 web build (same-origin: VITE_API_BASE_URL empty)"
(cd "${ROOT}" && VITE_API_BASE_URL= pnpm --filter @obcda/web build)
cp -r "${ROOT}/apps/web/dist/." "${OUT}/"

echo "📦 3/4 _routes.json (advanced mode: all paths through the worker)"
printf '{"version":1,"include":["/*"],"exclude":[]}\n' > "${OUT}/_routes.json"

echo "🔎 artifact summary:"
ls -la "${OUT}" | head -15
test -s "${OUT}/_worker.js" && test -s "${OUT}/index.html"
echo "✅ artifact OK: ${OUT}"

if [[ "${SKIP_DEPLOY:-0}" == "1" ]]; then
  echo "⏭  SKIP_DEPLOY=1 — artifact built and verified; no deploy performed."
  exit 0
fi

if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
  echo "🚫 CLOUDFLARE_API_TOKEN is not set — cannot deploy from this environment."
  echo "   Run on a credentialed machine:"
  echo "   npx wrangler pages deploy ${OUT} --project-name obcda-web --branch ${BRANCH}"
  exit 2
fi

if [[ "${BRANCH}" == "main" ]]; then
  echo "🚀 4/4 PRODUCTION deploy (human-executed per DEPLOYMENT.md)"
else
  echo "🚀 4/4 preview deploy"
fi
npx wrangler pages deploy "${OUT}" --project-name obcda-web --branch "${BRANCH}"

echo "🧪 post-deploy smoke:"
if [[ "${BRANCH}" == "main" ]]; then
  BASE_URL="https://obcda.mirai-dx-platform.com" "${ROOT}/scripts/smoke.sh" || true
else
  BASE_URL="https://preview.obcda-web.pages.dev" "${ROOT}/scripts/smoke.sh" || true
fi
