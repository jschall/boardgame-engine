#!/bin/bash
# SPDX-License-Identifier: MPL-2.0; Copyright (C) 2026 Jonathan Challinger; source: https://github.com/jschall/boardgame-engine
# This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at https://mozilla.org/MPL/2.0/.
# land_bumble_port.sh: put BUMBLE & BLOOM onto the engine in place. Copies the ported game files from the port folder over the game folder, removes
# the machinery the engine now owns, and adds the engine as the game's submodule. Run once, from anywhere:
#     bash engine/tools/land_bumble_port.sh <port folder> <bumble folder> <engine url or path>
# Afterwards in the bumble folder: node engine/bin/bg.js all   (and commit bumble's paths with an explicit pathspec).
set -euo pipefail
PORT=$(realpath "$1"); GAME=$(realpath "$2"); ENGINE_URL="$3"
[ -f "$PORT/game.json" ] || { echo "no game.json in $PORT"; exit 2; }
[ -f "$GAME/bumble-sim.js" ] || { echo "$GAME is not bumble"; exit 2; }
cd "$GAME"
# the machinery the engine owns now
rm -f build.js page.js pack_check.js boxjig.js jig.js scenes.js render3d.js manual-embed.js manual-viewer.js manual-viewer.css manual/build.js
rm -f geom/cli.js geom/cache_node.js geom/node_fonts.js geom/prewarm_worker.js
rm -rf fonts lib
rm -f analysis/page_check.js analysis/opening_check.js analysis/scroll_sheet.js analysis/jig_working.js analysis/jig_material.js
# the game's files, as ported
for f in game.json geom.js table.js page.js pack.js jigs.js basetest.js geom/lg.js geom/parts.js geom/compare.js geom/sweep.js geom/preview_part.js \
         manual/review-layout.js manual/cover-scene.js manual/assets.js manual/verify.js manual/check-references.js manual/sync-rules.js manual/replay.js manual/manual.css \
         analysis/lightbox_check.js analysis/qa_materials.js analysis/render_materials.js analysis/lettering_check.js analysis/lid_check.js analysis/jig_check.js analysis/jig_working_check.js analysis/jig_search.js; do
  [ -f "$PORT/$f" ] && cp "$PORT/$f" "$f"
done
# the engine as a submodule (a local path needs git's file transport allowed)
if [ ! -e engine ]; then
  if [ -d "$ENGINE_URL" ]; then git -c protocol.file.allow=always submodule add "$ENGINE_URL" engine; else git submodule add "$ENGINE_URL" engine; fi
  (cd engine && npm install --no-audit --no-fund)
fi
echo "landed: now  cd $GAME && node engine/bin/bg.js all"
