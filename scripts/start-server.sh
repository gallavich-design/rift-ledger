#!/bin/sh
# Production start: apply migrations (never resets data), fill the catalogue on first boot, serve.
set -e
if [ -z "$APP_PASSWORD" ] && [ "$RIFT_LEDGER_OPEN" != "1" ]; then
  echo "APP_PASSWORD is not set. Set it (and AUTH_SECRET, CRON_SECRET) before exposing Rift Ledger." >&2
  echo "For a trusted local machine only, RIFT_LEDGER_OPEN=1 runs without a password." >&2
  exit 1
fi
npx prisma migrate deploy
# First boot: card catalogue + today's prices in the background, so the site is up immediately.
npx tsx scripts/first-run.ts &
exec npx next start -H 0.0.0.0 -p "${PORT:-3000}"
