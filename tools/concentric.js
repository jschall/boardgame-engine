#!/usr/bin/env node
/* SPDX-License-Identifier: MPL-2.0; Copyright (C) 2026 Jonathan Challinger; source: https://github.com/jschall/boardgame-engine
   This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at https://mozilla.org/MPL/2.0/. */
/* concentric.js (boardgame-engine): a shape as a concentric scoring path. Reads an SVG (closed paths with any commands, polygons, rects, circles
   and ellipses; curves flattened; open subpaths, i.e. strokes, are skipped), takes the union of its filled shapes (even-odd, so a hole in a path is a hole), draws the concentric fill the
   layout's vector fill uses (one spiral of lines `pitch` apart from the shape's edge inward, a lead-in and lead-out so the laser's ramp lies on
   burnt track; the pieces a hole clips as lines of their own) and writes an SVG with those lines on the vector-fill layer (yellow #ffff00, stroke 0.1), in the input's units
   and coordinates, plus the laser-time model's estimate of the fill against rastering the shape's bounding box. Use it for a logo, a border or any
   engraving drawn outside the generator; the generator's own sheets get the same treatment automatically (plan_vector_fill).
     node engine/bin/bg.js concentric <in.svg> <out.svg> [--pitch 0.1] [--burn 0.36] [--kerf 0.18] [--scale 1]
   --kerf k shrinks the shape by k/2 first (an engraving is drawn compensated: the burn reaches the nominal edge); --scale maps the input's user
   units to millimetres (1 for an SVG drawn in mm; 25.4/96 for one drawn in CSS pixels). */
