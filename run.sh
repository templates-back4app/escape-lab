#!/usr/bin/env bash
# Prove you can leave: build an app on one backend, carry it to another, and run
# the same checks against both.
#
#   ./run.sh
#
# Needs Docker and Node 22. Destroys and rebuilds both backends every run, so the
# numbers are the same each time.
set -euo pipefail
cd "$(dirname "$0")"

echo ""
echo "  [1/5] two empty backends"
docker compose down -v >/dev/null 2>&1 || true
docker compose up -d >/dev/null
docker compose restart parse-a parse-b >/dev/null   # they race mongo on a cold volume

echo "  [2/5] building the app on the first one"
node seed.mjs

echo ""
echo "  [3/5] taking it out through the public API"
node export.mjs

echo ""
echo "  [4/5] rebuilding it on a backend that shares nothing with the first"
node import.mjs

echo ""
echo "  [5/5] the same checks, against both"
node verify.mjs

echo "  WHEN THE OLD BACKEND STOPS ANSWERING"
echo ""
docker compose stop parse-a >/dev/null
node deadlink.mjs
docker compose start parse-a >/dev/null
for _ in $(seq 1 60); do curl -sf -o /dev/null -H 'X-Parse-Application-Id: origin-app' \
  http://127.0.0.1:1337/parse/users?limit=0 && break; sleep 0.5; done
echo ""
