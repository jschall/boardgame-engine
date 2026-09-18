#!/usr/bin/env node
// qa_intersections.js: finds solid pieces that pass through each other in the BUILT PAGE's 3D scenes (the placements the page really uses,
// including mid-animation states), and checks the inventory (owner's rule: the table shows every piece at all times).
// The page must expose window.__scene (a Render3D scene with .static/.dynamic instance lists, basis() and world()), and for animated
// scenes window.__qa() returning {turn, over} plus the #shot=table&anim=N&speed=S hooks (see reference/page.md).
// Usage:  node qa_intersections.js page.html [scenes.json] [--parts parts/parts.json] [--alias lid=lid-cut,...] [--skip-sheets sheet0] [--ignore fitcomb,...]
//   scenes.json: [{"name": "table, unstarted", "hash": "", "wait": 3000, "inventory": true}, {"name": "12 turns in", "hash": "#shot=table&anim=12&speed=16", "anim": 12}, ...]
//   default: the unstarted table only, with the inventory check.  Exit 1 if anything intersects, the page throws, or the inventory is wrong.
// Inventory: for scenes marked "inventory": true (default for a scene whose name contains "unstarted"), every part cut on the game sheets
// (backs sheets, --skip-sheets, engrave-only overlays and --ignore coupons excluded) must appear as exactly that many visible instances
// (by part.pid), and no instance may be hidden. --alias lid=lid-cut for parts placed under another id; a trailing "-up" on an id is ignored.
'use strict';
const NAV_MS = +(process.env.NAV_TIMEOUT_MS || 180000);   // a 7 MB self-contained page can take over 30 s to reach its load event on a busy machine
const fs = require('fs'), path = require('path'); 
const a = process.argv.slice(2);
const opt = (k, d) => { const i = a.indexOf(k); if (i < 0) return d; const v = a[i + 1]; a.splice(i, 2); return v; };
const PARTS_FILE = opt('--parts'); const IGNORE = new Set((opt('--ignore', 'fitcomb') || '').split(',')); const ALIAS = Object.fromEntries((opt('--alias', '') || '').split(',').filter(s => s.includes('=')).map(s => s.split('='))); const SKIP = new Set((opt('--skip-sheets', 'sheet0') || '').split(','));
if (!a.length) { console.error('usage: node qa_intersections.js page.html [scenes.json] [--parts parts.json] [--alias a=b] [--skip-sheets s] [--ignore p]'); process.exit(2); }
const PAGE = 'file://' + path.resolve(a[0]);
const SCENES = a[1] ? JSON.parse(fs.readFileSync(a[1], 'utf8')) : [{ name: 'table, unstarted', hash: '', wait: 3000, inventory: true }];
const SHEET_COUNTS = {};
if (PARTS_FILE) { const PJ = JSON.parse(fs.readFileSync(PARTS_FILE, 'utf8'));
  for (const [sname, L] of Object.entries(PJ.layout || {})) { if (sname.startsWith('backs') || SKIP.has(sname)) continue;
    for (const [pid] of L.items || []) if (pid && !IGNORE.has(pid) && (PJ.parts[pid] || '').includes('#ff0000')) SHEET_COUNTS[pid] = (SHEET_COUNTS[pid] || 0) + 1; } }
