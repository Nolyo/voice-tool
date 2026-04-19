#!/usr/bin/env bash
# POC NOL-32 — sign a fixture payload and POST it to the local webhook.
#
# Usage:
#   LEMON_SQUEEZY_WEBHOOK_SECRET=... \
#   WEBHOOK_URL=http://localhost:54321/functions/v1/lemonsqueezy-webhook \
#   EVENT_NAME=subscription_created \
#   ./sign-fixture.sh tests/fixtures/subscription_created.json
#
# The secret must match the one configured in the Edge Function and in the LS dashboard.

set -euo pipefail

if [[ -z "${LEMON_SQUEEZY_WEBHOOK_SECRET:-}" ]]; then
  echo "LEMON_SQUEEZY_WEBHOOK_SECRET must be set" >&2
  exit 1
fi

WEBHOOK_URL="${WEBHOOK_URL:-http://localhost:54321/functions/v1/lemonsqueezy-webhook}"
EVENT_NAME="${EVENT_NAME:-subscription_created}"
FIXTURE="${1:-tests/fixtures/subscription_created.json}"

if [[ ! -f "$FIXTURE" ]]; then
  echo "fixture not found: $FIXTURE" >&2
  exit 1
fi

SIGNATURE=$(openssl dgst -sha256 -hmac "$LEMON_SQUEEZY_WEBHOOK_SECRET" -hex < "$FIXTURE" | awk '{print $2}')

curl -sS -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -H "X-Event-Name: $EVENT_NAME" \
  -H "X-Signature: $SIGNATURE" \
  --data-binary "@$FIXTURE"
echo