'use strict';
const fs = require('fs'), path = require('path');
const ENGINE = path.join(__dirname, '..');
const lg = require(path.join(ENGINE, 'lib', 'lasergeom.js')), R3 = require(path.join(ENGINE, 'lib', 'render3d.js'));
const a = process.argv.slice(2), opt = (k, d) => { const i = a.indexOf(k); if (i < 0) return d; const v = a[i + 1]; a.splice(i, 2); return v; };
const pitch = +opt('--pitch', 0.1), burn = +opt('--burn', 0.36), kerf = +opt('--kerf', 0), scale = +opt('--scale', 1);
const [inFile, outFile] = a;
if (!inFile || !outFile) { console.error('usage: node engine/bin/bg.js concentric <in.svg> <out.svg> [--pitch 0.1] [--burn 0.36] [--kerf 0.18] [--scale 1]'); process.exit(2); }
for (const [k, v] of [['pitch', pitch], ['burn', burn], ['scale', scale]]) if (!(v > 0)) { console.error(`--${k} must be positive`); process.exit(2); }
const svg = fs.readFileSync(inFile, 'utf8');
/* the shapes: every path, polygon, rect, circle and ellipse, flattened to rings in user units (transforms are not applied: draw the shape untransformed) */
const rings = [];
const num = (el, k, d = 0) => { const m = new RegExp(`\\s${k}="([^"]*)"`).exec(el); return m ? +m[1] : d; };
if (/\stransform="/.test(svg)) console.error('note: transform attributes are ignored; the shapes are read untransformed');
let open = 0;
for (const m of svg.matchAll(/<path\b[^>]*>/g)) { const d = /\sd="([^"]*)"/.exec(m[0]); if (!d) continue; for (const s of R3.flattenPath(d[1])) { if (!s.closed) { open++; continue; } if (s.pts.length >= 3) rings.push(s.pts.map(([x, y]) => [x * scale, y * scale])); } }
if (open) console.error(`note: ${open} open subpath${open === 1 ? '' : 's'} skipped: a stroke is not an area; convert strokes to outlines (Inkscape: Path > Stroke to Path) and close them`);
for (const m of svg.matchAll(/<polygon\b[^>]*>/g)) { const p = /\spoints="([^"]*)"/.exec(m[0]); if (!p) continue; const pts = [...p[1].matchAll(/(-?[\d.]+(?:e-?\d+)?)[,\s]+(-?[\d.]+(?:e-?\d+)?)/g)].map(q => [+q[1] * scale, +q[2] * scale]); if (pts.length >= 3) rings.push(pts); }
for (const m of svg.matchAll(/<rect\b[^>]*>/g)) { const e = m[0], x = num(e, 'x') * scale, y = num(e, 'y') * scale, w = num(e, 'width') * scale, h = num(e, 'height') * scale; if (w > 0 && h > 0) rings.push([[x, y], [x + w, y], [x + w, y + h], [x, y + h]]); }
for (const m of svg.matchAll(/<(circle|ellipse)\b[^>]*>/g)) { const e = m[0], cx = num(e, 'cx') * scale, cy = num(e, 'cy') * scale, rx = (m[1] === 'circle' ? num(e, 'r') : num(e, 'rx')) * scale, ry = (m[1] === 'circle' ? num(e, 'r') : num(e, 'ry')) * scale; if (rx > 0 && ry > 0) { const n = Math.max(24, Math.ceil(Math.PI * (rx + ry) / 0.5)); rings.push([...Array(n).keys()].map(i => { const t = 2 * Math.PI * i / n; return [cx + rx * Math.cos(t), cy + ry * Math.sin(t)]; })); } }
if (!rings.length) { console.error(`${inFile}: no path, polygon, rect, circle or ellipse found`); process.exit(2); }
let shape = lg.fill_rings(rings.map(r => r.concat([r[0]])), 'evenodd');
if (shape.is_empty) { console.error(`${inFile}: the shapes enclose no area`); process.exit(2); }
if (kerf > 0) { shape = shape.buffer(-kerf / 2, { join_style: 'round', quad_segs: 6 }); if (shape.is_empty) { console.error(`${inFile}: nothing is left after shrinking by half the kerf (${kerf / 2} mm)`); process.exit(2); } }
const fill = lg.concentric_fill(shape, { pitch, burn });
if (!fill.n) { console.error(`${inFile}: the shape is thinner than a pitch everywhere; raster it`); process.exit(2); }
const model = lg.laser_time_model({ pitch }), b = shape.bounds, rasterS = model.rasterT(b), vectorS = model.vectorT(fill);
const d = lg.concentric_path_d(fill), vb = `${(b[0] - 1).toFixed(2)} ${(b[1] - 1).toFixed(2)} ${(b[2] - b[0] + 2).toFixed(2)} ${(b[3] - b[1] + 2).toFixed(2)}`;
fs.writeFileSync(outFile, `<svg xmlns="http://www.w3.org/2000/svg" width="${(b[2] - b[0] + 2).toFixed(2)}mm" height="${(b[3] - b[1] + 2).toFixed(2)}mm" viewBox="${vb}">\n<!-- concentric scoring fill of ${path.basename(inFile)}: ${fill.n} closed lines ${pitch} mm apart (${Math.round(10 / pitch)} lines per centimetre), ${Math.round(fill.len)} mm; run at engraving power. Estimated ${vectorS.toFixed(1)} s as lines against ${rasterS.toFixed(1)} s rastered (rows along y) -->\n<path d="${d}" fill="none" stroke="#ffff00" stroke-width="0.1"/>\n</svg>\n`);
console.log(`${outFile}: ${fill.n} path${fill.n === 1 ? '' : 's'}, ${Math.round(fill.len)} mm, over ${Math.round(shape.area)} mm² in a ${(b[2] - b[0]).toFixed(1)} x ${(b[3] - b[1]).toFixed(1)} mm box; estimated ${vectorS.toFixed(1)} s as concentric lines, ${rasterS.toFixed(1)} s rastered on its own (rows along y): ${rasterS - model.V.min_gain * vectorS >= model.V.min_saving ? 'score it' : 'raster it'} (the fill wins when the raster costs ${model.V.min_gain} times the lines and saves ${model.V.min_saving} s after that; on a sheet the raster is what the shape's rows cost after the machine groups it with its neighbours)`);
