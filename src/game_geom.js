/* SPDX-License-Identifier: MPL-2.0; Copyright (C) 2026 Jonathan Challinger; source: https://github.com/jschall/boardgame-engine
   This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// game_geom.js (boardgame-engine), node only: load a game's geometry generator (game.json's geom: a UMD that exports the GAME object lasergeom.build runs,
// with register_fonts and set_store on it) and register the engine's fonts on it. Both the parts CLI and its prewarm workers start here.
'use strict';
const fs = require('fs'), path = require('path');
const ENGINE = path.join(__dirname, '..');
module.exports = function load_game(GAME_DIR) {
  const CFG = JSON.parse(fs.readFileSync(path.join(GAME_DIR, 'game.json'), 'utf8'));
  if (!CFG.geom) throw new Error('game.json has no geom (the geometry generator file, e.g. geom.js)');
  const GAME = require(path.join(GAME_DIR, CFG.geom));
  for (const k of ['generate', 'defaults', 'need', 'register_fonts', 'set_store']) if (typeof GAME[k] !== 'function' && !(k === 'defaults' && typeof GAME.defaults === 'object')) throw new Error(`${CFG.geom}: the GAME object has no ${k}`);
  const dir = path.join(ENGINE, 'fonts');
  GAME.register_fonts(Object.fromEntries(fs.readdirSync(dir).filter(f => f.endsWith('.ttf')).map(f => [f, fs.readFileSync(path.join(dir, f))])));
  return { CFG, GAME, lg: require(path.join(ENGINE, 'lib', 'lasergeom.js')) };
};
