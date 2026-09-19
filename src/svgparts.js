/* SPDX-License-Identifier: MPL-2.0; Copyright (C) 2026 Jonathan Challinger; source: https://github.com/jschall/boardgame-engine
   This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at https://mozilla.org/MPL/2.0/. */
/* Read a part's inner SVG (as parts.json stores it) back into geometry and measures: the cut outline as one polygon with its holes, the engraving's
   evenodd area, score segments. Used by the packer and the checks. Node or browser (BGEngine.svgparts). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../lib/lasergeom.js'));
  else (root.BGEngine = root.BGEngine || {}).svgparts = factory(root.lasergeom);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (lg) {
  'use strict';
  const PATH = /<path d="([^"]*)"([^>]*)\/>/g;
  function rings_of(d) {
    const out = [];
    for (const chunk of d.split('M').slice(1)) {
      const pts = [];
      for (const m of chunk.matchAll(/(-?[\d.]+(?:e-?\d+)?),(-?[\d.]+(?:e-?\d+)?)/g)) pts.push([+m[1], +m[2]]);
      if (pts.length) out.push({ pts, closed: /Z\s*$/.test(chunk.trim()) });
    }
    return out;
  }
  const signed = pts => { let a = 0; for (let i = 0, n = pts.length; i < n; i++) { const p = pts[i], q = pts[(i + 1) % n]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; };
  const bbox = pts => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const [x, y] of pts) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; } return [x0, y0, x1, y1]; };
  function inside(pts, x, y) {
    let w = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) w = !w;
    }
    return w;
  }
  /** evenodd area of a set of rings: each ring counts with the sign of its nesting depth */
  function evenodd_area(rings) {
    const R = rings.map(r => ({ pts: r, b: bbox(r), a: Math.abs(signed(r)) }));
    const order = R.map((_, i) => i).sort((i, j) => R[i].b[0] - R[j].b[0]);
    let total = 0;
    for (const i of order) {
      const r = R[i], [x, y] = r.pts[0]; let depth = 0;
      for (const s of R) {
        if (s === r || s.a <= r.a) continue;
        if (x < s.b[0] || x > s.b[2] || y < s.b[1] || y > s.b[3]) continue;
        if (inside(s.pts, x, y)) depth++;
      }
      total += depth % 2 ? -r.a : r.a;
    }
    return total;
  }
  /** {cut: Polygon|null, eng_rings, eng_area, scores, holes} from a part's inner SVG */
  function parse_part(inner) {
    const cut = [], eng = [], scores = [];
    for (const m of (inner || '').matchAll(PATH)) {
      const attrs = m[2], rs = rings_of(m[1]);
      if (/#ff0000/.test(attrs)) cut.push(...rs.map(r => r.pts));
      else if (/#0000ff/.test(attrs)) scores.push(...rs.map(r => r.pts));
      else eng.push(...rs.map(r => r.pts));
    }
    let poly = null;
    if (cut.length) {
      const sorted = cut.slice().sort((a, b) => Math.abs(signed(b)) - Math.abs(signed(a)));
      poly = lg.Polygon(sorted[0], sorted.slice(1));
      if (!poly.is_valid) poly = lg.Polygon(sorted[0]).difference(lg.unary_union(sorted.slice(1).map(h => lg.Polygon(h))));
    }
    return { cut: poly, holes: Math.max(0, cut.length - 1), eng_rings: eng, eng_area: evenodd_area(eng), scores };
  }
  /** evenodd engraving as geometry (for symmetric differences); slow on whole panels */
  function eng_geom(parsed) { return parsed.eng_rings.length ? lg.fill_rings(parsed.eng_rings, 'evenodd') : lg.EMPTY; }
  /** the numbers compare.js reports for one part */
  function compare_part(js_inner, py_inner, opts = {}) {
    const a = parse_part(js_inner), b = parse_part(py_inner);
    const out = { holes_js: a.holes, holes_py: b.holes, eng_js: a.eng_area, eng_py: b.eng_area, scores_js: a.scores.length, scores_py: b.scores.length };
    if (a.cut || b.cut) {
      if (!a.cut || !b.cut) out.outline_symdiff = Infinity;
      else { out.outline_symdiff = a.cut.symmetric_difference(b.cut).area; out.outline_area_js = a.cut.area; out.outline_area_py = b.cut.area; }
    }
    out.eng_rel = b.eng_area > 0 ? (a.eng_area - b.eng_area) / b.eng_area : (a.eng_area > 0 ? Infinity : 0);
    if (opts.eng_symdiff) out.eng_symdiff = eng_geom(a).symmetric_difference(eng_geom(b)).area;
    return out;
  }
  return { rings_of, parse_part, eng_geom, evenodd_area, compare_part, signed };
});
