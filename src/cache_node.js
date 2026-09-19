/* SPDX-License-Identifier: MPL-2.0; Copyright (C) 2026 Jonathan Challinger; source: https://github.com/jschall/boardgame-engine
   This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// cache_node.js (boardgame-engine), node only: a file store for the geometry caches, so a rebuild at another stock thickness or kerf (a new process) reuses
// the thickness-independent work:
//   M|<memo key>        art geometry memoised by the art modules (K.memo), kept when it took 200 ms or more to make
//   C|<art hash>|...    compensated engraving geometry, for parts whose engraving is moved or clipped at build time (walls)
//   S|<art hash>|...    a part's finished engraving SVG
// Entries live under ~/.cache/boardgame-engine/<game slug>/<source hash>/, where the source hash covers the game's geometry sources (game.json's
// geom_files: the art modules, the rules engine, the engine's own modules), the fonts and the lasergeom bundle, so any change to the code that
// draws the art starts a fresh cache. Usage: const store = require('./cache_node.js')(GAME_DIR); GAME.set_store(store); GAME.eng_store = store.
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto');
const ENGINE = path.join(__dirname, '..');

module.exports = function node_store(GAME_DIR, opts = {}) {
  const CFG = JSON.parse(fs.readFileSync(path.join(GAME_DIR, 'game.json'), 'utf8'));
  const SOURCES = CFG.geom_files.map(f => path.join(GAME_DIR, f)).concat(fs.readdirSync(path.join(ENGINE, 'fonts')).filter(f => f.endsWith('.ttf')).map(f => path.join(ENGINE, 'fonts', f)));
  const h = crypto.createHash('sha1');
  for (const f of SOURCES) h.update(fs.readFileSync(f));
  const src = h.digest('hex').slice(0, 16);
  const root = opts.dir || path.join(process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache'), 'boardgame-engine', CFG.slug);
  const dir = path.join(root, src);
  fs.mkdirSync(dir, { recursive: true });
  const file = k => { const d = crypto.createHash('sha1').update(k).digest('hex'); return path.join(dir, d.slice(0, 2), d + '.json'); };
  const stats = { hits: 0, misses: 0, writes: 0 };
  return {
    dir, src, stats,
    get(k) {
      // a missing entry is a miss by design (the caller makes it and set()s it); an unreadable or corrupt entry is an error
      const f = file(k);
      if (!fs.existsSync(f)) { stats.misses++; return undefined; }
      const v = JSON.parse(fs.readFileSync(f, 'utf8')); stats.hits++; return v;
    },
    set(k, v) {
      const f = file(k), tmp = f + '.' + process.pid + '.tmp';
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(tmp, JSON.stringify(v)); fs.renameSync(tmp, f); stats.writes++;
    },
  };
};
