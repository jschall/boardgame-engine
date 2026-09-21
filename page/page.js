/* SPDX-License-Identifier: MPL-2.0; Copyright (C) 2026 Jonathan Challinger; source: https://github.com/jschall/boardgame-engine
   This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at https://mozilla.org/MPL/2.0/. */
/* page.js (boardgame-engine): the stage, the game and the files section. Machinery shared by every game: the 3D scene, the shoulder box, the
   parts viewer, the modes and modals, the timing, log and chips, the demo loop and the QA contract, the sheet cards and lightbox, the stock inputs
   and the geometry worker, and the opening the box button runs. The game itself is GameTable(api): the table layout, initTable, setBoardFromState,
   animateEvents, assertLegal, noteShown, syncBoard, finale, the assemblies and part groups (engine/README.md lists the contract; a game's table.js
   is the worked example). Globals from build.js: PARTS, LAYOUT, SHEETS, META, PACKING, JIG, SHOWCASE, GEOM_SOURCES, FONTS, ENG_CACHE, GameSim,
   GameTable, CutView, Render3D. */
(function () {
  'use strict';
  const S = GameSim, R3 = Render3D, $ = id => document.getElementById(id);
  /* no defaults for the generator's output: a value missing from parts.json or an element missing from the page is an error, never a guess */
  const need = (o, k, where) => { const v = o[k]; if (v === undefined || v === null) throw new Error(`${where}.${k} is missing: rebuild with node engine/bin/bg.js parts, then page`); return v; };
  const el = id => { const e = $(id); if (!e) throw new Error(`the page has no #${id}: rebuild it with node engine/bin/bg.js page`); return e; };
  const STOCKS = need(META, 'stocks', 'META'), STOCK_LIST = Object.keys(STOCKS);
  const cache = {};
  /* the tray floors' inside faces (the lid's rules, the base's setup map) are engraved from the box sheet's backs file, since every outside face is in the
     front file, face up while cutting; the 3D draws them on the floor's upper face in the open tray */
  const part = id => cache[id] || (cache[id] = Object.assign(R3.parsePart('<svg xmlns="http://www.w3.org/2000/svg">' + CutView(need(PARTS, id, 'PARTS'), need(META, 'leaf_slots', 'META')[id]) + (id === 'lid-cut' ? need(PARTS, 'lid-inner', 'PARTS') : id === 'floor-base' ? need(PARTS, 'floor-base-map', 'PARTS') : '') + '</svg>'), { pid: id }));
  const ez = u => u < .5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
  const rotXY = (deg, x, y) => { const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); return [c * x - s * y, s * x + c * y]; };
  function setPose(inst, anchor, wx, wy, z, deg) { const [rx, ry] = rotXY(deg, anchor[0], anchor[1]); inst.x = wx - rx; inst.y = wy - ry; inst.z = z; inst.rot = deg; }

  const canvas = $('c3d');
  const scene = new R3.Scene(canvas, { pitch: 50, yaw: 0, dist: 3200, cx: 0, cy: 40, cz: 0, view: 980 });
  /* every instance knows its stock, so its mesh thickness and wood follow META after a regeneration */
  const STOCK_T = s => need(need(STOCKS, s, 'META.stocks'), 't', 'META.stocks.' + s);
  const STOCK_MAT = s => need(need(STOCKS, s, 'META.stocks'), 'mat', 'META.stocks.' + s);
  const stockOf = pid => need(need(META, 'part_stock', 'META'), pid, 'META.part_stock');
  const kindOf = pid => (META.part_kind || {})[pid] || (/^(wall-|neck-)/.test(pid) ? 'box' : 'plate');
  const isVertical = pid => /^(standee|pair)$/.test(kindOf(pid)) || /^(wall-|neck-)/.test(pid);
  let nid = 1; const mk = o => { const r = Object.assign({ id: nid++, shadow: true }, o); r.stock = stockOf(r.part.pid); r.mat = STOCK_MAT(r.stock); r.thick = STOCK_T(r.stock); return r; };
  /* the box's heights and offsets from the built stock: tray floor, rim, neck top, the closed lid's floor and rim */
  const DIM = () => { const T3 = STOCK_T(need(META, 'box_stock', 'META')), TW = STOCK_T(need(META, 'neck_stock', 'META')), F = need(META, 'fits', 'META'), WH = need(META, 'WALL_H', 'META'), FU = need(META, 'FLOOR_UP', 'META'), GAP = need(META, 'GAP', 'META'), NH = need(META, 'NECK_H', 'META');
    return { T3, TW, WT: need(F, 'WALL_T', 'META.fits'), WH, FU, NCL: (need(META, 'INNER', 'META') - need(META, 'NECK_OUT', 'META')) / 2, EB: need(META, 'BASE_EASE', 'META'), EL: need(META, 'LID_EASE', 'META'), NECK_ON: META.NECK_ON || 0, NECK_TOP: FU + T3 + (META.NECK_ON || 0) + NH, LID_FLOOR: 2 * WH + GAP - FU - T3, LID_TOP: 2 * WH + GAP }; };
  const posed = (inst, fn) => { inst.repose = () => Object.assign(inst, fn(DIM())); inst.repose(); return inst; };
  let dirty = true;
  /* a cross-lapped pair standing in the tile tilePid: tileZ is the tile's underside; the halves stand on its top face, whatever its stock */
  const standingPair = (a, b, x, y, tileZ, tilePid) => { if (!tilePid) throw new Error(`standingPair(${a}, ${b}): the tile the pair stands in must be named`); return [mk({ part: part(a), back: part(a + '-back'), vertical: true, rot: 0, x, y }), mk({ part: part(b), back: part(b + '-back'), vertical: true, rot: 90, x, y })].map(inst => posed(inst, () => ({ z: tileZ + STOCK_T(stockOf(tilePid)) }))); };

  /* ------------------------------------------------------------ box pieces (as in the SNOOZY viewer) */
  /* IN is the drawn frame both trays and the neck are centred on (IX along x, IY along y: a rectangular box; IN = IX for the square-minded); each tray is
     its ease (D.EB, D.EL) roomier on every side, the lid more than the base */
  const IN = need(META, 'INNER', 'META'), IX = META.INNER_X || IN, IY = META.INNER_Y || IN;
  const easeOf = (D, which) => which === 'base' ? D.EB : D.EL;
  function tray(list, ox, oy, which) {
    list.push(posed(which === 'base' ? mk({ part: part('floor-base'), back: part('floor-base-under'), x: ox, y: oy }) : mk({ part: part('lid-cut'), back: part('lid-outer'), x: ox, y: oy }), D => ({ z: D.FU })));
    walls(list, ox, oy, which, 'WH');
  }
  /* the lid closes turned over about the box's y axis (META.LID_HINGE 'y', the default: E and W trade places) or its x axis ('x': N and S trade);
     a cut lid wall is keyed by its closed position, so in the open tray it stands at its pair's opposite position */
  const HINGE = META.LID_HINGE || 'y', SWAP = HINGE === 'x' ? { S: 'N', N: 'S', E: 'E', W: 'W' } : { S: 'S', N: 'N', E: 'W', W: 'E' };
  const lidClosed = (ox, oy) => HINGE === 'x' ? { flipped: true, rot: 0, x: ox, y: oy } : { flipped: true, rot: 180, x: ox + IX, y: oy + IY };   /* the closed lid panel: the open one turned over about the hinge axis */
  function walls(list, ox, oy, which, zkey) {
    const w = s => part(`wall-${which === 'lid' ? SWAP[s] : s}-${which}`), at = D => { const e = easeOf(D, which); return [ox - e, oy - e, IX + 2 * e, IY + 2 * e]; };   /* this tray's inside corner and spans */
    list.push(posed(mk({ part: w('S'), vertical: true, rot: 0 }), D => { const [x0, y0, , J] = at(D); return { x: x0 - D.WT, y: y0 + J + D.WT - D.T3 / 2, z: D[zkey] }; }), posed(mk({ part: w('E'), vertical: true, rot: -90 }), D => { const [x0, y0, I, J] = at(D); return { x: x0 + I + D.WT - D.T3 / 2, y: y0 + J + D.WT, z: D[zkey] }; }),
      posed(mk({ part: w('N'), vertical: true, rot: 180 }), D => { const [x0, y0, I] = at(D); return { x: x0 + I + D.WT, y: y0 - D.WT + D.T3 / 2, z: D[zkey] }; }), posed(mk({ part: w('W'), vertical: true, rot: 90 }), D => { const [x0, y0] = at(D); return { x: x0 - D.WT + D.T3 / 2, y: y0 - D.WT, z: D[zkey] }; }));
  }
  /* a neck board standing from its near end along rot: the whole board, or the two halves a long box's sheet forced (neck_split: the board is
     symmetric, so the same half serves both ends, the second turned end for end at the far end of the same line) */
  function board(list, kind, rot, at, len) {
    if (PARTS[`neck-${kind}`]) { list.push(posed(mk({ part: part(`neck-${kind}`), vertical: true, rot }), at)); return; }
    const rad = rot * Math.PI / 180, dx = Math.cos(rad), dy = Math.sin(rad);
    list.push(posed(mk({ part: part(`neck-${kind}-half`), vertical: true, rot }), at),
      posed(mk({ part: part(`neck-${kind}-half`), vertical: true, rot: rot + 180 }), D => { const p = at(D), l = len(D); return { x: p.x + dx * l, y: p.y + dy * l, z: p.z }; }));
  }
  function neck(list, ox, oy, zkey) {
    const LA = D => IX - 2 * D.NCL, LB = D => IY - 2 * D.NCL;   /* the boards' outer lengths */
    board(list, 'A', 0, D => ({ x: ox + D.NCL, y: oy + IY - D.NCL - D.TW / 2, z: D[zkey] }), LA); board(list, 'A', 180, D => ({ x: ox + IX - D.NCL, y: oy + D.NCL + D.TW / 2, z: D[zkey] }), LA);
    board(list, 'B', -90, D => ({ x: ox + IX - D.NCL - D.TW / 2, y: oy + IY - D.NCL, z: D[zkey] }), LB); board(list, 'B', 90, D => ({ x: ox + D.NCL + D.TW / 2, y: oy + D.NCL, z: D[zkey] }), LB);
  }


  /* ------------------------------------------------------------ the parts viewer's assemblies: the box (machinery) and the game's (GameTable adds them with api.addAsm) */
  const PV = { static: [], dynamic: [], home: null, current: null, k: 0 };
  let mode = 'table';
  let viewLock = false, persistCam = false;   /* the GET string: each modal writes its place so a reload opens the same view */
  /* a standee on its base: the base flat at (x, y, z), the figure standing on it */
  function standee(list, basePid, pid, x, y, z, rot) { rot = rot || 0; list.push(mk({ part: part(basePid), x, y, z, rot }), posed(mk({ part: part(pid), back: part(pid + '-back'), vertical: true, x, y, rot }), () => ({ z: z + STOCK_T(stockOf(basePid)) }))); }
  function exFor(inst, ex) { inst.x0 = inst.x; inst.y0 = inst.y; inst.z0 = inst.z; inst.ex = ex || [0, 0, 0]; return inst; }
  const ASMS = {};
  function addAsm(id, group, name, desc, rep, build, opts) { ASMS[id] = Object.assign({ group, name, desc, rep, build }, opts || {}); }
  function trayEx(L, which) { const i0 = L.length; tray(L, 0, 0, which); exFor(L[i0]); [[0, 45, 0], [45, 0, 0], [0, -45, 0], [-45, 0, 0]].forEach((d, i) => exFor(L[i0 + 1 + i], d)); }
  function neckEx(L, dz) { const i0 = L.length; neck(L, 0, 0, 'NECK_TOP'); L.slice(i0).forEach(n => exFor(n, [0, 0, dz])); }
  function lidOn(L) { const i0 = L.length; L.push(posed(mk(Object.assign({ part: part('lid-cut'), back: part('lid-outer') }, lidClosed(0, 0))), D => ({ z: D.LID_FLOOR }))); walls(L, 0, 0, 'lid-up', 'LID_TOP'); L.slice(i0).forEach(x => exFor(x, [0, 0, 110])); }

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
  const api = { S, R3, META, PARTS, PACKING, JIG, SHOWCASE, scene, $, el, need, part, mk, posed, setPose, rotXY, ez, STOCK_T, STOCK_MAT, stockOf, kindOf, isVertical, DIM, IN, IX, IY, tray, walls, neck, standingPair, standee, exFor, addAsm, trayEx, neckEx, lidOn,
    tween, uiTween, wait, arc, log, escH, pick, illegal: countIllegal, markDirty: () => { dirty = true; }, get qr() { return qr; }, get G() { return G; },
    focus: { get cell() { return focusCell; }, set cell(v) { focusCell = v; } } };
  const GT = GameTable(api);
  for (const k of ['NP', 'players', 'T', 'BOXO', 'LIDO', 'BOXA', 'LIDA', 'initTable', 'setBoardFromState', 'animateEvents', 'resetShown', 'syncShown', 'syncBoard', 'finale', 'clearTable']) if (GT[k] === undefined) throw new Error(`GameTable returned no ${k}: table.js must provide it (engine/README.md)`);
  const NP = GT.NP, NAMES = GT.players.map(p => p.name), COLC = GT.players.map(p => p.colour), T = GT.T, BOXO = GT.BOXO, LIDO = GT.LIDO, BOXA = GT.BOXA, LIDA = GT.LIDA;
  const DARK = '#120c07';   /* the void the closed boxes stand in, until the lights come up on the table */
  scene.opts.table = DARK;
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
  const B = { static: [], dynamic: [], lid: [], home: { pitch: 72, yaw: -32, dist: 1400, cx: IX / 2, cy: IY / 2, cz: 26, view: 330 * Math.max(1, Math.max(IX, IY) / 190) } };   /* low enough to see the shadow line */
  tray(B.static, 0, 0, 'base'); neck(B.static, 0, 0, 'NECK_TOP');
  B.lid.push(posed(mk(Object.assign({ part: part('lid-cut'), back: part('lid-outer') }, lidClosed(0, 0))), D => ({ z: D.LID_FLOOR }))); walls(B.lid, 0, 0, 'lid-up', 'LID_TOP');
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
    () => { const L = [], D = DIM(), floorTop = D.FU + D.T3; trayEx(L, 'base'); neckEx(L, 0); L.forEach(i => i.ex = [0, 0, 0]);   /* the packer's z is above the floor's top: FLOOR_UP + the floor (0 + t for a flush floor; 6 was the raised floor's, and sank TUMBLER's neck into its pocket layer) */
      PACKING.forEach(q => { need(PARTS, q.pid, 'PARTS (a piece packing.json places)'); L.push(exFor(mk({ part: part(q.pid), x: q.x, y: q.y, z: floorTop + q.z, rot: q.rot || 0 }))); });
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
  const BOX_IDS = ['floor-base', 'lid-cut', 'wall-S-base', 'wall-E-base', 'wall-N-base', 'wall-W-base', 'wall-S-lid', 'wall-E-lid', 'wall-N-lid', 'wall-W-lid', 'neck-A', 'neck-A-half', 'neck-B', 'neck-B-half'].filter(k => PARTS[k]);
  const rest = Object.keys(PARTS).filter(k => !listed.has(k) && !BOX_IDS.includes(k) && !/-back$|^lid-inner$|^lid-outer$|^floor-base-(map|under)$|-lid-up$|^jig-|^[wt]?test-|^kerf-|^fitcomb$/.test(k));
  if (rest.length) PGROUPS.push(['Other pieces', rest]);
  PGROUPS.push(['Box', BOX_IDS], ['Kerf coupons and sample joints', Object.keys(PARTS).filter(k => /^([wt]?test-|kerf-)/.test(k))]);
  function thumb(pid) { const inner = PARTS[pid]; if (!inner) return ''; const bb = part(pid).bbox; const m = Math.max(bb[2] - bb[0], bb[3] - bb[1]) * 0.06; return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bb[0] - m} ${bb[1] - m} ${bb[2] - bb[0] + 2 * m} ${bb[3] - bb[1] + 2 * m}">${inner}</svg>`; }

  const plist = $('plist');
  function buildPlist() {
  plist.innerHTML = '';
  for (const [g, ids] of PGROUPS) {
    const h = document.createElement('h5'); h.textContent = g; plist.appendChild(h);
    for (const id of ids) {
      const A = ASMS[id]; const pid = A ? A.rep : id; if (!PARTS[pid]) continue;
      const bb = part(pid).bbox; const sub = A ? A.build().length + ' parts' : `${Math.round(bb[2] - bb[0])} × ${Math.round(bb[3] - bb[1])} mm`;
      const bt = document.createElement('button'); bt.className = 'pitem'; bt.dataset.id = id; bt.innerHTML = `${thumb(pid)}<span><span class="pn">${A ? A.name : partName(id)}</span><span class="ps">${sub}</span></span>`;
      bt.addEventListener('click', () => { persistCam = false; loadPart(id); }); plist.appendChild(bt);
    }
  }
  }
  buildPlist();
  function loadPart(id) {
    const A = ASMS[id]; const L = A ? A.build() : singleList(id); PV.current = id; PV.k = 0;
    plist.querySelectorAll('.pitem').forEach(b => b.classList.toggle('on', b.dataset.id === id)); const on = plist.querySelector('.pitem.on'); if (on) plist.scrollTop = Math.max(0, on.offsetTop - plist.offsetTop - 80);
    const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
    for (const inst of L) { const bb = inst.part.bbox, t = need(inst, 'thick', 'a 3D instance'), e = inst.ex || [0, 0, 0]; for (const u of [bb[0], bb[2]]) for (const v of [bb[1], bb[3]]) for (const hh of [0, t]) { const w = scene.world(scene.basis(inst), u, v, hh); for (const k of (A && A.frame === 'assembled' ? [0] : [0, 1])) for (let d = 0; d < 3; d++) { lo[d] = Math.min(lo[d], w[d] + e[d] * k); hi[d] = Math.max(hi[d], w[d] + e[d] * k); } } }
    const size = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2], 20);
    PV.dynamic = L; PV.home = { cx: (lo[0] + hi[0]) / 2, cy: (lo[1] + hi[1]) / 2, cz: (lo[2] + hi[2]) / 2, view: size * 1.3, dist: size * 4 + 300, pitch: A && A.pitch !== undefined ? A.pitch : 55, yaw: A && A.yaw !== undefined ? A.yaw : 25 };
    const pb = A ? null : part(id).bbox;
    $('pv-desc').innerHTML = A ? `<b>${A.name}</b><br>${A.desc}` : `<b>${partName(id)}</b>: ${Math.round(pb[2] - pb[0])} × ${Math.round(pb[3] - pb[1])} mm, ${need(STOCKS[stockOf(id)], 'name', 'META.stocks')}, exactly as cut.`;
    const ex = $('pv-explode'); ex.disabled = !A || !L.some(i => i.ex[0] || i.ex[1] || i.ex[2]); ex.textContent = A && A.lift ? 'Lift the lid' : 'Explode';
    if (mode === 'parts') { scene.dynamic = PV.dynamic; scene.setView(framed(PV.home)); dirty = true; writeView(); }
  }
  function setExplode(to, instant) {
    const A = ASMS[PV.current]; const from = PV.k;
    const apply = k => { PV.k = k; for (const i of PV.dynamic) if (i.ex) { i.x = i.x0 + i.ex[0] * k; i.y = i.y0 + i.ex[1] * k; i.z = i.z0 + i.ex[2] * k; } dirty = true; if (k === 0 || k === 1) writeView(); };
    $('pv-explode').textContent = A && A.lift ? (to ? 'Close the lid' : 'Lift the lid') : (to ? 'Collapse' : 'Explode');
    if (instant) apply(to); else uiTween(800, u => apply(from + (to - from) * ez(u)));
  }
  $('pv-explode').addEventListener('click', () => setExplode(PV.k > 0.5 ? 0 : 1));
  const MODES = { table: T, box: B, parts: PV };
  const FOG = [1800, 4600];   /* the table fades into the backdrop beyond this, so no camera angle shows its edge */
  /* the parts panel covers the right of the stage while it is open, so a home view is shifted to keep its subject in the clear part */
  const panelEl = el('panel'), stageEl = el('stage');
  /* the whole table in the viewport: from the game's home view, the camera backs off (never in) until every piece and both trays project inside a
     5 % margin, and the view centres on them (owner, 2026-09-18: "after opening, the view is too zoomed-in, the boxes are cut off on the left and
     right sides"). Projection is near enough linear in 1/view at the focus depth; two rounds settle the perspective. */
  function fitTable(v) {
    const insts = T.static.concat(T.dynamic).filter(inst => !inst.hidden && inst.part);
    if (!insts.length) return v;
    for (let round = 0; round < 2; round++) {
      scene.setView(v);
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const inst of insts) { const B = scene.basis(inst), bb = inst.part.bbox; for (const u of [bb[0], bb[2]]) for (const w of [bb[1], bb[3]]) for (const h of [0, inst.thick || 3]) { const p = scene.project(...scene.world(B, u, w, h)); x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); } }
      const m = 0.05, grow = Math.max(1, (x1 - x0) / (scene.W * (1 - 2 * m)), (y1 - y0) / (scene.H * (1 - 2 * m)));
      const mm = v.view / scene.H, dx = ((x0 + x1) / 2 - scene.W / 2) * mm, dy = (scene.H / 2 - (y0 + y1) / 2) * mm, R = scene.cam.right, U = scene.cam.up;   /* the subject's centre to the viewport's */
      v = Object.assign({}, v, { view: v.view * grow, cx: v.cx + R[0] * dx + U[0] * dy, cy: v.cy + R[1] * dx + U[1] * dy, cz: v.cz + R[2] * dx + U[2] * dy });
    }
    return v;
  }
  function framed(v0) {
    const portrait = scene.H > scene.W, base = v0 === T.home ? fitTable(v0) : v0, v = Object.assign({}, base, { view: base.view * (portrait ? 1.08 * scene.H / scene.W : 1) });   /* a tall phone screen backs off so the whole width of the subject fits */
    scene.setView(v); const mm = v.view / scene.H, out = Object.assign({}, v);
    if (portrait) { const d = scene.H * 0.13 * mm, U = scene.cam.up; out.cx -= U[0] * d; out.cy -= U[1] * d; out.cz -= U[2] * d; }   /* the log covers the bottom of a phone screen: the subject sits higher */
    if (panelEl.hidden) return out;
    const r = panelEl.getBoundingClientRect(), s = stageEl.getBoundingClientRect(); if (!r.width || !s.width) return out;
    if (r.left - s.left > s.width / 2) { const d = r.width / 2 * mm, R = scene.cam.right; out.cx += R[0] * d; out.cy += R[1] * d; out.cz += R[2] * d; }
    else { const d = r.height / 2 * mm, U = scene.cam.up; out.cx -= U[0] * d; out.cy -= U[1] * d; out.cz -= U[2] * d; }
    return out;
  }
  function setMode(m) {
    mode = m; const Mo = MODES[m]; if (m === 'parts' && !PV.home) loadPart(PV.current || GT.defaultPart || Object.keys(ASMS)[0]);
    panelEl.hidden = m !== 'parts'; stageEl.classList.toggle('parts', m === 'parts');
    scene.static = Mo.static; scene.dynamic = Mo.dynamic; scene.opts.table = m === 'parts' ? '#e4d6b8' : '#3b2a1c'; scene.opts.plain = m === 'parts'; scene.opts.fog = m === 'parts' ? null : FOG; scene.setView(framed(Mo.home)); dirty = true;
  }
  /* the nav's three modals: the rulebook and the laser files are overlays; Parts is the panel over the stage with the scene in parts mode. The game pauses behind any of them.
     Each open view is a GET string (location.search) so a reload lands on the same modal, page, part, explode, camera or sheet. Stock and QA stay in the hash. */
  const modalOpen = () => document.body.classList.contains('modal-open');
  const VIEW_KEYS = ['rules', 'parts', 'files', 'x', 'p', 'y', 'v', 'cx', 'cy', 'cz'];
  function hashPairs() { return location.hash.slice(1).split('&').filter(Boolean).map(s => { const i = s.indexOf('='); return i < 0 ? [s, ''] : [decodeURIComponent(s.slice(0, i)), decodeURIComponent(s.slice(i + 1))]; }); }
  function writeView() {
    if (viewLock || Object.fromEntries(hashPairs()).shot !== undefined) return;
    const p = new URLSearchParams(location.search);
    for (const k of VIEW_KEYS) p.delete(k);
    const overlay = [...document.querySelectorAll('.modal')].find(m => !m.hidden);
    const name = overlay ? overlay.id.slice(6) : (mode === 'parts' ? 'parts' : '');
    if (name === 'rules') {
      p.set('rules', String((window.__manual && window.__manual.page) || 1));
    } else if (name === 'parts') {
      p.set('parts', PV.current || '');
      if (PV.k > 0.5) p.set('x', '1');
      if (persistCam) {
        const o = scene.opts;
        p.set('p', String(Math.round(o.pitch * 10) / 10)); p.set('y', String(Math.round(o.yaw * 10) / 10)); p.set('v', String(Math.round(o.view)));
        p.set('cx', String(Math.round(o.cx))); p.set('cy', String(Math.round(o.cy))); p.set('cz', String(Math.round(o.cz)));
      }
    } else if (name === 'files') {
      p.set('files', (window.__lightbox && window.__lightbox.open && window.__lightbox.id) || '');
    }
    const qs = p.toString(), next = location.pathname + (qs ? '?' + qs : '') + location.hash;
    if (next !== location.pathname + location.search + location.hash) history.replaceState(null, '', next);
  }
  function applyView() {
    if (Object.fromEntries(hashPairs()).shot !== undefined) return;
    const q = Object.fromEntries(new URLSearchParams(location.search));
    viewLock = true;
    try {
      if (q.parts !== undefined) {
        openModal('parts');
        if (q.parts) loadPart(q.parts);
        if (q.x === '1') setExplode(1, true);
        if (q.p !== undefined) {
          persistCam = true;
          const v = {}; for (const [k, n] of [['p', 'pitch'], ['y', 'yaw'], ['v', 'view'], ['cx', 'cx'], ['cy', 'cy'], ['cz', 'cz']]) if (q[k] !== undefined) v[n] = +q[k];
          scene.setView(v); dirty = true;
        }
      } else if (q.rules !== undefined) {
        openModal('rules');
        if (q.rules && window.__manual && window.__manual.set) window.__manual.set(+q.rules);
      } else if (q.files !== undefined) {
        openModal('files');
        if (q.files && window.__lightbox && window.__lightbox.show) window.__lightbox.show(q.files);
      }
    } finally { viewLock = false; writeView(); }
  }
  window.__onManualPage = writeView;
  function openModal(name) {
    if (name === 'parts') { if (mode !== 'parts') { paused = true; introFinish(); setMode('parts'); } writeView(); return; }
    const m = el('modal-' + name); if (!m.hidden) return;
    if (name === 'files') {
      if (document.readyState === 'complete') ensurePreviews();
      else window.addEventListener('load', ensurePreviews, { once: true });
    }
    m.hidden = false; document.body.classList.add('modal-open'); paused = true;
    const c = m.querySelector('.close'); if (c && c.focus) c.focus({ preventScroll: true });
    writeView();
  }
  function closeModal(name) {
    if (name === 'parts') { if (mode === 'parts') { persistCam = false; setMode('table'); if (demo.on) paused = false; writeView(); } return; }
    const m = el('modal-' + name); m.hidden = true;
    if (![...document.querySelectorAll('.modal')].some(x => !x.hidden)) document.body.classList.remove('modal-open');
    if (demo.on && mode === 'table') paused = false;
    writeView();
  }
  document.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', () => openModal(b.dataset.open)));
  document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => closeModal(b.dataset.close)));
  document.querySelectorAll('.modal').forEach(m => m.addEventListener('click', e => { if (e.target === m) closeModal(m.id.slice(6)); }));
  window.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || (window.__lightbox && window.__lightbox.open)) return;
    const open = [...document.querySelectorAll('.modal')].find(m => !m.hidden); if (open) closeModal(open.id.slice(6)); else if (mode === 'parts') closeModal('parts');
  });
  window.__modal = { open: openModal, close: closeModal, apply: applyView };
  /* look is the reader's orbit on top of the opening's scripted camera, so a drag on the closed boxes or during the flights is not overwritten next frame */
  const LOOK = { yaw: 0, pitch: 0, cx: 0, cy: 0, cz: 0, view: 1 };
  const resetLook = () => { LOOK.yaw = LOOK.pitch = LOOK.cx = LOOK.cy = LOOK.cz = 0; LOOK.view = 1; };
  const withLook = base => Object.assign({}, base, { yaw: base.yaw + LOOK.yaw, pitch: base.pitch + LOOK.pitch, cx: base.cx + LOOK.cx, cy: base.cy + LOOK.cy, cz: base.cz + LOOK.cz, view: Math.max(20, Math.min(4000, (base.view || 980) * LOOK.view)) });
  (function orbit(cv, sc) {
    let drag = null;
    cv.addEventListener('pointerdown', e => { if (modalOpen()) return; e.preventDefault(); drag = { btn: e.button, x: e.clientX, y: e.clientY, yaw: sc.opts.yaw, pitch: sc.opts.pitch, cx: sc.opts.cx, cy: sc.opts.cy, cz: sc.opts.cz }; cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointermove', e => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (INTRO.live) {
        const base = introCamera(INTRO.p);
        if (drag.btn === 2 || e.shiftKey) { const mm = sc.opts.view / sc.H; const R = sc.cam.right, U = sc.cam.up;
          LOOK.cx = drag.cx - R[0] * dx * mm + U[0] * dy * mm - base.cx; LOOK.cy = drag.cy - R[1] * dx * mm + U[1] * dy * mm - base.cy; LOOK.cz = drag.cz - R[2] * dx * mm + U[2] * dy * mm - base.cz; }
        else { LOOK.yaw = drag.yaw - dx * 0.5 - base.yaw; LOOK.pitch = drag.pitch - dy * 0.35 - base.pitch; }
        sc.setView(withLook(base));
      } else if (drag.btn === 2 || e.shiftKey) { const mm = sc.opts.view / sc.H; const R = sc.cam.right, U = sc.cam.up; sc.setView({ cx: drag.cx - R[0] * dx * mm + U[0] * dy * mm, cy: drag.cy - R[1] * dx * mm + U[1] * dy * mm, cz: drag.cz - R[2] * dx * mm + U[2] * dy * mm }); }
      else sc.setView({ yaw: drag.yaw - dx * 0.5, pitch: drag.pitch - dy * 0.35 });
      dirty = true; });
    cv.addEventListener('pointerup', () => { drag = null; if (mode === 'parts') { persistCam = true; writeView(); } }); cv.addEventListener('pointercancel', () => { drag = null; });
    cv.addEventListener('contextmenu', e => e.preventDefault());
    /* the wheel (and a trackpad pinch, which arrives as ctrl + wheel) zooms; during the opening it scales the scripted view */
    cv.addEventListener('wheel', e => { e.preventDefault(); if (modalOpen()) return;
      if (INTRO.live) { LOOK.view = Math.max(0.05, Math.min(8, LOOK.view * Math.exp(e.deltaY * 0.0012))); sc.setView(withLook(introCamera(INTRO.p))); }
      else sc.setView({ view: Math.max(20, Math.min(4000, sc.opts.view * Math.exp(e.deltaY * 0.0012))) });
      dirty = true; if (mode === 'parts') { persistCam = true; writeView(); } }, { passive: false });
  })(canvas, scene);
  window.addEventListener('resize', () => { scene.resize(); dirty = true; });


  /* ------------------------------------------------------------ the QA contract (window.__maxSnap, __placements) and the game loop */
  function measureSnap(roundShown) {
    let snap = 0;
    for (const [inst, x, y, z, rot, period] of syncBoard(roundShown)) {   /* period: a hexagonal token looks the same every 60 degrees */
      const P = period || 360, d = rot === undefined ? 0 : Math.abs(((((rot - (inst.rot || 0)) % P) + P * 1.5) % P) - P / 2);
      snap = Math.max(snap, Math.hypot(x - inst.x, y - inst.y), Math.abs(z - inst.z), d * 0.1);
    }
    window.__maxSnap = Math.max(window.__maxSnap || 0, snap);
    return Math.max(snap, measureSettled());
  }
  /* the settled pose: once a turn's animation is over, every piece must already be exactly where the game's own re-pose from the engine state puts
     it, compared as the renderer sees it (position, turn, flip, standing, groups: the whole basis), so an animation that ends short of its pose and
     snaps is caught (owner, 2026-09-19: "the loot does not land on the cat correctly and snaps to the correct pose at the end of the animation.
     this seems like it could be an engine level unit test"); the worst piece is reported in window.__snapWorst */
  function measureSettled() {
    const insts = T.static.concat(T.dynamic).filter(i => i.part);
    const poses = () => { const by = new Map(); for (const i of insts) { if (i.hidden) continue; const pid = i.part.pid; if (!by.has(pid)) by.set(pid, []); by.get(pid).push(scene.basis(i)); } return by; };
    const before = poses(); setBoardFromState(G); GT.syncShown(G); dirty = true; const after = poses();
    /* two copies of one part are interchangeable (the re-pose may deal the other disc): each shown piece is matched to the nearest shown copy of its part */
    const gap = (b, a) => Math.max(...['O', 'U', 'V', 'N'].map(key => Math.hypot(b[key][0] - a[key][0], b[key][1] - a[key][1], b[key][2] - a[key][2]) * (key === 'O' ? 1 : 10)));   /* a unit axis off by 0.1 counts as a millimetre */
    let worst = 0, who = null;
    for (const pid of new Set([...before.keys(), ...after.keys()])) {
      const B = before.get(pid) || [], A0 = after.get(pid) || [], A = A0.slice();
      let d = B.length === A.length ? 0 : 1e3, pair = null;   /* shown or hidden by the animation but not by the state */
      for (const b of B) { if (!A.length) break; let k = 0, best = Infinity; A.forEach((a, j) => { const g = gap(b, a); if (g < best) { best = g; k = j; } }); if (best > d) pair = [b, A[k]]; A.splice(k, 1); d = Math.max(d, best); }
      if (d > worst) { worst = d; who = pid; }
      if (d > 0.3) (window.__snapLog = window.__snapLog || []).push({ turn: G && G.turn, pid, mm: +d.toFixed(2), shown: [B.length, A0.length], from: pair && pair[0].O.map(v => +v.toFixed(2)), to: pair && pair[1].O.map(v => +v.toFixed(2)) });
    }
    window.__maxSnap = Math.max(window.__maxSnap || 0, worst);
    if (worst > (window.__snapWorst ? window.__snapWorst.mm : 0)) window.__snapWorst = { pid: who, mm: +worst.toFixed(2), turn: G && G.turn };
    return worst;
  }
  window.__placements = {
    table: () => { introFinish(); return T.static.concat(T.dynamic); },
    midgame: turns => { introFinish(); const g = new S.Game({ players: NP, seed: SHOWCASE.seed }), rng = S.mulberry(SHOWCASE.seed * 13 + 5); if (GT.opening) GT.opening(g, rng); for (let i = 0; i < turns && !g.over; i++) S.playTurn(g, rng); setBoardFromState(g); return T.static.concat(T.dynamic); },
    box: () => B.static.concat(B.lid),
    assemblies: () => Object.keys(ASMS),
    assembly: id => need(ASMS, id, 'ASMS').build(),
  };

  async function run(seed, my, resume) {
    try {
      if (resume) { chips(-1); log('The game goes on.', 'sys'); } else {
      G = new S.Game({ players: NP, seed }); ai = S.mulberry(seed * 13 + 5); qr = S.mulberry(seed + 77);
      initTable(G); chips(-1); illegal = 0; GT.resetShown(G); seen = 0; lastRound = -1;
      log(GT.gameLine ? GT.gameLine(G) : `<b>Game ${seed}.</b> ${[...Array(NP).keys()].map(c => `${dot(c)}${NAMES[c]}`).join(', ')}.`, 'sys');
      if (GT.opening) { const line = GT.openingLine ? GT.openingLine(G) : null; if (line) log(line, 'round'); GT.opening(G, ai); await animateEvents(G.log.slice(seen), my); seen = G.log.length; measureSnap(0); }
      }
      while (!G.over) {
        if (G.round !== lastRound) { lastRound = G.round; log(GT.roundLine ? GT.roundLine(G) : `Round ${G.round + 1}`, 'round'); if (GT.onRound) await GT.onRound(G, my); }
        chips(G.current);
        S.playTurn(G, ai);
        await animateEvents(G.log.slice(seen), my); seen = G.log.length;
        measureSnap(lastRound);
        chips(-1); await wait(700, my);
        if (window.__stopAfter && G.turn >= window.__stopAfter) { paused = true; window.__stopAfter = 0; }
      }
      await GT.finale(my);
    } catch (e) { if (e !== CANCEL) throw e; }
  }
  /* the demo: at the bottom of the page the table plays game after game by itself, and there are no controls. Scrolling back up hands the
     pieces to the opening again (returnToTable). The QA hook #shot=table&anim=N runs the same loop and pauses after N turns. */
  const demo = { on: false, resume: false };
  let currentSeed = SHOWCASE.seed;
  async function demoLoop(my) {
    try {
      for (let seed = currentSeed; ; seed = 1 + Math.floor(Math.random() * 99999)) {
        currentSeed = seed; if (!demo.resume) logEl.innerHTML = '';
        await run(seed, my, demo.resume); if (my !== runId) return; demo.resume = false;   /* a cancelled loop leaves the flag to the next one */
        await wait(7000, my); log('Clearing the table for the next game.', 'sys'); await GT.clearTable(my);
      }
    } catch (e) { if (e !== CANCEL) throw e; }
  }
  function startDemo() { if (demo.on) { paused = false; return; } demo.on = true; paused = false; dbg(`the game starts (seed ${currentSeed}${demo.resume ? ', resumed' : ''})`); demoLoop(++runId); }   /* demo.resume set by returnToTable: the loop picks the game up where it stopped */
  function stopDemo() { demo.on = false; paused = true; ++runId; focusCell = null; }
  function syncToEngine() { setBoardFromState(G); seen = G.log.length; chips(-1); GT.resetShown(G); GT.syncShown(G); }

  /* ------------------------------------------------------------ laser sheets (machinery) */
  /* a sheet's download and its preview are blob URLs (a data URL took a base64 pass over megabytes of text per sheet); a URL is revoked when its
     card gets a new one, so a regeneration frees the old sheet */
  const svgURL = svg => URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  const setURL = (elm, attr, url) => { const old = elm.getAttribute(attr); if (old && old.startsWith('blob:')) URL.revokeObjectURL(old); elm.setAttribute(attr, url); };
  /* the four clamp spots of a two-sided sheet, drawn on its picture only: the sheet is clamped at its four full-sheet corners inside these triangles,
     where lasergeom places no part */
  const twoSided = name => !!LAYOUT['backs-' + name] || name.startsWith('backs-');
  function withClampSpots(name, svg) {
    if (!twoSided(name)) return svg;
    const C = need(META, 'clamp_spots', 'META'), W = need(META, 'sheet_w', 'META'), K = need(C, 'legs', 'META.clamp_spots'), DY = need(C, 'sheet_h', 'META.clamp_spots');
    const tri = pts => `<polygon points="${pts.map(p => p.join(',')).join(' ')}" fill="#00a000" fill-opacity="0.28" stroke="#00a000" stroke-width="0.4"/>`;
    /* the triangles are in layout coordinates: a file written datum-left carries its quarter turn on an outer group, so the spots take the same transform */
    const turn = svg.match(/<g id="datum-left" transform="([^"]*)">/);
    const spots = `<g id="clamp-spots"${turn ? ` transform="${turn[1]}"` : ''}>${[[[0, 0], [K, 0], [0, K]], [[W, 0], [W - K, 0], [W, K]], [[0, DY], [K, DY], [0, DY - K]], [[W, DY], [W - K, DY], [W, DY - K]]].map(tri).join('')}</g>`;
    const i = svg.lastIndexOf('</svg>'); if (i < 0) throw new Error(`${name}.svg has no closing </svg>`);
    return svg.slice(0, i) + spots + svg.slice(i);
  }
  function sheetPreview(name, svg) {
    if (twoSided(name)) return withClampSpots(name, svg);
    /* Test offcuts have no registration frame. Fit the thumbnail/lightbox to */
    /* their actual geometry, preserving the complete manufacturing download. */
    const root = new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement;
    if (root.tagName !== 'svg' || root.querySelector('parsererror')) throw new Error(`${name}: invalid SVG`);
    root.style.position = 'absolute'; root.style.left = '-10000px'; root.style.visibility = 'hidden';
    document.body.appendChild(root);
    let b = root.getBBox();
    if (b.height > b.width) {
      const turn = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      turn.setAttribute('transform', 'matrix(0,-1,1,0,0,0)');
      for (const child of [...root.childNodes]) turn.appendChild(child);
      root.appendChild(turn); b = root.getBBox();
    }
    for (const path of root.querySelectorAll('path[stroke]')) {
      path.setAttribute('vector-effect', 'non-scaling-stroke'); path.setAttribute('stroke-width', '0.65');
    }
    root.remove(); root.removeAttribute('style');
    if (!(b.width > 0 && b.height > 0)) throw new Error(`${name}: empty preview`);
    root.setAttribute('viewBox', `${b.x - 3} ${b.y - 3} ${b.width + 6} ${b.height + 6}`);
    root.setAttribute('width', `${b.width + 6}mm`); root.setAttribute('height', `${b.height + 6}mm`);
    return new XMLSerializer().serializeToString(root);
  }
  function renderSheets() {
    el('lightbox').querySelector('.lb-close').click();
    el('sheet-status').hidden = true;
    for (const card of el('sheets').querySelectorAll('.sheet[data-generated="true"]')) {
      const name = card.dataset.sheetId, svg = need(SHEETS, name, 'SHEETS');
      setURL(card.querySelector('a[download]'), 'href', svgURL(svg));
      setURL(card.querySelector('img'), 'src', svgURL(sheetPreview(name, svg)));
      card.querySelector('.sheet-preview').disabled = false;
      card.querySelector('.sheet-unavailable').hidden = true;
    }
  }
  /* the cards build.js wrote: each sheet's SVG sits in a plain-text script block after this script, so it is read once the document has
     finished parsing. The download links come first (a lightbox needs them); each preview picture is drawn later, in the idle moments after
     the first frame, or all at once when the files modal opens. */
  const sheetSVG = new Map(), previewTodo = [];
  function readStaticSheets() {
    for (const b of document.querySelectorAll('script.sheet-svg')) sheetSVG.set(b.dataset.sheetId, b.textContent);
    for (const d of el('sheets').querySelectorAll('.sheet')) {
      const a = d.querySelector('a[download]'), i = d.querySelector('img'), name = d.dataset.sheetId;
      if (!a || !i) throw new Error('a sheet card without its download link or preview image: rebuild with node build.js');
      const svg = sheetSVG.get(name); if (svg === undefined) throw new Error(`the page has no SVG text for the sheet ${name}: rebuild with node build.js`);
      setURL(a, 'href', svgURL(svg)); previewTodo.push([d, name, svg]);
    }
    const next = () => { if (!previewTodo.length) return; if (!document.hidden) drawPreview(previewTodo.shift()); setTimeout(next, 40); };
    setTimeout(next, 250);
  }
  function drawPreview([d, name, svg]) { setURL(d.querySelector('img'), 'src', svgURL(sheetPreview(name, svg))); }
  function ensurePreviews() { while (previewTodo.length) drawPreview(previewTodo.shift()); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', readStaticSheets); else readStaticSheets();

  /* the sheet lightbox (owner: "click the sheets to open them in a lightbox"): a click on a sheet card opens its picture full-window, fitted; the wheel
     zooms about the pointer, a drag pans, the arrow keys step to the previous or next sheet, Esc, the close button or a click on the backdrop closes it */
  (function sheetLightbox() {
    const box = document.createElement('div'); box.id = 'lightbox'; box.className = 'lightbox'; box.hidden = true;
    box.innerHTML = '<div class="lb-bar"><button type="button" class="lb-prev" aria-label="Previous sheet">&#8249;</button><span class="lb-title"></span><a class="lb-dl" download></a><button type="button" class="lb-next" aria-label="Next sheet">&#8250;</button><button type="button" class="lb-close" aria-label="Close">&#215;</button></div><p class="lb-description" hidden></p><div class="lb-view"><img alt="" draggable="false"></div>';
    document.body.appendChild(box);
    const view = box.querySelector('.lb-view'), img = view.querySelector('img'), title = box.querySelector('.lb-title'), dl = box.querySelector('.lb-dl');
    const S = { k: -1, scale: 1, x: 0, y: 0, drag: null };
    const cards = () => [...el('sheets').querySelectorAll('.sheet')].filter(c => c.querySelector('a[download]').hasAttribute('href'));
    const report = () => { window.__lightbox = { open: !box.hidden, index: S.k, id: S.id, name: img.alt, scale: S.scale, show: showId }; };
    function showId(id) { const k = cards().findIndex(c => c.dataset.sheetId === id); if (k >= 0) show(k); }
    const apply = () => { img.style.transform = `translate(${S.x}px, ${S.y}px) scale(${S.scale})`; report(); };
    const fit = () => {
      const vw = view.clientWidth, vh = view.clientHeight, nw = img.naturalWidth, nh = img.naturalHeight;
      if (!(nw > 0 && nh > 0 && vw > 0 && vh > 0)) return;
      S.scale = Math.min(vw / nw, vh / nh) * 0.96; S.x = (vw - nw * S.scale) / 2; S.y = (vh - nh * S.scale) / 2; apply();
    };
    function show(k) {
      const list = cards(); if (!list.length) return;
      S.k = (k + list.length) % list.length;
      const c = list[S.k], ci = c.querySelector('img'), ca = c.querySelector('a[download]');
      const description = box.querySelector('.lb-description');
      description.textContent = c.dataset.description || ''; description.hidden = !description.textContent;
      if (!ci || !ca) throw new Error('a sheet card without its picture or download link: rebuild with node build.js');
      if (!ci.getAttribute('src')) {
        const svg = sheetSVG.get(c.dataset.sheetId);
        if (svg === undefined) throw new Error(`the page has no SVG text for the sheet ${c.dataset.sheetId}: rebuild with node build.js`);
        drawPreview([c, c.dataset.sheetId, svg]);
      }
      title.textContent = ci.alt; dl.href = ca.href; dl.setAttribute('download', ca.getAttribute('download')); dl.textContent = ca.textContent;
      box.hidden = false; document.body.classList.add('lb-open');
      S.id = c.dataset.sheetId;
      img.onload = fit; img.alt = ci.alt; img.src = ci.src;
      if (img.complete && img.naturalWidth) fit(); else report();
      writeView();
    }
    function close() { box.hidden = true; document.body.classList.remove('lb-open'); S.id = undefined; report(); writeView(); }
    el('sheets').addEventListener('click', e => { if (e.target.closest('a')) return; const c = e.target.closest('.sheet'), k = cards().indexOf(c); if (k >= 0) show(k); });
    box.querySelector('.lb-close').addEventListener('click', close);
    box.querySelector('.lb-prev').addEventListener('click', () => show(S.k - 1));
    box.querySelector('.lb-next').addEventListener('click', () => show(S.k + 1));
    window.addEventListener('keydown', e => {
      if (box.hidden) return;
      if (e.key === 'Escape') close(); else if (e.key === 'ArrowLeft') show(S.k - 1); else if (e.key === 'ArrowRight') show(S.k + 1); else return;
      e.preventDefault(); e.stopPropagation();
    }, true);
    view.addEventListener('wheel', e => {
      e.preventDefault();
      const r = view.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top, s2 = Math.min(40, Math.max(0.02, S.scale * Math.exp(-e.deltaY * 0.0015)));
      S.x = px - (px - S.x) * s2 / S.scale; S.y = py - (py - S.y) * s2 / S.scale; S.scale = s2; apply();
    }, { passive: false });
    view.addEventListener('pointerdown', e => { if (e.button !== 0) return; S.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false }; view.setPointerCapture(e.pointerId); });
    view.addEventListener('pointermove', e => {
      const d = S.drag; if (!d || d.id !== e.pointerId) return;
      const dx = e.clientX - d.x, dy = e.clientY - d.y; if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
      d.x = e.clientX; d.y = e.clientY; S.x += dx; S.y += dy; apply();
    });
    view.addEventListener('pointerup', e => { const d = S.drag; S.drag = null; if (d && !d.moved && e.target === view) close(); });
    window.addEventListener('resize', () => { if (!box.hidden) fit(); });
    report();
  })();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', applyView); else applyView();

  /* ------------------------------------------------------------ the laser-files legend, from the built stock */
  function renderLegend() {
    if (META.kerf_comp !== 'file') throw new Error(`META.kerf_comp is ${META.kerf_comp}: the page shows only files that carry their own kerf `);
    const n = v => String(Math.round(v * 100) / 100);
    const KF = need(META, 'kerfs', 'META'), kv = STOCK_LIST.map(k => need(KF, k, 'META.kerfs')), kerf = kv.every(v => v === kv[0]) ? `${n(kv[0])} mm` : STOCK_LIST.map(k => `${n(KF[k])} mm (${STOCKS[k].name})`).join(', ');
    const edgeS = !!(META.edge_scores && META.edge_score_mm);
    const legend = el('files-legend');
    const vf = META.vector_fill && META.vector_fill.elements ? `, yellow vector fill (concentric lines ${META.vector_fill.lines_per_cm} to the centimetre: run at engraving power with the engraving, ${META.vector_fill.elements} low-density elements)` : '';
    legend.textContent = `${META.sheet_w} × ${META.sheet_h} mm sheets · kerf ${kerf} drawn into every cut: machine kerf compensation OFF · black engrave${vf}, blue score${edgeS ? ' (low power, after engraving, before cutting)' : ''}, orange corner marks on the backs files, red cut`;
  }
  renderLegend();

  /* ------------------------------------------------------------ stock thickness: every part, sheet and 3D mesh regenerated in a worker */
  /* each stock's thinnest and thickest caliper reading and its kerf: slots and bars are drawn for the thickest, tab depths for the thinnest. META.stocks[k].params names the three hash keys */
  const PARAMS = STOCK_LIST.map(k => need(STOCKS[k], 'params', 'META.stocks.' + k));
  const STOCK_KEYS = PARAMS.flatMap(p => [need(p, 'lo', 'params'), need(p, 'hi', 'params'), need(p, 'kerf', 'params')]);
  const STOCK_RANGE = Object.fromEntries(PARAMS.flatMap(p => [[p.lo, [0.3, 10]], [p.hi, [0.3, 10]], [p.kerf, [0.001, 0.6]]]));
  const builtStock = () => { const params = need(META, 'params', 'META'); return Object.fromEntries(STOCK_KEYS.map(k => [k, need(params, k, 'META.params')])); };
  const stockKey = P => STOCK_KEYS.map(k => (+P[k]).toFixed(3)).join('|');
  const regen = { log: [], worker: null, busy: false, pending: null, id: 0, started: 0, applied: stockKey(builtStock()) };
  window.__regen = regen;
  function stockStatus(html, cls) { const el = $('st-status'); if (el) { el.innerHTML = html; el.className = cls || ''; } }
  function workerMain() {
    self.onmessage = function (e) {
      const m = e.data;
      if (m.type === 'fonts') {
        GameGeom.register_fonts(m.fonts);
        /* a warm engraving store: S keys name the part whose engraving (the page's PARTS) is that finished SVG, C keys hold compensated geometry of parts
           moved or clipped at build time, T keys bleed tests; anything else is made once and kept for this worker's life */
        if (!m.cache || !m.parts) throw new Error('the page carries no engraving cache (parts/engraving_cache.json): run node engine/bin/bg.js parts, then page');
        for (const k of ['S', 'C', 'T', 'E']) if (!m.cache[k]) throw new Error(`engraving_cache.json has no ${k} entries: rebuild it with node engine/bin/bg.js parts`);
        const mem = new Map(), EC = m.cache, parts = m.parts;
        const EDGE_G = /<g class="edge-scores">[\s\S]*?<\/g>/;
        const engWhole = pid => { if (!(pid in parts)) throw new Error(`the engraving cache names part ${pid}, which PARTS does not have`); const inner = parts[pid]; const i = inner.search(/<path d="[^"]*" stroke="#ff0000"/); return i < 0 ? inner : inner.slice(0, i); };
        const engOf = pid => engWhole(pid).replace(EDGE_G, '');
        const edgeOf = pid => { const g = engWhole(pid).match(EDGE_G); return g ? g[0] : ''; };
        /* an engraving path read back as polygons (lasergeom's JSON form): each polygon was written as its shell then its holes, so a ring is a hole of the
           last shell when its first point lies inside that shell and not inside one of the shell's holes so far (an island in a hole starts a new shell) */
        const engGeomJSON = (svg, dx) => {
          const polys = [];
          const inside = (r, x, y) => { let w = false; for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) { const xi = r[i], yi = r[i + 1], xj = r[j], yj = r[j + 1]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) w = !w; } return w; };
          for (const m of svg.matchAll(/ d="([^"]*)"/g)) for (const chunk of m[1].split('M').slice(1)) {
            const r = []; for (const q of chunk.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)) r.push(+q[1] + dx, +q[2]);
            if (r.length < 6) continue; r.push(r[0], r[1]);
            const last = polys[polys.length - 1];
            if (last && inside(last[0], r[0], r[1]) && !last.slice(1).some(h => inside(h, r[0], r[1]))) last.push(r); else polys.push([r]);
          }
          return polys.length ? { t: 'MP', p: polys } : { t: 'E' };
        };
        GameGeom.eng_store = {
          get: function (k) {
            if (mem.has(k)) return mem.get(k);
            if (k[0] === 'S' && k in EC.S) return EC.S[k] === '' ? '' : engOf(EC.S[k]);
            if (k[0] === 'C' && k in EC.C) { const v = EC.C[k]; if (v.pid === undefined || v.dx === undefined) throw new Error(`ENG_CACHE.C ${k} has no pid or dx: rebuild the parts`); const j = engGeomJSON(engOf(v.pid), -v.dx); mem.set(k, j); return j; }
            if (k[0] === 'T' && k in EC.T) return EC.T[k];
            if (k[0] === 'E' && k in EC.E) return EC.E[k] === '' ? '' : edgeOf(EC.E[k]);
            return undefined;
          },
          set: function (k, v) { mem.set(k, v); }
        };
        return;
      }
      if (m.type !== 'build') return;
      const GG = GameGeom, t0 = performance.now();
      GG.onprogress = function (f, label) { self.postMessage({ type: 'progress', id: m.id, f: f, label: label }); };
      try {
        const P = lasergeom.parse_hash(m.hash, GG.defaults), r = lasergeom.build(GG, P);
        self.postMessage({ type: 'result', id: m.id, ms: performance.now() - t0, result: { parts: r.parts, layout: r.layout, meta: r.meta, sheets: r.sheets } });
      } catch (err) {
        self.postMessage({ type: 'error', id: m.id, ms: performance.now() - t0, message: String(err && err.message || err), problems: err && err.problems ? err.problems : null });
      }
    };
  }
  function ensureWorker() {
    if (regen.worker) return regen.worker;
    /* the fonts are registered as soon as the engine's shapes module exists, before the game's own files run: a game may draw lettering while it loads
       (TUMBLER builds its parts as its geometry module is evaluated), and the fonts message would come too late */
    const src = `const __FONTS = ${JSON.stringify(FONTS)};\n` + GEOM_SOURCES.map(code => code + '\n;if (self.BGEngine && self.BGEngine.shapes && self.BGEngine.shapes.register_fonts && !self.__fontsDone) { self.BGEngine.shapes.register_fonts(__FONTS); self.__fontsDone = true; }\n').join('\n;\n') + '\n;(' + workerMain.toString() + ')();\n';
    const w = regen.worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
    w.postMessage({ type: 'fonts', fonts: FONTS, cache: ENG_CACHE, parts: PARTS });
    w.onmessage = onWorker;
    w.onerror = e => { stockStatus('The generator failed to start: ' + escH(e.message || e), 'bad'); regen.busy = false; regen.worker = null; };
    return w;
  }
  function requestStock(P) {
    regen.pending = P;
    if (!regen.busy) nextBuild();
  }
  function nextBuild() {
    const P = regen.pending; regen.pending = null;
    if (!P) return;
    if (stockKey(P) === regen.applied) { stockStatus('Parts match this stock.'); return; }
    regen.busy = true; regen.started = performance.now(); regen.current = P;
    ensureWorker().postMessage({ type: 'build', id: ++regen.id, hash: '#' + STOCK_KEYS.map(k => `${k}=${P[k]}`).join('&') });
    stockStatus('Regenerating every part for this stock…', 'busy');
  }
  function onWorker(e) {
    const m = e.data;
    if (m.id !== regen.id) return;
    if (m.type === 'progress') { stockStatus(`Regenerating: ${Math.round(100 * m.f)}% · ${escH(m.label)}`, 'busy'); return; }
    const wall = performance.now() - regen.started, P = regen.current;
    regen.busy = false;
    if (m.type === 'error') {
      regen.log.push({ stock: P, ok: false, ms: Math.round(wall), message: m.message });
      regen.applied = null;
      el('lightbox').querySelector('.lb-close').click();
      for (const card of el('sheets').querySelectorAll('.sheet[data-generated="true"]')) {
        card.querySelector('a[download]').removeAttribute('href');
        card.querySelector('.sheet-preview').disabled = true;
        card.querySelector('.sheet-unavailable').hidden = false;
      }
      el('sheet-status').textContent = 'Regenerated files are unavailable: fix the stock or the generator error and try again. Standalone base tests and jigs still use the stock and kerf recorded in their files.';
      el('sheet-status').hidden = false;
      stockStatus(`The generator failed: ${escH((m.problems ? m.problems : [m.message]).slice(0, 6).join('; '))}`, 'bad');
    } else if (regen.pending) {
      regen.log.push({ stock: P, ok: true, ms: Math.round(wall), stale: true });
    } else {
      const t = performance.now(); applyGeometry(m.result); regen.applied = stockKey(P);
      regen.log.push({ stock: P, ok: true, ms: Math.round(wall), worker_ms: Math.round(m.ms), apply_ms: Math.round(performance.now() - t), build_ms: m.result.meta.build_ms, cache: m.result.meta.cache });
      stockStatus(`Regenerated for ${escH(STOCK_KEYS.map(k => `${k} ${P[k]}`).join(', '))} in ${(wall / 1000).toFixed(1)} s. The 3D pieces and generated sheet downloads are updated; standalone base tests and jigs keep their recorded stock and kerf.`, 'ok');
    }
    nextBuild();
  }
  function applyGeometry(res) {
    const wasLive = INTRO.live; introFinish();
    for (const [obj, src] of [[PARTS, res.parts], [LAYOUT, res.layout], [SHEETS, res.sheets], [META, res.meta]]) { for (const k of Object.keys(obj)) delete obj[k]; Object.assign(obj, src); }
    for (const k of Object.keys(cache)) delete cache[k];
    const seen = new Set();
    for (const list of [T.static, T.dynamic, B.static, B.lid, PV.static, PV.dynamic]) for (const inst of list || []) {
      if (seen.has(inst)) continue; seen.add(inst);
      if (inst.part && inst.part.pid) inst.part = part(inst.part.pid);
      if (inst.back && inst.back.pid) inst.back = part(inst.back.pid);
      if (inst.stock) inst.thick = STOCK_T(inst.stock);
      if (inst.repose) inst.repose();
    }
    B.lid.forEach(i => { i.z0 = i.z; i.z = i.z0 + 95 * lifted; });
    buildPlist();
    if (PV.current) { const k = PV.k; loadPart(PV.current); if (k) setExplode(k, true); }
    renderSheets(); renderLegend();
    scene.cache = null; dirty = true;
    if (wasLive) INTRO.pending = true;
  }
  (function stockInputs() {
    const inputs = STOCK_KEYS.map(k => el('st-' + k));
    const fromHash = Object.fromEntries(hashPairs().filter(([k, v]) => STOCK_KEYS.includes(k) && +v > 0).map(([k, v]) => [k, +v]));
    const P0 = Object.assign(builtStock(), fromHash);
    STOCK_KEYS.forEach((k, i) => { inputs[i].value = P0[k]; });
    if (GEOM_SOURCES === null) { inputs.forEach(i => { i.disabled = true; }); stockStatus('This page was built with --no-geom, so it cannot redraw the parts for other stock.'); return; }
    let timer = null;
    const read = () => {
      const P = {};
      for (let i = 0; i < STOCK_KEYS.length; i++) { const k = STOCK_KEYS[i], v = +inputs[i].value; if (!(v > STOCK_RANGE[k][0] && v < STOCK_RANGE[k][1])) return null; P[k] = v; }
      return PARAMS.every(p => P[p.lo] <= P[p.hi]) ? P : null;
    };
    const changed = () => {
      const P = read();
      if (!P) { stockStatus('Enter the thinnest and thickest reading of each stock and its kerf, in millimetres. A thinnest reading cannot be thicker than the thickest.', 'bad'); return; }
      const rest = hashPairs().filter(([k]) => !STOCK_KEYS.includes(k)).map(([k, v]) => v === '' ? k : `${k}=${v}`);
      history.replaceState(null, '', '#' + rest.concat(STOCK_KEYS.map(k => `${k}=${P[k]}`)).join('&'));
      clearTimeout(timer); timer = setTimeout(() => requestStock(P), 450);
    };
    inputs.forEach(i => i.addEventListener('input', changed));
    window.__setStock = P => { STOCK_KEYS.forEach((k, i) => { if (P[k] !== undefined) inputs[i].value = P[k]; }); changed(); };
    if (stockKey(P0) !== regen.applied) setTimeout(() => requestStock(P0), 0);
    else stockStatus('The files below are drawn for this stock. Change a thickness or a kerf to regenerate them.');
  })();

  /* ------------------------------------------------------------ the opening: one button opens the box, the same button closes it
     Two closed boxes stand in the dark, one showing its lid and one its underside. Open the box: the second dissolves, the lights and the table
     come up, the first box lies down, its lid flies across to the lid's place on the table, and every packed piece flies to where the table view
     keeps it, top of the box first; then the game starts by itself. Every frame is a function of one progress value p, run forward in time by
     the button (OPEN_MS for the whole opening) and backward by the same button (CLOSE_MS), so the sequence runs backwards as smoothly as forwards.
     (It was scroll-driven until 2026-09-18; the owner: "let's get rid of the scrolling mechanism and just have a button to open the box and a
     button to close the box. scroll can go back to being zoom when the box is open.") The table's own instances are moved: their table pose is
     stored first and restored the moment anything else needs the table (a modal, a QA hook), so window.__placements always reports the table
     pose. Closing during the game returns the pieces to the table pose and rebuilds the opening from that table, so the very game packs into the
     box and opening it again lets the game go on. The first animation frame starts the opening; the headless harness draws no frame, so under
     fitcheck nothing here runs. */
  const boxBtn = el('btn-box'), hudEl = el('hud'), titleEl = el('intro-title'), spotEl = el('spot');
  const OPEN_MS = 10000, CLOSE_MS = 7000;   /* the owner, watching the first cut: "the opening animation is too slow. maybe double the speed" */
  const INTRO = { pending: true, live: false, open: false, dir: 0, rate: 1, resumeFrom: -1, p: -1, forced: null, last: 0, all: [], base: [], lid: [], lidRot: null, pieces: [], boxB: [], tipP: [0, 0], tipAxis: [1, 0, 0], tipB: null, cam: [], end: 0, planner: null, fromTable: false, pileOrder: [], shot: false };
  const V3 = { dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
    unit: a => { const l = Math.hypot(a[0], a[1], a[2]); return [a[0] / l, a[1] / l, a[2] / l]; }, sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]] };
  const clamp01 = x => x < 0 ? 0 : x > 1 ? 1 : x;
  const seg = (p, a, b) => clamp01((p - a) / (b - a));
  const hexRGB = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const mixHex = (a, b, u) => '#' + hexRGB(a).map((v, i) => Math.round(v + (hexRGB(b)[i] - v) * u).toString(16).padStart(2, '0')).join('');
  const TABLE = '#3b2a1c';
  /* the rotation carrying frame E onto frame S, as the renderer's group rotation wants it: a unit axis and an angle in degrees. The renderer's
     group turns the other way round its axis than the textbook formula (it takes v x axis), so the axis is negated here. */
  function relRot(E, S) {
    const M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (const [e, s] of [[E.U, S.U], [E.V, S.V], [E.N, S.N]]) for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) M[i][j] += s[i] * e[j];
    if (V3.dot(E.U, V3.cross(E.V, E.N)) * V3.dot(S.U, V3.cross(S.V, S.N)) <= 0) throw new Error('the opening cannot tween between a pose and its mirror image (flipV)');
    const c = Math.max(-1, Math.min(1, (M[0][0] + M[1][1] + M[2][2] - 1) / 2)), ang = Math.acos(c);
    if (ang < 1e-5) return { axis: [0, 0, 1], angle: 0 };
    if (Math.PI - ang < 1e-3) { const d = [M[0][0] + 1, M[1][1] + 1, M[2][2] + 1], k = d.indexOf(Math.max(...d)); return { axis: V3.unit([M[0][k] + (k === 0 ? 1 : 0), M[1][k] + (k === 1 ? 1 : 0), M[2][k] + (k === 2 ? 1 : 0)]), angle: 180 }; }
    const s2 = -2 * Math.sin(ang); return { axis: [(M[2][1] - M[1][2]) / s2, (M[0][2] - M[2][0]) / s2, (M[1][0] - M[0][1]) / s2], angle: ang * 180 / Math.PI };
  }
  /* a piece's tween record: the table pose E (its instance fields, kept in end) and the packed pose S, the rotation between them, and the path its centre flies */
  function tweenRecord(inst, S) {
    const E = scene.basis(inst), bb = inst.part.bbox, c = [(bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2, inst.thick / 2];
    const PE = scene.world(E, c[0], c[1], c[2]), PS = scene.world(S, c[0], c[1], c[2]), R = relRot(E, S);
    return { inst, E, S, end: { x: inst.x, y: inst.y, z: inst.z }, off: V3.sub(PE, [inst.x, inst.y, inst.z]), PE, PS, axis: R.axis, angle: R.angle, shadow0: inst.shadow, group0: inst.group, thick: inst.thick, mates: [] };   /* group0: the game's own groups on the piece at its table pose (a tilt, a flip), back once it lands */
  }
  /* pose the instance so its centre sits at P with the rotation angle a (degrees) still to go about the pivot (its centre unless given), then the whole-box tip on top */
  function poseAt(q, P, a, tipG, pivot, axis) {
    const inst = q.inst; inst.x = P[0] - q.off[0]; inst.y = P[1] - q.off[1]; inst.z = P[2] - q.off[2];
    const own = a ? { angle: a, pivot: pivot || P, axis: axis || q.axis } : null;
    inst.group = own ? (tipG ? [own, tipG] : own) : (tipG ? [tipG] : undefined);
  }
  function restore(q) { const inst = q.inst; inst.x = q.end.x; inst.y = q.end.y; inst.z = q.end.z; inst.group = q.group0; inst.shadow = q.shadow0; }
  /* the timeline, in progress p: one thing at a time, each settled before the next starts; the pieces from W0, scheduled below. Most of the
     time goes to the pieces (owner, 2026-09-18: "the box opening animation spends too much time on the rear-facing box fade-out and zoom, and
     too little time spreading the pieces out") */
  const TL = { title: [0, 0.05], fadeB: [0.03, 0.11], lights: [0.09, 0.18], tip: [0.19, 0.29], lid: [0.30, 0.39], hud: [0.95, 1] };
  const FLY = 0.03, LIFT = 0.28, DROP = 0.1, W0 = 0.40, LID_ALT = 150;   /* a flight: a lift of LIFT x FLY, the carry, a drop of DROP x FLY; the carry stretches when the piece must land after another */
  /* the outline and stock that make two packed pieces interchangeable in a pile: any hex tile fits any hex slot */
  /* a packed slot takes any piece with the same outline and stock; a game's table may tell alike pieces apart with sig(pid) (TUMBLER's inner and outer wheel faces share outlines but not wheels) */
  const outlineSig = inst => { const o = inst.part.cuts.find(k => !k.hole); if (!o) throw new Error(`${inst.part.pid} has no outline`); return inst.stock + ':' + (GT.sig ? GT.sig(inst.part.pid) + ':' : '') + o.pts.map(p => Math.round(p[0] * 10) + ',' + Math.round(p[1] * 10)).join(';'); };
  /* where a piece is at scroll progress p: null in the box, 'landed', or its centre and the turn still to go. One arc: it lifts out of the box
     over the first part of the flight, crosses at its arc height, and drops onto its place over the last part; a standing piece turns upright
     as it drops. Nothing waits in the air. */
  function flight(q, p) {
    if (p < q.t0) return null; if (p >= q.tL) return 'landed';
    const t1 = q.t0 + LIFT * FLY, t2 = q.tL - DROP * FLY;
    const w = ez(seg(p, t1, t2)), z = q.PS[2] + (q.H - q.PS[2]) * ez(seg(p, q.t0, t1)) + (q.PE[2] - q.H) * ez(seg(p, t2, q.tL));
    return { P: [q.PS[0] + (q.PE[0] - q.PS[0]) * w, q.PS[1] + (q.PE[1] - q.PS[1]) * w, z], a: q.angle * (1 - ez(seg(p, t2 - 0.2 * FLY, t2 - 0.02 * FLY))), u: seg(p, q.t0, q.tL) };
  }
  /* plan footprints for the stacking relations: a part's outline points (and centre, when it lies in the part's own solid) in the plan, tested
     against the other part's solid, holes included, so a tile standing in one of the meadow frame's openings does not count as under it. A
     standing part's footprint is its thin plan box. */
  function geomOf() {
    const corners = (f, B) => { const bb = f.part.bbox, out = []; for (const u of [bb[0], bb[2]]) for (const v of [bb[1], bb[3]]) for (const h of [0, f.thick]) out.push(scene.world(B, u, v, h)); return out; };
    const box = (f, B) => { const a = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9]; for (const w of corners(f, B)) { a[0] = Math.min(a[0], w[0]); a[1] = Math.min(a[1], w[1]); a[2] = Math.min(a[2], w[2]); a[3] = Math.max(a[3], w[0]); a[4] = Math.max(a[4], w[1]); a[5] = Math.max(a[5], w[2]); } return a; };
    const localIn = (part, u, v) => { let inside = false; for (const c of part.cuts) { const r = c.pts; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const xi = r[i][0], yi = r[i][1], xj = r[j][0], yj = r[j][1]; if ((yi > v) !== (yj > v) && u < (xj - xi) * (v - yi) / (yj - yi) + xi) inside = !inside; } } return inside; };
    const outer = f => { const o = f.part.cuts.find(k => !k.hole); if (!o) throw new Error(f.part.pid + ' has no outline'); const L = o.pts.length, n = Math.max(1, Math.floor(L / 36)), pts = []; const bb = f.part.bbox;
      /* a little inside the edge along its normal, so two stacked copies register; a point that is in the material on neither side (the edge
         of a bay in the meadow frame, where a planted tile's outline lies on the frame's own cut line) is left out rather than put on the line */
      for (let i = 0; i < L; i += n) { const [u, v] = o.pts[i], [pu, pv] = o.pts[(i + L - 1) % L], [nu, nv] = o.pts[(i + 1) % L]; let tx = nu - pu, ty = nv - pv; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
        const c1 = [u - ty * 0.7, v + tx * 0.7], c2 = [u + ty * 0.7, v - tx * 0.7]; if (localIn(f.part, c1[0], c1[1])) pts.push(c1); else if (localIn(f.part, c2[0], c2[1])) pts.push(c2); }
      for (let a = 0; a < 5; a++) for (let b = 0; b < 5; b++) { const u = bb[0] + (bb[2] - bb[0]) * (a + 0.5) / 5, v = bb[1] + (bb[3] - bb[1]) * (b + 0.5) / 5; if (localIn(f.part, u, v)) pts.push([u, v]); }
      return pts; };
    const pts = (f, B) => outer(f).map(([u, v]) => scene.world(B, u, v, f.thick / 2));
    const inSolid = (f, B, w, vert, bx) => {
      if (vert) return w[0] > bx[0] - 0.3 && w[0] < bx[3] + 0.3 && w[1] > bx[1] - 0.3 && w[1] < bx[4] + 0.3;
      const O = B.O, U = B.U, V = B.V, dx = w[0] - O[0], dy = w[1] - O[1]; const u = (dx * U[0] + dy * U[1]) / (U[0] * U[0] + U[1] * U[1]), v = (dx * V[0] + dy * V[1]) / (V[0] * V[0] + V[1] * V[1]);
      return localIn(f.part, u, v); };
    const over = (a, b) => !(a[3] <= b[0] + 0.3 || b[3] <= a[0] + 0.3 || a[4] <= b[1] + 0.3 || b[4] <= a[1] + 0.3);
    let lastHit = null;
    const foot = (ptsA, ptsB, fa, Ba, va, ba, fb, Bb, vb, bb) => { const a = ptsA.find(w => inSolid(fb, Bb, w, vb, bb)); if (a) { lastHit = ['A in B', a]; return true; } const b = ptsB.find(w => inSolid(fa, Ba, w, va, ba)); if (b) { lastHit = ['B in A', b]; return true; } return false; };
    return { box, pts, over, foot, hit: () => lastHit };
  }
  /* The flight plan. The box empties the way hands would empty it: one pile at a time, each top down, one piece every STEP of the scroll; a pile
     that has other piles stacked on it, or that pieces from other piles land on, goes after them. A piece lands only after what it lands on has
     landed; where that piece left the box earlier than the piece under it (a comb frame packed on its own backing), it flies a longer, higher arc
     and stays above. A piece flying over pieces already landed keeps its arc above them. Nothing here is a fallback: an order that cannot be met
     throws. */
  function* schedule(P) {
    const N = P.length, D = DIM(), TOP = D.NECK_TOP + 0.8;
    const halfH = q => q.vertical ? 0.5 * (q.inst.part.bbox[3] - q.inst.part.bbox[1]) + 1.2 : q.thick - q.inst.thick / 2 + 0.6;   /* from the centre of the carrier to the top of what is glued on it */
    const G3 = geomOf();
    for (const q of P) { const f = { part: q.inst.part, thick: q.thick }; q.rz = halfH(q); q.rzS = q.thick - q.inst.thick / 2 + 0.6;   /* rz: what it sweeps once it turns; rzS: its thickness while it lifts flat with its pile */ q.r = 0.5 * Math.hypot(q.inst.part.bbox[2] - q.inst.part.bbox[0], q.inst.part.bbox[3] - q.inst.part.bbox[1]) + 0.5; q.bS = G3.box(f, q.S); q.bE = G3.box(f, q.E); q.ptsS = G3.pts(f, q.S); q.ptsE = G3.pts(f, q.E); }
    const over = G3.over;
    const foot = (a, b, inBox) => inBox ? G3.foot(a.ptsS, b.ptsS, a.inst, a.S, false, a.bS, b.inst, b.S, false, b.bS) : G3.foot(a.ptsE, b.ptsE, a.inst, a.E, !!a.vertical, a.bE, b.inst, b.E, !!b.vertical, b.bE);
    const above = P.map(() => []), under = P.map(() => []);   /* above[i]: packed above i; under[i]: i lands on them */
    for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
      const a = P[i], b = P[j];
      /* stacked pieces: the one whose underside is higher is on top (a standee's tab reaches below the tile it stands in). Two standing halves
         that cross-lap at one level keep their box order, so the upper one slides down into the lower one's slot last */
      if (over(a.bS, b.bS) && foot(a, b, true)) { if (a.bS[2] > b.bS[2] + 0.5) above[j].push(i); else if (b.bS[2] > a.bS[2] + 0.5) above[i].push(j); else if ((a.bS[3] - a.bS[0]) * (a.bS[4] - a.bS[1]) < (b.bS[3] - b.bS[0]) * (b.bS[4] - b.bS[1])) above[j].push(i); else above[i].push(j); }   /* same Z: the smaller outline is in a hole (a disc on pocket ramps), not a second stack */
      if (over(a.bE, b.bE) && foot(a, b, false)) {
        if (a.bE[2] > b.bE[2] + 0.5) under[i].push(j); else if (b.bE[2] > a.bE[2] + 0.5) under[j].push(i);
        else if (a.vertical && b.vertical) { if (above[i].includes(j)) under[j].push(i); else if (above[j].includes(i)) under[i].push(j); else if (a.inst.part.pid < b.inst.part.pid) under[j].push(i); else under[i].push(j); }
        else if (a.vertical) under[i].push(j); else if (b.vertical) under[j].push(i);   /* a standee whose tab goes right through its tile stands on it */
        /* same Z on the table: a disc in a pocket is not stacked on the layer */
      }
    }
    const seq = P.map(q => q.seq);
    let STEP = (0.955 - W0 - FLY) / (N + 6);
    /* what a piece launches after: everything packed above it, and what it lands on when the pile order has that leave the box first, so a
       piece is not in the air before the piece under its landing has even left the box (the beehives used to leave a tenth of the scroll before
       the hive tiles they stand on, and every drop near the hives pushed their hovering carry higher). A landing on a piece the pile order sends
       out later (a bee packed on the hive tile it stands on; the wasp's base, packed on the hive tiles, landing by the Oak) is not waited for:
       that piece leaves first and lands later, which the landing-time and arc-height rules arrange. Both kinds of edge point up the pile order,
       so there is no circle. */
    const after = P.map((q, i) => above[i].concat(under[i].filter(u => seq[u] < seq[i] && !above[i].includes(u))));
    const t0 = new Array(N), T0 = i => { if (!(t0[i] >= 0)) { let m = W0 + seq[i] * STEP; for (const a of after[i]) m = Math.max(m, T0(a) + STEP); t0[i] = Math.max(m, P[i].delay); } return t0[i]; };
    const tL = new Array(N), TL_ = i => { if (!(tL[i] >= 0)) { let m = T0(i) + FLY; for (const u of under[i]) m = Math.max(m, TL_(u) + (DROP + 0.12) * FLY); tL[i] = m; } return tL[i]; };   /* it drops only once what it lands on has landed and is clear */
    /* heights: a staircase up the box's stacking, so a piece flies above everything that was under it in the box, in its pile or in the pile its pile stood on */
    const below = P.map(() => []); P.forEach((q, i) => { for (const a of above[i]) below[a].push(i); });
    const segNear = (a, b, bx, r) => { const steps = 24; for (let k = 0; k <= steps; k++) { const t = k / steps, x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t; if (x > bx[0] - r && x < bx[3] + r && y > bx[1] - r && y < bx[4] + r) return true; } return false; };
    const HB = new Array(N), hb = i => { if (!(HB[i] > 0)) { const q = P[i]; let h = Math.max(TOP + q.rz + 6 * q.band + q.lift + q.floor, q.PE[2] + q.rz + 2);   /* and above where it lands: the top of a tall stack */
      for (const b of below[i]) h = Math.max(h, hb(b) + P[b].rzS + q.rzS + 0.6);   /* pile-mates lift flat together; the turn comes far from them, and the pass keeps same-destination standees apart */
      for (const u of under[i]) if (P[u].t0 > q.t0) h = Math.max(h, hb(u) + q.rz + P[u].rz + 0.6);   /* it lands on a piece that leaves the box after it: it stays above that piece */
      HB[i] = h; } return HB[i]; };
    const plan = () => { t0.fill(-1); tL.fill(-1); HB.fill(0); P.forEach((q, i) => { q.t0 = T0(i); q.tL = TL_(i); });
      for (let i = 0; i < N; i++) { const q = P[i]; q.floor = 0; for (let j = 0; j < N; j++) { if (i === j || under[i].includes(j)) continue; const o = P[j]; if (o.tL >= q.tL) continue; if (segNear(q.PS, q.PE, o.bE, q.r * 0.7)) q.floor = Math.max(q.floor, o.bE[5] + q.rz + 1 - (TOP + q.rz + 6 * q.band + q.lift)); } }   /* over whatever has landed under its path by the time it crosses */
      P.forEach((q, i) => { q.H = hb(i); q.dbgAbove = above[i].map(j => P[j].inst.part.pid + '#' + P[j].inst.id); q.dbgUnder = under[i].map(j => P[j].inst.part.pid + '#' + P[j].inst.id); }); };
    let end = 0, passes = 0; const trace = [], seenPair = new Map();   /* a pair that keeps conflicting gets a bigger nudge each time */
    for (let round = 0; round < 5; round++) {   /* the delays the pass adds can push the last landing past the bottom: then everything launches a little faster */
    P.forEach(q => { q.delay = 0; q.lift = 0; q.floor = 0; });
    plan();
    /* the light pass: pairs whose flights overlap in time are sampled with their carried footprints. A lift under a passing piece waits until
       it has gone by; two carries meeting at one height push the later one up (and the staircase above it); a carry meeting a drop goes above it. */
    const fpOf = (q, f, out) => { const x = f.P[0] - q.PS[0], y = f.P[1] - q.PS[1]; out[0] = q.bS[0] + x; out[1] = q.bS[1] + y; out[2] = q.bS[3] + x; out[3] = q.bS[4] + y;
      if (f.u > 0.5) { const ex = f.P[0] - q.PE[0], ey = f.P[1] - q.PE[1]; out[0] = Math.min(out[0], q.bE[0] + ex); out[1] = Math.min(out[1], q.bE[1] + ey); out[2] = Math.max(out[2], q.bE[3] + ex); out[3] = Math.max(out[3], q.bE[4] + ey); } };
    const fa = [0, 0, 0, 0], fb = [0, 0, 0, 0], fpS = [0, 0, 0, 0], gap = (a, b) => a.rz + b.rz + 0.6, phase = (q, t) => t < q.t0 + LIFT * FLY ? 1 : t > q.tL - DROP * FLY ? 3 : 2;
    for (passes = 0; passes < 40; passes++) {
      let changed = 0;
      const byT0 = P.map((q, i) => i).sort((a, b) => P[a].t0 - P[b].t0);
      for (let x = 0; x < N; x++) for (let y = x + 1; y < N; y++) {
        const i = byT0[x], j = byT0[y], a = P[i], b = P[j]; if (b.t0 >= a.tL) break;   /* later launches start after a has landed */
        if (above[i].includes(j) || above[j].includes(i)) continue;   /* the staircase settles pieces stacked in the box; pieces that stack on the table still need the pass */
        const t1 = Math.min(a.tL, b.tL), n = 24, key = i * N + j, again = seenPair.get(key) || 0, g_ = gap(a, b) * (1 + 0.5 * Math.min(again, 4)); let riseA = -1, riseB = -1, carry = false, dropA = false, dropB = false, overB = -1, overA = -1;
        const spot = (q, out) => { out[0] = q.bS[0]; out[1] = q.bS[1]; out[2] = q.bS[3]; out[3] = q.bS[4]; };
        const meets = (u, v) => !(u[2] <= v[0] + 0.3 || v[2] <= u[0] + 0.3 || u[3] <= v[1] + 0.3 || v[3] <= u[1] + 0.3);
        for (let k = 0; k <= n; k++) {
          const t = b.t0 + (t1 - b.t0) * k / n, f = flight(a, t), g = flight(b, t); if (!f || !g || f === 'landed' || g === 'landed') continue;
          fpOf(a, f, fa); fpOf(b, g, fb);
          spot(b, fpS); if (meets(fa, fpS)) overB = t; spot(a, fpS); if (meets(fb, fpS)) overA = t;   /* the last moment the other is over this piece's spot in the box */
          if (!meets(fa, fb)) continue;
          const pa = phase(a, t), pb = phase(b, t);
          if (pb === 1 && pa !== 1) riseB = t; else if (pa === 1 && pb !== 1) riseA = t; else if (pa === 2 && pb === 2) carry = true; else if (pa === 3 && pb === 2) dropA = true; else if (pb === 3 && pa === 2) dropB = true;
        }
        const hit = () => { changed++; seenPair.set(key, again + 1); };
        if (riseB >= 0 && a.H < b.H + g_) { b.delay = Math.max(b.delay, Math.max(riseB, overB) + (t1 - b.t0) / n); hit(); }   /* b lifts under a: b waits until a has left b's spot */
        else if (riseA >= 0 && b.H < a.H + g_) { a.delay = Math.max(a.delay, Math.max(riseA, overA) + (t1 - b.t0) / n); hit(); }
        else if (dropA && b.H < a.H + g_) { b.lift += a.H + g_ - b.H; hit(); }   /* a drops beside b's carry: b above */
        else if (dropB && a.H < b.H + g_) { a.lift += b.H + g_ - a.H; hit(); }
        else if (carry && Math.abs(a.H - b.H) < g_) { b.lift += g_ - Math.abs(a.H - b.H) + 0.2; hit(); }   /* two carries at one height: the later one goes up */
      }
      /* a pass that undoes no more than the one before is the residual: the same few pairs nudged again each pass, which only ratchets heights */
      const prev = trace.length ? trace[trace.length - 1] : Infinity; trace.push(changed); if (!changed || (passes >= 6 && changed >= prev)) break; plan(); yield;
    }
    end = Math.max(...P.map(q => q.tL)); if (end <= 0.965) break; STEP *= (0.955 - W0 - FLY) / (end - W0 - FLY);
    }
    window.__introDebug = { pieces: N, step: +STEP.toFixed(5), end: +Math.max(...P.map(q => q.tL)).toFixed(3), hMax: +Math.max(...P.map(q => q.H)).toFixed(1), slow: P.filter(q => q.tL - q.t0 > FLY * 1.5).length, passes, trace, delayed: P.filter(q => q.delay > 0).length, lifted: P.filter(q => q.lift > 0).length };
    if (end > 0.975) throw new Error(`the opening: the last piece lands at p = ${end.toFixed(3)} after ${passes} passes`);
    return Math.max(...P.map(q => q.tL));
  }
  function introBuild() {
    const D = DIM(), floorTop = D.FU + D.T3, IB = INTRO;
    IB.all = T.static.concat(T.dynamic).map(inst => ({ inst, end: { x: inst.x, y: inst.y, z: inst.z, rot: inst.rot, flipped: inst.flipped, hidden: inst.hidden }, shadow0: inst.shadow }));
    /* the closed boxes stand on the wall GT.stand names ('S' unless the table says: the wall toward the viewer at the start), so the cover reads the
       right way up: n is the unit vector toward the viewer, s the viewer's right, yaw0 the camera's azimuth; the standing box is HN tall (its extent
       along n plus the trays' walls) and NF is its near face's offset from the box's centre */
    const STAND = { S: { n: [0, 1], s: [1, 0], yaw: 0 }, E: { n: [1, 0], s: [0, -1], yaw: 90 }, N: { n: [0, -1], s: [-1, 0], yaw: 180 }, W: { n: [-1, 0], s: [0, 1], yaw: -90 } }[GT.stand || 'S'];
    if (!STAND) throw new Error(`GT.stand must be S, E, N or W, not ${GT.stand}`);
    const cA = [BOXO[0] + IX / 2, BOXO[1] + IY / 2], along = v => Math.abs(v[0]) * IX + Math.abs(v[1]) * IY, NF = along(STAND.n) / 2 + D.EL + D.WT, HN = along(STAND.n) + 2 * (D.EL + D.WT), WS = along(STAND.s) + 2 * (D.EL + D.WT);
    const at = (u, w) => [cA[0] + STAND.s[0] * u + STAND.n[0] * w, cA[1] + STAND.s[1] * u + STAND.n[1] * w];   /* a table point u to the viewer's right and w toward the viewer of the box's centre */
    IB.tipP = at(0, NF); IB.tipAxis = [STAND.s[0], STAND.s[1], 0];   /* the closed box's near edge on the table, the line it tips about */
    IB.base = BOXA.slice();
    /* the lid: its packed pose is the open tray carried onto the base and turned over about the box's mid-height. It flies as one rigid body:
       every part keeps its offset from the tray's centre, and one rotation (the floor's) turns them all about that moving centre */
    IB.lid = LIDA.map(inst => {
      const tmp = Object.assign({}, inst, { x: inst.x - LIDO[0] + BOXO[0], y: inst.y - LIDO[1] + BOXO[1], group: { angle: 180, pivot: [BOXO[0] + IX / 2, BOXO[1] + IY / 2, D.LID_TOP / 2], axis: HINGE === 'x' ? [1, 0, 0] : [0, 1, 0] } });
      return tweenRecord(inst, scene.basis(tmp));
    });
    const mean = k => IB.lid.reduce((a, q) => V3.add(a, q[k]), [0, 0, 0]).map(v => v / IB.lid.length);
    IB.lidC = { S: mean('PS'), E: mean('PE') }; IB.lid.forEach(q => { q.d = V3.sub(q.PE, IB.lidC.E); }); IB.lidRot = { axis: IB.lid[0].axis, angle: IB.lid[0].angle };
    /* every other piece on the table takes a packed slot with the same outline and stock. Which piece takes which slot is decided after the
       launch order: the slot that leaves the box first gets the piece that lands lowest, so a stack on the table builds from the bottom
       whichever piles its pieces come from. The launch order itself empties the box pile by pile, top down: a pile with other piles stacked on
       it, or holding a kind of piece that lands on a kind held by another pile (bees on bases), goes after them. */
    const boxIds = new Set(BOXA.concat(LIDA).map(i => i.id));
    let slots = PACKING.map(q => { const pid = q.pid, stock = need(need(META, 'part_stock', 'META'), pid, 'META.part_stock'), thick = STOCK_T(stock);
      const S = scene.basis({ part: part(pid), x: BOXO[0] + q.x, y: BOXO[1] + q.y, z: floorTop + q.z, rot: q.rot || 0, thick });
      return { pid, stock, thick, S, x: BOXO[0] + q.x, y: BOXO[1] + q.y, z: floorTop + q.z, rot: q.rot || 0, pile: need(q, 'pile', 'packing.json placements'), sig: outlineSig({ part: part(pid), stock }) }; });
    /* glued parts fly as one piece (owner, 2026-09-18: "trays are glued together - when they're coming out of the box they should come out as one
       piece"): a laminated tray's pocket layer on its back (META.trays), and the pairs the game's table names in GT.glued ([carrier pid, mate pid]:
       BUMBLE's comb frames on their backings). The mate lies on its carrier in the box and on the table; it leaves the planning, the carrier is
       planned at their joint thickness, and the mate follows the carrier's flight at its fixed offset, turning with it. */
    const GLUED = new Map();
    for (const [tid, tr] of Object.entries(META.trays || {})) if (tr.frame && PARTS[tid + '-frame']) GLUED.set(tid + '-frame', tid);
    for (const [c, m] of (GT.glued || [])) GLUED.set(m, c);
    const onTop = (m, c, ct) => Math.abs(m.x - c.x) < 0.05 && Math.abs(m.y - c.y) < 0.05 && Math.abs(((((m.rot || 0) - (c.rot || 0)) % 360) + 360) % 360) < 0.01 && Math.abs(m.z - (c.z + ct)) < 0.35;
    for (const sl of slots) if (GLUED.has(sl.pid)) { const c = slots.find(o => o.pid === GLUED.get(sl.pid) && o.pile === sl.pile && onTop(sl, o, o.thick)); if (!c) throw new Error(`the opening: ${sl.pid} is glued onto ${GLUED.get(sl.pid)} but packing.json does not pack it on one`); (c.mates = c.mates || []).push(sl); }
    slots = slots.filter(sl => !GLUED.has(sl.pid));
    for (const sl of slots) sl.fat = sl.thick + (sl.mates || []).reduce((a, m) => a + m.thick, 0);
    const G3 = geomOf();
    for (const sl of slots) { const f = { part: part(sl.pid), thick: sl.fat, vertical: false }; sl.b = G3.box(f, sl.S); sl.pts = G3.pts(f, sl.S); }
    let insts = T.static.concat(T.dynamic).filter(inst => !boxIds.has(inst.id) && !inst.hidden);
    for (const m of insts) if (GLUED.has(m.part.pid)) { const c = insts.find(o => o.part.pid === GLUED.get(m.part.pid) && onTop(m, o, o.thick)); if (!c) throw new Error(`the opening: ${m.part.pid} is glued onto ${GLUED.get(m.part.pid)} but the table does not show it on one`); (c._mates = c._mates || []).push(m); }
    insts = insts.filter(inst => !GLUED.has(inst.part.pid));
    for (const inst of insts) { inst._sig = outlineSig(inst); const E = scene.basis(inst); inst._E = E; const f = { part: inst.part, thick: inst.thick + (inst._mates || []).reduce((a, m) => a + m.thick, 0), vertical: inst.vertical }; inst._fat = f.thick; inst._b = G3.box(f, E); inst._pts = G3.pts(f, E); }
    const bySig = new Map(); for (const sl of slots) { if (!bySig.has(sl.sig)) bySig.set(sl.sig, []); bySig.get(sl.sig).push(sl); }
    for (const [sig, group] of bySig) { const n = insts.filter(i => i._sig === sig).length; if (n !== group.length) throw new Error(`the opening: packing.json has ${group.length} slot(s) of ${group[0].pid}'s outline and the table shows ${n} piece(s) of it`); }
    /* piles stacked on piles (slot footprints), kinds landing on kinds (table footprints) */
    const keys = [...new Set(slots.map(sl => sl.pile))], members = new Map(keys.map(k => [k, slots.filter(sl => sl.pile === k).sort((a, b) => b.b[2] - a.b[2])]));
    const before = new Map(keys.map(k => [k, new Set()]));
    for (let i = 0; i < slots.length; i++) for (let j = i + 1; j < slots.length; j++) { const a = slots[i], b = slots[j]; if (a.pile === b.pile || !G3.over(a.b, b.b) || !G3.foot(a.pts, b.pts, { part: part(a.pid) }, a.S, false, a.b, { part: part(b.pid) }, b.S, false, b.b)) continue;
      if (a.b[2] > b.b[2] + 0.5) before.get(b.pile).add(a.pile); else if (b.b[2] > a.b[2] + 0.5) before.get(a.pile).add(b.pile);
      else { const aA = (a.b[3] - a.b[0]) * (a.b[4] - a.b[1]), bA = (b.b[3] - b.b[0]) * (b.b[4] - b.b[1]); before.get(aA < bA ? b.pile : a.pile).add(aA < bA ? a.pile : b.pile); } }   /* same Z: the smaller outline is in a hole */
    const kindOn = new Map();   /* sig -> sigs it lands on */
    const sameOn = new Map();   /* inst -> the same kind of piece it lies on (the draw stack): its landings run in one chain, one after another */
    for (let i = 0; i < insts.length; i++) for (let j = 0; j < insts.length; j++) { if (i === j) continue; const a = insts[i], b = insts[j]; if (!G3.over(a._b, b._b)) continue;
      if (!G3.foot(a._pts, b._pts, a, a._E, !!a.vertical, a._b, b, b._E, !!b.vertical, b._b)) continue;
      const aOn = a._b[2] > b._b[2] + 0.5 || (Math.abs(a._b[2] - b._b[2]) <= 0.5 && a.vertical && !b.vertical);
      if (!aOn) continue;
      if (a._sig === b._sig) { if (a._b[2] > b._b[2] + 0.5 && (!sameOn.has(a) || b._b[2] > sameOn.get(a)._b[2])) sameOn.set(a, b); continue; }   /* the one directly beneath */
      if (!kindOn.has(a._sig)) kindOn.set(a._sig, new Set()); kindOn.get(a._sig).add(b._sig); }
    const depth = new Map(), depthOf = a => { if (!depth.has(a)) { depth.set(a, 0); depth.set(a, sameOn.has(a) ? depthOf(sameOn.get(a)) + 1 : 0); } return depth.get(a); };
    const sigChain = new Map(); for (const a of insts) sigChain.set(a._sig, Math.max(sigChain.get(a._sig) || 0, depthOf(a)));   /* sig -> how many of its kind land one on another */
    const pilesOf = sig => keys.filter(k => members.get(k).some(sl => sl.sig === sig));
    /* landing relations are a preference, not an order: bees sit on the hive tiles in the box and stand on them on the table, so they must leave
       first and land later, which the landing-time and arc-height rules below arrange */
    const soft = new Map(keys.map(k => [k, new Set()]));
    for (const [sig, unders] of kindOn) for (const u of unders) for (const pk of pilesOf(sig)) for (const pu of pilesOf(u)) if (pk !== pu) soft.get(pk).add(pu);
    /* A pile whose pieces land on pieces still in the box would hover in the air until those have landed, so it waits while any pile with its
       landings met is ready. Among the piles that must hover, the one that frees the most waited-for pile goes first: the bees packed on the hive
       tiles leave before the hive tiles, which twelve bases and the beehives then land on; the bases packed on the flower stacks only free the
       stacks, which nothing lands on. Urgency is the count of piles waiting to land on a pile this one holds down (itself or, through the
       stacking, any pile it must leave before). Without this rule the bases left early and hung in the air through the whole flower stack's
       flight, and the plan below never settled. */
    const needers = new Map(keys.map(k => [k, new Set()])); for (const [k, us] of soft) for (const u of us) needers.get(u).add(k);
    const frees = new Map(keys.map(k => [k, new Set()])); for (const p of keys) for (const k of before.get(p)) frees.get(k).add(p);
    for (let grew = true; grew;) { grew = false; for (const k of keys) for (const p of [...frees.get(k)]) for (const q of frees.get(p)) if (!frees.get(k).has(q)) { frees.get(k).add(q); grew = true; } }
    /* a pile's urgency is the longest chain of landings that follows its pieces: pieces of its kind that land one on another (the 28 flower
       tiles of the draw stack land in one chain, a beat apart, a seventh of the scroll), plus one for each kind that lands on it in turn. Whatever
       is packed on an urgent pile is as urgent as it (the bases on the flower stacks), what such a pile lands on is one more urgent than it (the
       hive tiles under the bases), and what is packed on that is as urgent again (the bees packed on the hive tiles). The box and the table make
       circles (the queen's base packed on the hive tiles lands on the Oak, whose stack carries bases that land on the hive tiles), so the
       inheritance runs a fixed number of hops rather than to a fixpoint. */
    const chainLen = k => Math.max(0, ...members.get(k).map(sl => sigChain.get(sl.sig) || 0));
    const urg0 = new Map(keys.map(k => [k, chainLen(k)]));
    for (let it = 0, grew = true; grew && it < 64; it++) { grew = false; for (const k of keys) { let u = urg0.get(k); for (const n of needers.get(k)) u = Math.max(u, urg0.get(n) + 1); if (u > urg0.get(k)) { urg0.set(k, u); grew = true; } } }
    const carried = m => new Map(keys.map(k => [k, Math.max(m.get(k), ...[...frees.get(k)].map(p => m.get(p)))]));
    const urg1 = carried(urg0), urg2 = new Map(keys.map(k => [k, Math.max(urg1.get(k), ...[...needers.get(k)].map(n => urg1.get(n) + 1))])), urg = carried(urg2);
    const pileOrder = [], done = new Set();
    while (pileOrder.length < keys.length) {
      const ready = keys.filter(k => !done.has(k) && [...before.get(k)].every(a => done.has(a)));
      if (!ready.length) { const name = k => members.get(k)[0].pid + '@' + k; throw new Error('the opening: the piles wait on one another in a circle: ' + keys.filter(k => !done.has(k)).map(k => name(k) + ' waits for ' + [...before.get(k)].filter(a => !done.has(a)).map(name).join(' ')).join('; ')); }
      const unmet = k => [...soft.get(k)].filter(a => !done.has(a)).length;
      /* within one urgency (a circle makes many piles equal), the pile most piles wait to land on goes first, with whatever is packed on it */
      const need = k => Math.max(needers.get(k).size, ...[...frees.get(k)].map(p => needers.get(p).size));
      ready.sort((a, b) => { const za = members.get(a)[0].b[5], zb = members.get(b)[0].b[5]; return urg.get(b) - urg.get(a) || need(b) - need(a) || unmet(a) - unmet(b) || zb - za || members.get(a)[0].b[0] - members.get(b)[0].b[0]; });
      pileOrder.push(ready[0]); done.add(ready[0]);
    }
    let n = 0; for (const k of pileOrder) for (const sl of members.get(k)) { sl.seq = n++; sl.band = pileOrder.indexOf(k) % 3; }
    IB.pileOrder = pileOrder.map(k => ({ pile: k, pids: members.get(k).map(sl => sl.pid), z: +members.get(k)[0].b[5].toFixed(1), soft: [...soft.get(k)].map(u => members.get(u)[0].pid + '@' + u), before: [...before.get(k)].map(u => members.get(u)[0].pid + '@' + u), needed: needers.get(k).size, urgency: urg.get(k), frees: [...frees.get(k)].map(u => members.get(u)[0].pid + '@' + u) }));
    /* the assignment, kind by kind: pieces by their table height (then position), slots by their turn to leave */
    const pieces = [];
    for (const [sig, group] of bySig) {
      const list = insts.filter(i => i._sig === sig).sort((a, b) => a._b[2] - b._b[2] || a.x - b.x || a.y - b.y), order = group.slice().sort((a, b) => a.seq - b.seq);
      /* a piece packed where it plays keeps that slot (it stays put in the opening); the rest pair by table height and turn to leave */
      const same = (inst, sl) => { const d = ((((inst.rot || 0) - (sl.rot || 0)) % 360) + 360) % 360; return Math.hypot(inst.x - sl.x, inst.y - sl.y, inst.z - sl.z) < 0.6 && (d < 0.5 || d > 359.5); };
      const pairs = [], restI = list.slice(), restS = order.slice();
      for (const sl of order) { const i = restI.findIndex(inst => same(inst, sl)); if (i < 0) continue; pairs.push([restI[i], sl]); restI.splice(i, 1); restS.splice(restS.indexOf(sl), 1); }
      restI.forEach((inst, k) => pairs.push([inst, restS[k]]));
      pairs.forEach(([inst, sl]) => { const S = scene.basis({ part: inst.part, x: sl.x, y: sl.y, z: sl.z, rot: sl.rot, flipped: !!inst.flipped, thick: inst.thick });
        const q = tweenRecord(inst, S); q.slot = sl; q.seq = sl.seq; q.band = sl.band; q.vertical = !!inst.vertical; q.thick = inst._fat;
        /* a glued mate: its packed pose is the carrier's plus the offset it keeps on the table, so the pair is rigid in the box as on the table */
        q.mates = (inst._mates || []).map(m => { const Sm = scene.basis({ part: m.part, x: sl.x, y: sl.y, z: sl.z + (m.z - inst.z), rot: sl.rot, flipped: !!m.flipped, thick: m.thick }); const mq = tweenRecord(m, Sm); mq.d = V3.sub(mq.PE, q.PE); return mq; });
        pieces.push(q); });
    }
    for (const inst of insts) { delete inst._sig; delete inst._E; delete inst._b; delete inst._pts; delete inst._fat; delete inst._mates; }
    /* the plan is made between frames (two or three seconds of work: the boxes are on screen meanwhile); until it is done every piece
       stays where the opening starts from, in the box or, coming back up from the game, on the table */
    /* a piece the box holds where the game plays it stays put: landed from the start, never planned (TUMBLER's board is its box: the pocket
       layer, the wheels, the loot and the tiles play where they are packed; owner, 2026-09-19: "all of the dials can start out in-place in
       the animation. they don't need to fly out of the box since the whole game is played inside the box") */
    const stays = q => Math.hypot(q.PE[0] - q.PS[0], q.PE[1] - q.PS[1], q.PE[2] - q.PS[2]) < 0.6 && Math.abs(q.angle) < 0.5;
    const movers = [];
    for (const q of pieces) { if (!stays(q)) { movers.push(q); continue; } q.PS = q.PE.slice(); q.S = q.E; q.angle = 0; for (const m of q.mates) { m.PS = m.PE.slice(); m.S = m.E; } }   /* its packed pose is its table pose, to the last digit */
    IB.pieces = pieces; IB.end = null; IB.fromTable = INTRO.resumeFrom >= 0; IB.planner = schedule(movers);
    for (const q of pieces) { q.t0 = q.tL = IB.fromTable || stays(q) ? -1 : 2; q.H = 0; q.delay = 0; q.lift = 0; }
    /* the second box: built one box height further from the viewer and tipped the other way about its far edge, it stands beside the first,
       at the same depth, its underside toward the viewer; turned half a turn about its centre first, so the underside art reads the right way up */
    const DX = WS + 46, cB = at(DX, 2 * NF + D.LID_TOP), oxB = cB[0] - IX / 2, oyB = cB[1] - IY / 2, L = [];
    tray(L, oxB, oyB, 'base'); neck(L, oxB, oyB, 'NECK_TOP');
    L.push(posed(mk(Object.assign({ part: part('lid-cut'), back: part('lid-outer') }, lidClosed(oxB, oyB))), d => ({ z: d.LID_FLOOR }))); walls(L, oxB, oyB, 'lid-up', 'LID_TOP');
    const farB = at(DX, NF + D.LID_TOP);
    IB.tipB = { angle: -90, pivot: [farB[0], farB[1], 0], axis: IB.tipAxis };   /* tipped about the lid wall's outer face, which the standing box rests on */ const turnB = { angle: 180, pivot: [cB[0], cB[1], 0], axis: [0, 0, 1] };
    L.forEach(inst => { inst.group = [turnB, IB.tipB]; }); IB.boxB = L;
    /* the camera path: keyframes in scroll progress joined by a monotone cubic, so it never stops dead or overshoots: a slow push-in on the
       pair while the title fades and the second box goes, then one crane down and round while the lights come up and the box lies down,
       then a pull back to the table's home view as the lid flies and the pieces come out. Yaw, pitch and view each move one way. */
    const H = HN, home = framed(T.home), key = (u, w, o) => { const [cx, cy] = at(u, w); return Object.assign({ cx, cy }, o, { yaw: o.yaw + STAND.yaw }); };
    IB.spotAt = at(DX / 2, NF + 10);
    const VS = Math.max(1, (IX + IY) / 380);   /* the keyframes were framed on a 190 mm box: a bigger box is seen from proportionally further */
    IB.cam = [
      [0.00, key(DX / 2, NF, { pitch: 84, yaw: -24, dist: 2500 * VS, cz: H / 2 + 36, view: 560 * VS })],
      [0.11, key(DX / 2, NF, { pitch: 82, yaw: -21, dist: 2350 * VS, cz: H / 2 + 26, view: 520 * VS })],
      [0.19, key(0, NF - 30, { pitch: 70, yaw: -17, dist: 1900 * VS, cz: 30, view: 430 * VS })],
      [0.29, key(0, 0, { pitch: 58, yaw: -12, dist: 1500 * VS, cz: 18, view: 400 * VS })],
      [0.42, { pitch: 52, yaw: -6 + STAND.yaw, dist: 2000, cx: home.cx, cy: home.cy, cz: home.cz, view: home.view * 0.9, framed: true }],
      [0.94, Object.assign({}, home, { framed: true })]];   /* framed: the view is the table's own (framed() already sized it for this viewport), so the game's first frame is the opening's last and the camera never steps */
  }
  const CAMK = ['pitch', 'yaw', 'dist', 'cx', 'cy', 'cz', 'view'];
  function introCamera(p) {
    const K = INTRO.cam, f = Math.max(1, 1.2 * scene.H / scene.W), n = K.length - 1;
    const val = (i, k) => k === 'view' && !K[i][1].framed ? K[i][1][k] * f : K[i][1][k];
    if (p <= K[0][0]) return Object.fromEntries(CAMK.map(k => [k, val(0, k)]));
    if (p >= K[n][0]) return Object.fromEntries(CAMK.map(k => [k, val(n, k)]));
    let i = 0; while (K[i + 1][0] < p) i++;
    const p0 = K[i][0], p1 = K[i + 1][0], h = p1 - p0, t = (p - p0) / h, t2 = t * t, t3 = t2 * t;
    const h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2, out = {};
    /* Fritsch-Carlson tangents: zero where the secants change sign or at the ends, a weighted harmonic mean between */
    const tangent = j => { if (j <= 0 || j >= n) return null; const hl = K[j][0] - K[j - 1][0], hr = K[j + 1][0] - K[j][0]; return k => { const dl = (val(j, k) - val(j - 1, k)) / hl, dr = (val(j + 1, k) - val(j, k)) / hr; return dl * dr <= 0 ? 0 : 3 * (hl + hr) / ((2 * hr + hl) / dl + (hr + 2 * hl) / dr); }; };
    const ma = tangent(i), mb = tangent(i + 1);
    for (const k of CAMK) { const a = val(i, k), b = val(i + 1, k); out[k] = h00 * a + h10 * h * (ma ? ma(k) : 0) + h01 * b + h11 * h * (mb ? mb(k) : 0); }
    return out;
  }
  const rotAbout = (v, axis, deg) => { const a = -deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), d = V3.dot(v, axis), x = V3.cross(axis, v); return [v[0] * c + x[0] * s + axis[0] * d * (1 - c), v[1] * c + x[1] * s + axis[1] * d * (1 - c), v[2] * c + x[2] * s + axis[2] * d * (1 - c)]; };
  function introApply(p) {
    const IB = INTRO;
    const title = 1 - ez(seg(p, TL.title[0], TL.title[1])), fadeB = 1 - ez(seg(p, TL.fadeB[0], TL.fadeB[1])), lights = ez(seg(p, TL.lights[0], TL.lights[1]));
    const tip = 90 * (1 - ez(seg(p, TL.tip[0], TL.tip[1]))), lidU = seg(p, TL.lid[0], TL.lid[1]);
    const tipG = Math.abs(tip) > 1e-4 ? { angle: tip, pivot: [IB.tipP[0], IB.tipP[1], 0], axis: IB.tipAxis } : null;
    scene.opts.tableAlpha = lights; scene.opts.table = mixHex(DARK, TABLE, lights);
    for (const inst of IB.base) inst.group = tipG ? [tipG] : undefined;
    if (lidU >= 1) { for (const q of IB.lid) restore(q); }
    else {
      /* the tray rises straight off the neck, turns over in the air and lands open side up: one centre path, one rotation for all five parts */
      const CS = IB.lidC.S, CE = IB.lidC.E, v = seg(lidU, 0.28, 1), w = ez(v);
      const C = lidU < 0.28 ? [CS[0], CS[1], CS[2] + (LID_ALT - CS[2]) * ez(lidU / 0.28)] : [CS[0] + (CE[0] - CS[0]) * w, CS[1] + (CE[1] - CS[1]) * w, LID_ALT + (CE[2] - LID_ALT) * ez(seg(v, 0.62, 1))];
      const a = IB.lidRot.angle * (1 - ez(seg(v, 0.15, 0.6)));
      for (const q of IB.lid) poseAt(q, V3.add(C, q.d), a, tipG, C, IB.lidRot.axis);
    }
    for (const q of IB.pieces) {
      const f = IB.planner ? (IB.fromTable || q.tL < 0 ? 'landed' : null) : flight(q, p);   /* while the plan is made: pieces that stay put are landed already */
      if (f === 'landed') { restore(q); if (tipG) q.inst.group = [tipG]; for (const m of q.mates) { restore(m); if (tipG) m.inst.group = [tipG]; } continue; }
      if (f === null) { poseAt(q, q.PS, q.angle, tipG); q.inst.shadow = false; for (const m of q.mates) { poseAt(m, V3.add(q.PS, m.d), q.angle, tipG, q.PS, q.axis); m.inst.shadow = false; } continue; }
      q.inst.shadow = q.shadow0; poseAt(q, f.P, f.a, tipG);
      for (const m of q.mates) { m.inst.shadow = m.shadow0; poseAt(m, V3.add(f.P, m.d), f.a, tipG, f.P, q.axis); }   /* glued on: the same path and turn, at its offset */
    }
    for (const inst of IB.boxB) { inst.alpha = fadeB < 1 ? fadeB : undefined; inst.hidden = fadeB <= 0.01; }
    scene.setView(withLook(introCamera(p)));
    const r = seg(p, TL.hud[0], TL.hud[1]); hudEl.style.opacity = r; stageEl.classList.toggle('veiled', r <= 0);
    titleEl.style.opacity = title; titleEl.classList.toggle('gone', title <= 0);
    boxButton();
    /* a pool of light on the floor under the standing boxes, until the table's own light comes up */
    const sp = scene.project(IB.spotAt[0], IB.spotAt[1], 0); spotEl.style.left = sp[0] + 'px'; spotEl.style.top = sp[1] + 'px'; spotEl.style.opacity = 1 - lights; spotEl.hidden = lights >= 1;
  }
  /* scroll progress through the track, 0 at the top, 1 at the bottom. The last pixel and a half count as the bottom: a browser at a zoom level
     or a fractional viewport height can stop a fraction of a pixel short of the track's end, and the game must still start there. */
  /* the box button: "Open the box" while the boxes stand closed or the box is closing, "Close the box" while it opens or the game runs;
     hidden while a harness drives p (#intro=, __intro.set) */
  function boxButton() {
    const opening = INTRO.live && INTRO.dir > 0, closed = INTRO.live && INTRO.p <= 0 && INTRO.dir <= 0;
    const text = (INTRO.open || opening) ? 'Close the box' : 'Open the box', hidden = INTRO.forced !== null || INTRO.shot || (!INTRO.live && !INTRO.open);
    if (boxBtn.textContent !== text) boxBtn.textContent = text;
    if (boxBtn.hidden !== hidden) boxBtn.hidden = hidden;
    if (boxBtn.classList.contains('closed') !== closed) boxBtn.classList.toggle('closed', closed);
  }
  function openBox() { if (INTRO.pending) return; if (!INTRO.live) return; INTRO.dir = 1; INTRO.last = performance.now(); dbg('open the box'); boxButton(); dirty = true; }
  function closeBox() {
    if (INTRO.pending) return;
    if (!INTRO.live) { if (!INTRO.open) return; dbg('close the box: the pieces go back to the table pose and the opening is rebuilt from it'); returnToTable(); return; }
    INTRO.dir = -1; INTRO.last = performance.now(); dbg('close the box'); boxButton(); dirty = true;
  }
  boxBtn.addEventListener('click', () => { if (INTRO.open || (INTRO.live && INTRO.dir > 0)) closeBox(); else openBox(); });
  /* what the console says (owner, 2026-09-18: "add console debug as needed"): the first frame, the plan, the button, the start of the game and
     uncaught errors; window.__debug() returns the state the start depends on */
  const T0 = performance.now();
  const dbg = (...a) => console.log(`[page ${((performance.now() - T0) / 1000).toFixed(1)}s]`, ...a);
  window.__debug = () => ({ p: INTRO.p, dir: INTRO.dir, open: INTRO.open, forced: INTRO.forced, live: INTRO.live, pending: INTRO.pending, planning: !!INTRO.planner, fromTable: INTRO.fromTable, modal: modalOpen(), mode, demo: demo.on, paused, turn: G && G.turn, over: G && G.over, hash: location.hash, search: location.search, viewport: [innerWidth, innerHeight] });
  window.addEventListener('error', e => dbg('uncaught error:', e.message, e.filename ? `${e.filename.split('/').pop()}:${e.lineno}` : ''));
  window.addEventListener('unhandledrejection', e => dbg('unhandled rejection:', e.reason && e.reason.message || e.reason));
  function introInit(now) {
    INTRO.pending = false; INTRO.p = -1;
    const q = Object.fromEntries(hashPairs());
    if (q.shot !== undefined) { INTRO.shot = true; introFinish(); return; }   /* a harness scene: the hash decides what runs, the box never opens or closes */
    if (mode === 'parts' || new URLSearchParams(location.search).has('parts')) {
      INTRO.p = 1; INTRO.live = false; INTRO.open = true; INTRO.dir = 0; INTRO.planner = null; boxButton(); return;
    }
    if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) { introFinish(); startDemo(); return; }
    if (q.intro !== undefined) INTRO.forced = clamp01(+q.intro);
    introBuild(); INTRO.live = true; INTRO.open = false; INTRO.dir = 0; scene.dynamic = T.dynamic.concat(INTRO.boxB); scene.opts.fog = FOG; stageEl.classList.add('live');
    if (INTRO.resumeFrom >= 0) { INTRO.p = INTRO.resumeFrom; INTRO.resumeFrom = -1; INTRO.dir = -1; introApply(INTRO.p); }   /* back from the game: the box closes from the table */
    else if (INTRO.p < 0) { INTRO.p = 0; introApply(0); }
    INTRO.last = now === undefined ? performance.now() : now;
    introUpdate(INTRO.last);
  }
  /* p runs with time in the button's direction; a forced value (#intro=, __intro.set) is exact. While the flight plan is still being made the
     opening waits at the edge of the flights (or, closing from the game, at the edge of the table). At p = 1 the opening ends and the game
     starts; at p = 0 the boxes stand closed again. */
  function introUpdate(now) {
    const dt = Math.max(0, Math.min(100, now - INTRO.last)); INTRO.last = now;
    let p = INTRO.forced === null ? clamp01(INTRO.p + INTRO.dir * dt * INTRO.rate / (INTRO.dir > 0 ? OPEN_MS : CLOSE_MS)) : INTRO.forced;
    if (INTRO.planner) { const lim = INTRO.fromTable ? 0.99 : W0 - 0.002, held = INTRO.fromTable ? p < lim : p > lim; if (held) p = lim; waiting(held); }
    if (p !== INTRO.p) { INTRO.p = p; introApply(p); dirty = true; }
    if (INTRO.forced !== null) return;
    if (p >= 1 && INTRO.dir > 0) { dbg(`the box is open: the opening ends${modalOpen() ? ', a modal is open so the game waits' : ' and the game starts'}`); introFinish(); if (!modalOpen()) startDemo(); }
    else if (p <= 0 && INTRO.dir < 0) { INTRO.dir = 0; dbg('the box is closed'); boxButton(); }
  }
  /** the table as the table view keeps it: every instance back in its table pose, the second box gone, the opening over until the geometry changes */
  function introFinish() {
    if (INTRO.live) { for (const q of INTRO.all) restore(q); for (const q of INTRO.pieces) { q.inst.alpha = undefined; q.inst.shadow = q.shadow0; } INTRO.boxB = []; scene.dynamic = T.dynamic;
      scene.setView({ pitch: scene.opts.pitch, yaw: scene.opts.yaw, dist: scene.opts.dist, cx: scene.opts.cx, cy: scene.opts.cy, cz: scene.opts.cz, view: scene.opts.view }); resetLook(); }
    INTRO.live = false; INTRO.open = true; INTRO.dir = 0; INTRO.forced = null; INTRO.planner = null; INTRO.end = INTRO.end === null ? 1 : INTRO.end; waiting(false); scene.opts.tableAlpha = 1; scene.opts.table = TABLE;
    stageEl.classList.remove('live', 'veiled'); hudEl.style.opacity = ''; spotEl.hidden = true; titleEl.classList.add('gone'); boxButton(); dirty = true;
  }
  /* the reader closes the box on the game: it stops where it is, every piece takes the place the engine gives it, and the opening is rebuilt
     from that table, so closing packs this very game into the box and opening it again lets the game go on */
  function returnToTable() {
    stopDemo(); if (G && !G.over) { syncToEngine(); demo.resume = true; } else { demo.resume = false; logEl.innerHTML = ''; }
    for (const inst of T.static.concat(T.dynamic)) inst.group = undefined;
    INTRO.resumeFrom = 1; INTRO.pending = true;
  }
  window.__intro = { get p() { return INTRO.p; }, get dir() { return INTRO.dir; }, get open() { return INTRO.open; }, get rate() { return INTRO.rate; }, set rate(r) { INTRO.rate = +r; }, openBox, closeBox, get live() { return INTRO.live; }, get end() { return INTRO.end; }, get ready() { return !INTRO.planner && !INTRO.pending; }, get pileOrder() { return INTRO.pileOrder; }, get box() { return { o: BOXO, tipP: INTRO.tipP, cam: INTRO.cam }; }, get pieces() { return INTRO.pieces.map(q => ({ pid: q.inst.part.pid, id: q.inst.id, t0: q.t0, tL: q.tL, H: q.H, lift: q.lift, delay: q.delay, pile: q.slot.pile, z: q.slot.z, above: q.dbgAbove, under: q.dbgUnder, bS: q.bS ? q.bS.map(v => +v.toFixed(1)) : null, nPts: q.ptsS ? q.ptsS.length : 0, stays: q.tL < 0 })); }, set: p => { INTRO.forced = clamp01(+p); dirty = true; }, finish: introFinish };

  /* ------------------------------------------------------------ go */
  G = new S.Game({ players: NP, seed: currentSeed }); qr = S.mulberry(1); initTable(G); chips(-1); GT.resetShown(G); window.__maxSnap = 0;
  setMode('table');
  scene.onTextures = () => { dirty = true; };
  const texReady = R3.prepareTextures();
  /* the loading screen covers the stage until the first frame; it comes back, see-through, while a scroll waits for the flight plan */
  const loadingEl = el('loading');
  function waiting(on) { if (firstFrame || on === (!loadingEl.hidden && loadingEl.classList.contains('wait'))) return; loadingEl.hidden = !on; loadingEl.classList.toggle('wait', on); loadingEl.querySelector('span').textContent = on ? 'Opening the box' : 'Loading'; }
  /* the planner runs for up to 8 ms per frame; when it is done the plan is in every piece and the hooks are told the page is ready */
  function advancePlan() {
    if (!INTRO.planner) return;
    const t = performance.now(); let r;
    do { r = INTRO.planner.next(); } while (!r.done && performance.now() - t < 8);
    if (r.done) { INTRO.planner = null; INTRO.end = r.value; waiting(false); dirty = true; dbg(`flight plan ready: the last piece lands at p ${(+r.value).toFixed(3)}`); }
  }
  let firstFrame = true, signalled = false;
  function loop(now) {
    if (INTRO.pending) introInit(now);
    else if (INTRO.live) introUpdate(now); else if (INTRO.shot) { /* a #shot= scene: the hash decides what runs */ }
    else if (!demo.on && INTRO.open && mode === 'table' && !modalOpen()) { dbg('the box is open, the table is shown and no game is running: the game starts'); startDemo(); }   /* the opening ended under a modal, or ended without the game for any other reason */
    if (dirty) { dirty = false; scene.render(); if (firstFrame) { firstFrame = false; loadingEl.hidden = true; dbg('first frame drawn'); }
      if (!signalled && !INTRO.planner && !INTRO.pending) { signalled = true; if (window.__signalReady) window.__signalReady(); } }
    advancePlan();
    requestAnimationFrame(loop);
  }
  texReady.then(() => {
    dirty = true; requestAnimationFrame(loop);
    const q = Object.fromEntries(hashPairs());   /* test hooks: #shot=table|box|parts&id=&p=&y=&v=&cx=&cy=&anim=N&speed= */
    if (q.shot) {
      if (q.shot === 'parts' && q.id) { setMode('parts'); loadPart(q.id); if (q.x === '1') setExplode(1, true); } else setMode(q.shot);
      const v = {}; for (const [k, n] of [['p', 'pitch'], ['y', 'yaw'], ['v', 'view'], ['cx', 'cx'], ['cy', 'cy'], ['cz', 'cz']]) if (q[k] !== undefined) v[n] = +q[k];
      scene.setView(v); dirty = true;
      if (q.lift) { lifted = 1; B.lid.forEach(i => i.z = i.z0 + 95); }
      if (q.anim) { window.__stopAfter = +q.anim; speed = +(q.speed || 8); startDemo(); }
    }
    window.__scene = scene; window.__qa = () => Object.assign({ turn: G && G.turn, over: G && G.over, illegal, mode, playing: demo.on && !paused }, GT.qa ? GT.qa() : {});
  });
})();
