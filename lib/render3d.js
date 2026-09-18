/* Render3D (boardgame-create skill copy of TUMBLER's renderer as of 2026-09-15 00:15, plus BUMBLE's per-part thickness and a wide table quad): turns laser SVG parts (cut = red stroke, engrave = black fill, score = blue stroke, text) into
   extruded, wood-textured 3D and paints them on a canvas with a simple perspective camera and painter's algorithm.
   No dependencies. Units: millimetres in, pixels out.
   CHANGELOG (edit this file only, in backward-compatible steps; message the other game sessions when you do)
   - 2026-09-15 00:15 (TUMBLER): performance pass. Each part's contours are one triangle buffer (m.fan/m.fanN; m.conts is gone) so a face is one
     stencil draw; OES_vertex_array_object; cached uniform/texture state (f1/i1/f2/tex); the ply-edge texture on unit 4 (uEdge); the engraving
     recess reads a baked alpha-gradient texture (m.decalN / backTex.grad, uDecalN on unit 3) instead of four taps; default dpr is native
     (min 2) instead of 1.5x supersampling; anisotropy 8; opaque instances draw highest-z first, translucent last; no per-instance allocation.
   - 2026-09-15 00:53 (BUMBLE): mesh(part, mat, thick) caches per thickness for 1.5 mm stock; table quad widened to +-6000 mm.
   - 2026-09-17 (BUMBLE): opts.tableAlpha (default 1) blends the table quad in; 0 draws no table. For the scroll-driven opening.
   - 2026-09-17 (BUMBLE): the overlay canvas only forces position:relative on a statically positioned parent; it used to override a sticky stage.
   - 2026-09-17 (BUMBLE): opts.fog = [near, far] fades the table into the clear colour with distance (no horizon line at low pitch); translucent instances
     draw depth first then colour, so a fading object shows one surface per pixel; shadows are soft three-pass contact shadows on the table for every
     flat instance, static or dynamic (none on a plain background), spreading and fading with height.
   - 2026-09-15 01:40 (TUMBLER): the wood is evaluated in the fragment shader from hash noise (no tile, so it never repeats), band-limited by the
     pixel footprint, bump normal from the height's screen derivatives (OES_standard_derivatives; finite differences without it). The 2048 px
     tiles and their worker are gone from the GL path; prepareTextures() resolves at once and still fires applyTiles/onTextures. setTexture()
     photos still render through the sampled path. WOODP keys drive setWood(kind) uniforms; the canvas-2D fallback bakes 512 px tiles lazily.
   - 2026-09-15 03:50 (TUMBLER): faces 1.04x instead of 1.12x and a soft highlight roll-off above 0.78 (top compressed to 40%): pale wood no
     longer clips to white in the light; midtones and dark woods are barely changed.
   - 2026-09-15 05:30 (TUMBLER): the baked decal-gradient textures are gone (their getImageData readbacks cost 5-7 s on the first frame):
     the engraving recess samples the decal's alpha at four neighbours again. uDecalN and gradTex removed.
   - 2026-09-15 09:40 (TUMBLER): no fallbacks (owner's rule: fail loudly). Render3D.Scene throws when WebGL is missing instead of switching to the
     canvas painter (CanvasScene stays as the explicit choice); the wood-tile worker's timeout or error rejects instead of re-running on the main
     thread, and a missing Worker API throws unless the page is opened with #sync=1, which remains the caller's explicit main-thread choice. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Render3D = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const T = 3.0;   // ply thickness

  // ------------------------------------------------------------ affine helpers
  const I = () => [1, 0, 0, 1, 0, 0];
  const mul = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
  const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  function parseTransform(str) {
    let m = I(); if (!str) return m;
    const re = /(\w+)\s*\(([^)]*)\)/g; let t;
    while ((t = re.exec(str))) {
      const a = t[2].split(/[\s,]+/).filter(s => s.length).map(Number); const k = t[1];
      if (k === 'translate') m = mul(m, [1, 0, 0, 1, a[0] || 0, a[1] || 0]);
      else if (k === 'scale') m = mul(m, [a[0], 0, 0, a.length > 1 ? a[1] : a[0], 0, 0]);
      else if (k === 'rotate') { const r = a[0] * Math.PI / 180, c = Math.cos(r), s = Math.sin(r); if (a.length > 2) m = mul(m, mul([1, 0, 0, 1, a[1], a[2]], mul([c, s, -s, c, 0, 0], [1, 0, 0, 1, -a[1], -a[2]]))); else m = mul(m, [c, s, -s, c, 0, 0]); }
      else if (k === 'matrix') m = mul(m, a);
    }
    return m;
  }

  // ------------------------------------------------------------ SVG path flattening
  function arcToPoints(x1, y1, rx, ry, phi, fa, fs, x2, y2, out) {
    if (rx === 0 || ry === 0) { out.push([x2, y2]); return; }
    const p = phi * Math.PI / 180, cp = Math.cos(p), sp = Math.sin(p);
    const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2; const x1p = cp * dx + sp * dy, y1p = -sp * dx + cp * dy;
    let lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry); if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
    const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p, den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
    let coef = Math.sqrt(Math.max(0, num / den)); if (fa === fs) coef = -coef;
    const cxp = coef * rx * y1p / ry, cyp = -coef * ry * x1p / rx;
    const cx = cp * cxp - sp * cyp + (x1 + x2) / 2, cy = sp * cxp + cp * cyp + (y1 + y2) / 2;
    const ang = (ux, uy, vx, vy) => { const d = ux * vx + uy * vy, l = Math.hypot(ux, uy) * Math.hypot(vx, vy); let a = Math.acos(Math.max(-1, Math.min(1, d / l))); if (ux * vy - uy * vx < 0) a = -a; return a; };
    const th1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry); let dth = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
    if (!fs && dth > 0) dth -= 2 * Math.PI; else if (fs && dth < 0) dth += 2 * Math.PI;
    const n = Math.max(2, Math.ceil(Math.abs(dth) * Math.max(rx, ry) / 2.0));
    for (let i = 1; i <= n; i++) { const th = th1 + dth * i / n; const ex = rx * Math.cos(th), ey = ry * Math.sin(th); out.push([cp * ex - sp * ey + cx, sp * ex + cp * ey + cy]); }
  }
  function flattenPath(d) {
    const toks = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e-?\d+)?/g) || []; const subs = []; let cur = null, x = 0, y = 0, sx = 0, sy = 0, cmd = null, i = 0, px = 0, py = 0;
    const num = () => parseFloat(toks[i++]);
    const start = () => { cur = { pts: [[x, y]], closed: false }; subs.push(cur); sx = x; sy = y; };
    while (i < toks.length) {
      const t = toks[i]; if (/[a-zA-Z]/.test(t)) { cmd = t; i++; if (cmd === 'Z' || cmd === 'z') { if (cur) { cur.closed = true; x = sx; y = sy; } cur = null; continue; } }
      const rel = cmd === cmd.toLowerCase(); const C = cmd.toUpperCase();
      if (C === 'M') { const nx = num(), ny = num(); x = rel ? x + nx : nx; y = rel ? y + ny : ny; start(); cmd = rel ? 'l' : 'L'; }
      else if (C === 'L') { const nx = num(), ny = num(); x = rel ? x + nx : nx; y = rel ? y + ny : ny; if (!cur) start(); else cur.pts.push([x, y]); }
      else if (C === 'H') { const nx = num(); x = rel ? x + nx : nx; if (!cur) start(); else cur.pts.push([x, y]); }
      else if (C === 'V') { const ny = num(); y = rel ? y + ny : ny; if (!cur) start(); else cur.pts.push([x, y]); }
      else if (C === 'A') { const rx = num(), ry = num(), phi = num(), fa = num(), fs = num(); let nx = num(), ny = num(); if (rel) { nx += x; ny += y; } if (!cur) start(); arcToPoints(x, y, rx, ry, phi, fa, fs, nx, ny, cur.pts); x = nx; y = ny; }
      else if (C === 'Q') { let cx = num(), cy = num(), nx = num(), ny = num(); if (rel) { cx += x; cy += y; nx += x; ny += y; } if (!cur) start(); for (let k = 1; k <= 8; k++) { const s = k / 8; cur.pts.push([(1 - s) * (1 - s) * x + 2 * (1 - s) * s * cx + s * s * nx, (1 - s) * (1 - s) * y + 2 * (1 - s) * s * cy + s * s * ny]); } x = nx; y = ny; px = cx; py = cy; }
      else if (C === 'C') { let c1x = num(), c1y = num(), c2x = num(), c2y = num(), nx = num(), ny = num(); if (rel) { c1x += x; c1y += y; c2x += x; c2y += y; nx += x; ny += y; } if (!cur) start(); for (let k = 1; k <= 10; k++) { const s = k / 10, u = 1 - s; cur.pts.push([u * u * u * x + 3 * u * u * s * c1x + 3 * u * s * s * c2x + s * s * s * nx, u * u * u * y + 3 * u * u * s * c1y + 3 * u * s * s * c2y + s * s * s * ny]); } x = nx; y = ny; }
      else { i++; }
    }
    return subs;
  }
  function circlePts(cx, cy, r, n) { n = n || Math.max(10, Math.ceil(2 * Math.PI * r / 2.0)); const o = []; for (let k = 0; k < n; k++) { const a = 2 * Math.PI * k / n; o.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); } return o; }
  function ellipsePts(cx, cy, rx, ry) { const n = 24; const o = []; for (let k = 0; k < n; k++) { const a = 2 * Math.PI * k / n; o.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]); } return o; }
  function rectPts(x, y, w, h, rx) {
    if (!rx) return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
    const o = []; const corners = [[x + w - rx, y + rx, -90], [x + w - rx, y + h - rx, 0], [x + rx, y + h - rx, 90], [x + rx, y + rx, 180]];
    for (const [cx, cy, a0] of corners) for (let k = 0; k <= 6; k++) { const a = (a0 + 90 * k / 6) * Math.PI / 180; o.push([cx + rx * Math.cos(a), cy + rx * Math.sin(a)]); }
    return o;
  }

  // ------------------------------------------------------------ SVG part parsing
  function classify(el) {
    const st = (el.getAttribute('stroke') || '').toLowerCase(), fi = (el.getAttribute('fill') || '').toLowerCase();
    if (st === '#ff0000' || st === '#cc0000' || st === 'red') return 'cut';
    if (st === '#0000ff' || st === 'blue') return 'score';
    if (fi === '#ffffff' || fi === 'white') return 'light';
    if (fi === '#000000' || fi === 'black' || st === '#000000' || st === 'black') return st && st !== 'none' && (fi === 'none' || !fi) ? 'line' : 'engrave';
    return null;
  }
  function parsePart(svgText) {
    const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
    const part = { cuts: [], engr: [], lines: [], texts: [] };
    function walk(el, m) {
      const tag = el.tagName; if (!tag) return;
      const mm = mul(m, parseTransform(el.getAttribute('transform')));
      if (tag === 'g' || tag === 'svg') { for (const ch of el.children) walk(ch, mm); return; }
      const cls = classify(el); const op = parseFloat(el.getAttribute('opacity') || el.getAttribute('fill-opacity') || '1');
      const sw = parseFloat(el.getAttribute('stroke-width') || '0');
      let shapes = [];
      if (tag === 'path') shapes = flattenPath(el.getAttribute('d') || '').map(s => ({ pts: s.pts, closed: s.closed }));
      else if (tag === 'circle') shapes = [{ pts: circlePts(+el.getAttribute('cx') || 0, +el.getAttribute('cy') || 0, +el.getAttribute('r')), closed: true }];
      else if (tag === 'ellipse') shapes = [{ pts: ellipsePts(+el.getAttribute('cx') || 0, +el.getAttribute('cy') || 0, +el.getAttribute('rx'), +el.getAttribute('ry')), closed: true }];
      else if (tag === 'rect') shapes = [{ pts: rectPts(+el.getAttribute('x') || 0, +el.getAttribute('y') || 0, +el.getAttribute('width'), +el.getAttribute('height'), +el.getAttribute('rx') || 0), closed: true }];
      else if (tag === 'polygon') { const n = (el.getAttribute('points') || '').split(/[\s,]+/).filter(s => s.length).map(Number); const p = []; for (let k = 0; k + 1 < n.length; k += 2) p.push([n[k], n[k + 1]]); shapes = [{ pts: p, closed: true }]; }
      else if (tag === 'text') {
        const x = +el.getAttribute('x') || 0, y = +el.getAttribute('y') || 0; const [tx, ty] = apply(mm, x, y);
        const ux = apply(mm, x + 1, y), uy = apply(mm, x, y + 1);
        part.texts.push({ x: tx, y: ty, ax: [ux[0] - tx, ux[1] - ty], ay: [uy[0] - tx, uy[1] - ty], size: +el.getAttribute('font-size') || 4, text: el.textContent, anchor: el.getAttribute('text-anchor') || 'start', weight: el.getAttribute('font-weight') || 'normal', italic: el.getAttribute('font-style') === 'italic', spacing: +el.getAttribute('letter-spacing') || 0, light: cls === 'light' });
        return;
      }
      if ((cls === 'engrave') && shapes.length > 1 && tag === 'path') {   // compound engraving: subpaths are holes (evenodd), e.g. an eye with a bare highlight
        part.engr.push({ polys: shapes.map(s => s.pts.map(([px, py]) => apply(mm, px, py))), alpha: op }); return;
      }
      for (const s of shapes) {
        const pts = s.pts.map(([px, py]) => apply(mm, px, py));
        if (cls === 'cut') { if (pts.length >= 3) part.cuts.push(pts); }
        else if (cls === 'engrave' || cls === 'light') part.engr.push({ pts, light: cls === 'light', alpha: op, closed: s.closed !== false });
        else if (cls === 'score' || cls === 'line') part.lines.push({ pts, w: sw || 0.2, closed: s.closed, alpha: op });
      }
    }
    walk(doc.documentElement, I());
    // orientation + nesting: material on the left of each edge (signed area > 0 for outers in y-down coords), holes reversed
    const area = p => { let a = 0; for (let i = 0; i < p.length; i++) { const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % p.length]; a += x1 * y2 - x2 * y1; } return a / 2; };
    const inside = (pt, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi) c = !c; } return c; };
    part.cuts = part.cuts.map((c, i) => { let depth = 0; for (let j = 0; j < part.cuts.length; j++) if (j !== i && inside(c[0], part.cuts[j])) depth++; const hole = depth % 2 === 1; const a = area(c); const pts = ((a > 0) !== hole) ? c : c.slice().reverse(); return { pts, hole }; });
    let minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9; for (const c of part.cuts) for (const [x, y] of c.pts) { minx = Math.min(minx, x); maxx = Math.max(maxx, x); miny = Math.min(miny, y); maxy = Math.max(maxy, y); }
    part.bbox = [minx, miny, maxx, maxy];
    return part;
  }

  // ------------------------------------------------------------ materials: procedural wood, one seamless tile per kind (colour + normal map)
  // The tile is a height/colour model of veneer: growth rings warped by low-frequency noise (the rings fold into broad cathedral figure
  // where the warp gradient cancels the ring gradient), streaks and fine grain along y, elongated pores, rare mineral streaks and a slow
  // surface wave. The normal map is the finite difference of the same height field, exaggerated S times. Birch and walnut tiles are
  // 2048 px = 300 mm at 6.83 px per mm, so no part shows a repeat; each instance samples its own offset and grain angle. Generated once,
  // in a worker where possible, and swapped in over a flat swatch when ready.
  const PXMM = 512 / 75;
  const WOODP = {
    birch:  { px: 2048, seed: 7,  ring: 4.0, warp: [20, 2.5, 0.6], late: 0.045, lateW: [0.55, 0.8, 0.9, 1], med: 0.06, fine: 0.09, pore: 0.06, poreT: 0.965, poreCell: [0.3, 1.2], streak: 0.12, streakT: 0.978, streakW: 0.014, streakCell: [1.2, 60], col: [[241, 224, 190], [206, 176, 130]], bump: [0.005, 0.012, 0.025, 0.010, 0.015], S: 6 },
    walnut: { px: 2048, seed: 13, ring: 4.5, warp: [18, 4, 1.0], late: 0.28, lateW: [0.4, 0.72, 0.85, 1], med: 0.08, fine: 0.08, pore: 0.32, poreT: 0.91, poreCell: [0.25, 3.5], streak: 0.15, streakT: 0.985, streakW: 0.008, streakCell: [0.6, 60], col: [[128, 84, 52], [86, 52, 30]], bump: [0.030, 0.015, 0.05, 0.010, 0.02], S: 5 },
    table:  { px: 1024, seed: 21, ring: 5.0, warp: [15, 3, 0.8], late: 0.15, lateW: [0.45, 0.75, 0.87, 1], med: 0.05, fine: 0.07, pore: 0.22, poreT: 0.93, poreCell: [0.3, 3], streak: 0.1, streakT: 0.985, streakW: 0.01, streakCell: [0.6, 60], col: [[96, 62, 38], [66, 42, 26]], bump: [0.02, 0.01, 0.03, 0.01, 0.01], S: 3 },
    brass:  { px: 512,  seed: 3,  ring: 1e9, warp: [0, 0, 0], late: 0, lateW: [0.3, 0.65, 0.82, 1], med: 0.03, fine: 0.10, pore: 0, poreT: 2, poreCell: [1, 1], streak: 0, streakT: 2, streakW: 0.01, streakCell: [1, 1], col: [[205, 154, 52], [188, 138, 44]], bump: [0, 0.004, 0, 0.004, 0], S: 6 },
  };
  function genWoodTile(kind, P) {   // self-contained (it is stringified into a worker): returns RGBA colour and normal arrays
    const N = P.px, K = 512 / 75, Wmm = N / K;
    let s = (P.seed * 2654435761) >>> 0 || 1; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    // lattice cells finer than 12 px snap to a whole number of pixels: a 2.05 px cell beats against the pixel grid and prints a quilt pattern every 80 px
    const cells = (c, n) => { let n0 = Math.max(1, Math.round(Wmm / c)); const px = N / n0; return px < 12 ? Math.round(N / Math.max(2, Math.round(px))) : n0; };
    const lat = (cx, cy) => { const nx = cells(cx), ny = cells(cy); const a = new Float32Array(nx * ny); for (let i = 0; i < a.length; i++) a[i] = rnd(); return { a, nx, ny, sx: nx / N, sy: ny / N }; };
    const vn = (L, i, j) => { const x = i * L.sx, y = j * L.sy; const xi = x | 0, yi = y | 0; let fx = x - xi, fy = y - yi; fx = fx * fx * fx * (fx * (fx * 6 - 15) + 10); fy = fy * fy * fy * (fy * (fy * 6 - 15) + 10); const xj = xi + 1 >= L.nx ? 0 : xi + 1, yj = yi + 1 >= L.ny ? 0 : yi + 1; const a = L.a, r0 = yi * L.nx, r1 = yj * L.nx; const v0 = a[r0 + xi] + (a[r0 + xj] - a[r0 + xi]) * fx, v1 = a[r1 + xi] + (a[r1 + xj] - a[r1 + xi]) * fx; return v0 + (v1 - v0) * fy; };
    const ss = (a, b, t) => { t = (t - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
    const W1 = lat(60, 200), W2 = lat(20, 70), W3 = lat(6, 20), ST = lat(P.streakCell[0], P.streakCell[1]), C1 = lat(100, 150), C2 = lat(30, 60), M1 = lat(2.5, 40), F1 = lat(0.6, 30), F2 = lat(0.3, 8), PO = lat(P.poreCell[0], P.poreCell[1]), LW = lat(60, 60), LM = lat(80, 120);
    const color = new Uint8ClampedArray(N * N * 4), h = new Float32Array(N * N);
    const c0 = P.col[0], c1 = P.col[1]; const wa = P.warp[0], wb = P.warp[1], wc = P.warp[2]; const b0 = P.bump[0], b1 = P.bump[1], b2 = P.bump[2], b3 = P.bump[3], b4 = P.bump[4]; const lw = P.lateW;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const X = i / K; const p = j * N + i;
      const warp = wa * (vn(W1, i, j) - .5) + wb * (vn(W2, i, j) - .5) + wc * (vn(W3, i, j) - .5);
      const r = X / P.ring + warp; const f = r - Math.floor(r);
      const late = ss(lw[0], lw[1], f) * (1 - ss(lw[2], lw[3], f)) * (0.45 + 0.55 * vn(LM, i, j));   // ring contrast comes and goes across the board, as on real veneer
      const drift = .65 * vn(C1, i, j) + .35 * vn(C2, i, j);
      const med = vn(M1, i, j) - .5, fine = .6 * (vn(F1, i, j) - .5) + .4 * (vn(F2, i, j) - .5);
      const pore = P.pore > 0 ? ss(P.poreT, P.poreT + .03, vn(PO, i, j)) : 0; const streak = P.streak > 0 ? ss(P.streakT, P.streakT + P.streakW, vn(ST, i, j)) : 0;
      const tone = 1 - P.late * late + P.med * med + P.fine * fine - P.pore * pore - P.streak * streak;
      color[p * 4] = (c0[0] + (c1[0] - c0[0]) * drift) * tone; color[p * 4 + 1] = (c0[1] + (c1[1] - c0[1]) * drift) * tone; color[p * 4 + 2] = (c0[2] + (c1[2] - c0[2]) * drift) * tone; color[p * 4 + 3] = 255;
      h[p] = -b0 * late + b1 * fine * 2 - b2 * pore - b4 * streak + b3 * (vn(LW, i, j) - .5) * 2;
    }
    const normal = new Uint8ClampedArray(N * N * 4); const g = P.S * K / 2;   // slope per mm of height, S times
    for (let j = 0; j < N; j++) { const jm = (j + N - 1) % N * N, jp = (j + 1) % N * N, j0 = j * N;
      for (let i = 0; i < N; i++) { const im = (i + N - 1) % N, ip = (i + 1) % N; const nx = -(h[j0 + ip] - h[j0 + im]) * g, ny = -(h[jp + i] - h[jm + i]) * g; const l = 1 / Math.sqrt(nx * nx + ny * ny + 1); const p = (j0 + i) * 4;
        normal[p] = (nx * l * .5 + .5) * 255; normal[p + 1] = (ny * l * .5 + .5) * 255; normal[p + 2] = (l * .5 + .5) * 255; normal[p + 3] = 255; } }
    return { kind, w: N, h: N, color, normal };
  }
  const TILES = {}; let tilesPromise = null, tilesPromise2 = null; const SCENES = [];   // live scenes get the tiles when they are ready
  function swatch(kind) { const c = document.createElement('canvas'); c.width = c.height = 4; const g = c.getContext('2d'); const m = WOODP[kind].col; g.fillStyle = `rgb(${(m[0][0] + m[1][0]) >> 1},${(m[0][1] + m[1][1]) >> 1},${(m[0][2] + m[1][2]) >> 1})`; g.fillRect(0, 0, 4, 4); return c; }
  function flatNormal() { const c = document.createElement('canvas'); c.width = c.height = 4; const g = c.getContext('2d'); g.fillStyle = 'rgb(128,128,255)'; g.fillRect(0, 0, 4, 4); return c; }
  function prepareTextures() {   // the GL path needs no textures; resolves on the next tick and fires applyTiles/onTextures for callers that gate on it
    if (tilesPromise) return tilesPromise;
    tilesPromise = Promise.resolve().then(() => { for (const sc of SCENES) sc.applyTiles(); return TILES; }); return tilesPromise;
  }
  function prepareTiles() {   // baked 512 px tiles for the canvas-2D fallback only
    if (tilesPromise2) return tilesPromise2;
    const toCanvas = r => { const mk = arr => { const c = document.createElement('canvas'); c.width = r.w; c.height = r.h; c.getContext('2d').putImageData(new ImageData(arr, r.w, r.h), 0, 0); return c; }; return { color: mk(r.color), normal: mk(r.normal), w: r.w, h: r.h }; };
    const inWorker = kind => new Promise((res, rej) => {
      try { const code = `self.onmessage=function(e){var r=(${genWoodTile.toString()})(e.data.kind,e.data.P);self.postMessage(r,[r.color.buffer,r.normal.buffer]);};`; const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' })); const w = new Worker(url);
        const dog = setTimeout(() => { w.terminate(); rej(new Error('Render3D: the wood-tile worker did not answer within 20 s')); }, 20000);   // no fallback: a stuck worker fails the tiles loudly
        w.onmessage = e => { clearTimeout(dog); res(e.data); w.terminate(); URL.revokeObjectURL(url); }; w.onerror = e => { clearTimeout(dog); w.terminate(); rej(e); }; w.postMessage({ kind, P: Object.assign({}, WOODP[kind], { px: 512 }) }); } catch (e) { rej(e); } });
    const syncMode = typeof location !== 'undefined' && /[#&]sync=1/.test(location.hash);   // #...&sync=1: the caller's explicit choice to bake on the main thread (headless virtual-time runs cannot wait for a worker)
    if (!syncMode && !(typeof Worker !== 'undefined' && typeof Blob !== 'undefined' && typeof URL !== 'undefined')) throw new Error('Render3D: Web Workers are required to bake the wood tiles (or open the page with #sync=1 to bake them on the main thread)');
    const useWorker = !syncMode;
    const small = kind => Object.assign({}, WOODP[kind], { px: 512 });
    const run = kind => (useWorker ? inWorker(kind) : Promise.resolve(genWoodTile(kind, small(kind))));   // a worker error or timeout rejects; nothing silently switches paths
    tilesPromise2 = Promise.all(Object.keys(WOODP).map(k => run(k).then(r => { TILES[k] = toCanvas(r); }))).then(() => { for (const sc of SCENES) if (sc.applyTiles2) sc.applyTiles2(); return TILES; });
    return tilesPromise2;
  }
  function woodPattern(kind) { return TILES[kind] ? TILES[kind].color : swatch(kind); }
  const EDGE = { birch: ['#b8935f', '#7a5231', '#c9a476'], walnut: ['#5a3418', '#2e180a', '#7a5030'], brass: ['#a67a24', '#6f4a10', '#d9b25a'] };
  function edgeTexture(kind) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 32; const g = c.getContext('2d');
    const [mid, dark, light] = EDGE[kind] || EDGE.birch; let seed = 5; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    g.fillStyle = mid; g.fillRect(0, 0, 256, 32);
    g.fillStyle = light; g.globalAlpha = .45; g.fillRect(0, 0, 256, 10); g.fillRect(0, 22, 256, 10); g.globalAlpha = 1;   // outer plies lighter
    g.fillStyle = dark; g.fillRect(0, 10, 256, 1.5); g.fillRect(0, 21, 256, 1.5);                                                // glue lines
    for (let i = 0; i < 1400; i++) { g.fillStyle = rnd() < .5 ? `rgba(0,0,0,${.05 + rnd() * .12})` : `rgba(255,255,255,${.03 + rnd() * .08})`; g.fillRect(rnd() * 256, rnd() * 32, 1 + rnd() * 3, 1); }
    g.fillStyle = 'rgba(30,12,4,.35)'; g.fillRect(0, 0, 256, 1.2); g.fillRect(0, 30.8, 256, 1.2);                                  // charred skin top and bottom
    return c;
  }
  const BURN = { birch: 'rgba(52,30,12,', walnut: 'rgba(18,9,4,', brass: 'rgba(60,40,10,' };
  const LIGHTFILL = 'rgba(248,238,215,';
  // engraving reads dark on pale woods (charred) but LIGHT on walnut ply: the beam takes off the dark face veneer and shows the pale core.
  // ENGRAVED holds the woods that engrave lighter than their surface; eng(mat) is the colour of an engraved mark, cut edges stay BURN (they char on any wood).
  const ENGRAVED = { walnut: 'rgba(200,170,126,' };
  const eng = mat => ENGRAVED[mat] || BURN[mat] || BURN.birch;

  // ------------------------------------------------------------ scene
  // group: { angle (deg), pivot [x, y, z], axis [ax, ay, az] } rotates the whole placed part about the horizontal line through the pivot along axis (default +y);
  // with the default axis, +angle lifts the +x side. An array of groups is applied in order.
  function applyGroup(B, g) {
    if (!g) return B;
    if (Array.isArray(g)) { for (const gg of g) B = applyGroup(B, gg); return B; }
    if (!g.angle) return B;
    const a = g.angle * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); const ax = g.axis || [0, 1, 0];
    const R = v => { const d = v[0] * ax[0] + v[1] * ax[1] + v[2] * ax[2]; const x = [v[1] * ax[2] - v[2] * ax[1], v[2] * ax[0] - v[0] * ax[2], v[0] * ax[1] - v[1] * ax[0]];
      return [v[0] * c + x[0] * s + ax[0] * d * (1 - c), v[1] * c + x[1] * s + ax[1] * d * (1 - c), v[2] * c + x[2] * s + ax[2] * d * (1 - c)]; };
    const o = R([B.O[0] - g.pivot[0], B.O[1] - g.pivot[1], B.O[2] - g.pivot[2]]);
    return { O: [g.pivot[0] + o[0], g.pivot[1] + o[1], g.pivot[2] + o[2]], U: R(B.U), V: R(B.V), N: R(B.N) };
  }
  class Scene {
    constructor(canvas, opts) {
      this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.opts = Object.assign({ pitch: 48, yaw: 0, dist: 900, cx: 135, cy: 195, cz: 0, view: 420, light: [-0.35, 0.55, 0.75], table: '#3b2a1c', plain: false, dpr: window.devicePixelRatio || 1 }, opts || {});
      this.patterns = {}; this.static = []; this.dynamic = []; this.cache = null; this.overlay = null;
      this.resize(); SCENES.push(this); prepareTiles();
    }
    applyTiles() { if (this.onTextures) this.onTextures(); }
    applyTiles2() { this.resize(); this.cache = null; if (this.onTextures) this.onTextures(); }
    resize() {
      const o = this.opts; const dpr = o.dpr; const w = this.canvas.clientWidth || 600, h = this.canvas.clientHeight || 800;
      this.W = w; this.H = h; this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr); this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const K = { birch: PXMM, walnut: PXMM, brass: PXMM, table: 512 / 150 };   // one scale for every wood part: 6.83 px per mm
      for (const k of Object.keys(WOODP)) { const src = this.patterns[k] && this.patterns[k].user ? this.patterns[k].canvas : woodPattern(k); this.patterns[k] = { canvas: src, pat: this.ctx.createPattern(src, 'repeat'), k: K[k], w: src.width, h: src.height, user: !!(this.patterns[k] && this.patterns[k].user) }; const e = edgeTexture(k); this.patterns[k + '-edge'] = { canvas: e, pat: this.ctx.createPattern(e, 'repeat'), k: 32 / T, w: 256, h: 32 }; }
      if (this.patterns.table) this.patterns.table = { canvas: this.patterns.table.canvas, pat: this.ctx.createPattern(this.patterns.table.canvas, 'repeat'), k: K.table, w: 512, h: 512 };
      this.updateCamera();
    }
    updateCamera() {
      const o = this.opts; const p = o.pitch * Math.PI / 180, yw = o.yaw * Math.PI / 180;
      const d = [Math.sin(p) * Math.sin(yw), Math.sin(p) * Math.cos(yw), Math.cos(p)];
      const pos = [o.cx + o.dist * d[0], o.cy + o.dist * d[1], o.cz + o.dist * d[2]]; const v = [-d[0], -d[1], -d[2]]; const right = [Math.cos(yw), -Math.sin(yw), 0];
      const up = [v[1] * right[2] - v[2] * right[1], v[2] * right[0] - v[0] * right[2], v[0] * right[1] - v[1] * right[0]];
      this.cam = { pos, v, right, up }; this.f = o.dist * (this.H / o.view); this.cache = null;
    }
    setView(o) { Object.assign(this.opts, o); this.updateCamera(); }
    setTexture(kind, img) { const K = { birch: PXMM, walnut: PXMM, brass: PXMM, table: 512 / 150 }; this.patterns[kind] = { canvas: img, pat: this.ctx.createPattern(img, 'repeat'), k: K[kind] || PXMM, w: img.width || 512, h: img.height || 512, user: true }; this.cache = null; }
    // affine map from part-local mm (u,v) at height h to screen px, linearised around (cu,cv)
    faceAffine(B, h, cu, cv) {
      const o = this.project(...this.world(B, cu, cv, h)), px = this.project(...this.world(B, cu + 1, cv, h)), py = this.project(...this.world(B, cu, cv + 1, h));
      const a = px[0] - o[0], b = px[1] - o[1], c = py[0] - o[0], d = py[1] - o[1];
      return [a, b, c, d, o[0] - a * cu - c * cv, o[1] - b * cu - d * cv];
    }
    // fill the face path with a texture attached to the part's own coordinates; big faces are subdivided so perspective holds
    fillTextured(ctx, top, B, h, mat, bbox, seed, grainRot) {
      const tex = this.patterns[mat]; if (!tex) return; const k = tex.k;
      const w = bbox[2] - bbox[0], hh = bbox[3] - bbox[1]; const CELL = 60; const nx = Math.max(1, Math.ceil(w / CELL)), ny = Math.max(1, Math.ceil(hh / CELL));
      const ox = (seed * 13) % tex.w, oy = (seed * 7) % tex.h; const gr = (grainRot || 0) * Math.PI / 180, cg = Math.cos(gr), sg = Math.sin(gr);
      ctx.save(); ctx.beginPath(); for (const pts of top) { ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath(); } ctx.clip('evenodd');
      for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
        const u0 = bbox[0] + w * i / nx - .4, u1 = bbox[0] + w * (i + 1) / nx + .4, v0 = bbox[1] + hh * j / ny - .4, v1 = bbox[1] + hh * (j + 1) / ny + .4;
        const A = this.faceAffine(B, h, (u0 + u1) / 2, (v0 + v1) / 2);
        // pattern px -> local mm: rotate grain, scale 1/k, offset
        const m = new DOMMatrix(A).multiply(new DOMMatrix([cg, sg, -sg, cg, 0, 0])).scale(1 / k).translate(ox, oy);
        tex.pat.setTransform(m); ctx.fillStyle = tex.pat; ctx.beginPath();
        for (const [u, v] of [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]) { const p = this.project(...this.world(B, u, v, h)); ctx.lineTo(p[0], p[1]); }
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }
    project(x, y, z) {
      const c = this.cam; const rx = x - c.pos[0], ry = y - c.pos[1], rz = z - c.pos[2];
      const depth = rx * c.v[0] + ry * c.v[1] + rz * c.v[2]; const sx = rx * c.right[0] + ry * c.right[1] + rz * c.right[2]; const sy = rx * c.up[0] + ry * c.up[1] + rz * c.up[2];
      const k = this.f / depth; return [this.W / 2 + sx * k, this.H / 2 - sy * k, depth];
    }
    // instance: { part, x, y, z, rot, mat, vertical, alpha, id, hidden }
    basis(inst) {
      const r = (inst.rot || 0) * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
      const sc = inst.scale || 1; const t = inst.thick || T;
      if (inst.vertical) { const N = [-s, c, 0]; return applyGroup({ O: [inst.x - N[0] * t / 2, inst.y - N[1] * t / 2, inst.z], U: [c * sc, s * sc, 0], V: [0, 0, inst.flipV ? sc : -sc], N }, inst.group); }   // flipV: drawing y runs up from z instead of down
      return applyGroup({ O: [inst.x, inst.y, inst.z], U: [c * sc, s * sc, 0], V: [-s * sc, c * sc, 0], N: [0, 0, 1] }, inst.group);
    }
    world(B, u, v, h) { return [B.O[0] + B.U[0] * u + B.V[0] * v + B.N[0] * h, B.O[1] + B.U[1] * u + B.V[1] * v + B.N[1] * h, B.O[2] + B.U[2] * u + B.V[2] * v + B.N[2] * h]; }
    drawShadow(ctx, inst) {
      if (inst.hidden) return; const part = inst.part; if (!part) return; const B = this.basis(inst);
      const cont = part.cuts.map(c => ({ w0: c.pts.map(([u, v]) => this.world(B, u, v, 0)) }));
      if (!inst.vertical && inst.shadow !== false && !part.noShadow) {
        ctx.fillStyle = 'rgba(0,0,0,0.16)'; ctx.beginPath();
        for (const c of cont) { const pts = c.w0.map(([x, y, z]) => this.project(x + 1.2, y + 1.6, z)); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath(); }
        ctx.fill('evenodd');
      } else if (inst.vertical && inst.shadow !== false) {
        const [X, Y] = this.project(inst.x + 2, inst.y + 1.5, inst.z); const [X2] = this.project(inst.x + 12, inst.y, inst.z); const rx = Math.abs(X2 - X), ry = rx * 0.45;
        ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.beginPath(); ctx.ellipse(X, Y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
      }
    }
    // collect every visible polygon of an instance as an independently depth-sorted drawable
    collect(inst, items) {
      if (inst.hidden) return; const part = inst.part; if (!part) return; const B = this.basis(inst); const mat = inst.mat || 'birch'; const t = inst.thick || T; const L = this.opts.light;
      const alpha = inst.alpha === undefined ? 1 : inst.alpha;
      const cont = part.cuts.map(c => ({ hole: c.hole, w0: c.pts.map(([u, v]) => this.world(B, u, v, 0)), w1: c.pts.map(([u, v]) => this.world(B, u, v, t)) }));
      const quads = [];
      for (const c of cont) {
        const n = c.w0.length; let s0 = 0;
        for (let i = 0; i < n; i++) {
          const a0 = c.w0[i], b0 = c.w0[(i + 1) % n], a1 = c.w1[i], b1 = c.w1[(i + 1) % n];
          const ex = b0[0] - a0[0], ey = b0[1] - a0[1], ez = b0[2] - a0[2];
          // outward normal = edge dir x N  (material on the left of the edge, in the local plane)
          const nx = ey * B.N[2] - ez * B.N[1], ny = ez * B.N[0] - ex * B.N[2], nz = ex * B.N[1] - ey * B.N[0];
          const cx = (a0[0] + b0[0] + a1[0] + b1[0]) / 4, cy = (a0[1] + b0[1] + a1[1] + b1[1]) / 4, cz = (a0[2] + b0[2] + a1[2] + b1[2]) / 4;
          const vx = this.cam.pos[0] - cx, vy = this.cam.pos[1] - cy, vz = this.cam.pos[2] - cz;
          const dot = nx * vx + ny * vy + nz * vz;
          const nl = Math.hypot(nx, ny, nz) || 1; const lit = Math.max(0, (nx * L[0] + ny * L[1] + nz * L[2]) / nl);
          const len = Math.hypot(ex, ey, ez); const sStart = s0; s0 += len;
          if (dot <= 0) continue;
          const p0 = this.project(...a0), p1 = this.project(...b0), p2 = this.project(...b1), p3 = this.project(...a1);
          quads.push({ p: [p0, p1, p2, p3], d: (p0[2] + p1[2]) / 2, lit, len, s: sStart });
        }
      }
      const E = EDGE[mat]; const et = this.patterns[mat + '-edge'];
      for (const q of quads) {
        items.push({ d: q.d, draw: ctx => {
          const [p0, p1, p2, p3] = q.p; ctx.globalAlpha = alpha;
          ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.lineTo(p3[0], p3[1]); ctx.closePath();
          if (et && q.len > 0.01) {
            const A = [(p1[0] - p0[0]) / q.len, (p1[1] - p0[1]) / q.len, (p3[0] - p0[0]) / t, (p3[1] - p0[1]) / t, p0[0], p0[1]];
            et.pat.setTransform(new DOMMatrix(A).scale(1 / et.k).translate(q.s * et.k, 0)); ctx.fillStyle = et.pat; ctx.fill();
          } else { ctx.fillStyle = E[0]; ctx.fill(); }
          const dark = 0.5 * (1 - q.lit); if (dark > 0.02) { ctx.fillStyle = `rgba(0,0,0,${dark.toFixed(3)})`; ctx.fill(); }
          ctx.globalAlpha = 1;
        } });
      }
      // top face, or the bottom face when the part is seen from behind
      const fc = this.world(B, (part.bbox[0] + part.bbox[2]) / 2, (part.bbox[1] + part.bbox[3]) / 2, t);
      const facing = (B.N[0] * (this.cam.pos[0] - fc[0]) + B.N[1] * (this.cam.pos[1] - fc[1]) + B.N[2] * (this.cam.pos[2] - fc[2])) > 0;
      const hFace = facing ? t : 0; const top = cont.map(c => (facing ? c.w1 : c.w0).map(([x, y, z]) => this.project(x, y, z)));
      const fcd = this.project(...this.world(B, (part.bbox[0] + part.bbox[2]) / 2, (part.bbox[1] + part.bbox[3]) / 2, hFace))[2];
      const seed = (inst.id || 0) * 37.7; const grainRot = inst.grain !== undefined ? inst.grain : (((inst.id || 0) * 23) % 7 - 3);
      items.push({ d: fcd, draw: ctx => { ctx.globalAlpha = alpha; this.drawFace(ctx, inst, part, B, t, hFace, facing, top, mat, seed, grainRot, L); ctx.globalAlpha = 1; } });
    }
    drawFace(ctx, inst, part, B, t, hFace, facing, top, mat, seed, grainRot, L) {
      this.fillTextured(ctx, top, B, hFace, mat, part.bbox, seed, grainRot);
      ctx.beginPath(); for (const pts of top) { ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath(); }
      // subtle top lighting: darken faces turned away from the light
      const nl = Math.max(0, (facing ? 1 : -1) * (B.N[0] * L[0] + B.N[1] * L[1] + B.N[2] * L[2])); ctx.fillStyle = `rgba(0,0,0,${(0.22 * (1 - nl)).toFixed(3)})`; ctx.fill('evenodd');
      // engravings (front face only)
      for (const e of facing ? part.engr : []) {
        ctx.fillStyle = (e.light ? LIGHTFILL : eng(mat)) + (0.88 * (e.alpha || 1)).toFixed(2) + ')'; ctx.beginPath();
        for (const poly of (e.polys || [e.pts])) { const pts = poly.map(([u, v]) => this.project(...this.world(B, u, v, hFace))); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath(); }
        ctx.fill('evenodd');
      }
      for (const l of facing ? part.lines : []) {
        const pts = l.pts.map(([u, v]) => this.project(...this.world(B, u, v, hFace)));
        ctx.strokeStyle = eng(mat) + '0.7)'; ctx.lineWidth = Math.max(.5, l.w * this.pxPerMm(B, t)); ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); if (l.closed) ctx.closePath(); ctx.stroke();
      }
      if (facing) for (const tx of part.texts) this.drawText(ctx, B, t, tx, mat);
      // charred edge line on the drawn contour
      ctx.strokeStyle = BURN[mat] + '0.55)'; ctx.lineWidth = Math.max(.6, .35 * this.pxPerMm(B, t)); ctx.beginPath(); for (const pts of top) { ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath(); } ctx.stroke();
    }
    drawInstances(ctx, list) {
      for (const inst of list) this.drawShadow(ctx, inst);          // every shadow first, so raised parts always cover them
      const items = []; for (const inst of list) this.collect(inst, items);
      items.sort((a, b) => b.d - a.d); for (const it of items) it.draw(ctx);
    }
    pxPerMm(B, t) { const a = this.project(...this.world(B, 0, 0, t)), b = this.project(...this.world(B, 1, 0, t)); return Math.hypot(b[0] - a[0], b[1] - a[1]); }
    drawText(ctx, B, t, tx, mat) {
      const o = this.project(...this.world(B, tx.x, tx.y, t)); const px = this.project(...this.world(B, tx.x + tx.ax[0], tx.y + tx.ax[1], t)); const py = this.project(...this.world(B, tx.x + tx.ay[0], tx.y + tx.ay[1], t));
      const a = px[0] - o[0], b = px[1] - o[1], c = py[0] - o[0], d = py[1] - o[1];
      ctx.save(); ctx.transform(a, b, c, d, o[0], o[1]);
      ctx.font = `${tx.weight === 'bold' ? 'bold ' : ''}${tx.italic ? 'italic ' : ''}${tx.size}px Georgia, "Times New Roman", serif`; ctx.textAlign = tx.anchor === 'middle' ? 'center' : tx.anchor === 'end' ? 'right' : 'left'; ctx.textBaseline = 'alphabetic';
      if ('letterSpacing' in ctx) ctx.letterSpacing = tx.spacing + 'px';
      ctx.fillStyle = tx.light ? LIGHTFILL + '0.9)' : eng(mat) + '0.9)'; ctx.fillText(tx.text, 0, 0); ctx.restore();
    }
    // ---- rings / pins drawn on a horizontal plane (overlays)
    ring(ctx, x, y, z, r, color, width, alpha) {
      ctx.save(); ctx.globalAlpha = alpha === undefined ? 1 : alpha; ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath();
      for (let k = 0; k <= 40; k++) { const a = 2 * Math.PI * k / 40; const p = this.project(x + r * Math.cos(a), y + r * Math.sin(a), z); if (k === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]); }
      ctx.stroke(); ctx.restore();
    }
    disc(ctx, x, y, z, r, color, alpha) {
      ctx.save(); ctx.globalAlpha = alpha === undefined ? 1 : alpha; ctx.fillStyle = color; ctx.beginPath();
      for (let k = 0; k <= 30; k++) { const a = 2 * Math.PI * k / 30; const p = this.project(x + r * Math.cos(a), y + r * Math.sin(a), z); if (k === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]); }
      ctx.fill(); ctx.restore();
    }
    label(ctx, x, y, z, text, size, color) { const p = this.project(x, y, z); ctx.save(); ctx.font = `bold ${size}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.fillStyle = color; ctx.fillText(text, p[0], p[1]); ctx.restore(); }
    // ---- frame
    renderStatic() {
      const c = document.createElement('canvas'); c.width = this.canvas.width; c.height = this.canvas.height; const g = c.getContext('2d'); g.setTransform(this.opts.dpr, 0, 0, this.opts.dpr, 0, 0);
      g.fillStyle = this.opts.table; g.fillRect(0, 0, this.W, this.H);
      if (!this.opts.plain) { const tp = this.patterns.table ? this.patterns.table.pat : this.patterns.walnut.pat; tp.setTransform(new DOMMatrix([1.4, 0, 0, 1.4, 0, 0])); g.globalAlpha = this.patterns.table ? 1 : .35; g.fillStyle = tp; g.fillRect(0, 0, this.W, this.H); g.globalAlpha = 1; }
      this.drawInstances(g, this.static);
      this.cache = c;
    }
    depthOf(inst) { const B = this.basis(inst); const bb = inst.part ? inst.part.bbox : [0, 0, 0, 0]; const c = this.world(B, (bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2, (inst.thick || T) / 2); return this.project(...c)[2]; }
    render() {
      if (!this.cache) this.renderStatic();
      const ctx = this.ctx; ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(this.cache, 0, 0); ctx.restore(); ctx.setTransform(this.opts.dpr, 0, 0, this.opts.dpr, 0, 0);
      if (this.underlay) this.underlay(ctx);
      this.drawInstances(ctx, this.dynamic.filter(i => !i.hidden));
      if (this.overlay) this.overlay(ctx);
    }
    pick(px, py, radius) {
      let best = null; for (const inst of this.dynamic) { if (!inst.pickable) continue; const p = this.project(inst.x, inst.y, inst.z + (inst.thick || T)); const d = Math.hypot(p[0] - px, p[1] - py); if (d < radius && (!best || d < best.d)) best = { inst, d }; }
      return best && best.inst;
    }
  }

  // ============================================================ WebGL scene: depth buffer, stencil-filled faces, perspective-correct textures
  const VS = `
    attribute vec3 aPos; attribute vec3 aNrm; attribute vec2 aUV;
    uniform mat4 uModel, uVP; uniform mat3 uNrmM; uniform float uZ;
    varying vec3 vN; varying vec2 vUV; varying vec2 vLocal; varying vec3 vW;
    void main(){ vec3 p = aPos + vec3(0.0, 0.0, uZ); vec4 w = uModel * vec4(p, 1.0); vW = w.xyz; gl_Position = uVP * w; vN = normalize(uNrmM * aNrm); vUV = aUV; vLocal = aPos.xy; }`;
  // The wood is not a texture: the veneer model (rings warped by low-frequency noise so they fold into cathedral figure, streaks, pores,
  // mineral streaks, a slow surface wave) is evaluated per pixel from hash-based value noise in an unbounded plane, so it never repeats.
  // Every term fades as the pixel footprint approaches its feature size (band-limiting), which replaces mipmapping; the height's screen
  // derivatives give the bump normal. A photo set with setTexture() still takes the old sampled path (uProc = 0).
  const FS_HEAD = `#extension GL_OES_standard_derivatives : enable
`;
  const FS = `
    #ifdef GL_FRAGMENT_PRECISION_HIGH
    precision highp float;
    #else
    precision mediump float;
    #endif
    uniform sampler2D uWood, uDecal, uNrm, uEdge; uniform mat3 uNrmM; uniform int uMode; uniform float uK, uAlpha, uGrain, uFlipDecal, uBump, uEngr, uProc; uniform vec2 uOff, uDecalO, uDecalS, uDecalPx, uSeed; uniform vec3 uLight, uColor, uCam, uC0, uC1, uFogC; uniform vec2 uFog; uniform vec4 uWA, uWB, uWC, uWD, uWE, uWF, uWG;
    varying vec3 vN; varying vec2 vUV; varying vec2 vLocal; varying vec3 vW;
    float hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    float vn(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0); return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y); }
    float bl(float size, float fp) { return 1.0 - smoothstep(0.35 * size, 1.2 * size, fp); }   // band limit: a feature fades as the pixel footprint reaches its size
    vec4 wood(vec2 p, float fp) {   // p: wood millimetres (x across the grain, y along it); returns colour and height (mm)
      vec2 q = p + uSeed;
      float w1 = vn(q / vec2(60.0, 200.0)) - 0.5, w2 = (vn(q / vec2(20.0, 70.0) + 17.0) - 0.5) * bl(20.0, fp), w3 = (vn(q / vec2(6.0, 20.0) + 29.0) - 0.5) * bl(6.0, fp);
      float f = fract(p.x / uWA.x + uWA.y * w1 + uWA.z * w2 + uWA.w * w3);
      float lm = 0.45 + 0.55 * vn(q / vec2(80.0, 120.0) + 41.0); float lb = bl(0.5 * uWA.x, fp);
      float late = mix(0.5 * (1.0 - uWB.y - uWB.z + uWB.w), smoothstep(uWB.y, uWB.z, f) * (1.0 - smoothstep(uWB.w, 1.0, f)), lb) * lm;   // far away the rings average to their mean
      float drift = 0.65 * vn(q / vec2(100.0, 150.0) + 53.0) + 0.35 * vn(q / vec2(30.0, 60.0) + 67.0);
      float med = (vn(q / vec2(2.5, 40.0) + 79.0) - 0.5) * bl(2.5, fp);
      float fine = 0.6 * (vn(q / vec2(0.6, 30.0) + 91.0) - 0.5) * bl(0.6, fp) + 0.4 * (vn(q / vec2(0.3, 8.0) + 103.0) - 0.5) * bl(0.3, fp);
      float pore = smoothstep(uWC.w, uWC.w + 0.03, vn(q / uWD.xy + 113.0)) * bl(uWD.x, fp);
      float streak = smoothstep(uWD.w, uWD.w + uWE.x, vn(q / uWE.yz + 127.0)) * bl(uWE.y, fp);
      float lw = (vn(q / vec2(60.0, 60.0) + 139.0) - 0.5) * 2.0;
      float tone = 1.0 - uWB.x * late + uWC.x * med + uWC.y * fine - uWC.z * pore - uWD.z * streak;
      float h = -uWF.x * late + uWF.y * fine * 2.0 - uWF.z * pore - uWG.x * streak + uWF.w * lw;
      return vec4(mix(uC0, uC1, drift) * tone, h);
    }
    void main(){
      if (uMode == 3) { gl_FragColor = vec4(uColor, uAlpha); return; }
      vec3 N = normalize(vN); if (!gl_FrontFacing) N = -N;
      vec3 V = normalize(uCam - vW);
      vec3 col;
      if (uMode == 2) {   // sides: charred ply edge, no bump
        float dl = max(0.0, dot(N, uLight)); float hemi = 0.5 + 0.5 * N.z; float fill = 0.16 * max(0.0, dot(N, V)); vec3 H = normalize(uLight + V);
        col = texture2D(uEdge, vUV).rgb; col *= (0.36 + 0.16 * hemi) + 0.56 * dl + fill; col += vec3(0.10) * pow(max(dot(N, H), 0.0), 20.0); }
      else {
        float c = cos(uGrain), s = sin(uGrain); vec2 p = vec2(c * vUV.x - s * vUV.y, s * vUV.x + c * vUV.y) + uOff * 1000.0;   // wood mm: each instance sits somewhere else on an endless board
        vec3 nt;
        if (uProc > 0.5) {
      #ifdef HAS_DERIV
          float fp = length(fwidth(p)); vec4 wd = wood(p, fp); col = wd.rgb * 1.04;
          vec2 dpx = dFdx(p), dpy = dFdy(p); float dhx = dFdx(wd.a), dhy = dFdy(wd.a); float det = dpx.x * dpy.y - dpx.y * dpy.x;
          vec2 g = abs(det) > 1e-9 ? vec2(dhx * dpy.y - dhy * dpx.y, dhy * dpx.x - dhx * dpy.x) / det : vec2(0.0);   // height gradient in wood mm per mm
      #else
          float fp = 0.5; vec4 wd = wood(p, fp); col = wd.rgb * 1.04; float e = 0.15;
          vec2 g = vec2(wood(p + vec2(e, 0.0), fp).a - wood(p - vec2(e, 0.0), fp).a, wood(p + vec2(0.0, e), fp).a - wood(p - vec2(0.0, e), fp).a) / (2.0 * e);
      #endif
          nt = normalize(vec3(-uWG.y * g, 1.0)); }
        else { vec2 q = p / uK; col = texture2D(uWood, q).rgb * 1.04; nt = texture2D(uNrm, q).xyz * 2.0 - 1.0; }
        nt.xy *= uBump;
        vec2 nl = vec2(c * nt.x + s * nt.y, -s * nt.x + c * nt.y);   // wood frame back into the part's local frame
        vec4 d = vec4(0.0);
        if (uMode == 0) {   // engraving decal, recessed uEngr mm: its alpha gradient tilts the normal at every burnt edge
          vec2 dc = (vLocal - uDecalO) / uDecalS; if (uFlipDecal > 0.5) dc.x = 1.0 - dc.x; d = texture2D(uDecal, dc);
          vec2 e = 1.0 / uDecalPx; float gx = texture2D(uDecal, dc + vec2(e.x, 0.0)).a - texture2D(uDecal, dc - vec2(e.x, 0.0)).a; float gy = texture2D(uDecal, dc + vec2(0.0, e.y)).a - texture2D(uDecal, dc - vec2(0.0, e.y)).a;   // alpha gradient across two texels
          gx *= 0.5 * uDecalPx.x / uDecalS.x; gy *= 0.5 * uDecalPx.y / uDecalS.y; if (uFlipDecal > 0.5) gx = -gx;
          nl += uEngr * vec2(gx, gy); }
        vec3 nloc = vec3(nl, nt.z); if (!gl_FrontFacing) nloc.z = -nloc.z;
        N = normalize(uNrmM * nloc);
        float dl = max(0.0, dot(N, uLight)); float hemi = 0.5 + 0.5 * N.z; float fill = 0.16 * max(0.0, dot(N, V)); vec3 H = normalize(uLight + V);
        col *= (0.50 + 0.16 * hemi) + 0.50 * dl + fill; col += vec3(0.16, 0.14, 0.11) * pow(max(dot(N, H), 0.0), 30.0);
        if (uMode == 0) col = mix(col, d.rgb * (0.55 + 0.45 * dl), d.a);
      }
      col = mix(col, 0.78 + (col - 0.78) * 0.4, step(vec3(0.78), col));   // soft highlight roll-off: midtones untouched, the top 22% compressed so pale wood keeps its grain instead of clipping to white
      if (uMode == 1 && uFog.y > 0.0) col = mix(col, uFogC, smoothstep(uFog.x, uFog.y, distance(vW, uCam)));   // the table fades into the backdrop colour with distance, so its far edge is never seen
      gl_FragColor = vec4(col, uAlpha);
    }`;
  function compile(gl, type, src) { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; }
  const m4mul = (a, b) => { const o = new Float32Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; };

  class GLScene {
    constructor(canvas, opts) {
      this.canvas = canvas; this.opts = Object.assign({ pitch: 48, yaw: 0, dist: 900, cx: 135, cy: 195, cz: 0, view: 420, light: [-0.35, 0.55, 0.75], table: '#3b2a1c', plain: false, dpr: Math.min(2, window.devicePixelRatio || 1) }, opts || {});   // native resolution: MSAA already smooths the edges, and 1.5x supersampling cost 2.25x the fragments
      const gl = this.gl = canvas.getContext('webgl', { antialias: true, stencil: true, alpha: false, premultipliedAlpha: false, preserveDrawingBuffer: false });
      if (!gl) throw new Error('Render3D: WebGL with a stencil buffer is required (Render3D.Scene); use Render3D.CanvasScene explicitly if you want the 2D painter');
      this.aniso = gl.getExtension('EXT_texture_filter_anisotropic') || gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic'); this.maxAniso = this.aniso ? gl.getParameter(this.aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT) : 0;
      this.vaoExt = gl.getExtension('OES_vertex_array_object'); this.curVao = null; this.curBuf = null; this.bound = [null, null, null, null, null]; this.activeUnit = 0; this.uv = {};   // GL state caches: skip redundant binds and uniform sets
      this._M = new Float32Array(16); this._N = new Float32Array(9);
      // overlay canvas for 2D markers
      const ov = this.ov = document.createElement('canvas'); ov.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;'; if (getComputedStyle(canvas.parentNode).position === 'static') canvas.parentNode.style.position = 'relative';   /* a sticky or absolute parent keeps its own positioning (BUMBLE's sticky stage) */ canvas.parentNode.appendChild(ov); this.ctx = ov.getContext('2d');
      this.deriv = !!gl.getExtension('OES_standard_derivatives');
      const prog = this.prog = gl.createProgram(); gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VS)); gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, (this.deriv ? FS_HEAD + '#define HAS_DERIV\n' : '') + FS)); gl.linkProgram(prog); if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog)); gl.useProgram(prog);
      this.a = { pos: gl.getAttribLocation(prog, 'aPos'), nrm: gl.getAttribLocation(prog, 'aNrm'), uv: gl.getAttribLocation(prog, 'aUV') };
      this.u = {}; for (const n of ['uModel', 'uVP', 'uNrmM', 'uZ', 'uWood', 'uDecal', 'uMode', 'uK', 'uAlpha', 'uGrain', 'uOff', 'uDecalO', 'uDecalS', 'uLight', 'uColor', 'uCam', 'uFlipDecal', 'uNrm', 'uBump', 'uEngr', 'uDecalPx', 'uEdge', 'uProc', 'uSeed', 'uC0', 'uC1', 'uFog', 'uFogC', 'uWA', 'uWB', 'uWC', 'uWD', 'uWE', 'uWF', 'uWG']) this.u[n] = gl.getUniformLocation(prog, n);
      this.meshes = new WeakMap(); this.textures = {}; this.static = []; this.dynamic = []; this.overlay = null; this.underlay = null;
      this.texMM = {}; for (const k in WOODP) this.texMM[k] = WOODP[k].px / PXMM; this.userTex = {}; this.woodKind = null;   // texMM only matters for photos set with setTexture()
      this.flatN = this.makeTex(flatNormal(), true);
      for (const k of Object.keys(WOODP)) { this.textures[k] = this.makeTex(swatch(k), true); this.textures[k + '-edge'] = this.makeTex(edgeTexture(k), true); }
      SCENES.push(this); prepareTextures();
      this.white = this.makeTex((() => { const c = document.createElement('canvas'); c.width = c.height = 2; return c; })(), false);
      this.resize();
    }
    makeTex(img, repeat) {
      const gl = this.gl; const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE);
      if (repeat) { gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); } else gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      if (this.aniso) gl.texParameterf(gl.TEXTURE_2D, this.aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, this.maxAniso));
      this.bound[this.activeUnit] = t;
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      return t;
    }
    // cached state setters
    tex(unit, t) { if (this.bound[unit] === t) return; if (this.activeUnit !== unit) { this.gl.activeTexture(this.gl.TEXTURE0 + unit); this.activeUnit = unit; } this.gl.bindTexture(this.gl.TEXTURE_2D, t); this.bound[unit] = t; }
    f1(n, v) { if (this.uv[n] === v) return; this.uv[n] = v; this.gl.uniform1f(this.u[n], v); }
    i1(n, v) { if (this.uv[n] === v) return; this.uv[n] = v; this.gl.uniform1i(this.u[n], v); }
    f2(n, a, b) { const k = n + 'y'; if (this.uv[n] === a && this.uv[k] === b) return; this.uv[n] = a; this.uv[k] = b; this.gl.uniform2f(this.u[n], a, b); }
    setTexture(kind, img) { this.userTex[kind] = true; this.textures[kind] = this.makeTex(img, true); this.texMM[kind] = (img.width || 512) / PXMM; }   // a photo overrides the procedural tile (no normal map)
    applyTiles() { if (this.onTextures) this.onTextures(); }   // kept for callers that gate on it: the wood needs no textures now
    setWood(kind) {   // the veneer parameters of one wood as uniforms (skipped when unchanged)
      if (this.woodKind === kind) return; this.woodKind = kind; const gl = this.gl, u = this.u, P = WOODP[kind] || WOODP.birch;
      gl.uniform4f(u.uWA, P.ring, P.warp[0], P.warp[1], P.warp[2]); gl.uniform4f(u.uWB, P.late, P.lateW[0], P.lateW[1], P.lateW[2]); gl.uniform4f(u.uWC, P.med, P.fine, P.pore, P.poreT);
      gl.uniform4f(u.uWD, P.poreCell[0], P.poreCell[1], P.streak, P.streakT); gl.uniform4f(u.uWE, P.streakW, P.streakCell[0], P.streakCell[1], P.S); gl.uniform4f(u.uWF, P.bump[0], P.bump[1], P.bump[2], P.bump[3]); gl.uniform4f(u.uWG, P.bump[4], P.S, 0, 0);
      gl.uniform3f(u.uC0, P.col[0][0] / 255, P.col[0][1] / 255, P.col[0][2] / 255); gl.uniform3f(u.uC1, P.col[1][0] / 255, P.col[1][1] / 255, P.col[1][2] / 255); gl.uniform2f(u.uSeed, P.seed * 373.1, P.seed * 211.7);
      this.f1('uProc', this.userTex[kind] ? 0 : 1); this.tex(0, this.textures[kind] || this.textures.birch); this.tex(2, this.textures[kind + '-nrm'] || this.flatN); this.f1('uK', this.texMM[kind] || this.texMM.birch);
    }
    resize() {
      const o = this.opts, dpr = o.dpr; const w = this.canvas.clientWidth || 600, h = this.canvas.clientHeight || 800; this.W = w; this.H = h;
      this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr); this.ov.width = this.canvas.width; this.ov.height = this.canvas.height; this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.gl.viewport(0, 0, this.canvas.width, this.canvas.height); this.updateCamera();
    }
    updateCamera() {
      const o = this.opts; const p = o.pitch * Math.PI / 180, yw = o.yaw * Math.PI / 180;
      const d = [Math.sin(p) * Math.sin(yw), Math.sin(p) * Math.cos(yw), Math.cos(p)];
      const pos = [o.cx + o.dist * d[0], o.cy + o.dist * d[1], o.cz + o.dist * d[2]]; const v = [-d[0], -d[1], -d[2]]; const right = [Math.cos(yw), -Math.sin(yw), 0];
      const up = [v[1] * right[2] - v[2] * right[1], v[2] * right[0] - v[0] * right[2], v[0] * right[1] - v[1] * right[0]];
      this.cam = { pos, v, right, up }; this.f = o.dist * (this.H / o.view);
      const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; const bk = [-v[0], -v[1], -v[2]];
      // column-major view matrix
      const V = new Float32Array([right[0], up[0], bk[0], 0, right[1], up[1], bk[1], 0, right[2], up[2], bk[2], 0, -dot(right, pos), -dot(up, pos), -dot(bk, pos), 1]);
      const n = 30, fr = 6000, f = this.f, W = this.W, H = this.H;
      const P = new Float32Array([2 * f / W, 0, 0, 0, 0, 2 * f / H, 0, 0, 0, 0, -(fr + n) / (fr - n), -1, 0, 0, -2 * fr * n / (fr - n), 0]);
      this.VP = m4mul(P, V);
    }
    setView(o) { Object.assign(this.opts, o); this.updateCamera(); }
    project(x, y, z) { const c = this.cam; const rx = x - c.pos[0], ry = y - c.pos[1], rz = z - c.pos[2]; const depth = rx * c.v[0] + ry * c.v[1] + rz * c.v[2]; const sx = rx * c.right[0] + ry * c.right[1] + rz * c.right[2]; const sy = rx * c.up[0] + ry * c.up[1] + rz * c.up[2]; const k = this.f / depth; return [this.W / 2 + sx * k, this.H / 2 - sy * k, depth]; }
    basis(inst) {
      const r = (inst.rot || 0) * Math.PI / 180, c = Math.cos(r), s = Math.sin(r); const sc = inst.scale || 1; const t = inst.thick || T;
      if (inst.vertical) { const N = [-s, c, 0]; return applyGroup({ O: [inst.x - N[0] * t / 2, inst.y - N[1] * t / 2, inst.z], U: [c * sc, s * sc, 0], V: [0, 0, inst.flipV ? sc : -sc], N }, inst.group); }   // flipV: drawing y runs up from z instead of down
      const B = { O: [inst.x, inst.y, inst.z], U: [c * sc, s * sc, 0], V: [-s * sc, c * sc, 0], N: [0, 0, 1] };
      if (inst.flipped && inst.part) {   // turned over about its own x axis: same footprint and height, inside face down
        const bb = inst.part.bbox; const yy = bb[1] + bb[3];
        B.O = [B.O[0] + B.V[0] * yy, B.O[1] + B.V[1] * yy, B.O[2] + t]; B.V = [-B.V[0], -B.V[1], 0]; B.N = [0, 0, -1];
      }
      return applyGroup(B, inst.group);
    }
    world(B, u, v, h) { return [B.O[0] + B.U[0] * u + B.V[0] * v + B.N[0] * h, B.O[1] + B.U[1] * u + B.V[1] * v + B.N[1] * h, B.O[2] + B.U[2] * u + B.V[2] * v + B.N[2] * h]; }
    modelMatrix(B) { const M = this._M; M[0] = B.U[0]; M[1] = B.U[1]; M[2] = B.U[2]; M[3] = 0; M[4] = B.V[0]; M[5] = B.V[1]; M[6] = B.V[2]; M[7] = 0; M[8] = B.N[0]; M[9] = B.N[1]; M[10] = B.N[2]; M[11] = 0; M[12] = B.O[0]; M[13] = B.O[1]; M[14] = B.O[2]; M[15] = 1; return M; }
    normalMatrix(B) { const N = this._N; N[0] = B.U[0]; N[1] = B.U[1]; N[2] = B.U[2]; N[3] = B.V[0]; N[4] = B.V[1]; N[5] = B.V[2]; N[6] = B.N[0]; N[7] = B.N[1]; N[8] = B.N[2]; return N; }
    // ---- per-part GPU data
    mesh(part, mat, tk) {   // one mesh per part and thickness (1.5 mm and 3 mm stock)
      const t = tk || T; let mm = this.meshes.get(part); if (!mm) { mm = {}; this.meshes.set(part, mm); } let m = mm[t]; if (m) return m; const gl = this.gl;
      // side quads as triangles: pos(3) nrm(3) uv(2) ; uv = (arc length, height)
      const side = [];
      for (const c of part.cuts) { const n = c.pts.length; let s0 = 0;
        for (let i = 0; i < n; i++) { const a = c.pts[i], b = c.pts[(i + 1) % n]; const ex = b[0] - a[0], ey = b[1] - a[1]; const len = Math.hypot(ex, ey) || 1e-6; const nx = ey / len, ny = -ex / len;   // outward normal (material on the left)
          const s1 = s0 + len;
          side.push(a[0], a[1], 0, nx, ny, 0, s0, 0,  b[0], b[1], 0, nx, ny, 0, s1, 0,  b[0], b[1], t, nx, ny, 0, s1, t,  a[0], a[1], 0, nx, ny, 0, s0, 0,  b[0], b[1], t, nx, ny, 0, s1, t,  a[0], a[1], t, nx, ny, 0, s0, t); s0 = s1; } }
      const sideBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, sideBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(side), gl.STATIC_DRAW);
      // all contours as one triangle list (fan triangles from each contour's first point): drawn with stencil INVERT this still fills even-odd, in one call
      const fan = []; for (const c of part.cuts) { const p = c.pts; for (let i = 1; i + 1 < p.length; i++) fan.push(p[0][0], p[0][1], 0, 0, 0, 1, p[0][0], p[0][1], p[i][0], p[i][1], 0, 0, 0, 1, p[i][0], p[i][1], p[i + 1][0], p[i + 1][1], 0, 0, 0, 1, p[i + 1][0], p[i + 1][1]); }
      const fanBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, fanBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(fan), gl.STATIC_DRAW);
      const bb = part.bbox; const q = []; for (const [x, y] of [[bb[0], bb[1]], [bb[2], bb[1]], [bb[2], bb[3]], [bb[0], bb[3]]]) q.push(x, y, 0, 0, 0, 1, x, y);
      const quad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quad); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(q), gl.STATIC_DRAW);
      m = { sideBuf: { buf: sideBuf }, sideN: side.length / 8, fan: { buf: fanBuf }, fanN: fan.length / 8, quad: { buf: quad }, decal: null, decalMat: null }; mm[t] = m; return m;
    }
    decal(part, m, mat) {
      if (m.decal && m.decalMat === mat) return m.decal;
      const bb = part.bbox; const w = Math.max(1, bb[2] - bb[0]), h = Math.max(1, bb[3] - bb[1]); const k = Math.min(10, 2000 / Math.max(w, h));
      const c = document.createElement('canvas'); c.width = Math.ceil(w * k); c.height = Math.ceil(h * k); const g = c.getContext('2d'); g.setTransform(k, 0, 0, k, -bb[0] * k, -bb[1] * k);
      const burn = BURN[mat] || BURN.birch, ink = eng(mat);
      for (const e of part.engr) { g.fillStyle = (e.light ? LIGHTFILL : ink) + (0.9 * (e.alpha || 1)).toFixed(2) + ')'; g.beginPath(); for (const poly of (e.polys || [e.pts])) { g.moveTo(poly[0][0], poly[0][1]); for (let i = 1; i < poly.length; i++) g.lineTo(poly[i][0], poly[i][1]); g.closePath(); } g.fill('evenodd'); }
      for (const l of part.lines) { g.strokeStyle = ink + '0.75)'; g.lineWidth = Math.max(0.25, l.w); g.lineCap = 'round'; g.beginPath(); g.moveTo(l.pts[0][0], l.pts[0][1]); for (let i = 1; i < l.pts.length; i++) g.lineTo(l.pts[i][0], l.pts[i][1]); if (l.closed) g.closePath(); g.stroke(); }
      for (const tx of part.texts) { g.save(); g.transform(tx.ax[0], tx.ax[1], tx.ay[0], tx.ay[1], tx.x, tx.y); g.font = `${tx.weight === 'bold' ? 'bold ' : ''}${tx.italic ? 'italic ' : ''}${tx.size}px Georgia, "Times New Roman", serif`; g.textAlign = tx.anchor === 'middle' ? 'center' : tx.anchor === 'end' ? 'right' : 'left'; if ('letterSpacing' in g) g.letterSpacing = tx.spacing + 'px'; g.fillStyle = (tx.light ? LIGHTFILL : ink) + '0.9)'; g.fillText(tx.text, 0, 0); g.restore(); }
      g.strokeStyle = burn + '0.6)'; g.lineWidth = 0.3; g.beginPath(); for (const cc of part.cuts) { g.moveTo(cc.pts[0][0], cc.pts[0][1]); for (let i = 1; i < cc.pts.length; i++) g.lineTo(cc.pts[i][0], cc.pts[i][1]); g.closePath(); } g.stroke();   // charred edge line
      m.decal = this.makeTex(c, false); m.decalMat = mat; m.decalO = [bb[0], bb[1]]; m.decalS = [w, h]; m.decalPx = [c.width, c.height]; return m.decal;
    }
    backDecal(part, backPart, m, mat) {   // one texture per (mesh, back part): many plugs share one mesh but carry different symbols underneath
      m.backs = m.backs || new Map(); const key = backPart; if (m.backs.has(key)) return m.backs.get(key);
      const bb = part.bbox; const w = Math.max(1, bb[2] - bb[0]), h = Math.max(1, bb[3] - bb[1]); const k = Math.min(10, 2000 / Math.max(w, h));
      const c = document.createElement('canvas'); c.width = Math.ceil(w * k); c.height = Math.ceil(h * k); const g = c.getContext('2d'); g.setTransform(k, 0, 0, k, -bb[0] * k, -bb[1] * k);
      const burn = BURN[mat] || BURN.birch, ink = eng(mat);
      for (const e of backPart.engr) { g.fillStyle = ink + '0.9)'; g.beginPath(); for (const poly of (e.polys || [e.pts])) { g.moveTo(poly[0][0], poly[0][1]); for (let i = 1; i < poly.length; i++) g.lineTo(poly[i][0], poly[i][1]); g.closePath(); } g.fill('evenodd'); }
      for (const l of backPart.lines) { g.strokeStyle = ink + '0.75)'; g.lineWidth = Math.max(0.25, l.w); g.beginPath(); g.moveTo(l.pts[0][0], l.pts[0][1]); for (let i = 1; i < l.pts.length; i++) g.lineTo(l.pts[i][0], l.pts[i][1]); if (l.closed) g.closePath(); g.stroke(); }
      for (const tx of backPart.texts) { g.save(); g.transform(tx.ax[0], tx.ax[1], tx.ay[0], tx.ay[1], tx.x, tx.y); g.font = `${tx.weight === 'bold' ? 'bold ' : ''}${tx.italic ? 'italic ' : ''}${tx.size}px Georgia, "Times New Roman", serif`; g.textAlign = tx.anchor === 'middle' ? 'center' : tx.anchor === 'end' ? 'right' : 'left'; if ('letterSpacing' in g) g.letterSpacing = tx.spacing + 'px'; g.fillStyle = ink + '0.9)'; g.fillText(tx.text, 0, 0); g.restore(); }
      const tex = this.makeTex(c, false); m.backs.set(key, tex); return tex;
    }
    bindAttribs(b) {   // b = { buf, vao }: with OES_vertex_array_object the pointers are set once per buffer and rebinding is one call
      if (this.vaoExt) { if (!b.vao) { b.vao = this.vaoExt.createVertexArrayOES(); this.vaoExt.bindVertexArrayOES(b.vao); this.pointers(b.buf); this.curVao = b.vao; return; } if (this.curVao !== b.vao) { this.vaoExt.bindVertexArrayOES(b.vao); this.curVao = b.vao; } return; }
      if (this.curBuf === b.buf) return; this.pointers(b.buf); this.curBuf = b.buf;
    }
    pointers(buf) { const gl = this.gl; gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.enableVertexAttribArray(this.a.pos); gl.vertexAttribPointer(this.a.pos, 3, gl.FLOAT, false, 32, 0); gl.enableVertexAttribArray(this.a.nrm); gl.vertexAttribPointer(this.a.nrm, 3, gl.FLOAT, false, 32, 12); gl.enableVertexAttribArray(this.a.uv); gl.vertexAttribPointer(this.a.uv, 2, gl.FLOAT, false, 32, 24); }
    // draw one face (h = 0 bottom or t top) of a part using the stencil even-odd trick
    face(m, h, mode) {
      const gl = this.gl; this.f1('uZ', h);
      gl.enable(gl.STENCIL_TEST); gl.colorMask(false, false, false, false); gl.depthMask(false); gl.stencilMask(1); gl.stencilFunc(gl.ALWAYS, 0, 1); gl.stencilOp(gl.KEEP, gl.KEEP, gl.INVERT); gl.disable(gl.DEPTH_TEST);
      this.bindAttribs(m.fan); gl.drawArrays(gl.TRIANGLES, 0, m.fanN);
      gl.enable(gl.DEPTH_TEST); if (!this.depthOnly) gl.colorMask(true, true, true, true); gl.depthMask(true); gl.stencilFunc(gl.EQUAL, 1, 1); gl.stencilOp(gl.ZERO, gl.ZERO, gl.ZERO);
      this.i1('uMode', mode); this.bindAttribs(m.quad); gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
      gl.disable(gl.STENCIL_TEST); this.f1('uZ', 0);
    }
    drawInstance(inst) {
      if (inst.hidden || !inst.part) return; const gl = this.gl, u = this.u; const part = inst.part; const mat = inst.mat || 'birch'; const B = this.basis(inst); const t = inst.thick || T; const m = this.mesh(part, mat, t);
      gl.uniformMatrix4fv(u.uModel, false, this.modelMatrix(B)); gl.uniformMatrix3fv(u.uNrmM, false, this.normalMatrix(B));
      const alpha = inst.alpha === undefined ? 1 : inst.alpha; this.f1('uAlpha', alpha); if (alpha < 1 && !this.depthOnly) { gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); } else gl.disable(gl.BLEND);
      if (this.depthOnly) gl.colorMask(false, false, false, false);
      const seed = (inst.id || 0) * 37.7; this.f2('uOff', (seed * 13 % 512) / 512, (seed * 7 % 512) / 512); this.f1('uGrain', ((inst.grain !== undefined ? inst.grain : (((inst.id || 0) * 23) % 7 - 3)) * Math.PI / 180));
      // sides
      this.tex(4, this.textures[mat + '-edge'] || this.textures['birch-edge']); this.i1('uEdge', 4); this.i1('uWood', 0); this.i1('uMode', 2);   // the edge texture keeps its own unit, so the wood stays bound on unit 0 across instances
      this.bindAttribs(m.sideBuf); this.f1('uZ', 0); gl.drawArrays(gl.TRIANGLES, 0, m.sideN);
      // faces: wood texture + decal on top
      // make (or fetch) the decal textures first: creating one binds it on the active unit, so the wood is bound afterwards
      const dec = this.decal(part, m, mat); const bd = inst.noBottom !== true && inst.back ? this.backDecal(part, inst.back, m, mat) : null;
      this.setWood(mat); this.i1('uNrm', 2); this.f1('uBump', 1); this.f1('uEngr', 0.3);
      this.tex(1, dec); this.i1('uDecal', 1); this.f2('uDecalO', m.decalO[0], m.decalO[1]); this.f2('uDecalS', m.decalS[0], m.decalS[1]); this.f2('uDecalPx', m.decalPx[0], m.decalPx[1]);
      this.f1('uFlipDecal', 0); this.face(m, t, 0);
      if (inst.noBottom !== true) { if (bd) { this.tex(1, bd); this.f1('uFlipDecal', 1); this.face(m, 0, 0); this.f1('uFlipDecal', 0); } else this.face(m, 0, 1); }
      gl.disable(gl.BLEND); if (this.depthOnly) gl.colorMask(true, true, true, true);
    }
    shadow(inst) {
      // a soft contact shadow on the table: the part's outline projected straight down onto z = 0, drawn three times, each pass a little larger and
      // fainter, all of them spreading and fading with the part's height, so a lifted piece throws a wide faint pool and a resting one a tight dark rim.
      // Depth-tested, so a floor the piece sits on hides it. Vertical parts (walls, standees) cast none.
      if (inst.hidden || !inst.part || inst.vertical || inst.shadow === false) return; const gl = this.gl, u = this.u; const m = this.mesh(inst.part, inst.mat, inst.thick || T);
      const B = this.basis(inst), bb = inst.part.bbox, cu = (bb[0] + bb[2]) / 2, cv = (bb[1] + bb[3]) / 2, t = inst.thick || T;
      const c = this.world(B, cu, cv, t / 2); const h = Math.max(0, c[2] - t / 2); if (h > 400) return;
      const U = [B.U[0], B.U[1], 0], V = [B.V[0], B.V[1], 0]; const lift = 1 + h / 28;
      this.i1('uMode', 3); gl.uniform3f(u.uColor, 0, 0, 0); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false); gl.uniformMatrix3fv(u.uNrmM, false, new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]));
      for (let k = 0; k < 3; k++) {
        const sc = 1 + (0.02 + 0.03 * k) * lift, a = [0.12, 0.07, 0.045][k] / (1 + h / 50);
        const M = this._M; M[0] = U[0] * sc; M[1] = U[1] * sc; M[2] = 0; M[3] = 0; M[4] = V[0] * sc; M[5] = V[1] * sc; M[6] = 0; M[7] = 0; M[8] = 0; M[9] = 0; M[10] = 1; M[11] = 0;
        M[12] = c[0] - (U[0] * cu + V[0] * cv) * sc; M[13] = c[1] - (U[1] * cu + V[1] * cv) * sc; M[14] = 0.05 + 0.02 * k; M[15] = 1; gl.uniformMatrix4fv(u.uModel, false, M);
        this.f1('uAlpha', a);
        gl.enable(gl.STENCIL_TEST); gl.colorMask(false, false, false, false); gl.stencilMask(1); gl.stencilFunc(gl.ALWAYS, 0, 1); gl.stencilOp(gl.KEEP, gl.KEEP, gl.INVERT); gl.disable(gl.DEPTH_TEST); this.f1('uZ', 0);
        this.bindAttribs(m.fan); gl.drawArrays(gl.TRIANGLES, 0, m.fanN);
        gl.enable(gl.DEPTH_TEST); gl.colorMask(true, true, true, true); gl.stencilFunc(gl.EQUAL, 1, 1); gl.stencilOp(gl.ZERO, gl.ZERO, gl.ZERO); this.bindAttribs(m.quad); gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
        gl.disable(gl.STENCIL_TEST);
      }
      gl.depthMask(true); gl.disable(gl.BLEND);
    }
    render() {
      const gl = this.gl, u = this.u; gl.useProgram(this.prog);
      const tc = this.opts.table; const r = parseInt(tc.slice(1, 3), 16) / 255, g = parseInt(tc.slice(3, 5), 16) / 255, b = parseInt(tc.slice(5, 7), 16) / 255;
      gl.clearColor(r, g, b, 1); gl.clearStencil(0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
      const fog = this.opts.fog || [0, 0]; gl.uniform2f(u.uFog, fog[0], fog[1]); gl.uniform3f(u.uFogC, r, g, b);   // opts.fog = [near, far] mm from the camera; the fog colour is the clear colour
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.disable(gl.CULL_FACE); gl.frontFace(gl.CW);   // the world basis (x right, y toward the viewer, z up) is left-handed, so front faces wind clockwise
      gl.uniformMatrix4fv(u.uVP, false, this.VP); const L = this.opts.light; const ln = Math.hypot(...L); gl.uniform3f(u.uLight, L[0] / ln, L[1] / ln, L[2] / ln); gl.uniform3f(u.uCam, this.cam.pos[0], this.cam.pos[1], this.cam.pos[2]);
      this.uv = {}; this.bound = [null, null, null, null, null]; this.activeUnit = -1; this.curVao = null; this.curBuf = null; this.woodKind = null; this.f1('uFlipDecal', 0);   // caches start clean each frame
      // table: a big textured quad just under the floor, only while the camera is above it
      const ta = this.opts.tableAlpha === undefined ? 1 : this.opts.tableAlpha;   // opts.tableAlpha fades the table in (BUMBLE's scroll-driven opening)
      if (!this.opts.plain && WOODP.table && this.cam.pos[2] > 0 && ta > 0) { this.setWood('table'); this.i1('uWood', 0); this.i1('uMode', 1); this.f1('uAlpha', ta); if (ta < 1) { gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); } else gl.disable(gl.BLEND); this.f1('uGrain', 0); this.f2('uOff', 0, 0); this.f1('uZ', 0); this.f1('uBump', 1); this.f1('uEngr', 0); this.i1('uNrm', 2);
        gl.uniformMatrix4fv(u.uModel, false, new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -0.05, 1])); gl.uniformMatrix3fv(u.uNrmM, false, new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]));
        if (!this.tableBuf) { const q = []; for (const [x, y] of [[-6000, -6000], [6400, -6000], [6400, 6400], [-6000, 6400]]) q.push(x, y, 0, 0, 0, 1, x, y);   /* wide enough that no viewport shows the quad's edge (a dark wedge appeared at 1900 px with ±1000 mm) */ const tb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, tb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(q), gl.STATIC_DRAW); this.tableBuf = { buf: tb }; }
        this.bindAttribs(this.tableBuf); gl.drawArrays(gl.TRIANGLE_FAN, 0, 4); gl.disable(gl.BLEND); }
      const order = [], late = []; for (const inst of this.static) if (!inst.hidden && inst.part) (inst.alpha !== undefined && inst.alpha < 1 ? late : order).push(inst); for (const inst of this.dynamic) if (!inst.hidden && inst.part) (inst.alpha !== undefined && inst.alpha < 1 ? late : order).push(inst);
      order.sort((a, b) => (b.z + (b.vertical ? 30 : 0)) - (a.z + (a.vertical ? 30 : 0)));   // highest first: wheels before the floor, so the floor under them is depth-rejected before shading; translucent ones last
      for (const inst of order) this.drawInstance(inst);
      if (late.length) {   // translucent instances: a depth-only pass, then colour with LEQUAL, so each pixel shows the nearest face at the instance's alpha rather than every face behind it (a box fades as one object, not an x-ray)
        this.depthOnly = true; for (const inst of late) this.drawInstance(inst); this.depthOnly = false;
        for (const inst of late) this.drawInstance(inst);
      }
      if (!this.opts.plain) { for (const inst of this.static) this.shadow(inst); for (const inst of this.dynamic) this.shadow(inst); }
      // 2D overlay
      const ctx = this.ctx; ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, this.ov.width, this.ov.height); ctx.restore(); ctx.setTransform(this.opts.dpr, 0, 0, this.opts.dpr, 0, 0);
      if (this.overlay) this.overlay(ctx);
    }
    ring(ctx, x, y, z, r, color, width, alpha) { ctx.save(); ctx.globalAlpha = alpha === undefined ? 1 : alpha; ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath(); for (let k = 0; k <= 40; k++) { const a = 2 * Math.PI * k / 40; const p = this.project(x + r * Math.cos(a), y + r * Math.sin(a), z); if (k === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]); } ctx.stroke(); ctx.restore(); }
    disc(ctx, x, y, z, r, color, alpha) { ctx.save(); ctx.globalAlpha = alpha === undefined ? 1 : alpha; ctx.fillStyle = color; ctx.beginPath(); for (let k = 0; k <= 30; k++) { const a = 2 * Math.PI * k / 30; const p = this.project(x + r * Math.cos(a), y + r * Math.sin(a), z); if (k === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]); } ctx.fill(); ctx.restore(); }
    label(ctx, x, y, z, text, size, color) { const p = this.project(x, y, z); ctx.save(); ctx.font = `bold ${size}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.fillStyle = color; ctx.fillText(text, p[0], p[1]); ctx.restore(); }
    pick(px, py, radius) { let best = null; for (const inst of this.dynamic) { if (!inst.pickable) continue; const p = this.project(inst.x, inst.y, inst.z + (inst.thick || T)); const d = Math.hypot(p[0] - px, p[1] - py); if (d < radius && (!best || d < best.d)) best = { inst, d }; } return best && best.inst; }
  }

  function shade(hex, k) { const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16); return `rgb(${Math.round(r * k)},${Math.round(g * k)},${Math.round(b * k)})`; }
  /* Scene is the WebGL scene; its constructor throws when the browser has no WebGL with a stencil buffer (no automatic fallback: the owner's rule
     is to fail loudly; Render3D.CanvasScene is the 2D painter, chosen explicitly). No probe context is made up front: creating a throwaway WebGL
     context cost a second on the page's first load, before anything was drawn. */
  let probed = null; const hasGL = () => { if (probed === null) { try { const c = document.createElement('canvas'); probed = !!c.getContext('webgl', { stencil: true }); } catch (e) { probed = false; } } return probed; };
  return { parsePart, applyGroup, Scene: GLScene, CanvasScene: Scene, GLScene, flattenPath, T, hasGL, prepareTextures, WOODP, genWoodTile };
}));
