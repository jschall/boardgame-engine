#!/usr/bin/env node
// fitcheck.js: interference checker for laser-cut parts placed in 3D scenes (closed box, packed box, table during play, assemblies).
// Rasterises every part's solid at RES mm from its cut outline (holes respected), places it exactly as render3d's basis() does, and
// samples every part's volume against every other part's volume. Overlap deeper than `contact` mm is INTERFERENCE (exit 1); shallower is a listed contact.
// Usage: node fitcheck.js parts/parts.json scenes.js [--res 0.2] [--contact 0.3] [--kerf 0.15]
//   When parts.json says meta.kerf_comp == "file" (outlines offset out and holes in by kerf/2 so the laser cuts finished sizes), every part is eroded by
//   meta.kerf/2 (or --kerf/2) back to finished size before rasterising, so fits are judged as they will be cut, not as drawn.
//   parts.json: {"parts": {pid: "<inner svg>"}, ...}   (what lasergeom's write_parts / Layout.write produces)
//   scenes.js : module.exports = [{ name, insts: [{ name, pid, x, y, z, rot, vertical, flipped, flipV, thick, group }] }]  or  module.exports = (PARTS) => [...]
//               group: { angle, pivot: [x,y,z], axis: [ax,ay,az] } or an array of groups (see render3d applyGroup); a scenes.json file works too.
'use strict';
const fs = require('fs'), path = require('path');
const args = process.argv.slice(2); const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? +args[i + 1] : d; };
const files = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
if (files.length < 2) { console.error('usage: node fitcheck.js parts.json scenes.js [--res 0.2] [--contact 0.3]'); process.exit(2); }
const RES = opt('--res', 0.2), CONTACT = opt('--contact', 0.3);
const KERF_ARG = args.includes('--kerf') ? opt('--kerf', 0) : null;

