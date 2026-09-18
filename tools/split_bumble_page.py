#!/usr/bin/env python3
"""split_bumble_page.py: the engine's page/page.js and BUMBLE's table.js were first made by splitting BUMBLE & BLOOM's page.js (the game blocks out,
the machinery generalised). This is that split, by anchors, so a later BUMBLE page.js (the flight planner keeps improving) can be re-split:

    python3 engine/tools/split_bumble_page.py <bumble page.js> <engine dir> <bumble game dir>

It writes <engine>/page/page.js and <game>/table.js. Every anchor must match exactly once; a changed anchor stops the script."""
import sys, re
src_path, engine, game = sys.argv[1:4]
S = open(src_path).read()
lines = S.split('\n')

def find(anchor, start=0):
    hits = [i for i, l in enumerate(lines) if l.startswith(anchor)]
    hits = [i for i in hits if i >= start]
    assert len(hits) >= 1, ('anchor not found', anchor)
    return hits[0]
def block(a_start, a_end, inclusive_end=False, start=0):
    i0 = find(a_start, start); i1 = find(a_end, i0 + 1)
    return '\n'.join(lines[i0:(i1 + 1 if inclusive_end else i1)])
def rep(s, old, new, n=1):
    assert s.count(old) == n, (old[:90], s.count(old))
    return s.replace(old, new)

HERE = __import__('os').path.dirname(__file__)
tpl = lambda name: open(__import__('os').path.join(HERE, 'page_parts', name)).read()

# ---------------------------------------------------------------- the engine's page.js
box_block = block("  /* ------------------------------------------------------------ box pieces", "  /* ------------------------------------------------------------ GAME: the table layout")
box_block = rep(box_block, "const IN = META.INNER;", "const IN = need(META, 'INNER', 'META');")
box_block = rep(box_block, "    const W = 'walnut';\n", "")
for a in ["rot: 0, mat: W", "rot: 180, mat: W", "rot: -90, mat: W", "rot: 90, mat: W"]: box_block = rep(box_block, a, a.replace(", mat: W", ""))
viewer = block("  const plist = $('plist');", "  /* ------------------------------------------------------------ timing */")
viewer = rep(viewer, "${WAL.test(id) ? '3 mm walnut' : THINP.test(id) ? '1.5 mm basswood' : '3 mm basswood'}", "${need(STOCKS[stockOf(id)], 'name', 'META.stocks')}")
viewer = rep(viewer, "loadPart(PV.current || 'asm-bee-bumble')", "loadPart(PV.current || GT.defaultPart || Object.keys(ASMS)[0])")
sheets = block("  /* ------------------------------------------------------------ laser sheets (machinery) */", "  /* ------------------------------------------------------------ the laser-files legend")
legend = block("  /* ------------------------------------------------------------ the laser-files legend", "  /* ------------------------------------------------------------ stock thickness")
legend = rep(legend, "  const escH = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');\n", "")
legend = rep(legend, "(node geom/cli.js)`);", "`);")
legend = rep(legend, "    const KF = need(META, 'kerfs', 'META'), kerf = KF.t3 === KF.tw && KF.t3 === KF.t15 ? `${n(KF.t3)} mm` : `${n(KF.t3)} mm (basswood 3 mm), ${n(KF.tw)} mm (walnut) and ${n(KF.t15)} mm (basswood 1.5 mm)`;",
             "    const KF = need(META, 'kerfs', 'META'), kv = STOCK_LIST.map(k => need(KF, k, 'META.kerfs')), kerf = kv.every(v => v === kv[0]) ? `${n(kv[0])} mm` : STOCK_LIST.map(k => `${n(KF[k])} mm (${STOCKS[k].name})`).join(', ');")
