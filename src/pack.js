#!/usr/bin/env node
/* pack.js (boardgame-engine): does every playing piece fit inside the closed shoulder box?

   Reads the cut outlines and sheet layout from a parts.json (it never runs the generator), packs the pieces the way a person would (piles by
   kind: boards flat on the bottom, tiles in stacks, tokens by kind, standees flat in the gaps) with the real cut outlines, then verifies the result
   independently, piece by piece, as 3D prisms. Writes packing.json and pack/layer-N.png (SVG rendered by rsvg-convert).
   The piles come from the game's pack.js when it has one (module.exports = ctx => { columns, place, flat_top, clearance }), else from META.part_kind.

     node engine/bin/bg.js pack [parts/parts.json] [--out DIR]      (DIR defaults to the game folder: DIR/packing.json, DIR/pack/layer-N.png)

   The interior follows the stock thickness recorded in parts.json META: the floor top is FLOOR_UP + T (basswood), the neck boards are
   the walnut thickness (META.TW, else T) and stand NECK_CL in from the tray walls, the neck is NECK_H tall, and the lid's floor inside
   face sits WALL_H - FLOOR_UP - T beyond its rim. With NECK_H = 2 WALL_H + GAP - 2 (FLOOR_UP + T) the neck top meets the lid floor
   at any T, so the usable height is 2 WALL_H + GAP - 2 (FLOOR_UP + T): 40 mm at T = 3.0, 40.66 at 2.67; the interior width is
   INNER - 2 (NECK_CL + TW). Stack heights are nominal thickness (T, TW for walnut sheets, THIN) + 0.2 mm tolerance. */
'use strict';
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const lg = require('../lib/lasergeom.js');
const SP = require('./svgparts.js');
const cut_view = require('./cut_view.js');
const { box: sbox, unary_union, affinity, polys, Polygon, pyround } = lg;

