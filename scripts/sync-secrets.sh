#!/usr/bin/env bash
# After rotating keys: copies the app's settings from .env.local to Vercel (production),
# redeploys, and checks the live site. Never prints values.
set -euo pipefail
cd "$(dirname "$0")/.."

KEYS=(NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY FOUNDER_EMAILS
      GEMINI_API_KEY GEMINI_MODEL RESEND_API_KEY EMAIL_FROM EMAIL_TEST_ALLOWLIST EMAIL_DELIVERY_MODE RESEND_WEBHOOK_SECRET ACCESS_CODE SESSION_SECRET)

for k in "${KEYS[@]}"; do
  v="$(grep -E "^${k}=" .env.local | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' || true)"
  if [ -z "$v" ]; then echo "skip  $k (empty)"; continue; fi
  flag="--sensitive"; [[ "$k" == NEXT_PUBLIC_* ]] && flag=""
  printf '%s' "$v" | vercel env add "$k" production --force $flag >/dev/null 2>&1 && echo "set   $k" || { echo "FAIL  $k"; exit 1; }
done

./scripts/deploy.sh >/dev/null 2>&1
code="$(curl -s -o /dev/null -w '%{http_code}' https://kargo-decision-room.vercel.app/login)"
api="$(curl -s -o /dev/null -w '%{http_code}' https://kargo-decision-room.vercel.app/api/state)"
echo "deployed: /login -> $code (expect 200), /api/state -> $api (expect 401)"
