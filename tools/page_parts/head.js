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
    return { T3, TW, WT: need(F, 'WALL_T', 'META.fits'), WH, FU, NCL: (need(META, 'INNER', 'META') - need(META, 'NECK_OUT', 'META')) / 2, EB: need(META, 'BASE_EASE', 'META'), EL: need(META, 'LID_EASE', 'META'), NECK_TOP: FU + T3 + NH, LID_FLOOR: 2 * WH + GAP - FU - T3, LID_TOP: 2 * WH + GAP }; };
  const posed = (inst, fn) => { inst.repose = () => Object.assign(inst, fn(DIM())); inst.repose(); return inst; };
  let dirty = true;
  /* a cross-lapped pair standing in the tile tilePid: tileZ is the tile's underside; the halves stand on its top face, whatever its stock */
  const standingPair = (a, b, x, y, tileZ, tilePid) => { if (!tilePid) throw new Error(`standingPair(${a}, ${b}): the tile the pair stands in must be named`); return [mk({ part: part(a), back: part(a + '-back'), vertical: true, rot: 0, x, y }), mk({ part: part(b), back: part(b + '-back'), vertical: true, rot: 90, x, y })].map(inst => posed(inst, () => ({ z: tileZ + STOCK_T(stockOf(tilePid)) }))); };