const norm = pid => { pid = ALIAS[pid] || pid; return pid.endsWith('-up') ? pid.slice(0, -3) : pid; };
const CHECK = `(() => {
  const S = window.__scene, RES = 0.4, STRIDE = 2, HT = 0.35; const seen = new Set(), insts = [];
  for (const k of Object.keys(S)) { const a = S[k]; if (!Array.isArray(a)) continue; for (const i of a) if (i && i.part && i.part.cuts && !i.hidden && !seen.has(i)) { seen.add(i); insts.push(i); } }
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const masks = new Map();
  const maskOf = part => {   // one raster per part: inside (even-odd over every cut) then eroded by one cell, so tabs seated in slots and touching faces do not register
    if (masks.has(part)) return masks.get(part); const bb = part.bbox; const W = Math.ceil((bb[2] - bb[0]) / RES) + 2, H = Math.ceil((bb[3] - bb[1]) / RES) + 2; const m = new Uint8Array(W * H); const edges = [];
    for (const c of part.cuts) { const n = c.pts.length; for (let k = 0; k < n; k++) { const a = c.pts[k], q = c.pts[(k + 1) % n]; if (a[1] !== q[1]) edges.push([a[0], a[1], q[0], q[1]]); } }
    for (let j = 0; j < H; j++) { const y = bb[1] + (j + 0.5) * RES; const xs = []; for (const [x0, y0, x1, y1] of edges) if ((y0 <= y) !== (y1 <= y)) xs.push(x0 + (y - y0) * (x1 - x0) / (y1 - y0)); xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) { const i0 = Math.max(0, Math.ceil((xs[k] - bb[0]) / RES - 0.5)), i1 = Math.min(W - 1, Math.floor((xs[k + 1] - bb[0]) / RES - 0.5)); for (let i = i0; i <= i1; i++) m[j * W + i] = 1; } }
    const deep = new Uint8Array(W * H); for (let j = 1; j < H - 1; j++) for (let i = 1; i < W - 1; i++) { const o = j * W + i; if (m[o] && m[o - 1] && m[o + 1] && m[o - W] && m[o + W]) deep[o] = 1; }
    const r = { W, H, deep, bb }; masks.set(part, r); return r;
  };
  const insideDeep = (part, x, y) => { const r = maskOf(part); const i = Math.floor((x - r.bb[0]) / RES), j = Math.floor((y - r.bb[1]) / RES); return i >= 0 && j >= 0 && i < r.W && j < r.H && r.deep[j * r.W + i] === 1; };
  const info = insts.map(inst => { const B = S.basis(inst), t = inst.thick || 3.0, bb = inst.part.bbox; const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
    for (const u of [bb[0], bb[2]]) for (const v of [bb[1], bb[3]]) for (const h of [0, t]) { const w = S.world(B, u, v, h); for (let d = 0; d < 3; d++) { lo[d] = Math.min(lo[d], w[d]); hi[d] = Math.max(hi[d], w[d]); } }
    return { inst, B, t, lo, hi, samples: null }; });
  const samplesOf = I => { if (I.samples) return I.samples; const r = maskOf(I.inst.part), out = [];
    for (let j = 0; j < r.H; j += STRIDE) for (let i = 0; i < r.W; i += STRIDE) if (r.deep[j * r.W + i]) { const u = r.bb[0] + (i + 0.5) * RES, v = r.bb[1] + (j + 0.5) * RES; for (const h of [I.t * 0.25, I.t * 0.5, I.t * 0.75]) out.push(S.world(I.B, u, v, h)); }
    return (I.samples = out); };
  const hits = new Map();
  const test = (A, Bi) => { let n = 0, ex = null; for (const w of samplesOf(A)) { if (w[0] < Bi.lo[0] || w[0] > Bi.hi[0] || w[1] < Bi.lo[1] || w[1] > Bi.hi[1] || w[2] < Bi.lo[2] || w[2] > Bi.hi[2]) continue; const r = [w[0] - Bi.B.O[0], w[1] - Bi.B.O[1], w[2] - Bi.B.O[2]]; const h = dot(r, Bi.B.N); if (h < HT || h > Bi.t - HT) continue; if (insideDeep(Bi.inst.part, dot(r, Bi.B.U), dot(r, Bi.B.V))) { n++; if (!ex) ex = w; } } return [n, ex]; };
  for (let i = 0; i < info.length; i++) for (let j = i + 1; j < info.length; j++) { const A = info[i], Bi = info[j]; let ok = true; for (let d = 0; d < 3; d++) if (A.hi[d] <= Bi.lo[d] + 0.2 || Bi.hi[d] <= A.lo[d] + 0.2) ok = false; if (!ok) continue; const [n1, e1] = test(A, Bi), [n2, e2] = test(Bi, A); if (n1 + n2 > 0) hits.set(i + ':' + j, { n: n1 + n2, at: (e1 || e2).map(v => Math.round(v * 10) / 10), a: A.inst, b: Bi.inst }); }
  const label = inst => ({ pid: inst.pid || inst.part.pid || inst.part.id || '?', id: inst.id, vertical: !!inst.vertical, rot: Math.round(inst.rot || 0), pos: [inst.x, inst.y, inst.z].map(v => Math.round((v || 0) * 10) / 10), size: [Math.round(inst.part.bbox[2] - inst.part.bbox[0]), Math.round(inst.part.bbox[3] - inst.part.bbox[1])] });
  return { parts: insts.length, hits: [...hits.values()].sort((p, q) => q.n - p.n).map(h => ({ samples: h.n, at: h.at, a: label(h.a), b: label(h.b) })) }; })()`;
