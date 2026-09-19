#!/usr/bin/env node
/* SPDX-License-Identifier: MPL-2.0; Copyright (C) 2026 Jonathan Challinger; source: https://github.com/jschall/boardgame-engine
   This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at https://mozilla.org/MPL/2.0/. */
/* ids.js: part ids and sheet placements stay the same at both ends of every stock range (the id-stability half of a thickness sweep).
     node engine/bin/bg.js ids
   Builds in memory (does not write parts/). Exit 1 if any part or placement id differs. */
'use strict';
const path = require('path');
const GAME_DIR = process.env.GAME_DIR || process.cwd();
const { GAME, lg } = require('../src/game_geom.js')(GAME_DIR);
const store = require('../src/cache_node.js')(GAME_DIR);
GAME.set_store(store);
const D = GAME.defaults;
if (!D || typeof D !== 'object') throw new Error('GAME.defaults is missing');
const los = Object.keys(D).filter(k => k.endsWith('lo'));
if (!los.length) throw new Error('GAME.defaults has no <stock>lo keys');
function hash_of(P) { return '#' + Object.entries(P).map(([k, v]) => k + '=' + v).join('&'); }
function build(label, P) {
  const t0 = Date.now();
  const res = lg.build(GAME, lg.parse_hash(hash_of(P), D));
  process.stderr.write(`  ${label}: ${Date.now() - t0} ms, ${Object.keys(res.parts).length} parts\n`);
  return res;
}
const base = build('defaults', D);
const thin = Object.assign({}, D), thick = Object.assign({}, D);
for (const lo of los) {
  const s = lo.slice(0, -2), hi = s + 'hi';
  if (!(hi in D)) throw new Error(`GAME.defaults has ${lo} but no ${hi}`);
  thin[lo] = thin[hi] = D[lo];
  thick[lo] = thick[hi] = D[hi];
}
let bad = 0;
for (const [name, P] of [['thin', thin], ['thick', thick]]) {
  const res = build(name, P);
  const diff = lg.compare_ids(base, res);
  if (diff.length) { bad++; console.log('E', name + ':'); for (const d of diff) console.log('  ' + d); }
  else console.log('ok', name + ': part ids and placements match defaults');
}
process.exit(bad ? 1 : 0);