stock = block("  /* ------------------------------------------------------------ stock thickness", "  /* ------------------------------------------------------------ the opening: one button opens the box")
stock = rep(stock, "  /* each stock's thinnest and thickest caliper reading and its kerf: slots and bars are drawn for the thickest, tab depths for the thinnest (geom/fits.js) */\n  const STOCK_KEYS = ['t3lo', 't3hi', 'twlo', 'twhi', 't15lo', 't15hi', 'kerf3', 'kerfw', 'kerf15'];\n  const STOCK_RANGE = { t3lo: [0.5, 10], t3hi: [0.5, 10], twlo: [0.5, 10], twhi: [0.5, 10], t15lo: [0.3, 6], t15hi: [0.3, 6], kerf3: [0.001, 0.6], kerfw: [0.001, 0.6], kerf15: [0.001, 0.6] };",
             "  /* each stock's thinnest and thickest caliper reading and its kerf: slots and bars are drawn for the thickest, tab depths for the thinnest. META.stocks[k].params names the three hash keys */\n  const PARAMS = STOCK_LIST.map(k => need(STOCKS[k], 'params', 'META.stocks.' + k));\n  const STOCK_KEYS = PARAMS.flatMap(p => [need(p, 'lo', 'params'), need(p, 'hi', 'params'), need(p, 'kerf', 'params')]);\n  const STOCK_RANGE = Object.fromEntries(PARAMS.flatMap(p => [[p.lo, [0.3, 10]], [p.hi, [0.3, 10]], [p.kerf, [0.001, 0.6]]]));")
stock = rep(stock, "        BumbleGeom.common.register_fonts(m.fonts);", "        GameGeom.register_fonts(m.fonts);")
stock = rep(stock, "run node geom/cli.js, then node build.js');", "run node engine/bin/bg.js parts, then page');")
stock = rep(stock, "rebuild it with node geom/cli.js`);", "rebuild it with node engine/bin/bg.js parts`);")
stock = rep(stock, "        BumbleGeom.parts.eng_store = {", "        GameGeom.eng_store = {")
stock = rep(stock, "rebuild with node geom/cli.js`);", "rebuild the parts`);")
stock = rep(stock, "      const G = BumbleGeom.parts, t0 = performance.now();\n      G.onprogress = function (f, label) { self.postMessage({ type: 'progress', id: m.id, f: f, label: label }); };\n      try {\n        const P = lasergeom.parse_hash(m.hash, G.defaults), r = lasergeom.build(G, P);",
             "      const GG = GameGeom, t0 = performance.now();\n      GG.onprogress = function (f, label) { self.postMessage({ type: 'progress', id: m.id, f: f, label: label }); };\n      try {\n        const P = lasergeom.parse_hash(m.hash, GG.defaults), r = lasergeom.build(GG, P);")
stock = rep(stock, "    w.postMessage({ type: 'fonts', fonts: FREDOKA, cache: ENG_CACHE, parts: PARTS });", "    w.postMessage({ type: 'fonts', fonts: FONTS, cache: ENG_CACHE, parts: PARTS });")
stock = rep(stock, "      return ['t3', 'tw', 't15'].every(s => P[s + 'lo'] <= P[s + 'hi']) ? P : null;", "      return PARAMS.every(p => P[p.lo] <= P[p.hi]) ? P : null;")
opening = block("  /* ------------------------------------------------------------ the opening: one button opens the box", "  /* ------------------------------------------------------------ go */")
opening = rep(opening, "pile: pid === 'meadow-frame' ? 'frame' : Math.round(q.x / 2) + '|' + Math.round(q.y / 2),", "pile: need(q, 'pile', 'packing.json placements'),")
assert "INTRO.shot" in opening, "the page.js is from before 29bb04a (no INTRO.shot): re-split from a09dbdd or later"
assert "boxBtn" in opening, "the page.js is from before a15e8ec (no box button): re-split from a09dbdd or later"
opening = opening.replace("`[bumble ${((performance.now() - T0) / 1000).toFixed(1)}s]`", "`[page ${((performance.now() - T0) / 1000).toFixed(1)}s]`")
go = '\n'.join(lines[find("  /* ------------------------------------------------------------ go */"):])
go = rep(go, "  G = new S.Game({ players: NP, seed: currentSeed }); qr = S.mulberry(1); initTable(G); chips(-1); resetShown(); window.__maxSnap = 0;", "  G = new S.Game({ players: NP, seed: currentSeed }); qr = S.mulberry(1); initTable(G); chips(-1); GT.resetShown(G); window.__maxSnap = 0;")
# startDemo / stopDemo / demoLoop are the machinery template's; BUMBLE's own startDemo line (with its console line) replaces the template's when it differs
sd = lines[find("  function startDemo() {")]