// ---- a tiny DOM so render3d's SVG parser runs in node
class El { constructor(tag, attrs) { this.tagName = tag; this.attrs = attrs; this.children = []; this.textContent = ''; } getAttribute(n) { return n in this.attrs ? this.attrs[n] : null; } }
function parseXML(src) {
  const root = new El('#root', {}); const stack = [root]; let i = 0; const dec = s => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#(\d+);/g, (m, d) => String.fromCharCode(+d));
  while (i < src.length) {
    const lt = src.indexOf('<', i); if (lt < 0) break;
    if (lt > i) { const t = src.slice(i, lt); if (t.trim()) stack[stack.length - 1].textContent += dec(t); }
    if (src.startsWith('<!--', lt)) { i = src.indexOf('-->', lt) + 3; continue; }
    if (src.startsWith('<?', lt)) { i = src.indexOf('?>', lt) + 2; continue; }
    const gt = src.indexOf('>', lt); const body = src.slice(lt + 1, gt); i = gt + 1;
    if (body[0] === '/') { stack.pop(); continue; }
    const selfClose = body.endsWith('/'); const b = selfClose ? body.slice(0, -1) : body;
    const m = b.match(/^([\w:-]+)\s*([\s\S]*)$/); const attrs = {}; const re = /([\w:-]+)\s*=\s*"([^"]*)"/g; let a;
    while ((a = re.exec(m[2]))) attrs[a[1]] = dec(a[2]);
    const el = new El(m[1], attrs); stack[stack.length - 1].children.push(el); if (!selfClose) stack.push(el);
  }
  return root;
}
global.DOMParser = class { parseFromString(s) { const r = parseXML(s); return { documentElement: r.children[0] }; } };
const R3 = require(path.join(__dirname, '..', 'lib', 'render3d.js'));   // the skill's synced copy of the canonical renderer: one parser for every check
const DATA = JSON.parse(fs.readFileSync(files[0], 'utf8')); const PARTS = DATA.parts; const META = DATA.meta || {};
// kerf compensation in the file: erode each part by half ITS kerf (kerf is per sheet/stock: basswood, walnut and 1.5 mm cut differently).
// parts.json contract: meta.kerf_comp "file", meta.part_kerf {pid: kerf} (lasergeom from 2026-09-15) or, for older files, a single numeric meta.kerf.
const IN_FILE = META.kerf_comp === 'file';
function kerfOf(id) {
  if (KERF_ARG !== null) return KERF_ARG;
  if (!IN_FILE) return 0;
  if (META.part_kerf) { const k = META.part_kerf[id]; if (typeof k !== 'number') throw new Error(`parts.json meta.part_kerf has no entry for ${id}`); return k; }
  if (typeof META.kerf === 'number') return META.kerf;
  throw new Error('parts.json says kerf_comp "file" but has neither meta.part_kerf {pid: kerf} nor a numeric meta.kerf (or pass --kerf)');
}
const ERODE = IN_FILE || KERF_ARG !== null ? 1 : 0;
let LG = null;
function lasergeom() { if (LG) return LG; const f = path.join(__dirname, '..', 'lib', 'lasergeom.js'); return (LG = require(f)); }
function erodeCuts(cuts, d) {   // cuts: [{pts, hole}] in file geometry -> the same shape shrunk by d (holes grow), as a list of {pts, hole}
  const lg = lasergeom(); const poly = pts => { let p = lg.Polygon(pts); if (!p.is_valid) p = lg.make_valid(p); return p; };
  let g = null, h = null; for (const c of cuts) { const p = poly(c.pts); if (p.is_empty) continue; if (c.hole) h = h ? h.union(p) : p; else g = g ? g.union(p) : p; }   // outers first, then holes: the parser may list a hole before its outer
  if (!g) return cuts; if (h) g = g.difference(h); g = g.buffer(-d); const out = [];
  const strip = coords => coords.slice(0, -1).map(([x, y]) => [x, y]);
  for (const p of (g.geoms ? [...g.geoms] : [g])) { if (p.is_empty || p.geom_type !== 'Polygon') continue; out.push({ pts: strip(p.exterior.coords), hole: false }); for (const r of p.interiors) out.push({ pts: strip(r.coords), hole: true }); }
  return out;
}
if (ERODE) console.log(`kerf compensation in the file: eroding every part by half its kerf (${META.part_kerf ? 'per part, from meta.part_kerf' : KERF_ARG !== null ? KERF_ARG + ' mm' : META.kerf + ' mm'}) to finished size`);
let scenes = files[1].endsWith('.json') ? JSON.parse(fs.readFileSync(files[1], 'utf8')) : require(path.resolve(files[1]));
if (typeof scenes === 'function') scenes = scenes(PARTS, DATA);

