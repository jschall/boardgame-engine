/* SPDX-License-Identifier: MPL-2.0; Copyright (C) 2026 Jonathan Challinger; source: https://github.com/jschall/boardgame-engine
   This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at https://mozilla.org/MPL/2.0/. */
/* game_fonts.js: the game supplies its typefaces in fonts/ (game.json.fonts). The engine never picks a face.
   game.json.fonts = { family, R, SB, B [, hero] }: CSS family name and filenames under fonts/ for regular, semibold and bold
   (hero is the weight the page title uses; default SB). Lasergeom names are the filename stems in lower case. */
'use strict';
const fs = require('fs'), path = require('path');

function stem(file) {
  return path.basename(file, path.extname(file)).toLowerCase();
}

module.exports = function load_game_fonts(GAME_DIR, CFG) {
  const spec = CFG && CFG.fonts;
  if (!spec || typeof spec !== 'object') throw new Error('game.json has no fonts: { family, R, SB, B } as filenames in fonts/ (see starter/fonts and starter/game.json)');
  for (const k of ['family', 'R', 'SB', 'B']) if (!spec[k] || typeof spec[k] !== 'string') throw new Error(`game.json.fonts.${k} is missing (a CSS family name, or a filename in fonts/)`);
  const dir = path.join(GAME_DIR, 'fonts');
  if (!fs.existsSync(dir)) throw new Error(`fonts/ is missing: the game supplies its typefaces (copy starter/fonts and set game.json.fonts)`);
  const files = {};
  for (const role of ['R', 'SB', 'B']) {
    const f = spec[role];
    const p = path.join(dir, f);
    if (!fs.existsSync(p)) throw new Error(`fonts/${f} is missing (game.json.fonts.${role})`);
    files[f] = fs.readFileSync(p);
  }
  for (const f of fs.readdirSync(dir).filter(n => /\.(ttf|otf)$/i.test(n))) {
    if (!files[f]) files[f] = fs.readFileSync(path.join(dir, f));
  }
  const hero = spec.hero || spec.SB;
  if (!files[hero]) throw new Error(`game.json.fonts.hero (${hero}) is not a file in fonts/`);
  const ofl = path.join(dir, 'OFL.txt');
  return {
    dir, files, family: spec.family, hero,
    roles: { R: spec.R, SB: spec.SB, B: spec.B, family: spec.family, hero },
    registered: { R: stem(spec.R), SB: stem(spec.SB), B: stem(spec.B) },
    license: fs.existsSync(ofl) ? ofl : null,
  };
};
module.exports.stem = stem;
