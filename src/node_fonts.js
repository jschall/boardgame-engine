// Node only: register the engine's three Fredoka weights from engine/fonts/ (the page embeds the same bytes as base64) on a shapes-like module K
// (K.register_fonts and K.FONT_FILES: engine/src/shapes.js, or a game's own common module with the same two names).
'use strict';
const fs = require('fs'), path = require('path');
module.exports = function register_node_fonts(K) {
  const dir = path.join(__dirname, '..', 'fonts');
  K.register_fonts(Object.fromEntries(Object.values(K.FONT_FILES).map(f => [f, fs.readFileSync(path.join(dir, f))])));
};
