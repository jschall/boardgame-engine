#!/usr/bin/env node
/* SPDX-License-Identifier: MPL-2.0; Copyright (C) 2026 Jonathan Challinger; source: https://github.com/jschall/boardgame-engine
   This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at https://mozilla.org/MPL/2.0/. */
/* laser_time.js (boardgame-engine): the estimated machine time of every sheet's engraving, and what the vector fill decided. Reads
   parts/parts.json (meta.vector_fill, written by the layout's plan_vector_fill) and prints, per sheet, the raster seconds under the sweep-and-merge
   model before and after the conversions, the vector seconds added, and each element decided on (converted or rejected, with the raster rows
   it forced on its own, the whole-sheet saving its conversion gives, and its vector cost). The model is the owner's xTool S1 at 100 lines per
   centimetre; with the fill off (the default) there is nothing to report and the tool says so; compare the totals with the machine software's own estimate and correct the model (game.json vector_fill, or the layout's vector_fill
   option) when they drift.
     node engine/bin/bg.js lasertime [--all]          (from the game folder; --all lists every decided element, not only the converted ones) */
'use strict';
const fs = require('fs'), path = require('path');
const root = process.env.GAME_DIR || process.cwd(), all = process.argv.includes('--all');
const pj = JSON.parse(fs.readFileSync(path.join(root, 'parts', 'parts.json'), 'utf8'));
const vf = pj.meta && pj.meta.vector_fill;
if (!vf) { console.error('parts.json has no meta.vector_fill: the layout was built with vector_fill off (game.json / the parts spec)'); process.exit(2); }
const M = vf.model, mmss = s => { s = Math.round(s); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
console.log(`laser time model: raster ${M.raster_speed} mm/s in rows ${vf.pitch} mm apart (${vf.lines_per_cm} lines per centimetre) with ${M.accel} mm of run-in and run-out per row, objects merged into one sweep while that saves time; vector ${M.vector_speed} mm/s plus ${M.path_overhead} s per closed line; a shape (every copy of it on the sheet, in every part: duplicate geometry always matches) is drawn as concentric lines only when the saving is dramatic: the raster rows it forces, plus the edge score it would get, cost at least ${M.min_gain} times its lines and the saving after that weighting is at least ${M.min_saving} s for the shape as a whole (elements under ${M.min_area} mm² are never considered; a part flagged raster in the spec never is).`);
let tb = 0, ta = 0, tv = 0;
const layout = pj.layout || {};
for (const [name, r] of Object.entries(vf.sheets)) {
  const title = layout[name] && layout[name].title ? ` · ${layout[name].title}` : '';
  console.log(`\n${name}${title}`);
  console.log(`  engraving: ${r.elements_total} elements${r.kept_raster ? ` (${r.kept_raster} flagged raster)` : ''}${r.followed ? ` (${r.followed} follow a shape decided on an earlier sheet)` : ''}; raster ${mmss(r.raster_s_before)} as drawn, ${mmss(r.raster_s_after)} after ${r.elements} conversion${r.elements === 1 ? '' : 's'}; vector ${mmss(r.vector_s)} (${r.vector_mm} mm); estimated ${mmss(r.raster_s_after + r.vector_s)} instead of ${mmss(r.raster_s_before)}`);
  tb += r.raster_s_before; ta += r.raster_s_after; tv += r.vector_s;
  const rows = (r.decisions || []).filter(d => all || d.converted);
  if (rows.length) {
    const W = [10, 44, 7, 9, 12, 13, 11, 13, 8, 6];
    console.log('  ' + ['decision', 'shape (part:element ×copies)', 'copies', 'area mm²', 'size mm', 'raster alone', 'edge score', 'sheet saving', 'vector', 'lines'].map((h, i) => h.padEnd(W[i])).join(' '));
    for (const d of rows) console.log('  ' + [d.converted ? 'vector' : 'raster', d.parts.map(p => `${p.pid}:${p.element}${p.copies > 1 ? ' ×' + p.copies : ''}`).join(', '), String(d.copies), String(d.area_mm2), d.size_mm.join(' × '), `${d.raster_alone_s} s`, `${d.edge_score_s} s`, `${d.saving_s} s`, `${d.vector_s} s`, String(d.lines)].map((c, i) => c.padEnd(W[i])).join(' '));
  } else if (!all) console.log('  nothing converted' + ((r.decisions || []).length ? ` (${r.decisions.length} candidate${r.decisions.length === 1 ? '' : 's'} rejected: --all lists them)` : ''));
}
console.log(`\nall sheets: raster ${mmss(tb)} as drawn; ${mmss(ta + tv)} with the vector fill (raster ${mmss(ta)} + vector ${mmss(tv)}); ${vf.elements} elements drawn as ${vf.vector_mm} mm of concentric lines. Compare with the machine software's estimate; the cuts and the scores are not in these numbers.`);
