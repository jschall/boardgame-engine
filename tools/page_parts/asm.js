/* SPDX-License-Identifier: MPL-2.0; Copyright (C) 2026 Jonathan Challinger; source: https://github.com/jschall/boardgame-engine
   This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at https://mozilla.org/MPL/2.0/. */

  /* ------------------------------------------------------------ the parts viewer's assemblies: the box (machinery) and the game's (GameTable adds them with api.addAsm) */
  const PV = { static: [], dynamic: [], home: null, current: null, k: 0 };
  let mode = 'table';
  /* a standee on its base: the base flat at (x, y, z), the figure standing on it */
  function standee(list, basePid, pid, x, y, z, rot) { rot = rot || 0; list.push(mk({ part: part(basePid), x, y, z, rot }), posed(mk({ part: part(pid), back: part(pid + '-back'), vertical: true, x, y, rot }), () => ({ z: z + STOCK_T(stockOf(basePid)) }))); }
  function exFor(inst, ex) { inst.x0 = inst.x; inst.y0 = inst.y; inst.z0 = inst.z; inst.ex = ex || [0, 0, 0]; return inst; }
  const ASMS = {};
  function addAsm(id, group, name, desc, rep, build, opts) { ASMS[id] = Object.assign({ group, name, desc, rep, build }, opts || {}); }
  function trayEx(L, which) { const i0 = L.length; tray(L, 0, 0, which); exFor(L[i0]); [[0, 45, 0], [45, 0, 0], [0, -45, 0], [-45, 0, 0]].forEach((d, i) => exFor(L[i0 + 1 + i], d)); }
  function neckEx(L, dz) { const i0 = L.length; neck(L, 0, 0, 'NECK_TOP'); L.slice(i0).forEach(n => exFor(n, [0, 0, dz])); }
  function lidOn(L) { const i0 = L.length; L.push(posed(mk({ part: part('lid-cut'), back: part('lid-outer'), flipped: true, rot: 180, x: IN, y: IN }), D => ({ z: D.LID_FLOOR }))); walls(L, 0, 0, 'lid-up', 'LID_TOP'); L.slice(i0).forEach(x => exFor(x, [0, 0, 110])); }

  /* ------------------------------------------------------------ timing (declared before the game, whose animations call tween and wait) */
  let paused = true, speed = 1, runId = 0, lifted = 0; const CANCEL = { cancel: true };
  function tween(ms, fn, my) { return new Promise((res, rej) => { let t = 0, last = null; const step = () => { const now = performance.now(); if (my !== runId) return rej(CANCEL); if (last !== null && !paused) t += Math.min(100, now - last) * speed; last = now; const u = Math.min(1, t / ms); fn(u); dirty = true; if (u < 1) requestAnimationFrame(step); else res(); }; requestAnimationFrame(step); }); }
  function uiTween(ms, fn) { let t0 = null; const step = now => { if (t0 === null) t0 = now; const u = Math.min(1, (now - t0) / ms); fn(u); dirty = true; if (u < 1) requestAnimationFrame(step); }; requestAnimationFrame(step); }
  const wait = (ms, my) => tween(ms, () => {}, my);
  const arc = (a, b, u, h) => [a[0] + (b[0] - a[0]) * ez(u), a[1] + (b[1] - a[1]) * ez(u), a[2] + (b[2] - a[2]) * ez(u) + Math.sin(Math.PI * u) * h];

  /* ------------------------------------------------------------ log */
  const logEl = $('log');
  window.addEventListener('unhandledrejection', e => log('Script error: ' + (e.reason && e.reason.stack || e.reason), 'sys'));
  const escH = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  function log(h, cls) { const d = document.createElement('div'); d.className = 'le ' + (cls || ''); d.innerHTML = h; logEl.appendChild(d); logEl.scrollTop = logEl.scrollHeight; }
  let G = null, ai = null, qr = null, seen = 0, lastRound = -1, illegal = 0, focusCell = null;
  const pick = a => a[Math.floor(qr() * a.length)];
  const countIllegal = (e, why) => { illegal++; log(`<b>ILLEGAL</b> ${escH(e.type)}: ${escH(why)}`, 'sys'); };

  /* ------------------------------------------------------------ GAME: everything the game brings, through one call */
  const api = { S, R3, META, PARTS, PACKING, JIG, SHOWCASE, scene, $, el, need, part, mk, posed, setPose, rotXY, ez, STOCK_T, STOCK_MAT, stockOf, kindOf, isVertical, DIM, IN, tray, walls, neck, standingPair, standee, exFor, addAsm, trayEx, neckEx, lidOn,
    tween, uiTween, wait, arc, log, escH, pick, illegal: countIllegal, markDirty: () => { dirty = true; }, get qr() { return qr; }, get G() { return G; },
    focus: { get cell() { return focusCell; }, set cell(v) { focusCell = v; } } };
  const GT = GameTable(api);
  for (const k of ['NP', 'players', 'T', 'BOXO', 'LIDO', 'BOXA', 'LIDA', 'initTable', 'setBoardFromState', 'animateEvents', 'resetShown', 'syncShown', 'syncBoard', 'finale', 'clearTable']) if (GT[k] === undefined) throw new Error(`GameTable returned no ${k}: table.js must provide it (engine/README.md)`);
  const NP = GT.NP, NAMES = GT.players.map(p => p.name), COLC = GT.players.map(p => p.colour), T = GT.T, BOXO = GT.BOXO, LIDO = GT.LIDO, BOXA = GT.BOXA, LIDA = GT.LIDA;
  if (NAMES.length < NP) throw new Error(`GameTable.players names ${NAMES.length} seats for a ${NP}-player table`);
  const dot = c => `<span class="dot" style="--c:${COLC[c]}"></span>`;
  const say = (c, line) => log(`<span class="who">${NAMES[c]}:</span> “${line}”`, 'say');
  scene.overlay = ctx => { if (mode !== 'table' || !GT.overlay) return; GT.overlay(ctx, focusCell); };
  const { initTable, setBoardFromState, animateEvents, syncBoard } = GT;
  function chips(active) {
    const elc = $('chips'); elc.innerHTML = '';
    for (let c = 0; c < NP; c++) {
      const d = document.createElement('span'); d.className = 'chip' + (c === active ? ' turn' : ''); d.style.setProperty('--c', COLC[c]);
      d.title = GT.chipTitle ? GT.chipTitle(G, c) : NAMES[c];
      d.innerHTML = `<i class="dot"></i>${NAMES[c]} <b>${GT.shownScore ? GT.shownScore(G, c) : G.score(c).total}</b>`; elc.appendChild(d); }
  }
  Object.assign(api, { dot, say, NAMES, COLC, chips });

  /* ------------------------------------------------------------ the box (machinery for the shoulder box) */
  const B = { static: [], dynamic: [], lid: [], home: { pitch: 72, yaw: -32, dist: 1400, cx: IN / 2, cy: IN / 2, cz: 26, view: 330 } };   /* low enough to see the shadow line */
  tray(B.static, 0, 0, 'base'); neck(B.static, 0, 0, 'NECK_TOP');
  B.lid.push(posed(mk({ part: part('lid-cut'), back: part('lid-outer'), flipped: true, rot: 180, x: IN, y: IN }), D => ({ z: D.LID_FLOOR }))); walls(B.lid, 0, 0, 'lid-up', 'LID_TOP');
  B.lid.forEach(i => i.z0 = i.z); B.dynamic = B.lid;
  /* the assemblies every game has, after the game's own: each standee on its base (META.bases), the two trays, the closed and the packed box, the box jig */
  function partName(id) { if (GT.partName) { const n = GT.partName(id); if (n) return n; } return (META.part_name || {})[id] || id.replace(/-/g, ' '); }
  const BASES = META.bases || {};
  for (const [pid, basePid] of Object.entries(BASES)) if (!ASMS['asm-' + pid] && PARTS[pid] && PARTS[basePid]) addAsm('asm-' + pid, 'Assemblies', `${partName(pid)} on its base`, `The ${partName(pid)}'s 10 mm tab presses between the base's two leaf springs${META.part_key && META.part_key[pid] !== null && META.part_key[pid] !== undefined ? '; the gap in the tab matches the bridge across this base\'s slot, so only the right figure fits' : ''}. Explode lifts it out.`, pid,
    () => { const L = []; standee(L, basePid, pid, 0, 0, 0, 0); exFor(L[0]); exFor(L[1], [0, 0, 18]); return L; }, { pitch: 72, yaw: 15 });
  /* each laminated tray: its frame on its back, with the pieces its pockets hold (META.trays) */
  for (const [tid, tr] of Object.entries(META.trays || {})) if (!ASMS['asm-' + tid] && PARTS[tid]) addAsm('asm-' + tid, 'Assemblies', `${partName(tid)}${tr.frame ? ' with its pocket layer' : ''}`, tr.frame ? `The ${STOCKS[tr.frame].name} pocket layer is glued onto the ${STOCKS[tr.back].name} back; each piece sits in its pocket with 0.3 mm to spare and stands ${tr.pockets[0].proud.toFixed(1)} mm proud${tr.pockets.some(q => q.notch) ? ' (a finger notch where it would not)' : ''}. Explode lifts the layer and the pieces.` : `The pockets are engraved into the tray, each with 0.3 mm to spare round its piece. Explode lifts the pieces.`, tid,
    () => { const L = [exFor(mk({ part: part(tid), x: 0, y: 0, z: 0 }))]; if (tr.frame) L.push(exFor(mk({ part: part(tid + '-frame'), x: 0, y: 0, z: STOCK_T(tr.back) }), [0, 0, 20]));
      for (const q of tr.pockets) if (q.piece && PARTS[q.piece]) L.push(exFor(mk({ part: part(q.piece), x: q.x, y: q.y, z: STOCK_T(tr.back), rot: q.rot }), [0, 0, 40])); return L; }, { pitch: 55, yaw: 15 });
  if (!ASMS['asm-base-tray']) addAsm('asm-base-tray', 'Assemblies', 'Base tray with its neck', 'The floor\'s tabs go through the four walls\' slots and the walls\' finger bands meet at the corners; the neck stands in the base tray, glued in place after its broad lower ends locate it, standing proud so the closed box shows a shadow line. Explode pulls the walls out and lifts the neck.', 'floor-base',
    () => { const L = []; trayEx(L, 'base'); neckEx(L, 70); return L; }, { pitch: 55, yaw: -32 });
  if (!ASMS['asm-lid-tray']) addAsm('asm-lid-tray', 'Assemblies', 'Lid tray', 'The base tray\'s twin without a neck, drawn a hair roomier so that, turned over, it slides down over the neck easily. Explode pulls the walls out.', 'lid-cut', () => { const L = []; trayEx(L, 'lid'); return L; }, { pitch: 55, yaw: -32 });
  if (!ASMS['view-closed']) addAsm('view-closed', 'Views', 'The closed box', 'The lid tray sits turned over on the base. The neck holds the rims apart, leaving a shadow line, with thumb notches on two sides to push them apart. Orbit underneath for the medallion and the product code.', 'lid-cut',
    () => { const L = []; trayEx(L, 'base'); neckEx(L, 0); L.forEach(i => i.ex = [0, 0, 0]); lidOn(L); return L; }, { pitch: 62, yaw: -32, lift: true });
  if (!ASMS['view-packed']) addAsm('view-packed', 'Views', 'The box, packed for storage', 'Every piece inside the closed box, as the packing check placed it. Lift the lid to see where the pieces fit.', 'floor-base',
    () => { const L = []; trayEx(L, 'base'); neckEx(L, 0); L.forEach(i => i.ex = [0, 0, 0]);
      PACKING.forEach(q => { need(PARTS, q.pid, 'PARTS (a piece packing.json places)'); L.push(exFor(mk({ part: part(q.pid), x: q.x, y: q.y, z: 6 + q.z, rot: q.rot || 0 }))); });
      lidOn(L); return L; }, { pitch: 58, yaw: -32, lift: true });
  /* the box glue jig, standing as it is used (JIG carries each ramp's place in the assembled jig, from the generator, not from the cut sheet). A vertical
     instance runs the drawing's y DOWN from z unless flipV is set; the ramp is drawn with its body above the torsion axis and its tab below, so it wants
     flipV and z at the plate's top face: the tab then drops into the mortise and the body stands proud */
  if (JIG && JIG.stations && PARTS['jig-box-base']) addAsm('asm-jig-box', 'Assembly jigs', 'Box glue jig', 'The base plate with sixteen ramped inserts glued into its mortises, two torsion bars carrying each one. Lower a tray onto it open side up: the pads bear 20 to 22 mm above the plate and squeeze all four walls square while the glue sets. Explode lifts the inserts out.', 'jig-box-base',
    () => [exFor(mk({ part: part('jig-box-base'), x: 0, y: 0, z: 0 })), ...JIG.stations.map(s => exFor(mk({ part: part('jig-box-ramp'), vertical: true, flipV: true, x: s.x, y: s.y, z: JIG.thick, rot: s.rot }), [0, 0, 45]))], { pitch: 58, yaw: 20 });
  if (GT.jigAssemblies) GT.jigAssemblies();
  function singleList(id) {
    const vertical = isVertical(id), p = part(id);
    const back = PARTS[id + '-back'] ? part(id + '-back') : id === 'floor-base' ? part('floor-base-under') : id === 'lid-cut' ? part('lid-outer') : undefined;
    const inst = mk({ part: p, vertical, x: 0, y: 0, z: 0, back });
    if (vertical) inst.z = -p.bbox[1];
    return [exFor(inst)];
  }
  const groupIds = g => Object.keys(ASMS).filter(k => ASMS[k].group === g);
  const PGROUPS = [['Assemblies', groupIds('Assemblies')], ['Views', groupIds('Views')], ['Assembly jigs', groupIds('Assembly jigs')]].concat(GT.groups || []);
  const listed = new Set(); for (const [, ids] of PGROUPS) for (const id of ids) listed.add(id);
  const BOX_IDS = ['floor-base', 'lid-cut', 'wall-S-base', 'wall-E-base', 'wall-N-base', 'wall-W-base', 'wall-S-lid', 'wall-E-lid', 'wall-N-lid', 'wall-W-lid', 'neck-A', 'neck-B'];
  const rest = Object.keys(PARTS).filter(k => !listed.has(k) && !BOX_IDS.includes(k) && !/-back$|^lid-inner$|^lid-outer$|^floor-base-(map|under)$|-lid-up$|^jig-|^[wt]?test-|^kerf-|^fitcomb$/.test(k));
  if (rest.length) PGROUPS.push(['Other pieces', rest]);
  PGROUPS.push(['Box', BOX_IDS], ['Kerf coupons and sample joints', Object.keys(PARTS).filter(k => /^([wt]?test-|kerf-)/.test(k))]);
  function thumb(pid) { const inner = PARTS[pid]; if (!inner) return ''; const bb = part(pid).bbox; const m = Math.max(bb[2] - bb[0], bb[3] - bb[1]) * 0.06; return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bb[0] - m} ${bb[1] - m} ${bb[2] - bb[0] + 2 * m} ${bb[3] - bb[1] + 2 * m}">${inner}</svg>`; }
