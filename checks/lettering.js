#!/usr/bin/env node
/* SPDX-License-Identifier: MPL-2.0; Copyright (C) 2026 Jonathan Challinger; source: https://github.com/jschall/boardgame-engine
   This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at https://mozilla.org/MPL/2.0/. */
/* lettering.js: every lg.text / lg.text_min_stroke call during generate, after kerf compensation, keeps one component per glyph
   (no vanished stems, no splits). Stem width is measured, never failed on (standard: guidance, not a gate).
   Lettering that falls outside the cut (0.8 mm inset from every outline and hole) is cut off: that fails. Decorative art may bleed;
   glyphs may not. lasergeom.lettering_cut_off is the unit test; this check is the game gate.
     node engine/bin/bg.js lettering
   Draws every part's art (parts_only: no nest). Exit 1 on a vanished, split, or cut-off glyph. */
'use strict';
const path = require('path');
const GAME_DIR = process.env.GAME_DIR || process.cwd();
const ENGINE = path.join(__dirname, '..');
const lgPath = require.resolve(path.join(ENGINE, 'lib', 'lasergeom.js'));
const original = require(lgPath);
const calls = [];
function wrap(fn, minStroke) {
  return function (...args) {
    const g = fn.apply(this, args);
    const o = original.kw(args, ['s', 'size', 'x', 'y', 'anchor', 'font', 'spacing', 'min_line'], { anchor: 'middle', font: null, spacing: 0 });
    if (o.s && !String(o.s).startsWith('the quick brown fox')) {
      const rec = { s: String(o.s), size: o.size, font: o.font, minStroke, g };
      calls.push(rec);
      if (adding && adding.texts) adding.texts.push(rec);
    }
    return g;
  };
}
const cutoffs = [];
let adding = null;
function follow(op, g, args) {
  if (!adding || !adding.texts.length) return op.apply(original.affinity, [g, ...args]);
  const r = op.apply(original.affinity, [g, ...args]);
  for (const t of adding.texts) {
    if (!t.g || t.g.is_empty) continue;
    if (t.g === g) { t.g = op.apply(original.affinity, [t.g, ...args]); continue; }
    try { if (g.contains && !g.is_empty && g.contains(t.g.centroid)) t.g = op.apply(original.affinity, [t.g, ...args]); }
    catch (e) { /* a huge panel may not relate; skip this glyph */ }
  }
  return r;
}
const origRot = original.affinity.rotate, origTr = original.affinity.translate, origSc = original.affinity.scale;
original.affinity.rotate = function (g, ...rest) { return follow(origRot, g, rest); };
original.affinity.translate = function (g, ...rest) { return follow(origTr, g, rest); };
original.affinity.scale = function (g, ...rest) { return follow(origSc, g, rest); };
const audit = Object.assign(Object.create(Object.getPrototypeOf(original)), original, { text: wrap(original.text, false), text_min_stroke: wrap(original.text_min_stroke, true) });
if (!audit.Layout) throw new Error('lasergeom has no Layout');
const OrigAdd = original.Layout.prototype.add;
original.Layout.prototype.add = function (pid, cut, eng, o) {
  adding = { pid, shape: cut || (o && o.edge), texts: [] };
  try {
    if (typeof eng === 'function') eng();
    if (adding.shape && original.lettering_cut_off) {
      for (const c of adding.texts) {
        if (!c.g || c.g.is_empty) continue;
        let lost;
        try { lost = original.lettering_cut_off(c.g, adding.shape, 0.8); }
        catch (e) { cutoffs.push({ pid, s: c.s, area: -1, err: String(e.message || e) }); continue; }
        if (lost && !lost.is_empty && lost.area > 0.05) cutoffs.push({ pid, s: c.s, area: +lost.area.toFixed(2) });
      }
    }
    return OrigAdd.apply(this, arguments);
  } finally { adding = null; }
};
require.cache[lgPath].exports = audit;
const { GAME, lg } = require('../src/game_geom.js')(GAME_DIR);
const store = require('../src/cache_node.js')(GAME_DIR);
GAME.set_store(store);
const D = GAME.defaults;
const kerfs = Object.keys(D).filter(k => /kerf/i.test(k)).map(k => D[k]).filter(v => v > 0);
if (!kerfs.length) throw new Error('GAME.defaults has no kerf');
const kerf = Math.max(...kerfs);
const P = lg.parse_hash('', D);
GAME.parts_only = true;
const lo = typeof GAME.layout === 'function' ? GAME.layout(P) : GAME.layout;
if (!lo) throw new Error('GAME.layout is missing');
GAME.generate(P, new lg.Layout(lo), lg);
if (!calls.length) throw new Error('generate drew no lettering (no lg.text / lg.text_min_stroke calls)');
const unique = [...new Map(calls.map(c => [JSON.stringify([c.s, c.size, c.font, c.minStroke]), c])).values()];
const damage = [];
for (const c of unique) {
  let vanished = 0, split = 0, components = 0, width = Infinity, weakest = '';
  for (const ch of new Set(c.s.replace(/\s/g, ''))) {
    const g = lg.text(ch, c.size, 0, 0, { font: c.font });
    const compensated = lg.compensate_engraving(g, kerf);
    const ps = lg.polys(compensated);
    for (const p of lg.polys(g)) {
      components++;
      const matches = ps.filter(q => p.intersection(q).area > 0.001);
      if (!matches.length) vanished++;
      if (matches.length > 1) split++;
    }
    for (const p of ps) {
      const count = r => lg.polys(p.buffer(-r, { quad_segs: 4 })).filter(q => q.area > 0.001).length;
      let loR = 0, hiR = 0.005;
      while (count(hiR) === 1 && hiR < 2) { loR = hiR; hiR += 0.005; }
      for (let i = 0; i < 13; i++) { const r = (loR + hiR) / 2; if (count(r) === 1) loR = r; else hiR = r; }
      const w = 2 * loR; if (w < width) { width = w; weakest = ch; }
    }
  }
  const row = { s: c.s, size: c.size, font: c.font, vanished, split, components, minCriticalWidthMm: +width.toFixed(3), weakest };
  if (vanished || split) damage.push(row);
  else process.stderr.write(`  ok ${JSON.stringify(c.s)} ${c.size} mm  stem ${row.minCriticalWidthMm} mm (${weakest})\n`);
}
const cutUniq = [...new Map(cutoffs.map(c => [JSON.stringify([c.pid, c.s]), c])).values()];
console.log(`lettering: ${unique.length} distinct runs, kerf ${kerf} mm, ${damage.length} vanished or split, ${cutUniq.length} cut off`);
for (const r of damage) console.log('E', JSON.stringify(r));
for (const c of cutUniq) console.log('CUT', JSON.stringify(c));
process.exit(damage.length || cutUniq.length ? 1 : 0);
