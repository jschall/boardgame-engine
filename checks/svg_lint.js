#!/usr/bin/env node
/* SPDX-License-Identifier: MPL-2.0; Copyright (C) 2026 Jonathan Challinger; source: https://github.com/jschall/boardgame-engine
   This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// svg_lint.js: automated checks on generated laser parts and sheets (parts/parts.json: {"parts": {pid: inner SVG}, "layout": {...}, "meta": {...}}).
// Usage:  node svg_lint.js parts/parts.json [--min-line 0.45] [--min-gap 0.6] [--edge 0.6] [--counts manifest.json] [--allow-text] [--strict]
// Checks (E = error, exit 1; W = warning):
//   E colours: only cut #ff0000 / share #cc0000 / score #0000ff / vector-fill #ffff00 / corner-mark #ff8000 (backs files only) strokes and engrave #000000 (or #ff8000 mark) fills; anything else (greys, white fills, opacity, gradients) breaks two-tone engraving
//   E live <text>: lettering must be outlined so the laser software cannot substitute a font       (--allow-text downgrades to W)
//   E open cut contours: a cut path that does not close leaves the part attached
//   E engraving outside its part's cut outline;  W an engraving-only part (an overlay or a back)
//   W engraving closer than --edge to a cut edge (charring merges with the edge)
//   W engraved islands thinner than --min-line, bare gaps narrower than --min-gap, specks under 0.3 mm²
//   W thin engraved strips running ACROSS the sheet's long axis (raster direction): text and long marks should run along it
//   E sheet: any element outside the sheet, or inside the margin;  E a sheet SVG on disk that is not well-formed XML
//   E counts: placed copies of each part id against --counts {"pid": n}
// Exit 1 on any error (and on warnings with --strict).
'use strict';
const fs = require('fs'), path = require('path');
const a = process.argv.slice(2); if (!a.length) { console.error('usage: node svg_lint.js parts.json [options]'); process.exit(2); }
const opt = (k, d) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : d; };
const MIN_LINE = +opt('--min-line', 0.45), MIN_GAP = +opt('--min-gap', 0.6), EDGE = +opt('--edge', 0.6), STRICT = a.includes('--strict'), ALLOW_TEXT = a.includes('--allow-text');
const D = JSON.parse(fs.readFileSync(a[0], 'utf8')); for (const k of ['parts', 'layout', 'meta']) if (!D[k]) throw new Error(`parts.json has no "${k}": expected {parts, layout, meta} as lasergeom writes it`);
const PARTS = D.parts, LAYOUT = D.layout, META = D.meta;
for (const k of ['sheet_w', 'sheet_h']) if (typeof META[k] !== 'number') throw new Error(`parts.json meta.${k} is missing: the generator must write sheet_w and sheet_h`);
const SW = META.sheet_w, SH = META.sheet_h;
const num = (k, d) => (typeof META[k] === 'number' ? META[k] : d);   // margins are optional Layout settings with documented defaults (3 mm); lasergeom writes the ones it used
const MARGIN_X = num('margin_x', num('margin', 3)), MARGIN_TOP = num('margin_top', num('margin', 3)), MARGIN_BOTTOM = num('margin_bottom', num('margin', 3));
const IN_FILE = META.kerf_comp === 'file' || a.includes('--kerf-in-file');
const KERF_ARG = a.includes('--kerf') ? +opt('--kerf') : null;
function kerfOf(pid) {   // kerf is per sheet/stock: meta.part_kerf {pid: kerf} (lasergeom from 2026-09-15), or a single numeric meta.kerf in older files
  if (KERF_ARG !== null) return KERF_ARG; if (!IN_FILE) return 0;
  if (META.part_kerf) { const k = META.part_kerf[pid]; if (typeof k !== 'number') throw new Error(`parts.json meta.part_kerf has no entry for ${pid}`); return k; }
  if (typeof META.kerf === 'number') return META.kerf;
  throw new Error('parts.json says kerf_comp "file" but has neither meta.part_kerf nor a numeric meta.kerf (or pass --kerf)');
}   // compensated files: engraving may bleed past the cut by kerf/2 (fronts) or 0.25 + kerf/2 (backs)
const bleedOf = pid => IN_FILE ? 0.25 + kerfOf(pid) / 2 + 0.05 : 0.05;   // engraving may bleed past the cut by kerf/2 (fronts) or 0.25 + kerf/2 (backs)
const errors = [], warns = []; const E = s => errors.push(s), W = s => warns.push(s);

// ---- geometry on the engine's lasergeom (shapely names; Clipper2 for buffers and booleans)
const lgPath = path.join(__dirname, '..', 'lib', 'lasergeom.js');
const lg = require(lgPath);
function polyOf(pts) { if (pts.length < 3) return null; let p = lg.Polygon(pts); if (!p.is_valid) p = lg.make_valid(p); return p.is_empty ? null : p; }
const union = gs => gs.length ? lg.unary_union(gs) : null;
const geoms = g => (g.geoms ? [...g.geoms] : [g]).filter(x => !x.is_empty);
const bounds = g => g.bounds.map(v => Math.round(v * 10) / 10);
const translate = (g, dx, dy, rot) => lg.affinity.translate(rot ? lg.affinity.rotate(g, rot, [0, 0]) : g, dx, dy);
const area = g => g.area;

// ---- SVG parsing with the renderer's parser (path flattening, transforms, colour classes)
class El { constructor(tag, attrs) { this.tagName = tag; this.attrs = attrs; this.children = []; this.textContent = ''; } getAttribute(n) { return n in this.attrs ? this.attrs[n] : null; } }
function parseXML(src) { const root = new El('#root', {}); const stack = [root]; let i = 0; const dec = s => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
  while (i < src.length) { const lt = src.indexOf('<', i); if (lt < 0) break; if (lt > i) { const t = src.slice(i, lt); if (t.trim()) stack[stack.length - 1].textContent += dec(t); }
    if (src.startsWith('<!--', lt)) { i = src.indexOf('-->', lt) + 3; continue; } if (src.startsWith('<?', lt)) { i = src.indexOf('?>', lt) + 2; continue; }
    const gt = src.indexOf('>', lt); const body = src.slice(lt + 1, gt); i = gt + 1; if (body[0] === '/') { stack.pop(); continue; }
    const selfClose = body.endsWith('/'); const b = selfClose ? body.slice(0, -1) : body; const m = b.match(/^([\w:-]+)\s*([\s\S]*)$/); const attrs = {}; const re = /([\w:-]+)\s*=\s*"([^"]*)"/g; let x; while ((x = re.exec(m[2]))) attrs[x[1]] = dec(x[2]);
    const el = new El(m[1], attrs); stack[stack.length - 1].children.push(el); if (!selfClose) stack.push(el); } return root; }
global.DOMParser = class { parseFromString(s) { return { documentElement: parseXML(s).children[0] }; } };
const R3 = require(path.join(__dirname, '..', 'lib', 'render3d.js'));

// ---- element-level checks (colours, text, opacity, foreign elements) straight from the markup
const OK_STROKE = new Set(['#ff0000', '#cc0000', '#0000ff', '#ffff00', '#ff8000', 'red', 'blue', 'none', '']), OK_FILL = new Set(['#000000', '#ff8000', 'black', 'none', '']);   // #ffff00 stroke: vector fill (concentric lines at engraving power); #ff8000: the backs corner marks   // #ffff00: the backs registration corner marks, their own layer (lasergeom c5497b9)
for (const [pid, svg] of Object.entries(PARTS)) {
  for (const m of svg.matchAll(/<(path|circle|rect|ellipse|polygon|polyline|line|text|image|use|linearGradient|radialGradient|filter)\b([^>]*?)\/?>/g)) {
    const tag = m[1]; const at = Object.fromEntries([...m[2].matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)].map(x => [x[1], x[2]]));
    if (['image', 'use', 'linearGradient', 'radialGradient', 'filter'].includes(tag)) { E(`${pid}: <${tag}> is not a laser element`); continue; }
    if (tag === 'text') { (ALLOW_TEXT ? W : E)(`${pid}: live <text> (outline it with the geometry library's text())`); continue; }
    const st = (at.stroke || '').toLowerCase(), fi = (at.fill || '').toLowerCase();
    if (!OK_STROKE.has(st) || !OK_FILL.has(fi)) E(`${pid}: colour outside the two-tone set: stroke=${st || '-'} fill=${fi || '-'} (${tag})`);
    for (const k of ['opacity', 'fill-opacity', 'stroke-opacity']) if (k in at && +at[k] < 1) E(`${pid}: ${k}=${at[k]} on a ${tag} (no tones between engraved and bare)`);
  }
}
// ---- geometry-level checks through the parsed part
const report = {};
for (const [pid, svg] of Object.entries(PARTS)) {
  const p = R3.parsePart('<svg xmlns="http://www.w3.org/2000/svg">' + svg + '</svg>');
  // open contours: the parser keeps `closed` on flattened subpaths only via the cut list; re-check the raw path data for cut paths without Z
  for (const m of svg.matchAll(/<path\b([^>]*?)\/?>/g)) { const at = Object.fromEntries([...m[1].matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)].map(x => [x[1], x[2]])); const st = (at.stroke || '').toLowerCase();
    if ((st === '#ff0000' || st === 'red') && at.d && !/[zZ]\s*$/.test(at.d.trim()) && !/[zZ]/.test(at.d)) E(`${pid}: open cut contour (path without Z)`); }
  const outers = p.cuts.filter(c => !c.hole).map(c => polyOf(c.pts)).filter(Boolean); const holes = p.cuts.filter(c => c.hole).map(c => polyOf(c.pts)).filter(Boolean);
  let outline = outers.length ? union(outers) : null; if (outline && holes.length) outline = outline.difference(union(holes));
  const engr = []; for (const e of p.engr) { if (e.polys) { const ps = e.polys.map(polyOf).filter(Boolean); if (ps.length) { let g = ps[0]; for (const q of ps.slice(1)) g = g.symmetric_difference(q); engr.push(g); } } else { const g = polyOf(e.pts); if (g) engr.push(g); } }
  const art = engr.length ? union(engr) : null; report[pid] = { outline, art };
  if (!art || art.is_empty) continue;
  if (!outline) { if (!pid.endsWith('-back')) W(`${pid}: engraving-only part (fine if it is an overlay placed over a cut part, e.g. lid-outer on the lid floor, or a backs part)`); }
  else { const BLEED = bleedOf(pid); const outside = art.difference(outline.buffer(BLEED)); if (area(outside) > 0.5) E(`${pid}: ${area(outside).toFixed(1)} mm² of engraving outside the cut outline (beyond the ${BLEED.toFixed(2)} mm bleed allowance) near ${JSON.stringify(bounds(outside))}`);
    const band = outline.buffer(-0.02).difference(outline.buffer(-EDGE));   // the strip just inside the cut edge: art that stops in it neither bleeds past the edge nor keeps clear, and charring merges with the edge
    const inBand = art.intersection(band); let nearArea = 0; for (const g of geoms(inBand)) { if (g.distance(outline.boundary) > 0.02) nearArea += area(g); }
    if (nearArea > 1.0) W(`${pid}: ${nearArea.toFixed(1)} mm² of engraving stops within ${EDGE} mm of a cut edge (either bleed past the edge or keep ${EDGE} mm clear)`); }
  const specks = [], thin = [], gaps = [];
  for (const g of geoms(art)) { if (area(g) < 0.3) specks.push(g); else if (g.buffer(-MIN_LINE / 2).is_empty) thin.push(g); }
  if (outline) { const bare = outline.buffer(-0.3).difference(art); for (const g of geoms(bare)) { const ar = area(g); if (ar > 0.2 && ar < 40 && g.buffer(-MIN_GAP / 2).is_empty) gaps.push(g); } }
  const tally = (list, noun, detail) => { if (!list.length) return; const n = list.length; W(`${pid}: ${n} ${noun}${n > 1 ? 's' : ''} ${detail}${n > 1 ? ', first' : ''} at ${JSON.stringify(bounds(list[0]))}`); };
  tally(specks, 'speck', 'under 0.3 mm²'); tally(thin, 'engraved island', `thinner than ${MIN_LINE} mm everywhere (legibility guidance; the kerf shrink takes kerf/2 off every stroke, so draw thicker)`); tally(gaps, 'bare gap', `narrower than ${MIN_GAP} mm that may burn closed`);
}
// ---- sheets: XML validity, bounds, margins, raster direction, counts
const counts = {}; const frame = polyOf([[MARGIN_X, MARGIN_TOP], [SW - MARGIN_X, MARGIN_TOP], [SW - MARGIN_X, SH - MARGIN_BOTTOM], [MARGIN_X, SH - MARGIN_BOTTOM]]).buffer(0.01);   // 0.01 mm tolerance: Clipper2 snaps to a 1e-6 grid, so a part placed exactly on the margin can sit 1e-7 outside it   // the usable area lasergeom checked against (backs/datum strips are the generator's own check)
const pdir = path.dirname(path.resolve(a[0]));
for (const [sname, L] of Object.entries(LAYOUT)) {
  const f = path.join(pdir, sname + '.svg');
  if (fs.existsSync(f)) { const s = fs.readFileSync(f, 'utf8'); if (/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-f]+;)/i.test(s)) E(`${sname}.svg has an unescaped & (not well-formed XML; escape & and < in titles)`); }
  for (const [pid, x, y, rot, gid] of L.items || []) {
    if (!pid) continue; if (!sname.startsWith('backs')) counts[pid] = (counts[pid] || 0) + 1;
    const r = report[pid] || {}; for (const [g, what] of [[r.outline, 'outline'], [r.art, 'engraving']]) { if (!g || g.is_empty) continue; const gp = translate(g, x, y, rot); if (!frame.contains(gp)) E(`${sname}: ${gid} ${what} crosses the margin/sheet edge ${JSON.stringify(bounds(gp))}`); }
    if (r.art && !r.art.is_empty) { const ga = translate(r.art, x, y, rot); for (const g of geoms(ga)) { const [x0, y0, x1, y1] = bounds(g); const w = x1 - x0, h = y1 - y0; const longY = SH >= SW; const across = longY ? (w > 12 && h < 6 && w > 3 * h) : (h > 12 && w < 6 && h > 3 * w);
      if (across) W(`${sname}: ${gid} has a thin engraved strip ${w.toFixed(0)} x ${h.toFixed(0)} mm across the raster direction (rotate text/marks to run along the sheet's long axis)`); } }
  }
}
const need = opt('--counts') ? JSON.parse(fs.readFileSync(opt('--counts'), 'utf8')) : {};
for (const [pid, n] of Object.entries(need)) if ((counts[pid] || 0) !== n) E(`counts: ${pid} placed ${counts[pid] || 0} times, manifest needs ${n}`);
for (const s of errors) console.log('E', s); for (const s of warns.slice(0, 200)) console.log('W', s); if (warns.length > 200) console.log(`... ${warns.length - 200} more warnings`);
console.log(`svg_lint: ${Object.keys(PARTS).length} parts, ${Object.keys(LAYOUT).length} sheets, ${errors.length} errors, ${warns.length} warnings`);
process.exit(errors.length || (STRICT && warns.length) ? 1 : 0);
