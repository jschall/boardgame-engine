/* SPDX-License-Identifier: MPL-2.0; Copyright (C) 2026 Jonathan Challinger; source: https://github.com/jschall/boardgame-engine
   This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at https://mozilla.org/MPL/2.0/. */
/* Node only: register the game's fonts/ (game.json.fonts) on a shapes-like module K (K.register_fonts). */
'use strict';
const fs = require('fs'), path = require('path');
module.exports = function register_node_fonts(K, GAME_DIR) {
  const dir = GAME_DIR || process.env.GAME_DIR || process.cwd();
  const CFG = JSON.parse(fs.readFileSync(path.join(dir, 'game.json'), 'utf8'));
  const fonts = require('./game_fonts.js')(dir, CFG);
  K.register_fonts({ files: fonts.files, roles: fonts.roles });
};
