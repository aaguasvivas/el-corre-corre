#!/bin/sh
# Machine-wide lock for heavy dev tools: headless Chrome (tools/shots.mjs and
# puppeteer probes), production builds and xcodebuild. The dev Mac has 8 GB
# of RAM; parallel agents that each started a browser ran it out of memory.
# Every heavy command in every worktree goes through this script, so they
# queue instead of stacking. A lock whose owner died is reclaimed.
#
#   sh tools/heavy.sh node tools/shots.mjs --scenes malecon --viewports se
#   sh tools/heavy.sh npm run build
LOCK=/private/tmp/ecc-heavy.lock
while ! mkdir "$LOCK" 2>/dev/null; do
  owner=$(cat "$LOCK/pid" 2>/dev/null)
  if [ -n "$owner" ] && ! kill -0 "$owner" 2>/dev/null; then
    rm -rf "$LOCK"
    continue
  fi
  sleep 3
done
echo $$ > "$LOCK/pid"
trap 'rm -rf "$LOCK"' EXIT INT TERM
"$@"
