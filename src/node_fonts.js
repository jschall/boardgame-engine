/* SPDX-License-Identifier: MPL-2.0; Copyright (C) 2026 Jonathan Challinger; source: https://github.com/jschall/boardgame-engine
   This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// Node only: register the engine's three Fredoka weights from engine/fonts/ (the page embeds the same bytes as base64) on a shapes-like module K
// (K.register_fonts and K.FONT_FILES: engine/src/shapes.js, or a game's own common module with the same two names).
'use strict';
const fs = require('fs'), path = require('path');
module.exports = function register_node_fonts(K) {
  const dir = path.join(__dirname, '..', 'fonts');
  K.register_fonts(Object.fromEntries(Object.values(K.FONT_FILES).map(f => [f, fs.readFileSync(path.join(dir, f))])));
};