const INVENTORY = `(() => { const S = window.__scene, seen = new Set(), counts = {}; let hidden = 0;
  for (const k of Object.keys(S)) { const a = S[k]; if (!Array.isArray(a)) continue; for (const i of a) { if (!i || !i.part || seen.has(i)) continue; seen.add(i); if (i.hidden) { hidden++; continue; } const pid = i.pid || i.part.pid || i.part.id || '?'; counts[pid] = (counts[pid] || 0) + 1; } }
  return { counts, hidden }; })()`;
(async () => {
  let bad = 0; const br = await require('./browser.js').launch();
  for (const sc of SCENES) {
    const pg = await br.newPage({ viewport: { width: 1400, height: 900 } }); const errs = []; pg.setDefaultTimeout(NAV_MS);   /* screenshots and waits too: 30 s is not enough under heavy machine load */ pg.on('pageerror', e => errs.push(String(e)));
    await pg.goto(PAGE + (sc.hash || ''), { timeout: NAV_MS });
    if (sc.anim) { for (let i = 0; i < 600; i++) { await pg.waitForTimeout(1000); const q = (await pg.evaluate('window.__qa ? window.__qa() : {}')) || {}; if (q.over || ((q.turn || 0) >= sc.anim && !(await pg.evaluate('window.__stopAfter')))) break; } await pg.waitForTimeout(2500); }
    else await pg.waitForTimeout(sc.wait || 3000);
    if (!(await pg.evaluate('!!window.__scene'))) { console.log(`${sc.name}: page has no window.__scene`); bad++; await pg.close(); continue; }
    const res = await pg.evaluate(CHECK);
    console.log(`${sc.name}: ${res.parts} parts, ${res.hits.length} intersecting pairs` + (errs.length ? `  PAGE ERRORS ${JSON.stringify(errs.slice(0, 2))}` : ''));
    for (const h of res.hits.slice(0, 40)) console.log('   ', JSON.stringify(h));
    bad += res.hits.length + errs.length;
    if (Object.keys(SHEET_COUNTS).length && (sc.inventory !== undefined ? sc.inventory : sc.name.includes('unstarted'))) {
      const inv = await pg.evaluate(INVENTORY); const seen = {}; for (const [pid, n] of Object.entries(inv.counts)) seen[norm(pid)] = (seen[norm(pid)] || 0) + n;
      const normSheet = new Set(Object.keys(SHEET_COUNTS).map(norm));
      const problems = Object.entries(SHEET_COUNTS).sort().filter(([pid, n]) => (seen[norm(pid)] || 0) !== n).map(([pid, n]) => `${pid}: ${seen[norm(pid)] || 0} on the table, ${n} on the sheets`)
        .concat(Object.entries(seen).sort().filter(([pid]) => !(pid in SHEET_COUNTS) && !normSheet.has(pid)).map(([pid, n]) => `${pid}: ${n} on the table, none on the game sheets`));
      if (inv.hidden) problems.push(`${inv.hidden} hidden instance(s) in the table scene`);
      console.log(`   inventory: ${Object.values(inv.counts).reduce((s, n) => s + n, 0)} visible instances vs ${Object.values(SHEET_COUNTS).reduce((s, n) => s + n, 0)} parts on the game sheets, ${problems.length} problems`);
      for (const s of problems.slice(0, 60)) console.log('     ', s); bad += problems.length;
    }
    await pg.close();
  }
  await br.close(); process.exit(bad ? 1 : 0);
})();