module.exports = function pack(GAME_DIR, argv) {
const HERE = GAME_DIR;
const opt = (k, d) => { const i = argv.indexOf(k); if (i < 0) return d; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const OUTDIR = opt('--out', HERE);
const PARTS_FILE = argv[0] || path.join(HERE, 'parts', 'parts.json');
const t_start = Date.now();
const CFG = JSON.parse(fs.readFileSync(path.join(HERE, 'game.json'), 'utf8'));

// ------------------------------------------------------------------ parts
const PJ = JSON.parse(fs.readFileSync(PARTS_FILE, 'utf8'));
const LAYOUT = PJ.layout, META = PJ.meta;
// meta.kerf_comp 'file': the cut paths in parts.json are the outlines grown by kerf / 2 (holes shrunk); erode them back to finished size.
if (META.kerf_comp !== 'file') throw new Error(`${PARTS_FILE} META.kerf_comp is ${META.kerf_comp}: the packer takes files that carry their own kerf`);
const KERF_FILE = true;
for (const k of ['stocks', 'box_stock', 'neck_stock', 'part_stock', 'part_kerf', 'leaf_slots', 'INNER', 'WALL_H', 'FLOOR_UP', 'GAP', 'NECK_H', 'NECK_CL', 'NECK_OUT']) if (META[k] === undefined) throw new Error(`${PARTS_FILE} META.${k} is missing: rebuild the parts`);
const kerf_of = pid => { const k = META.part_kerf[pid]; if (!(k > 0)) throw new Error(`${PARTS_FILE} META.part_kerf has no kerf for ${pid}`); return k; };
const OUTLINES = {};
for (const [pid, inner] of Object.entries(PJ.parts)) {
  const model = META.leaf_slots[pid];
  const p = SP.parse_part(cut_view(inner, model)); if (!p.cut) continue;
  OUTLINES[pid] = !model ? polys(p.cut.buffer(-kerf_of(pid) / 2, { join_style: 'mitre', mitre_limit: 4.0 })).sort((a, b) => b.area - a.area)[0] : p.cut;
}
const BOX_T = META.stocks[META.box_stock].t;
const K = { T: BOX_T, TW: META.stocks[META.neck_stock].t, INNER: META.INNER, WALL_H: META.WALL_H, FLOOR_UP: META.FLOOR_UP, GAP: META.GAP, NECK_H: META.NECK_H, NECK_CL: META.NECK_CL };
const r2 = v => pyround(v, 2), r3 = v => pyround(v, 3);
const SLACK = 1.0, GAP_XY = 0.5, PLY_TOL = 0.2;

// ------------------------------------------------------------------ the interior, from the box geometry
const NECK_T = (META.fits && META.fits.NECK_T !== undefined) ? META.fits.NECK_T : K.TW;
const FLOOR_TOP = K.FLOOR_UP + K.T;                                  // 6 at T = 3
if (!Number.isFinite(META.NECK_OUT)) throw new Error('META.NECK_OUT is required for the real neck datum');
const NECK_OFFSET = (K.INNER - META.NECK_OUT) / 2;
const NECK_IN0 = NECK_OFFSET + NECK_T;                                 // inner face of the W / S neck board
const NECK_IN1 = K.INNER - NECK_OFFSET - NECK_T;                       // inner face of the E / N neck board
const NECK_TOP = FLOOR_TOP + K.NECK_H;
const LID_RIM = K.WALL_H + K.GAP;                                    // the lid is the same tray upside down, its rim GAP above the base rim
const LID_FLOOR_UNDER = LID_RIM + (K.WALL_H - K.FLOOR_UP - K.T);     // its floor's inside face (= LID_RIM + SLOT_Y0 when the slot is exactly T)
if (Math.abs(LID_FLOOR_UNDER - NECK_TOP) > 1e-9) throw new Error(`neck top ${NECK_TOP} and lid floor ${LID_FLOOR_UNDER} disagree`);
if (META.fits && META.fits.SLOT_Y0 !== undefined && META.fits.SLOT_Y0 > K.WALL_H - K.FLOOR_UP - K.T + 1e-9) throw new Error('wall slot top is beyond the floor');
const USABLE_H = LID_FLOOR_UNDER - FLOOR_TOP;
const BUDGET_H = USABLE_H - SLACK;
const INTERIOR = sbox(NECK_IN0, NECK_IN0, NECK_IN1, NECK_IN1);
const NECK_RING = sbox(NECK_OFFSET, NECK_OFFSET, K.INNER - NECK_OFFSET, K.INNER - NECK_OFFSET).difference(INTERIOR);

/* a piece's stacking thickness: its stock's thickest reading plus the ply tolerance */
function thick(pid) { const s = META.part_stock[pid]; if (!s || !META.stocks[s]) throw new Error(`${pid}: no stock in META.part_stock`); return META.stocks[s].t + PLY_TOL; }

// ------------------------------------------------------------------ what goes in (counts from the cut sheets)
const counts = {};
for (const s of Object.keys(LAYOUT).filter(s => /^sheet[1-9]\d*$/.test(s))) for (const it of LAYOUT[s].items) counts[it[0]] = (counts[it[0]] || 0) + 1;
const BOX_PARTS = new Set(['floor-base', 'lid-cut', 'lid-outer', 'neck-A', 'neck-B']);
const inventory = {};
for (const [p, n] of Object.entries(counts)) if (!p.startsWith('wall-') && !p.startsWith('test-') && !BOX_PARTS.has(p) && p in OUTLINES) inventory[p] = n;
const pool = Object.assign({}, inventory);
function take(pid, n = 1) {
  if (!((pool[pid] || 0) >= n)) throw new Error(`not enough ${pid}`);
  pool[pid] -= n; return Array(n).fill(pid);
}
/* the piles: the game's pack.js decides, or the default by part kind. columns: [name, [pids bottom to top] | [[dx, dy, pids]], shelf preference]
   ('floor', 'top' or 'any'); the game may also give place(name, pids, ctx) for piles it fixes by hand, flat_top (id prefixes that can carry piles) and
   clearance(a, b) (the gap two pieces need, when not GAP_XY) */
const kind_of = pid => (META.part_kind || {})[pid] || 'plate';
const GAME_PACK = fs.existsSync(path.join(HERE, 'pack.js')) ? require(path.join(HERE, 'pack.js')) : null;
function default_columns() {
  const cols = [], by = {};
  for (const pid of Object.keys(inventory).sort()) (by[kind_of(pid)] = by[kind_of(pid)] || []).push(pid);
  /* even stacks no taller than the box allows: n stacks of about the same height */
  const chunk = (name, pids, maxN, pref) => { if (!pids.length) return; const n = Math.ceil(pids.length / maxN), per = Math.ceil(pids.length / n); for (let k = 0, i = 1; k < pids.length; k += per, i++) cols.push([n > 1 ? `${name} ${i}` : name, pids.slice(k, k + per), pref]); };
  const fits = pids => Math.max(1, Math.floor(BUDGET_H / thick(pids[0])));   /* how many of a piece stack in the box's height */
  const sig = pid => { const b = OUTLINES[pid].bounds; return [Math.round(b[2] - b[0]), Math.round(b[3] - b[1])].join('x'); };
  /* pieces of one kind and size stack together: boards on the floor, tiles in even stacks, cards in one stack, tokens by kind, standing pieces and bases flat in the gaps */
  const bySig = pids => { const m = new Map(); for (const p of pids) { const k = sig(p); if (!m.has(k)) m.set(k, []); m.get(k).push(...take(p, inventory[p])); } return [...m.entries()]; };
  /* laminated trays pack as themselves, the frame on its back; trays of one outline stack in one pile, as many as the box's height takes */
  { const stacks = new Map();
    for (const pid of by.tray || []) { const n = inventory[pid], frame = inventory[pid + '-frame'] ? take(pid + '-frame', n) : [], backs = take(pid, n); const k = sig(pid); if (!stacks.has(k)) stacks.set(k, []); for (let i = 0; i < n; i++) stacks.get(k).push(backs[i], ...(frame[i] ? [frame[i]] : [])); }
    for (const [k, pids] of stacks) { const per = Math.max(1, Math.floor(BUDGET_H / pids.reduce((a, p) => a + thick(p), 0) * pids.length)); chunk(`trays ${k}`, pids, per, 'floor'); } }
  for (const [k, pids] of bySig(by.board || [])) chunk(`boards ${k}`, pids, fits(pids), 'floor');
  for (const [k, pids] of bySig(by.tile || [])) chunk(`tiles ${k}`, pids, fits(pids), 'floor');
  for (const [k, pids] of bySig(by.card || [])) chunk(`cards ${k}`, pids, fits(pids), 'any');
  for (const pid of by.token || []) chunk(`${pid} tokens`, take(pid, inventory[pid]), Math.min(10, fits([pid])), 'any');
  for (const [k, pids] of bySig((by.pair || []).concat(by.standee || []))) chunk(`standing pieces ${k}`, pids, 4, 'any');
  for (const pid of (by.base || []).concat(by.plate || [])) chunk(pid, take(pid, inventory[pid]), 3, 'any');
  return cols;
}
const ctx0 = { META, K, inventory, take, OUTLINES, thick, lg, kind_of };
const GP = GAME_PACK ? GAME_PACK(ctx0) : { columns: default_columns() };
let columns = GP.columns;
columns = columns.map(([nm, st, pref]) => [nm, Array.isArray(st[0]) ? st : [[0.0, 0.0, st]], pref]);
const left = Object.entries(pool).filter(([, n]) => n);
if (left.length) throw new Error(`pieces not assigned to a pile: ${JSON.stringify(left)}`);

// ------------------------------------------------------------------ fast exact rejection for containment tests
/** point location against a polygonal geometry: -1 strictly outside, 1 strictly inside, 0 within eps of the boundary */
class Locator {
  constructor(geom, cell = 2.0, eps = 1e-7) {
    this.eps = eps; this.cell = cell; this.edges = []; this.verts = [];
    for (const p of polys(geom)) for (const r of [p.exterior, ...p.interiors]) {
      const c = r.coords;
      for (let i = 0; i + 1 < c.length; i++) { this.edges.push([c[i][0], c[i][1], c[i + 1][0], c[i + 1][1]]); this.verts.push(c[i]); }
    }
    const b = geom.bounds; this.b = b;
    this.nx = Math.max(1, Math.ceil((b[2] - b[0]) / cell) + 1); this.ny = Math.max(1, Math.ceil((b[3] - b[1]) / cell) + 1);
    this.rows = Array.from({ length: this.ny }, () => []); this.grid = new Map();
    this.edges.forEach((e, i) => {
      const y0 = Math.min(e[1], e[3]), y1 = Math.max(e[1], e[3]), x0 = Math.min(e[0], e[2]), x1 = Math.max(e[0], e[2]);
      const j0 = this.ry(y0 - eps), j1 = this.ry(y1 + eps), i0 = this.rx(x0 - eps), i1 = this.rx(x1 + eps);
      for (let j = j0; j <= j1; j++) { this.rows[j].push(i); for (let k = i0; k <= i1; k++) { const key = j * this.nx + k; let a = this.grid.get(key); if (!a) this.grid.set(key, a = []); a.push(i); } }
    });
  }
  rx(x) { return Math.min(this.nx - 1, Math.max(0, Math.floor((x - this.b[0]) / this.cell))); }
  ry(y) { return Math.min(this.ny - 1, Math.max(0, Math.floor((y - this.b[1]) / this.cell))); }
  locate(x, y) {
    const b = this.b, eps = this.eps;
    if (x < b[0] - eps || x > b[2] + eps || y < b[1] - eps || y > b[3] + eps) return -1;
    const near = this.grid.get(this.ry(y) * this.nx + this.rx(x));
    if (near) for (const i of near) {
      const [ax, ay, bx, by] = this.edges[i], dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
      let t = L ? ((x - ax) * dx + (y - ay) * dy) / L : 0; t = Math.max(0, Math.min(1, t));
      if (Math.hypot(x - ax - t * dx, y - ay - t * dy) <= eps) return 0;
    }
    let odd = false;
    for (const i of this.rows[this.ry(y)]) {
      const [ax, ay, bx, by] = this.edges[i];
      if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) odd = !odd;
    }
    return odd ? 1 : -1;
  }
}
/** contains(free, g translated by (x, y)), exactly as the geometry predicate, after two exact necessary-condition rejections:
 *  a vertex of g strictly outside free, or a boundary vertex of free strictly inside g */
function make_contains(free) {
  const L = new Locator(free), ev = L.verts;
  return (g0, gl, x, y) => {
    for (const [px, py] of gl.verts) if (L.locate(px + x, py + y) < 0) return false;
    const b = gl.b;
    for (const [vx, vy] of ev) {
      const u = vx - x, v = vy - y;
      if (u > b[0] && u < b[2] && v > b[1] && v < b[3] && gl.locate(u, v) > 0) return false;
    }
    return free.contains(affinity.translate(g0, x, y));
  };
}

// ------------------------------------------------------------------ packing (simplified, slightly swollen outlines; exact ones are verified below)
const PACK_SHAPE = {};
for (const p of Object.keys(inventory)) PACK_SHAPE[p] = OUTLINES[p].buffer(0.15).simplify(0.1).buffer(0);
if (process.env.PACK_SHAPES_JSON) {   // diagnostic: packing shapes computed elsewhere (GeoJSON-like {pid: {type, coordinates}})
  const S = JSON.parse(fs.readFileSync(process.env.PACK_SHAPES_JSON, 'utf8'));
  const poly = c => Polygon(c[0], c.slice(1));
  for (const p of Object.keys(inventory)) { const m = S[p]; PACK_SHAPE[p] = m.type === 'Polygon' ? poly(m.coordinates) : unary_union(m.coordinates.map(poly)); }
}
const ROTS = [0, 90, 180, 270];
const at = (g, dx, dy, rot, x = 0.0, y = 0.0) => affinity.translate(affinity.rotate(affinity.translate(g, dx, dy), rot, [0, 0]), x, y);
const footprint = (stacks, rot) => unary_union(stacks.flatMap(([dx, dy, pids]) => [...new Set(pids)].map(p => at(PACK_SHAPE[p], dx, dy, rot))));

const placed = [];   // {name, pids, x, y, rot, z0, z1, fp, tier}
const FLOOR = { name: 'floor', region: INTERIOR.buffer(-GAP_XY, { join_style: 'mitre' }), z0: 0.0, tier: 0 };
let shelves = [FLOOR];
const STEP = 1.0;
let contains_calls = 0;

function try_shelf(col_pids, shelf) {
  const h = Math.max(...col_pids.map(([, , pids]) => pids.reduce((s, p) => s + thick(p), 0))), z0 = shelf.z0, z1 = shelf.z0 + h;
  if (z1 > BUDGET_H + 1e-9) return null;
  const obst = placed.filter(q => q.z0 < z1 - 1e-9 && q.z1 > z0 + 1e-9).map(q => q.fp.buffer(GAP_XY));
  const free = obst.length ? shelf.region.difference(unary_union(obst)) : shelf.region;
  if (free.is_empty) return null;
  const inside = make_contains(free); let best = null;
  for (const rot of ROTS) {
    const fp0 = footprint(col_pids, rot), [bx0, by0, bx1, by1] = fp0.bounds;
    if (fp0.area > free.area) continue;
    const gl = new Locator(fp0); gl.verts = [];
    for (const p of polys(fp0)) gl.verts.push(...p.exterior.coords);
    const [fx0, fy0, fx1, fy1] = free.bounds;
    let y = fy0 - by0;
    while (y + by1 <= fy1 + 1e-9 && (best === null || y < best[0])) {
      let x = fx0 - bx0;
      while (x + bx1 <= fx1 + 1e-9) {
        contains_calls++;
        if (inside(fp0, gl, x, y) && (!shelf.balanced || col_pids.every(([dx, dy, ps]) => shelf.balanced(at(OUTLINES[ps[0]], dx, dy, rot, x, y))))) {
          if (best === null || y < best[0] || (y === best[0] && x < best[1])) best = [y, x, rot];
          break;
        }
        x += STEP;
      }
      if (best !== null && best[0] === y) break;
      y += STEP;
    }
  }
  if (best === null) return null;
  const [y, x, rot] = best;
  return { pids: col_pids, x, y, rot, z0, z1, fp: affinity.translate(footprint(col_pids, rot), x, y), tier: shelf.tier };
}

const failed = [];
const FLAT_TOP = GP.flat_top || null;   /* id prefixes whose flat, regular tops can carry more piles; default: tiles, cards and boards */
const flat_top = pid => FLAT_TOP ? FLAT_TOP.some(s => pid.startsWith(s)) : /^(tile|card|board)$/.test(kind_of(pid));
const fixed_pile = (pids, x, y, z0, tier) => ({ pids, x, y, rot: 0, z0,
  z1: z0 + Math.max(...pids.map(([, , ps]) => ps.reduce((s, p) => s + thick(p), 0))),
  fp: affinity.translate(footprint(pids, 0), x, y), tier });
const ctx1 = Object.assign(ctx0, { FLOOR, fixed_pile, try_shelf, shelves: () => shelves, addShelf: s => shelves.push(s), placed, GAP_XY, BUDGET_H });
for (const [name, pids, pref] of columns) {
  const tops = shelves.filter(s => s.tier > 0);
  const order = { floor: [FLOOR], top: tops.concat([FLOOR]), any: tops.concat([FLOOR]) }[pref];
  let got = GP.place ? GP.place(name, pids, ctx1) : null;   /* the game's hand-placed piles (a frame with stacks through its openings) */
  if (!got) for (const sh of order) { got = try_shelf(pids, sh); if (got) break; }
  if (!got) { failed.push(name); continue; }
  got.name = name; placed.push(got);
  if (GP.after) GP.after(name, got, ctx1);
  const head = BUDGET_H - got.z1, stack0 = pids[0][2], top = stack0[stack0.length - 1];
  if (pids.length === 1 && flat_top(top) && head >= K.T + PLY_TOL) {   // a flat, regular pile top that can carry more piles
    const top_region = affinity.translate(affinity.rotate(OUTLINES[top], got.rot, [0, 0]), got.x, got.y).convex_hull;
    shelves.push({ name: `on ${name}`, region: top_region, z0: got.z1, tier: got.tier + 1 });
  }
  shelves = shelves.map((s, i) => [s, i]).sort((a, b) => ((a[0].tier ? -a[0].z0 : 1e9) - (b[0].tier ? -b[0].z0 : 1e9)) || a[1] - b[1]).map(e => e[0]);   // highest pile tops first, the floor last
}

// ------------------------------------------------------------------ independent verification, piece by piece
const pieces = [];
for (const q of placed) {
  for (const [dx, dy, pids] of q.pids) {
    let z = q.z0; const r = q.rot * Math.PI / 180, px = q.x + dx * Math.cos(r) - dy * Math.sin(r), py = q.y + dx * Math.sin(r) + dy * Math.cos(r);
    for (const p of pids) {
      const geom = at(OUTLINES[p], dx, dy, q.rot, q.x, q.y);
      pieces.push({ pid: p, x: px, y: py, z, rot: q.rot, t: thick(p), geom, bb: geom.bounds, pile: q.name, pile_z0: q.z0 }); z += thick(p);
    }
  }
}
const problems = [];
const placed_counts = {};
for (const pc of pieces) placed_counts[pc.pid] = (placed_counts[pc.pid] || 0) + 1;
for (const [p, n] of Object.entries(inventory)) if ((placed_counts[p] || 0) !== n) problems.push(`${p}: ${placed_counts[p] || 0} packed of ${n}`);
const INT_EXT = INTERIOR.exterior;
for (const pc of pieces) {
  if (!INTERIOR.contains(pc.geom)) problems.push(`${pc.pid} (${pc.pile}) crosses the neck ring`);
  else { const d = pc.geom.distance(INT_EXT); if (d < GAP_XY - 1e-6) problems.push(`${pc.pid} (${pc.pile}) is ${d.toFixed(2)} mm from the neck`); }
  if (pc.z + pc.t > BUDGET_H + 1e-9) problems.push(`${pc.pid} (${pc.pile}) top ${(pc.z + pc.t).toFixed(1)} > ${BUDGET_H.toFixed(1)}`);
  if (pc.z > 1e-9) {   // something must hold it up: its centroid over the pieces directly beneath (a frame's window or a standee's notch still holds the piece above)
    const under = pieces.filter(o => Math.abs(o.z + o.t - pc.z) < 1e-6).map(o => o.hull || (o.hull = o.geom.convex_hull));
    if (!under.length || !unary_union(under).buffer(0.01).contains(pc.geom.centroid)) problems.push(`${pc.pid} (${pc.pile}) at z ${pc.z.toFixed(1)} is unsupported`);
    /* a piece on the actual contact patches of what is under it (a frame's webs, a standee's silhouette) must have its centroid inside the contact's hull.
       The game's balance(pc, pieces, under) names the surfaces to test against (null: no test); the default tests every standing piece against everything under it */
    const under_geoms = () => pieces.filter(o => Math.abs(o.z + o.t - pc.z) < 1e-6).map(o => o.geom);
    const surfaces = GP.balance ? GP.balance(pc, pieces, under_geoms) : (/^(standee|pair)$/.test(kind_of(pc.pid)) ? under_geoms() : null);
    if (surfaces && surfaces.length) {
      const contact = unary_union(surfaces).intersection(pc.geom);
      if (contact.is_empty || !contact.convex_hull.contains(pc.geom.centroid)) problems.push(`${pc.pid} (${pc.pile}) is not balanced on the piece${surfaces.length > 1 ? 's' : ''} below it`);
    }
  }
}
for (let i = 0; i < pieces.length; i++) {
  const a = pieces[i];
  for (const b of pieces.slice(i + 1)) {
    if (a.z < b.z + b.t - 1e-6 && b.z < a.z + a.t - 1e-6) {
      const gx = Math.max(a.bb[0] - b.bb[2], b.bb[0] - a.bb[2], 0), gy = Math.max(a.bb[1] - b.bb[3], b.bb[1] - a.bb[3], 0);
      if (Math.hypot(gx, gy) >= GAP_XY) continue;   // the envelopes alone keep them apart
      const d = a.geom.distance(b.geom);
      // SVG arc flattening changes the measured edge distance by less than 0.005 mm.
      const required = GP.clearance ? GP.clearance(a, b, GAP_XY) : GAP_XY;
      if (d < required - 1e-6) problems.push(`${a.pid} (${a.pile}) and ${b.pid} (${b.pile}) are ${d.toFixed(6)} mm apart at z ${Math.max(a.z, b.z).toFixed(1)}`);
    }
  }
}
for (const name of failed) problems.push(`no room for the pile '${name}'`);

const max_top = pieces.reduce((m, pc) => Math.max(m, pc.z + pc.t), 0.0);
const floor_cover = unary_union(pieces.filter(pc => pc.z < 1e-9).map(pc => pc.geom));
const free_floor = INTERIOR.area - floor_cover.area;
const piece_vol = pieces.reduce((s, pc) => s + pc.geom.area * pc.t, 0);
const fits = !problems.length;
const npcs = q => q.pids.reduce((s, st) => s + st[2].length, 0);

const f1 = v => v.toFixed(1);
console.log(`${CFG.name} packing check`);
console.log(`  interior inside the neck: ${f1(NECK_IN1 - NECK_IN0)} x ${f1(NECK_IN1 - NECK_IN0)} mm (x, y ${f1(NECK_IN0)}..${f1(NECK_IN1)} from the tray's inside corner) = ${INTERIOR.area.toFixed(0)} mm2`);
console.log(`  height floor top z ${f1(FLOOR_TOP)} to lid floor underside z ${f1(LID_FLOOR_UNDER)} (box closed): ${f1(USABLE_H)} mm; budget after ${SLACK.toFixed(0)} mm slack ${f1(BUDGET_H)} mm`);
console.log(`  stacking thickness ${Object.entries(META.stocks).map(([k, st]) => `${st.name} ${st.t} -> ${f1(st.t + PLY_TOL)}`).join(', ')} mm; ${GAP_XY} mm between neighbours`);
console.log(`  ${pieces.length} pieces in ${placed.length} piles`);
for (const q of placed) console.log(`    ${q.name.trim().padEnd(18)} ${String(npcs(q)).padStart(2)} pcs  at (${q.x.toFixed(1).padStart(6)},${q.y.toFixed(1).padStart(6)}) rot ${String(q.rot).padStart(3)}  z ${q.z0.toFixed(1).padStart(5)}..${q.z1.toFixed(1).padStart(5)}`);
console.log(`  tallest pile top ${f1(max_top)} mm; height margin ${f1(BUDGET_H - max_top)} mm under the slack (${f1(USABLE_H - max_top)} mm to the lid)`);
console.log(`  free floor area ${free_floor.toFixed(0)} mm2 of ${INTERIOR.area.toFixed(0)} (${(100 * free_floor / INTERIOR.area).toFixed(0)}%); pieces fill ${(100 * piece_vol / (INTERIOR.area * USABLE_H)).toFixed(0)}% of the volume`);
if (problems.length) { console.log('  PROBLEMS:'); problems.slice(0, 40).forEach(p => console.log('   ', p)); }
console.log('VERDICT:', fits ? 'FITS' : 'DOES NOT FIT');

// ------------------------------------------------------------------ packing.json
const out = {
  verdict: fits ? 'FITS' : 'DOES NOT FIT', problems,
  coords: "box coordinates: origin at the inside corner of the base tray floor (the floor part's drawing origin), z = bottom of the piece above the floor top; " +
    "piece outline = OUTLINES[pid] rotated rot degrees about its own origin (as the renderer's flat instance) then moved by (x, y)",
  interior: {
    x0: NECK_IN0, y0: NECK_IN0, x1: NECK_IN1, y1: NECK_IN1, width: NECK_IN1 - NECK_IN0, depth: NECK_IN1 - NECK_IN0, floor_top_z_in_tray: FLOOR_TOP,
    lid_floor_underside_z_in_tray: LID_FLOOR_UNDER, height: USABLE_H, slack: SLACK, height_budget: BUDGET_H, ply_tolerance: PLY_TOL, gap_xy: GAP_XY,
    tallest: r2(max_top), height_margin: r2(BUDGET_H - max_top), free_floor_mm2: Math.round(free_floor), floor_mm2: Math.round(INTERIOR.area),
    stock: Object.fromEntries(Object.entries(META.stocks).map(([k, s]) => [k, s.t])), parts: path.relative(HERE, path.resolve(PARTS_FILE)),
  },
  piles: placed.map(q => ({ name: q.name.trim(), x: r2(q.x), y: r2(q.y), rot: q.rot, z0: r2(q.z0), z1: r2(q.z1), count: npcs(q) })),
  placements: pieces.map(pc => ({ pid: pc.pid, x: r3(pc.x), y: r3(pc.y), z: r3(pc.z), rot: pc.rot, thick: r2(pc.t - PLY_TOL), pile: pc.pile.trim() })),
};
fs.mkdirSync(OUTDIR, { recursive: true });
fs.writeFileSync(path.join(OUTDIR, 'packing.json'), JSON.stringify(out, null, 1));

// ------------------------------------------------------------------ top view per layer (pile tier: 0 on the floor, 1 on a pile, ...)
const TAB20 = ['#1f77b4', '#aec7e8', '#ff7f0e', '#ffbb78', '#2ca02c', '#98df8a', '#d62728', '#ff9896', '#9467bd', '#c5b0d5', '#8c564b', '#c49c94', '#e377c2', '#f7b6d2', '#7f7f7f', '#c7c7c7', '#bcbd22', '#dbdb8d', '#17becf', '#9edae5'];
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const pathd = g => polys(g).map(p => [p.exterior, ...p.interiors].map(r => 'M' + r.coords.map(([x, y]) => `${x.toFixed(3)},${y.toFixed(3)}`).join('L') + 'Z').join('')).join('');
const pack_dir = path.join(OUTDIR, 'pack'); fs.mkdirSync(pack_dir, { recursive: true });
const tiers = [...new Set(placed.map(q => q.tier))].sort((a, b) => a - b);
const lo = -K.T - 2, hi = K.INNER + K.T + 2, S = 4.0, M = 70, PW = (hi - lo) * S + 2 * M;   // px per mm, margin for title and axes
const X = x => M + (x - lo) * S, Y = y => M + (hi - y) * S;
const wrote = [];
for (const tier of tiers) {
  const g = [];
  const shape = (geom, style) => `<path d="${pathd(geom)}" fill-rule="evenodd" ${style} vector-effect="non-scaling-stroke"/>`;
  g.push(`<g transform="translate(${M - lo * S},${M + hi * S}) scale(${S},${-S})">`);
  g.push(shape(sbox(-K.T, -K.T, K.INNER + K.T, K.INNER + K.T).difference(sbox(0, 0, K.INNER, K.INNER)), 'fill="#d9c7a3" stroke="black" stroke-width="0.5"'));
  g.push(shape(NECK_RING, 'fill="#6b4a2b" stroke="black" stroke-width="0.8"'));
  for (const q of placed) if (q.tier < tier) g.push(shape(q.fp, 'fill="#e4e4e4" stroke="#aaaaaa" stroke-width="0.5"'));
  const labels = [];
  placed.filter(q => q.tier === tier).forEach((q, k) => {
    const col = TAB20[k % 20];
    for (const [dx, dy, pids] of q.pids) g.push(shape(unary_union([...new Set(pids)].map(pid => at(OUTLINES[pid], dx, dy, q.rot, q.x, q.y))), `fill="${col}" fill-opacity="0.85" stroke="black" stroke-width="0.6"`));
    const c = q.fp.area < 1500 ? q.fp.representative_point() : q.fp.centroid, fs_ = q.fp.area < 1500 ? 8 : 10;
    labels.push(`<text x="${X(c.x).toFixed(1)}" y="${(Y(c.y) - fs_ * 0.15).toFixed(1)}" font-size="${fs_}" text-anchor="middle">${esc(q.name.trim())}</text>` +
      `<text x="${X(c.x).toFixed(1)}" y="${(Y(c.y) + fs_ * 1.05).toFixed(1)}" font-size="${fs_}" text-anchor="middle">${npcs(q)}x  z${q.z0.toFixed(1)}-${q.z1.toFixed(1)}</text>`);
  });
  g.push('</g>');
  const ticks = [];
  for (let v = 0; v <= K.INNER; v += 25) {
    ticks.push(`<line x1="${X(v)}" y1="${Y(lo)}" x2="${X(v)}" y2="${Y(lo) + 5}" stroke="black"/><text x="${X(v)}" y="${Y(lo) + 18}" font-size="12" text-anchor="middle">${v}</text>`);
    ticks.push(`<line x1="${X(lo)}" y1="${Y(v)}" x2="${X(lo) - 5}" y2="${Y(v)}" stroke="black"/><text x="${X(lo) - 8}" y="${Y(v) + 4}" font-size="12" text-anchor="end">${v}</text>`);
  }
  const title = `${esc(CFG.name)} packed box, layer ${tier} (${tier === 0 ? 'on the floor' : 'on top of layer ' + (tier - 1)}; grey = below)`;
  const sub = `interior ${f1(NECK_IN1 - NECK_IN0)} mm square, ${USABLE_H.toFixed(0)} mm tall; verdict ${fits ? 'FITS' : 'DOES NOT FIT'}, margin ${f1(BUDGET_H - max_top)} mm`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${PW}" height="${PW}" font-family="DejaVu Sans, sans-serif"><rect width="${PW}" height="${PW}" fill="white"/>` +
    `<text x="${PW / 2}" y="24" font-size="15" text-anchor="middle">${title}</text><text x="${PW / 2}" y="44" font-size="15" text-anchor="middle">${esc(sub)}</text>` +
    g.join('') + `<rect x="${X(lo)}" y="${Y(hi)}" width="${(hi - lo) * S}" height="${(hi - lo) * S}" fill="none" stroke="black"/>` + ticks.join('') + labels.join('') +
    `<text x="${PW / 2}" y="${PW - 18}" font-size="13" text-anchor="middle">x mm (box coordinates)</text><text x="18" y="${PW / 2}" font-size="13" text-anchor="middle" transform="rotate(-90 18 ${PW / 2})">y mm</text></svg>`;
  const sf = path.join(pack_dir, `layer-${tier}.svg`), pf = path.join(pack_dir, `layer-${tier}.png`);
  fs.writeFileSync(sf, svg);
  const r = spawnSync('rsvg-convert', ['-o', pf, sf], { encoding: 'utf8' });
  if (r.status) { console.error(`rsvg-convert failed: ${r.stderr}`); process.exitCode = 1; }
  fs.unlinkSync(sf); wrote.push(path.relative(OUTDIR, pf));
}
console.log(`wrote ${path.join(OUTDIR, 'packing.json')} and ${wrote.join(', ')} (${((Date.now() - t_start) / 1000).toFixed(1)} s, ${contains_calls} placement tests)`);
if (!fits) process.exitCode = 1;
return fits;
};
if (require.main === module) module.exports(process.cwd(), process.argv.slice(2));
