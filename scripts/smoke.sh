#!/usr/bin/env bash
# O2: deploy/uptime smoke test (DEPLOYMENT.md §6).
#
# Usage:
#   BASE_URL=https://obcda.mirai-dx-platform.com ./scripts/smoke.sh
#   BASE_URL=http://localhost:8787 ./scripts/smoke.sh           # local API dev
#
# Behind Cloudflare Access, pass a Service Token:
#   CF_ACCESS_CLIENT_ID=... CF_ACCESS_CLIENT_SECRET=... BASE_URL=... ./scripts/smoke.sh
#
# Exit code 0 = all PASS. Designed for both manual post-deploy checks and a
# scheduled uptime job (GitHub Actions cron).
set -u

BASE_URL="${BASE_URL:?BASE_URL is required (e.g. https://obcda.mirai-dx-platform.com)}"
CURL_ARGS=(--silent --show-error --max-time 15 --output /dev/null --write-out '%{http_code}')
if [[ -n "${CF_ACCESS_CLIENT_ID:-}" && -n "${CF_ACCESS_CLIENT_SECRET:-}" ]]; then
  CURL_ARGS+=(-H "CF-Access-Client-Id: ${CF_ACCESS_CLIENT_ID}" -H "CF-Access-Client-Secret: ${CF_ACCESS_CLIENT_SECRET}")
fi

# API_ONLY=1 skips the top-page check (local API dev server has no SPA shell)
API_ONLY="${API_ONLY:-0}"

failures=0

check() {
  local name="$1" path="$2" expected="${3:-200}"
  local status
  status=$(curl "${CURL_ARGS[@]}" "${BASE_URL}${path}" 2>/dev/null || echo "000")
  if [[ "${status}" == "${expected}" ]]; then
    echo "✅ PASS ${name} (${status})"
  else
    echo "❌ FAIL ${name} — expected ${expected}, got ${status} (${BASE_URL}${path})"
    failures=$((failures + 1))
  fi
}

if [[ "${API_ONLY}" != "1" ]]; then
  check "top page          " "/"
fi
check "health live       " "/api/v1/health/live"
check "health ready      " "/api/v1/health/ready"
check "search (線形)      " "/api/v1/search?q=%E7%B7%9A%E5%BD%A2&limit=3"
check "search (IfcAlign) " "/api/v1/search?q=IfcAlignment&limit=3"
check "sources           " "/api/v1/sources"
check "system info       " "/api/v1/system/info"

if [[ ${failures} -gt 0 ]]; then
  echo "🚨 smoke: ${failures} check(s) failed"
  exit 1
fi
echo "🎉 smoke: all checks passed"