go = rep(go, "    window.__scene = scene; window.__qa = () => ({ turn: G && G.turn, over: G && G.over, illegal, mode, playing: demo.on && !paused, tokensOnBoard: tokens.filter(t => t.where !== 'supply').length });",
         "    window.__scene = scene; window.__qa = () => Object.assign({ turn: G && G.turn, over: G && G.over, illegal, mode, playing: demo.on && !paused }, GT.qa ? GT.qa() : {});")
qa_tpl = tpl('qa.js')
i0 = qa_tpl.index("  function startDemo() {"); i1 = qa_tpl.index("\n", i0)
qa_tpl = qa_tpl[:i0] + sd + qa_tpl[i1:]
page = '\n'.join([tpl('head.js'), box_block, tpl('asm.js'), viewer, qa_tpl, sheets, legend, stock, opening, go]) + '\n'
for bad in ['BumbleSim', 'BumbleCutView', 'BumbleGeom', 'FREDOKA', "'walnut'", "'basswood", 'COLK', 'FLK', 'skep', 'meadow-frame']:
    assert bad not in page, ('game-specific token left in page.js', bad)
open(engine + '/page/page.js', 'w').write(page)

# ---------------------------------------------------------------- BUMBLE's table.js
layout = block("  const T = { static: [], dynamic: [], home:", "  /* ------------------------------------------------------------ the box (machinery for the shoulder box)")
for old, new in [
  ("T.static.push(oak, ...standingPair('oak-a', 'oak-b', 0, 0, 0, 'walnut'));", "T.static.push(oak, ...standingPair('oak-a', 'oak-b', 0, 0, 0, 'oak'));"),
  ("T.static.push(inst, ...standingPair('skep-a', 'skep-b', x, y, 0, 'birch'));", "T.static.push(inst, ...standingPair('skep-a', 'skep-b', x, y, 0, 'hive-' + COLK[c]));"),
  ("const base = mk({ part: part('base-' + COLK[c] + '-' + (b + 1)), mat: c === 3 ? 'walnut' : 'birch', shadow: true }); const bee = mk({ part: part('bee-' + COLK[c]), back: part('bee-' + COLK[c] + '-back'), vertical: true, mat: c === 3 ? 'walnut' : 'birch', rot: 45 });",
   "const base = mk({ part: part('base-' + COLK[c] + '-' + (b + 1)), shadow: true }); const bee = mk({ part: part('bee-' + COLK[c]), back: part('bee-' + COLK[c] + '-back'), vertical: true, rot: 45 });"),
  ("const wasp = { base: mk({ part: part('base-wasp'), mat: 'walnut', shadow: true, rot: -45 }), bee: mk({ part: part('wasp'), back: part('wasp-back'), vertical: true, mat: 'walnut', rot: -45 }) };",
   "const wasp = { base: mk({ part: part('base-wasp'), shadow: true, rot: -45 }), bee: mk({ part: part('wasp'), back: part('wasp-back'), vertical: true, rot: -45 }) };"),
  ("const inst = mk({ part: part('sprout-' + COLK[c]), mat: c === 3 ? 'walnut' : 'birch', shadow: true });", "const inst = mk({ part: part('sprout-' + COLK[c]), shadow: true });"),
  ("const queenB = { base: mk({ part: part('base-queen'), mat: 'walnut', shadow: true, rot: 45 }), bee: mk({ part: part('queen-bee'), back: part('queen-bee-back'), vertical: true, mat: 'walnut', rot: 45 }) };",
   "const queenB = { base: mk({ part: part('base-queen'), shadow: true, rot: 45 }), bee: mk({ part: part('queen-bee'), back: part('queen-bee-back'), vertical: true, rot: 45 }) };"),
  ("const inst = mk({ part: part('hive-' + COLK[c]), mat: 'walnut' });", "const inst = mk({ part: part('hive-' + COLK[c]) });")]:
    layout = rep(layout, old, new)