// ---- parts and their rasterised solids
const cache = new Map();
function part(id) {
  if (cache.has(id)) return cache.get(id);
  if (!PARTS[id]) throw new Error('no part ' + id);
  const p = R3.parsePart('<svg xmlns="http://www.w3.org/2000/svg">' + PARTS[id] + '</svg>'); p.id = id;
  if (!p.cuts.length) throw new Error('part ' + id + ' has no cut outline');
  const ero = ERODE ? kerfOf(id) / 2 : 0;
  if (ero > 0) { p.cuts = erodeCuts(p.cuts, ero); let minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9; for (const c of p.cuts) for (const [x, y] of c.pts) { minx = Math.min(minx, x); maxx = Math.max(maxx, x); miny = Math.min(miny, y); maxy = Math.max(maxy, y); } p.bbox = [minx, miny, maxx, maxy]; }
  const bb = p.bbox; const W = Math.ceil((bb[2] - bb[0]) / RES) + 2, H = Math.ceil((bb[3] - bb[1]) / RES) + 2;
  const mask = new Uint8Array(W * H); const edges = [];
  for (const c of p.cuts) { const n = c.pts.length; for (let k = 0; k < n; k++) { const a = c.pts[k], q = c.pts[(k + 1) % n]; if (a[1] !== q[1]) edges.push([a[0], a[1], q[0], q[1]]); } }
  for (let j = 0; j < H; j++) {
    const y = bb[1] + (j + 0.5) * RES; const xs = [];
    for (const [x0, y0, x1, y1] of edges) if ((y0 <= y) !== (y1 <= y)) xs.push(x0 + (y - y0) * (x1 - x0) / (y1 - y0));
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) { const i0 = Math.max(0, Math.ceil((xs[k] - bb[0]) / RES - 0.5)), i1 = Math.min(W - 1, Math.floor((xs[k + 1] - bb[0]) / RES - 0.5)); for (let i = i0; i <= i1; i++) mask[j * W + i] = 1; }
  }
  const solid = new Uint8Array(W * H);   // eroded by one cell so exact-fit joints do not register
  for (let j = 1; j < H - 1; j++) for (let i = 1; i < W - 1; i++) { const o = j * W + i; if (mask[o] && mask[o - 1] && mask[o + 1] && mask[o - W] && mask[o + W]) solid[o] = 1; }
  p.raster = { W, H, mask, solid }; cache.set(id, p); return p;
}
function inside(p, u, v) { const r = p.raster, bb = p.bbox; const i = Math.floor((u - bb[0]) / RES), j = Math.floor((v - bb[1]) / RES); if (i < 0 || j < 0 || i >= r.W || j >= r.H) return false; return r.solid[j * r.W + i] === 1; }
const thick = inst => inst.thick || 3.0;
function basis(inst) {   // identical to render3d GLScene.basis
  const r = (inst.rot || 0) * Math.PI / 180, c = Math.cos(r), s = Math.sin(r); const t = thick(inst);
  if (inst.vertical) { const N = [-s, c, 0]; return R3.applyGroup({ O: [inst.x - N[0] * t / 2, inst.y - N[1] * t / 2, inst.z], U: [c, s, 0], V: [0, 0, inst.flipV ? 1 : -1], N }, inst.group); }
  const B = { O: [inst.x, inst.y, inst.z], U: [c, s, 0], V: [-s, c, 0], N: [0, 0, 1] };
  if (inst.flipped) { const bb = inst.part.bbox; const yy = bb[1] + bb[3]; B.O = [B.O[0] + B.V[0] * yy, B.O[1] + B.V[1] * yy, B.O[2] + t]; B.V = [-B.V[0], -B.V[1], 0]; B.N = [0, 0, -1]; }
  return R3.applyGroup(B, inst.group);
}
const world = (B, u, v, h) => [B.O[0] + B.U[0] * u + B.V[0] * v + B.N[0] * h, B.O[1] + B.U[1] * u + B.V[1] * v + B.N[1] * h, B.O[2] + B.U[2] * u + B.V[2] * v + B.N[2] * h];
function local(B, p) { const d = [p[0] - B.O[0], p[1] - B.O[1], p[2] - B.O[2]]; return [d[0] * B.U[0] + d[1] * B.U[1] + d[2] * B.U[2], d[0] * B.V[0] + d[1] * B.V[1] + d[2] * B.V[2], d[0] * B.N[0] + d[1] * B.N[1] + d[2] * B.N[2]]; }
function aabb(inst) {
  const B = basis(inst), bb = inst.part.bbox; const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  for (const u of [bb[0], bb[2]]) for (const v of [bb[1], bb[3]]) for (const h of [0, thick(inst)]) { const w = world(B, u, v, h); for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], w[k]); hi[k] = Math.max(hi[k], w[k]); } }
  return { lo, hi, B };
}
function cells(inst) { const r = inst.part.raster; let n = 0; for (let k = 0; k < r.solid.length; k++) n += r.solid[k]; return n; }
function edgeDist(p, u, v) {
  let best = 1e9;
  for (const cnt of p.cuts) { const n = cnt.pts.length; for (let k = 0; k < n; k++) { const a = cnt.pts[k], b = cnt.pts[(k + 1) % n]; const dx = b[0] - a[0], dy = b[1] - a[1]; const L2 = dx * dx + dy * dy || 1e-9;
    let t = ((u - a[0]) * dx + (v - a[1]) * dy) / L2; t = Math.max(0, Math.min(1, t)); const ex = a[0] + t * dx - u, ey = a[1] + t * dy - v; const d = ex * ex + ey * ey; if (d < best) best = d; } }
  return Math.sqrt(best);
}
function overlap(A, Bi, box) {   // volume of A inside Bi, sampling A's solid cells at three heights
  const pa = A.part, ra = pa.raster, bb = pa.bbox; const BA = A.ab.B, BB = Bi.ab.B; const tA = thick(A), tB = thick(Bi); let hits = 0, first = null, deep = 0;
  for (let j = 0; j < ra.H; j++) for (let i = 0; i < ra.W; i++) {
    if (!ra.solid[j * ra.W + i]) continue;
    const u = bb[0] + (i + 0.5) * RES, v = bb[1] + (j + 0.5) * RES;
    for (const h of [tA / 6, tA / 2, 5 * tA / 6]) {
      const w = world(BA, u, v, h);
      if (w[0] < box.lo[0] || w[0] > box.hi[0] || w[1] < box.lo[1] || w[1] > box.hi[1] || w[2] < box.lo[2] || w[2] > box.hi[2]) continue;
      const l = local(BB, w); if (l[2] <= 0.05 * tB || l[2] >= tB * 0.95) continue;
      if (inside(Bi.part, l[0], l[1])) { hits++; const d = Math.min(edgeDist(Bi.part, l[0], l[1]), l[2], tB - l[2]); if (d > deep) { deep = d; first = w.map(x => +x.toFixed(1)); } }
    }
  }
  return { vol: hits * RES * RES * (tA / 3), hits, first, deep };
}
function check(name, insts) {
  for (const it of insts) { it.part = part(it.pid); it.ab = aabb(it); it.n = cells(it); }
  const bad = [], touch = []; let pairs = 0;
  for (let a = 0; a < insts.length; a++) for (let b = a + 1; b < insts.length; b++) {
    const A = insts[a], Bi = insts[b]; const lo = [], hi = []; let ok = true;
    for (let k = 0; k < 3; k++) { lo[k] = Math.max(A.ab.lo[k], Bi.ab.lo[k]) - 0.01; hi[k] = Math.min(A.ab.hi[k], Bi.ab.hi[k]) + 0.01; if (hi[k] - lo[k] < CONTACT) ok = false; }
    if (!ok) continue; pairs++;
    const [S, Lg] = A.n <= Bi.n ? [A, Bi] : [Bi, A]; const r = overlap(S, Lg, { lo, hi });
    if (r.hits >= 2) (r.deep < CONTACT ? touch : bad).push({ a: A.name, b: Bi.name, vol: r.vol, at: r.first, deep: r.deep });
  }
  bad.sort((x, y) => y.vol - x.vol); touch.sort((x, y) => y.deep - x.deep);
  console.log(`${name}: ${insts.length} parts, ${pairs} close pairs, ${bad.length ? bad.length + ' INTERFERENCE' : 'no interference'}${touch.length ? `, ${touch.length} light contacts (under ${CONTACT} mm)` : ''}`);
  for (const x of bad) console.log(`   ${x.a} × ${x.b}: ${x.vol.toFixed(1)} mm³, ${x.deep.toFixed(2)} mm deep near (${x.at.join(', ')})`);
  for (const x of touch.slice(0, 20)) console.log(`   contact ${x.a} × ${x.b}: ${x.deep.toFixed(2)} mm near (${x.at.join(', ')})`);
  return bad.length;
}
let fails = 0;
for (const sc of scenes) fails += check(sc.name, sc.insts.map((o, i) => Object.assign({ name: o.name || `${o.pid}#${i}`, x: 0, y: 0, z: 0, rot: 0 }, o)));
process.exit(fails ? 1 : 0);
