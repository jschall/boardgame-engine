#!/usr/bin/env node
// cli.js (boardgame-engine): the game's cut files from measured stock thicknesses: writes parts/parts.json and parts/<sheet>.svg, manifest.json and the
// engraving cache the page's worker starts from. Run from the game folder (node engine/bin/bg.js parts):
//   node engine/src/cli.js ['#t3lo=2.67&t3hi=2.92&kerf_t3=0.18'] [--jobs N] [--out DIR] [--no-write] [--quiet] [--part-files] [--no-cache] [--preset NAME]
//   The files carry their own kerf compensation (machine compensation OFF for every layer).
//   Each stock is its thinnest and thickest caliper reading and its kerf (the game's defaults, game.json's stocks); exit 1 on any check problem.
// One exact thickness per stock at the range ends:  node engine/src/cli.js '#t3lo=2.67&t3hi=2.67' --out /tmp/p267
'use strict';
const fs = require('fs'), path = require('path');
const lg = require('../lib/lasergeom.js');
const EDGE_G = /<g class="edge-scores">[\s\S]*?<\/g>/;

async function main(argv, GAME_DIR = process.cwd()) {
  const a = argv.slice(2), flag = k => { const i = a.indexOf(k); if (i < 0) return false; a.splice(i, 1); return true; };
  if (a.includes('--help') || a.includes('-h')) { console.log(fs.readFileSync(__filename, 'utf8').split('\n').filter(l => l.startsWith('//')).map(l => l.slice(3)).join('\n')); return null; }
  const opt = (k, d) => { const i = a.indexOf(k); if (i < 0) return d; const v = a[i + 1]; a.splice(i, 2); return v; };
  const { GAME } = require('./game_geom.js')(GAME_DIR);
  const HERE = GAME_DIR;
  const out = opt('--out', path.join(HERE, 'parts')), preset = opt('--preset', null);
  const quiet = flag('--quiet'), nowrite = flag('--no-write'), part_files = flag('--part-files');
  if (preset) GAME.preset = preset;
  let used = null, store_raw = null;
  if (!flag('--no-cache')) {
    const store = require('./cache_node.js')(GAME_DIR); GAME.set_store(store); store_raw = store;
    // the final build's engraving entries (S: finished SVG, C: compensated geometry of parts moved or clipped at build time, T: bleed tests), recorded so
    // build.js can hand the page's worker a warm cache: a thickness change in the browser then never draws art
    used = new Map();
    GAME.eng_store = { get: k => { const v = store.get(k); if (v !== undefined && /^[SCTE]\|/.test(k)) used.set(k, v); return v; }, set: (k, v) => { store.set(k, v); if (/^[SCTE]\|/.test(k)) used.set(k, v); }, stats: store.stats };
  }
  const jobs = +opt('--jobs', Math.max(1, Math.min(8, Math.floor(require('os').cpus().length / 3))));
  const unknown = a.filter(x => x.startsWith('-'));
  if (unknown.length || a.length > 1) { console.error(`unknown arguments: ${a.join(' ')} (node geom/cli.js --help)`); process.exit(2); }
  const hash = a[0] || '';
  const P = lg.parse_hash(hash, GAME.defaults);
  if (!quiet) GAME.onprogress = (f, label) => process.stderr.write(`  ${String(Math.round(f * 100)).padStart(3)}%  ${label}\n`);
  if (jobs > 1 && GAME.eng_store) { await prewarm(GAME, P, hash, jobs, quiet, GAME_DIR); if (used) used.clear(); }
  let res;
  try { res = lg.build(GAME, P); }
  catch (e) { console.error(e.message || e); process.exit(1); }
  if (!nowrite) {
    lg.write_parts(res, out, { part_files });
    if (path.resolve(out) === path.resolve(path.join(HERE, 'parts'))) fs.writeFileSync(path.join(HERE, 'manifest.json'), JSON.stringify(GAME.need()) + '\n');
    if (used) {   // S values are the parts' own engraving, so they are stored as the part id whose SVG starts with them
      // E values (edge scores) are the part's own <g class="edge-scores"> group, stored as its part id too; S values are the engraving without it
      const S = {}, C = {}, T = {}, E = {}, byEng = new Map(), byEdge = new Map();
      for (const [pid, inner] of Object.entries(res.parts)) {
        const leafStart = inner.indexOf('<g class="leaf-cuts">');
        const i = leafStart >= 0 ? leafStart : inner.search(/<path d="[^"]*" stroke="#ff0000"/), eng = i < 0 ? inner : inner.slice(0, i), g = eng.match(EDGE_G);
        byEng.set(eng.replace(EDGE_G, ''), pid); if (g) byEdge.set(g[0], pid);
      }
      for (const [k, v] of used) {
        if (k[0] === 'S') { const pid = byEng.get(v); if (pid !== undefined) S[k] = pid; else if (v === '') S[k] = ''; }
        else if (k[0] === 'E') { const pid = byEdge.get(v); if (pid !== undefined) E[k] = pid; else if (v === '') E[k] = ''; }
        else if (k[0] === 'C') C[k] = v; else T[k] = v;
      }
      // parts moved or clipped at build time (eng_post) need their compensated geometry in the page, whatever thickness this build had: the S key is
      // 'S|id|' + ckey (6 fields when compensating) + '|' + post key, and the C key 'C|id|' + ckey
      // The page does not carry that geometry: the part's own engraving (in PARTS) read back is the same shape less the build-time clip, so C entries
      // name the part and, for walls, the x shift the build applied (the next build moves it again and clips it off its own slots)
      for (const k of Object.keys(S)) {
        const f = k.split('|'); if (f.length <= 8 || f[8] === '' || typeof S[k] !== 'string' || !S[k]) continue;
        const ck = 'C|' + f.slice(1, 8).join('|');
        if (!(ck in C)) C[ck] = { pid: S[k], dx: f[1].startsWith('Kwall:') ? +f[8] || 0 : 0 };
      }
      for (const k of Object.keys(C)) if (!(C[k] && C[k].pid !== undefined)) delete C[k];
      fs.writeFileSync(path.join(out, 'engraving_cache.json'), JSON.stringify({ params: P, preset: GAME.preset, S, C, T, E }));
    }
  }
  const m = res.meta;
  console.log(`parts ${Object.keys(res.parts).length}, sheets ${Object.keys(res.layout).join(' ')}; stock ${JSON.stringify(P)} preset ${m.preset}; ` +
    `kerf by sheet ${JSON.stringify(m.kerf)} (${m.kerf_comp}); build ${m.build_ms} ms (generate ${m.generate_ms}); usage % ${JSON.stringify(m.usage)}` + (nowrite ? '' : `; wrote ${path.relative(process.cwd(), out) || '.'}`));
  if (m.edge_scores) console.log(`edge scores ${m.edge_score_mm || 0} mm: ` + Object.entries(m.edge_scores.sheets).map(([s, v]) => `${s} ${v.mm} mm / ${v.paths} paths`).join(', '));
  if (GAME.warnings && GAME.warnings.length) console.log('warnings:\n  ' + [...new Set(GAME.warnings)].join('\n  '));
  if (!quiet) console.log('stages ms', JSON.stringify(m.stage_ms), 'cache', JSON.stringify(m.cache || {}), 'store', GAME.eng_store ? JSON.stringify(GAME.eng_store.stats) : 'off');
  return res;
}
/** make every part's engraving in `jobs` worker threads before the build (parts are independent; the store is shared), heaviest parts spread first */
function prewarm(GAME, P, hash, jobs, quiet, GAME_DIR) {
  const { Worker } = require('worker_threads'), groups = [];
  // list the engraved parts without drawing any art: a dry pass that skips them all
  const seen = new Set();
  Object.assign(GAME, { on_part: (pid, g) => { if (!seen.has(g)) { seen.add(g); groups.push(g); } }, part_filter: () => false, parts_only: true });
  const lo = typeof GAME.layout === 'function' ? GAME.layout(P) : GAME.layout;
  GAME.generate(P, new lg.Layout(lo), lg);
  Object.assign(GAME, { on_part: null, part_filter: null, parts_only: false });
  const weight = g => /^wall-/.test(g) ? 12 : g === 'lid-outer' ? 14 : /^floor-base/.test(g) ? 7 : g === 'lid-inner' ? 4 : (GAME.weight ? GAME.weight(g) : 1);   /* the box panels are the heavy art; a game may weigh its own parts */
  const bins = Array.from({ length: jobs }, () => ({ w: 0, groups: [] }));
  for (const g of groups.slice().sort((x, y) => weight(y) - weight(x))) { const b = bins.reduce((m, x) => (x.w < m.w ? x : m)); b.groups.push(g); b.w += weight(g); }
  const game = { preset: GAME.preset, compensate: GAME.compensate, sheet0: GAME.sheet0 };
  const t0 = Date.now();
  let left = jobs, failed = null;
  const workers = bins.map((b, index) => {
    const w = new Worker(require('path').join(__dirname, 'prewarm_worker.js'), { workerData: { hash, game, groups: b.groups, index, gameDir: GAME_DIR } });
    w.on('message', m => { if (!quiet) process.stderr.write(`  worker ${m.index}: ${m.groups} parts in ${(m.ms / 1000).toFixed(1)} s\n`); });
    w.on('error', e => { failed = failed || e; });
    w.on('exit', () => { left--; });
    return w;
  });
  void workers;
  const deasync_wait = () => new Promise(res => { const tick = () => (left ? setTimeout(tick, 200) : res()); tick(); });
  return deasync_wait().then(() => { if (failed) throw failed; if (!quiet) process.stderr.write(`  prewarm: ${groups.length} part groups in ${jobs} workers, ${((Date.now() - t0) / 1000).toFixed(1)} s\n`); });
}
module.exports = main;
if (require.main === module) main(process.argv).catch(e => { console.error(e && e.stack || e); process.exit(1); });
