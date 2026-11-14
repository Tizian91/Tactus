#!/usr/bin/env bash
# Screenshots for the manual (help/img/*.png): opens the app headless in Edge once per picture
# (tools/help/shots.js builds the scene), tablet size 1180 x 820.
#   bash tools/build_help_images.sh            all pictures
#   bash tools/build_help_images.sh seite      one picture
set -euo pipefail
cd "$(dirname "$0")/.."
EDGE=${EDGE:-"/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"}
OUT=help/img
mkdir -p "$OUT"
# the app page of the UI test, with the shot script instead of the tests
sed 's#uitest.js#../help/shots.js#' tools/uitest/index.html > tools/uitest/_helpshots.html
trap 'rm -f tools/uitest/_helpshots.html' EXIT
ROOT=$(pwd -W 2>/dev/null || pwd)
NAMES=${*:-ueberblick notenmenue anschlag seite kitprofil fehlt import bspwiederholungen bspspruenge}
for n in $NAMES; do
  "$EDGE" --headless --disable-gpu --hide-scrollbars --force-device-scale-factor=1 --window-size=1180,820 \
    --virtual-time-budget=6000 --screenshot="$ROOT/$OUT/$n.png" "file:///$ROOT/tools/uitest/_helpshots.html?s=$n" 2>/dev/null || true
  echo "$OUT/$n.png"
done
