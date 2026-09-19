#!/usr/bin/env node
/* SPDX-License-Identifier: MPL-2.0; Copyright (C) 2026 Jonathan Challinger; source: https://github.com/jschall/boardgame-engine
   This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// preview.js: flat inspection pages of the generated parts (one <figure> per part on a wood-coloured background) plus every sheet,
// for the art judges and for your own eyes. Not part of the deliverable.
// Usage:  node preview.js parts/parts.json preview/ [groups.json]
//   groups.json: {"tiles": {"match": ["flower-", "oak"], "scale": 5}, "box": {"ids": ["lid-outer", "lid-inner"], "scale": 3}}
//   match = id prefixes; ids = explicit ids; scale = px per mm. Without groups.json every part goes on one page per prefix before the first '-'.
// Then render_for_judge.js captures each figure as its own PNG.
'use strict';
const fs = require('fs'), path = require('path');
if (process.argv.length < 4) { console.error('usage: node preview.js parts.json outdir [groups.json]'); process.exit(2); }
const D = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')); const P = D.parts; const OUT = process.argv[3]; fs.mkdirSync(OUT, { recursive: true });
const GROUPS = process.argv[4] ? JSON.parse(fs.readFileSync(process.argv[4], 'utf8')) : null;
if (!D.meta || typeof D.meta.sheet_w !== 'number' || typeof D.meta.sheet_h !== 'number') throw new Error('parts.json meta.sheet_w / sheet_h missing: the generator must write them');
const SW = D.meta.sheet_w, SH = D.meta.sheet_h;
function bbox(svg) {
  const xs = [], ys = [];
  for (const m of svg.matchAll(/ d="([^"]+)"/g)) { const d = m[1].replace(/[Aa]\s*[-\d.]+[,\s]+[-\d.]+[,\s]+[-\d.]+[,\s]+[01][,\s]+[01]/g, ''); const nums = (d.match(/-?\d*\.?\d+(?:e-?\d+)?/g) || []).map(Number); nums.forEach((v, i) => (i % 2 ? ys : xs).push(v)); }
  for (const m of svg.matchAll(/<circle[^>]*cx="([-\d.]+)"[^>]*cy="([-\d.]+)"[^>]*r="([-\d.]+)"/g)) { const [cx, cy, r] = m.slice(1).map(Number); xs.push(cx - r, cx + r); ys.push(cy - r, cy + r); }
  for (const m of svg.matchAll(/<rect[^>]*x="([-\d.]+)"[^>]*y="([-\d.]+)"[^>]*width="([-\d.]+)"[^>]*height="([-\d.]+)"/g)) { const [x, y, w, h] = m.slice(1).map(Number); xs.push(x, x + w); ys.push(y, y + h); }
  if (!xs.length) return [-10, -10, 10, 10];
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}
function fig(pid, k, pad = 2, bg = '#ead9b8') { const [x0, y0, x1, y1] = bbox(P[pid]); const w = x1 - x0 + 2 * pad, h = y1 - y0 + 2 * pad;
  return `<figure><svg width="${(w * k).toFixed(0)}" height="${(h * k).toFixed(0)}" viewBox="${x0 - pad} ${y0 - pad} ${w} ${h}" style="background:${bg}">${P[pid]}</svg><figcaption>${pid}</figcaption></figure>`; }
function page(name, body, width = 1900) { const css = `body{margin:8px;font:12px sans-serif;background:#555;width:${width}px} figure{display:inline-block;margin:4px;color:#eee} svg{display:block}`; fs.writeFileSync(path.join(OUT, name + '.html'), `<!doctype html><style>${css}</style>${body}`); }
if (GROUPS) { for (const [name, spec] of Object.entries(GROUPS)) { const ids = [...(spec.ids || []), ...Object.keys(P).filter(p => (spec.match || []).some(m => p.startsWith(m)))]; page(name, ids.map(p => fig(p, spec.scale || 5)).join(''), spec.width || 1900); } }
else { const groups = {}; for (const p of Object.keys(P)) (groups[p.split('-')[0]] = groups[p.split('-')[0]] || []).push(p); for (const [name, ids] of Object.entries(groups)) page(name, ids.map(p => fig(p, 5)).join('')); }
function sheet(name, k = 2.2) { const L = D.layout[name]; const body = L.items.filter(it => it[0]).map(([pid, x, y, r]) => `<g transform="translate(${x},${y})${r ? ` rotate(${r})` : ''}">${P[pid]}</g>`).join('');
  return `<figure><svg width="${(SW * k).toFixed(0)}" height="${(SH * k).toFixed(0)}" viewBox="0 0 ${SW} ${SH}" style="background:#ead9b8">${body}</svg><figcaption>${name} · ${L.title}</figcaption></figure>`; }
page('sheets', Object.keys(D.layout).map(n => sheet(n)).join(''), 2900);
console.log('wrote', fs.readdirSync(OUT).sort().join(' '));