assert "mat:" not in layout
asms = block("  COLK.forEach((c, ci) => addAsm('asm-bee-' + c,", "  /* a part's name as players read it")
for old, new in [
  ("standee(L, 'base-' + c + '-1', 'bee-' + c, 0, 0, 0, c === 'carpenter' ? 'walnut' : 'birch', 0);", "standee(L, 'base-' + c + '-1', 'bee-' + c, 0, 0, 0);"),
  ("standee(L, 'base-wasp', 'wasp', 0, 0, 0, 'walnut', 0);", "standee(L, 'base-wasp', 'wasp', 0, 0, 0);"),
  ("standee(L, 'base-queen', 'queen-bee', 0, 0, 0, 'walnut', 0);", "standee(L, 'base-queen', 'queen-bee', 0, 0, 0);"),
  ("const pr = standingPair('oak-a', 'oak-b', 0, 0, 0, 'walnut');", "const pr = standingPair('oak-a', 'oak-b', 0, 0, 0, 'oak');"),
  ("const pr = standingPair('skep-a', 'skep-b', 0, 0, 0, 'birch');", "const pr = standingPair('skep-a', 'skep-b', 0, 0, 0, 'hive-' + c);"),
  ("const L = [exFor(mk({ part: part('hive-' + c), mat: 'walnut', x: 0, y: 0, z: 0 }))];", "const L = [exFor(mk({ part: part('hive-' + c), x: 0, y: 0, z: 0 }))];"),
  ("() => { const m = c === 'carpenter' ? 'walnut' : 'birch'; const L = [mk({ part: part('hive-' + c), mat: 'walnut', x: 0, y: 0, z: 0 }), ...standingPair('skep-a', 'skep-b', 0, 0, 0, 'birch')]; HSLOT.forEach(([x, y, r], i) => standee(L, 'base-' + c + '-' + (i + 1), 'bee-' + c, x, y, 3, m, 0, r)); return L.map(i => exFor(i)); }",
   "() => { const L = [mk({ part: part('hive-' + c), x: 0, y: 0, z: 0 }), ...standingPair('skep-a', 'skep-b', 0, 0, 0, 'hive-' + c)]; HSLOT.forEach(([x, y, r], i) => standee(L, 'base-' + c + '-' + (i + 1), 'bee-' + c, x, y, 3, r)); return L.map(i => exFor(i)); }"),
  ("() => { const L = [mk({ part: part('meadow-frame'), x: 0, y: 0, z: 0 }), mk({ part: part('oak'), x: 0, y: 0, z: 0 }), ...standingPair('oak-a', 'oak-b', 0, 0, 0, 'walnut')];",
   "() => { const L = [mk({ part: part('meadow-frame'), x: 0, y: 0, z: 0 }), mk({ part: part('oak'), x: 0, y: 0, z: 0 }), ...standingPair('oak-a', 'oak-b', 0, 0, 0, 'oak')];"),
  ("if (i % 2 === 0) standee(L, 'base-' + COLK[i / 2 % 4] + '-1', 'bee-' + COLK[i / 2 % 4], x + META.SLOT[0][0], y + META.SLOT[0][1], 3, 'birch', 1.2, META.SLOT[0][2]); });",
   "if (i % 2 === 0) standee(L, 'base-' + COLK[i / 2 % 4] + '-1', 'bee-' + COLK[i / 2 % 4], x + META.SLOT[0][0], y + META.SLOT[0][1], 3, META.SLOT[0][2]); });"),
  ("const hx = AF * 1.5, hy = -AF * SQ3 / 2; L.push(mk({ part: part('hive-bumble'), mat: 'walnut', x: hx, y: hy, z: 0 }), ...standingPair('skep-a', 'skep-b', hx, hy, 0, 'birch')); HSLOT.forEach(([x, y, r], i) => standee(L, 'base-bumble-' + (i + 1), 'bee-bumble', hx + x, hy + y, 3, 'birch', 0, r));",
   "const hx = AF * 1.5, hy = -AF * SQ3 / 2; L.push(mk({ part: part('hive-bumble'), x: hx, y: hy, z: 0 }), ...standingPair('skep-a', 'skep-b', hx, hy, 0, 'hive-bumble')); HSLOT.forEach(([x, y, r], i) => standee(L, 'base-bumble-' + (i + 1), 'bee-bumble', hx + x, hy + y, 3, r));"),
  ("PACKING.forEach(q => { need(PARTS, q.pid, 'PARTS (a piece packing.json places)'); L.push(exFor(mk({ part: part(q.pid), x: q.x, y: q.y, z: 6 + q.z, rot: q.rot || 0, thick: q.thick < 2 ? META.THIN : undefined, mat: WAL.test(q.pid) ? 'walnut' : 'birch' }))); });",
   "PACKING.forEach(q => { need(PARTS, q.pid, 'PARTS (a piece packing.json places)'); L.push(exFor(mk({ part: part(q.pid), x: q.x, y: q.y, z: 6 + q.z, rot: q.rot || 0 }))); });")]:
    asms = rep(asms, old, new)
assert "'walnut'" not in asms and "'birch'" not in asms
jigs = block("  addAsm('asm-jig-comb',", "  const PGROUPS = ")
for k in ["fences", "board_at", "board_layers"]:
    assert "JIG." + k in jigs; jigs = jigs.replace("JIG." + k, "JIG.extra." + k)
jigs_fn = "  /* the comb board glue jig, standing as it is used: JIG.extra carries each fence's place from the generator. The fence is drawn with y running down from the\n     base's top face, so it keeps the default vertical mapping and sits at the plate's top face, its 2.5 mm tab reaching down into the slot */\n  function jigAssemblies() {\n" + '\n'.join('  ' + l if l.strip() else l for l in jigs.split('\n')) + "\n  }"
partname = lines[find("  const partName = id => id.replace(/skep-a/")]
pg0 = find("  const PGROUPS = ")
groups = "  const groups = [\n" + '\n'.join(lines[pg0 + 2:find("    ['Box', [", pg0)]) + "\n  ];"
words = block("  const flowerName = t =>", "  /* ------------------------------------------------------------ GAME: setting the table")
init = block("  /* ------------------------------------------------------------ GAME: setting the table", "  let focusCell = null;")
anim = block("  async function animateEvents(evs, my) {", "  /* ------------------------------------------------------------ GAME: assertLegal")
qa = block("  let illegal = 0, shown = null;", "  window.__placements = {")
qa = rep(qa, "  let illegal = 0, shown = null;\n  function resetShown() { shown = { planted: new Map(), move: [0, 1, 2, 3].map(() => 3), cap: [0, 1, 2, 3].map(() => G.rules.cap), wasp: null }; }",
         "  let shown = null;\n  function resetShown(g) { G = g; qr = api.qr; shown = { planted: new Map(), move: [0, 1, 2, 3].map(() => 3), cap: [0, 1, 2, 3].map(() => g.rules.cap), wasp: null }; }\n  function syncShown(g) { for (const [cell, t] of g.tiles) if (t.kind === 'flower') shown.planted.set(cell, t); shown.wasp = g.wasp; for (let c = 0; c < NP; c++) { shown.move[c] = g.col[c].move; shown.cap[c] = g.col[c].cap; } }")
qa = rep(qa, "    const bad = why => { illegal++; log(`<b>ILLEGAL</b> ${escH(e.type)}: ${escH(why)}`, 'sys'); };", "    const bad = why => api.illegal(e, why);")
i0 = qa.index('  function measureSnap(roundShown) {'); i1 = qa.index("  /** every piece where the engine's state g puts it")
qa = qa[:i0] + qa[i1:]
clear = block("  async function clearTable(my) {", "  async function demoLoop(my) {")
table = '\n'.join([tpl('table_head.js'), layout, '', '  /* ------------------------------------------------------------ the assemblies and views the parts list offers */', asms, jigs_fn, partname, groups, '', words, '', init, anim, '', qa, '', clear, tpl('table_tail.js')])
table = table.replace('focusCell = e.cell;', 'api.focus.cell = e.cell;').replace('focusCell = e.to;', 'api.focus.cell = e.to;').replace('focusCell = hiveCell(e.c);', 'api.focus.cell = hiveCell(e.c);').replace('\n    focusCell = null;', '\n    api.focus.cell = null;')
table = rep(table, "    dirty = true;\n  }\n  let combTok", "    api.markDirty();\n  }\n  let combTok")
for bad in ['focusCell', 'escH(', 'illegal++', 'dirty = true']:
    assert bad not in table, ('machinery token left in table.js', bad)
open(game + '/table.js', 'w').write(table + '\n')
print('wrote', engine + '/page/page.js', len(page.split('\n')), 'lines;', game + '/table.js', len(table.split('\n')), 'lines')
