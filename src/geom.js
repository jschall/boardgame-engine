/* SPDX-License-Identifier: MPL-2.0; Copyright (C) 2026 Jonathan Challinger; source: https://github.com/jschall/boardgame-engine
   This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at https://mozilla.org/MPL/2.0/. */
/* boardgame-create engine: from a game's parts spec to the cut files. make_game(spec) returns the GAME object lasergeom.build(GAME, P) runs, in
   node (bin/bg.js parts) and in the page's worker (a stock change regenerates everything). It registers every part with its art (front and back),
   makes standee tabs and leaf-spring bases with keys, adds the box (engine/box.js), nests everything onto 300 x 450 sheets by stock with identical
   parts on shared cut lines, adds the kerf coupons and joint samples, the backs files, and the META the page, the packer and the checks read.
   Node (module.exports) or browser (BGEngine.geom). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./shapes.js'), require('./stock.js'), require('./box.js'));
  else (root.BGEngine = root.BGEngine || {}).geom = factory(root.BGEngine.shapes, root.BGEngine.stock, root.BGEngine.box);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (K, stock, BOX) {
  'use strict';
  const lg = K.lg;
  const { Polygon, sbox, unary_union, affinity, EMPTY, polys, hexagon, C, rrect, memo, range, FONT, ink } = K;
  const SHEET_W = 300.0, SHEET_H = 450.0, TOP = 3.0;
  const KINDS = ['tile', 'token', 'card', 'board', 'plate', 'standee', 'base', 'pair', 'tray'];

  /** check and complete a game's parts spec (the object parts.js returns) */
  function normalize(spec) {
    if (!spec || typeof spec !== 'object') throw new Error('parts.js must export a function returning the parts spec');
    if (!spec.stocks || !Object.keys(spec.stocks).length) throw new Error('the spec has no stocks');
    if (!spec.box || !spec.box.stock) throw new Error('the spec has no box { stock, ... }');
    if (!Array.isArray(spec.parts)) throw new Error('the spec has no parts array (empty is a box-only game)');
    const ids = new Set(), out = [];
    for (const p of spec.parts) {
      if (!p.id || !/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(p.id)) throw new Error(`part id ${JSON.stringify(p.id)}: lower-case words joined by hyphens`);
      if (/-back$|-frame$/.test(p.id)) throw new Error(`part ${p.id}: ids ending in -back or -frame are the engine's (a back face, a tray's pocket layer)`);
      { const m = p.id.match(/^(.*)-(a|b)$/); if (m && spec.parts.some(q => q.kind === 'pair' && q.id === m[1])) throw new Error(`part ${p.id}: the pair ${m[1]} owns ${m[1]}-a and ${m[1]}-b`); }
      if (ids.has(p.id)) throw new Error(`part ${p.id} is listed twice`); ids.add(p.id);
      if (!KINDS.includes(p.kind)) throw new Error(`part ${p.id}: kind ${p.kind} is not one of ${KINDS.join(', ')}`);
      if (!Number.isInteger(p.count) || p.count < 1) throw new Error(`part ${p.id}: count must be a whole number of copies`);
      if (!spec.stocks[p.stock]) throw new Error(`part ${p.id}: stock ${p.stock} is not in the spec's stocks (${Object.keys(spec.stocks).join(', ')})`);
      if (p.raster !== undefined && p.raster !== true && !(p.raster && p.raster.geom_type)) throw new Error(`part ${p.id}: raster must be true (its engraving is never drawn as concentric lines) or a lasergeom geometry (the region of its art that is never)`);
      if (p.kind === 'standee') {
        if (!p.silhouette || !p.silhouette.geom_type) throw new Error(`standee ${p.id}: silhouette must be a lasergeom polygon`);
        if (!p.in || !spec.stocks[p.in]) throw new Error(`standee ${p.id}: in = the stock key of the base or tile it stands in`);
      } else if (p.kind === 'base') {
        if (!p.holds || !spec.stocks[p.holds]) throw new Error(`base ${p.id}: holds = the stock key of the standee it holds`);
        if (!(p.size >= 14)) throw new Error(`base ${p.id}: size (mm across) must be 14 or more for the leaf springs`);
      } else if (p.kind === 'pair') {
        if (!p.silhouette || !p.silhouette.geom_type) throw new Error(`pair ${p.id}: silhouette must be a lasergeom polygon`);
        if (!p.in || !spec.stocks[p.in]) throw new Error(`pair ${p.id}: in = the stock key of the tile with the + hole`);
      } else if (p.kind === 'tray') {
        if (!Array.isArray(p.pockets) || !p.pockets.length) throw new Error(`tray ${p.id}: pockets = [{ piece | shape, x, y, rot, notch }]`);
        for (const q of p.pockets) if (!(q.piece && typeof q.piece === 'string') && !(q.shape && q.shape.geom_type)) throw new Error(`tray ${p.id}: each pocket names a piece (its id) or gives a shape`);
        if (p.frame !== undefined && p.frame !== null && !spec.stocks[p.frame]) throw new Error(`tray ${p.id}: frame ${p.frame} is not a stock`);
      } else if (!p.shape || (!p.shape.geom_type && typeof p.shape !== 'function')) throw new Error(`part ${p.id}: shape must be a lasergeom polygon, or a function of the built fits F -> polygon`);
      if (p.art !== undefined && p.art !== null && typeof p.art !== 'function') throw new Error(`part ${p.id}: art must be a function drawing the engraving (or null)`);
      if (p.back !== undefined && p.back !== null && typeof p.back !== 'function' && p.back !== true) throw new Error(`part ${p.id}: back must be a function, true (the front mirrored) or null`);
      out.push(Object.assign({ art: null, back: null, name: p.id.replace(/-/g, ' ') }, p));
    }
    for (const p of out) if (p.kind === 'tile' && p.plus) { if (!out.find(q => q.id === p.plus.pair && q.kind === 'pair')) throw new Error(`tile ${p.id}: plus.pair names no pair`); }
    for (const p of out) if (p.kind === 'tray') for (const q of p.pockets) if (q.piece) { const t = out.find(r => r.id === q.piece); if (!t) throw new Error(`tray ${p.id}: pocket piece ${q.piece} is not a part`); if (!t.shape) throw new Error(`tray ${p.id}: pocket piece ${q.piece} has no flat shape (a standee stands in a base, not a pocket)`); }
    return Object.assign({}, spec, { parts: out });
  }

  /** a tray with pockets for pieces (the tray competency), usable from make_game and from a hand-written generator (BUMBLE):
   *  make_tray(p, { stocks, F, pieceOf(id) -> { shape, stock } }) -> { parts: [{ pid, kind, stock, name, shape, art, edge }], meta }
   *  Pocket = the piece's outline plus POCKET_CLEARANCE all round. With a thinner stock in the game the pockets are cut out of it (the frame) and
   *  laminated on a back (p.stock: thin or thick, the author's choice of material use); a piece must stand POCKET_PROUD above the frame or the pocket
   *  gets a finger notch. With no thinner stock the pockets are engraved into the tray (one part; the laser's engraving depth is the pocket depth).
   *  p: { id, count, stock, name, pockets: [{ piece | shape, t, x, y, rot, notch }], frame, margin, r, shape, art (the back), frame_art, store } */
  function make_tray(p, ctx) {
    const { stocks, F, pieceOf } = ctx, D = K.DESIGN, EMPTY = lg.EMPTY;
    if (!Array.isArray(p.pockets) || !p.pockets.length) throw new Error(`tray ${p.id}: pockets = [{ piece | shape, x, y, rot, notch }]`);
    const piece = q => { if (!q.piece) return null; const r = pieceOf(q.piece); if (!r || !r.shape) throw new Error(`tray ${p.id}: pocket piece ${q.piece} is not a flat part`); return r; };
    const pieceShape = q => q.piece ? piece(q).shape : q.shape, pieceT = q => q.piece ? F.stocks[piece(q).stock].t : (q.t || F.stocks[p.stock].t);
    if (p.frame && !stocks[p.frame]) throw new Error(`tray ${p.id}: frame ${p.frame} is not a stock`);
    const thinner = Object.keys(stocks).filter(k => k !== p.stock && stocks[k].nominal < 0.75 * Math.min(...p.pockets.map(pieceT))).sort((a, b) => stocks[a].nominal - stocks[b].nominal);
    const frame = p.frame === null ? null : p.frame !== undefined ? p.frame : (thinner[0] || null);
    const pockets = p.pockets.map((q, i) => {
      if (!q.piece && !(q.shape && q.shape.geom_type)) throw new Error(`tray ${p.id}: pocket ${i} names a piece or gives a shape`);
      const sh = affinity.translate(affinity.rotate(pieceShape(q), q.rot || 0, [0, 0]), q.x || 0, q.y || 0), b = sh.bounds;
      const hole = sh.buffer(D.POCKET_CLEARANCE, { join_style: 'round', quad_segs: 6 });
      const proud = pieceT(q) - (frame ? F.stocks[frame].t : 0);
      const side = q.notch === undefined ? ((b[2] - b[0]) >= (b[3] - b[1]) ? 'S' : 'E') : q.notch;   /* the notch on the pocket's longer side */
      const notch = frame && proud < D.POCKET_PROUD && side ? C(side === 'S' || side === 'N' ? (b[0] + b[2]) / 2 : side === 'E' ? b[2] + D.POCKET_CLEARANCE : b[0] - D.POCKET_CLEARANCE, side === 'S' ? b[3] + D.POCKET_CLEARANCE : side === 'N' ? b[1] - D.POCKET_CLEARANCE : (b[1] + b[3]) / 2, D.NOTCH_R, 16) : null;
      return { i, piece: q.piece || null, x: q.x || 0, y: q.y || 0, rot: q.rot || 0, hole, notch, proud, t: pieceT(q), bounds: hole.bounds, w: +(b[2] - b[0]).toFixed(2), h: +(b[3] - b[1]).toFixed(2) };
    });
    const hb = pockets.map(q => q.notch ? q.hole.union(q.notch).bounds : q.bounds), M = p.margin || 6;
    const x0 = Math.min(...hb.map(b => b[0])) - M, y0 = Math.min(...hb.map(b => b[1])) - M, x1 = Math.max(...hb.map(b => b[2])) + M, y1 = Math.max(...hb.map(b => b[3])) + M;
    const outer = p.shape || rrect(x0, y0, x1, y1, p.r || 3.0);
    for (const q of pockets) if (outer.buffer(-2.0).contains(q.hole) === false) throw new Error(`tray ${p.id}: pocket ${q.i} comes within 2 mm of the tray's edge`);
    for (let a = 0; a < pockets.length; a++) for (let b = a + 1; b < pockets.length; b++) if (pockets[a].hole.distance(pockets[b].hole) < 2.0) throw new Error(`tray ${p.id}: pockets ${a} and ${b} leave less than 2 mm of wood between them`);
    const holes = unary_union(pockets.map(q => q.notch ? q.hole.union(q.notch) : q.hole));
    const parts = [];
    if (frame) {   /* the back (p.stock) with its art, the frame (thin) with the pockets cut out and the frame_art */
      parts.push({ pid: p.id, kind: 'tray', stock: p.stock, name: p.name, shape: outer, art: () => p.art ? p.art() : EMPTY, edge: outer });
      const frameShape = outer.difference(holes);
      if (frameShape.geom_type !== 'Polygon') throw new Error(`tray ${p.id}: the pockets cut the frame into pieces`);
      parts.push({ pid: p.id + '-frame', kind: 'tray-frame', stock: frame, name: `${p.name}, pocket layer`, shape: frameShape, art: () => p.frame_art ? p.frame_art() : EMPTY, edge: outer });
    } else parts.push({ pid: p.id, kind: 'tray', stock: p.stock, name: p.name, shape: outer, art: () => unary_union([holes, p.art ? p.art() : EMPTY]), edge: outer });   /* one part: the pockets engraved */
    const meta = { w: +(outer.bounds[2] - outer.bounds[0]).toFixed(2), h: +(outer.bounds[3] - outer.bounds[1]).toFixed(2), x0: +outer.bounds[0].toFixed(2), y0: +outer.bounds[1].toFixed(2), frame, back: p.stock, depth: frame ? F.stocks[frame].t : null, engraved: !frame, store: p.store !== false,
      pockets: pockets.map(q => ({ i: q.i, piece: q.piece, x: q.x, y: q.y, rot: q.rot, w: q.w, h: q.h, t: q.t, proud: +q.proud.toFixed(2), notch: !!q.notch })) };
    return { parts, meta, frame };
  }

  /** the outline a part is cut to (nominal, before compensation) and its thickness class; used by the packer and the table */
  function make_game(spec0, opts = {}) {
    const spec = normalize(spec0), stocks = spec.stocks, box = spec.box;
    const stock_keys = Object.keys(stocks);
    const stock_of = {};   // pid -> stock key (back faces follow their fronts)
    const P0 = stock.nominal_params(stocks);
    let NEED_F = null;   /* the built fits, once generate has them: the neck's split depends on the box's size */
    const need = () => {
      const n = BOX.NEED(NEED_F);
      for (const p of spec.parts) {
        if (p.kind === 'pair') { n[`${p.id}-a`] = p.count; n[`${p.id}-b`] = p.count; } else n[p.id] = p.count;
        if (p.kind === 'tray' && p.frame !== null) { const thinner = Object.keys(spec.stocks).filter(k => k !== p.stock && spec.stocks[k].nominal < 0.75 * Math.min(...p.pockets.map(q => q.piece ? spec.stocks[spec.parts.find(r => r.id === q.piece).stock].nominal : (q.t || spec.stocks[p.stock].nominal)))); if (p.frame || thinner.length) n[`${p.id}-frame`] = p.count; }
      }
      return n;
    };
    const GAME = {
      name: spec.name || 'GAME',
      defaults: stock.defaults(stocks),
      stocks,
      spec,
      edge_scores: true, compensate: true,
      /* spec.sheet: { w, h, margin_x, margin_bottom } for stock other than the 300 x 450 mm sheet the engine assumes (TUMBLER lays 12 x 18 in sheets edge to edge) */
      layout: P => ({ registration: 'crosses', cross_length: 3, cross_edge: 'bottom', mark_gap: 0.25, center_along: typeof spec.sheets !== 'function', center_across: typeof spec.sheets !== 'function', corner_marks: 'score', corner_keepout: 15, margin_x: (spec.sheet && spec.sheet.margin_x) || 3.0, margin_bottom: (spec.sheet && spec.sheet.margin_bottom) || 3.0,
        sheet_w: (spec.sheet && spec.sheet.w) || SHEET_W, sheet_h: (spec.sheet && spec.sheet.h) || SHEET_H,
        speck_area: 0.12, speck_len: 0.5, back_of: { 'floor-base': 'floor-base-map', 'lid-cut': 'lid-inner' }, title_prefix: (spec.name || 'GAME') + ' ',
        compensate: true, kerf: P[`kerf_${box.stock}`], eng_store: GAME.eng_store || null, edge_scores: true,
        /* the vector fill (low-density engraving as a spiral of lines, 100 lines per centimetre) is off unless the game asks: spec.vector_fill true or
           the planner's options (owner, 2026-09-21: "concentric should only ever be used for large thick borders. it shouldn't be auto selected, it
           should default to off and be an option"); explicit lines on a part go through add()'s vfill */
        vector_fill: spec.vector_fill ? Object.assign({ pitch: 0.1 }, spec.vector_fill === true ? {} : spec.vector_fill) : false }),
      need,
      register_fonts: K.register_fonts, set_store: K.set_store, warnings: K.warnings,
      onprogress: null, eng_store: null, part_filter: null, parts_only: false, on_part: null,
      generate(P, lay) {
        const t0 = Date.now(), times = {};
        const F = stock.derive(stocks, P, box), F0 = stock.derive(stocks, P0, box); NEED_F = F;
        const CK = lay.o.corner_keepout, W = lay.W, H = lay.H;
        lay.usable2 = sbox(lay.o.margin_x, TOP, W - lay.o.margin_x, H - lay.o.margin_bottom);
        lay.keepout = unary_union([Polygon([[0, 0], [CK, 0], [0, CK]]), Polygon([[W, 0], [W - CK, 0], [W, CK]]), Polygon([[0, H], [CK, H], [0, H - CK]]), Polygon([[W, H], [W - CK, H], [W, H - CK]])]);
        let stage = null, st0 = 0;
        const step = (label, frac) => { const now = Date.now(); if (stage) times[stage] = now - st0; stage = label; st0 = now; if (GAME.onprogress) GAME.onprogress(frac, label); };
        const kerf_of = pid => { const s = stock_of[pid]; if (!s) throw new Error(`${pid}: no stock recorded`); return F.stocks[s].kerf; };
        const setStock = (pid, s) => { stock_of[pid] = s; };
        const add = (pid, shape, art, o) => lay.add(pid, shape === undefined ? null : shape, art === undefined ? EMPTY : art, Object.assign({ kerf: kerf_of(pid) }, o || {}));
        const raster_of = {};   // part id -> the spec's `raster` flag: true keeps the part's engraving a raster on every sheet, a geometry keeps what touches it
        const keyed = (pid, shape, key, draw, o) => {
          if (GAME.on_part) GAME.on_part(pid, pid.replace(/-back$/, ''));
          if (GAME.part_filter && !GAME.part_filter(pid, pid.replace(/-back$/, ''))) return false;
          const r = raster_of[pid.replace(/-back$/, '')], vf = r === true ? { vector_fill: false } : r ? { vector_fill: { raster: r } } : {};
          lay.add(pid, shape === undefined ? null : shape, draw, Object.assign({ art_key: key, kerf: kerf_of(pid) }, vf, o || {}));
          return true;
        };
        const mirrored = shape => K.back_art(shape, shape);
        const bases = {}, part_kind = {}, part_name = {}, part_key = {}, standee_of = {}, trays = {};
        // ------------------------------------------------------------ the game's parts
        step('parts', 0.02);
        const flat = (p) => {
          setStock(p.id, p.stock); part_kind[p.id] = p.kind; part_name[p.id] = p.name;
          const shape = typeof p.shape === 'function' ? p.shape(F) : p.shape;   /* a shape may follow the built stock (a slot the stock's thickness wide) */
          if (!shape || !shape.geom_type) throw new Error(`part ${p.id}: shape(F) must return a lasergeom polygon`);
          if (p.plus) {   // a tile holding a cross-lapped pair: a + hole with four leaf springs
            const pair = spec.parts.find(q => q.id === p.plus.pair), fp = F.pair(pair.stock, p.stock);
            const site = K.leaf_site(fp.plus_bar, fp.plus_w, kerf_of(p.id), true, null, p.plus.x || 0, p.plus.y || 0);
            const registered = keyed(p.id, shape, `part:${p.id}`, () => p.art ? p.art() : EMPTY, { edge: shape, eng_post: g => K.clip_out(g, site.removed.buffer(1.0)), eng_post_key: 'leaf:' + [fp.plus_bar, fp.plus_w, kerf_of(p.id)].join(',') });
            if (registered) K.leaf_part(lay, p.id, shape, site);
          } else keyed(p.id, shape, `part:${p.id}`, () => p.art ? p.art() : EMPTY, Object.assign({ edge: shape }, p.score ? { score: K.score_lines(p.score()) } : {}));   /* score: blue lines drawn on the part (a dial's ticks, a card's circles) */
          if (p.back) { setStock(p.id + '-back', p.stock); keyed(p.id + '-back', null, `part:${p.id}:back`, () => K.back_art(shape, p.back === true ? (p.art ? p.art() : EMPTY) : p.back()), { edge: mirrored(shape), back: true }); }
        };
        const standee = (p) => {
          setStock(p.id, p.stock); setStock(p.id + '-back', p.stock); part_kind[p.id] = 'standee'; part_name[p.id] = p.name; part_key[p.id] = p.key === undefined ? null : p.key;
          const fs = F.standee(p.stock, p.in), depth = fs.tab_depth, key = p.key === undefined ? null : p.key;
          const snom = memo(`standee:${p.id}:nominal`, () => K.standee_shape(p.silhouette, F0.standee(p.stock, p.in).tab_depth, key));
          const shape = memo(`standee:${p.id}:${depth}`, () => K.standee_shape(p.silhouette, depth, key));
          keyed(p.id, shape, `part:${p.id}`, () => p.art ? p.art() : EMPTY, { edge: snom });
          keyed(p.id + '-back', null, `part:${p.id}:back`, () => K.back_art(snom, p.back && p.back !== true ? p.back() : (p.art ? p.art() : EMPTY)), { edge: mirrored(snom), back: true });
          if (p.base) { if (!spec.parts.find(q => q.id === p.base && q.kind === 'base')) throw new Error(`standee ${p.id}: base ${p.base} is not a base part`); bases[p.id] = p.base; }
          standee_of[p.id] = { in: p.in };
        };
        const base = (p) => {
          setStock(p.id, p.stock); part_kind[p.id] = 'base'; part_name[p.id] = p.name; part_key[p.id] = p.key === undefined ? null : p.key;
          const fs = F.standee(p.holds, p.stock), whole = typeof p.shape === 'string' || !p.shape ? K.base_shape(p.shape || 'circle', p.size) : p.shape;
          const site = K.leaf_site(fs.slot_len, fs.slot_w, kerf_of(p.id), false, p.key === undefined ? null : p.key);
          K.leaf_base_check(whole, site);
          const registered = keyed(p.id, whole, `part:${p.id}`, () => p.art ? p.art() : EMPTY, { edge: whole, eng_post: g => K.clip_out(g, site.removed.buffer(0.6), 0.6, 1.2), eng_post_key: 'leaf:' + [fs.slot_len, fs.slot_w, kerf_of(p.id), p.key].join(',') });
          if (registered) K.leaf_part(lay, p.id, whole, site);
        };
        /* a tray with pockets for pieces (the tray competency): the engine's make_tray, registered here */
        const tray = (p) => {
          const T = make_tray(p, { stocks, F, pieceOf: id => { const q = spec.parts.find(r => r.id === id); return q && { shape: q.shape, stock: q.stock }; }, EMPTY });
          for (const q of T.parts) { setStock(q.pid, q.stock); part_kind[q.pid] = q.kind; part_name[q.pid] = q.name; keyed(q.pid, q.shape, `part:${q.pid}`, q.art, { edge: q.edge }); }
          trays[p.id] = T.meta;
        };
        const pair = (p) => {
          const tile = spec.parts.find(q => q.kind === 'tile' && q.plus && q.plus.pair === p.id);
          if (!tile) throw new Error(`pair ${p.id}: no tile has plus: { pair: '${p.id}' }`);
          const fp = F.pair(p.stock, p.in), fp0 = F0.pair(p.stock, p.in);
          const H = -p.silhouette.bounds[1];
          for (const [half, front] of [['a', true], ['b', false]]) {
            const pid = `${p.id}-${half}`; setStock(pid, p.stock); setStock(pid + '-back', p.stock); part_kind[pid] = 'pair'; part_name[pid] = `${p.name}, ${front ? 'front' : 'back'} half`;
            const make = (f) => { const [tab] = K.spring_tab(K.DESIGN.STAND_TAB, f.tab_depth, 2.5); const sil = unary_union([p.silhouette, tab]); return K.crosslap(sil, H, front, f.xlap_w, f.xlap_over, f.below, `pair ${p.id}`); };
            const snom = memo(`pair:${pid}:nominal`, () => make(fp0)), shape = memo(`pair:${pid}:${[fp.tab_depth, fp.xlap_w, fp.below].join(',')}`, () => make(fp));
            const band = K.centre_band(fp.centre_half).buffer(0.25), band_back = K.back_art(snom, band), bk = `band:${fp.centre_half}`;
            keyed(pid, shape, `part:${p.id}`, () => p.art ? p.art() : EMPTY, { edge: snom, eng_post: g => K.clip_out(g, band, 0.6, 1.2), eng_post_key: bk });
            keyed(pid + '-back', null, `part:${p.id}:back`, () => K.back_art(snom, p.art ? p.art() : EMPTY), { edge: mirrored(snom), back: true, eng_post: g => K.clip_out(g, band_back, 0.6, 1.2), eng_post_key: bk });
          }
        };
        for (const p of spec.parts) if (p.raster !== undefined) raster_of[p.id] = p.raster;
        for (const p of spec.parts) { if (p.kind === 'standee') standee(p); else if (p.kind === 'base') base(p); else if (p.kind === 'pair') pair(p); else if (p.kind === 'tray') tray(p); else flat(p); }
        // ------------------------------------------------------------ the box
        step('box', 0.4);
        for (const pid of ['floor-base', 'floor-base-under', 'floor-base-map', 'lid-cut', 'lid-inner', 'lid-outer', 'neck-A', 'neck-B', 'neck-A-half', 'neck-B-half']) setStock(pid, pid.startsWith('neck') ? (box.neck || box.stock) : box.stock);
        for (const s of 'SENW') for (const h of ['base', 'lid', 'lid-up']) setStock(`wall-${s}-${h}`, box.stock);
        const boxSpec = Object.assign({ title: spec.name }, box);
        const { fl } = BOX.add_parts({ keyed, add }, F, F0, boxSpec);
        if (GAME.parts_only === true) return { need: {}, meta: {} };
        // ------------------------------------------------------------ coupons: one kerf coupon per stock, and the joint samples on the box stock
        step('coupons', 0.55);
        const legend = [], coupon_sheets = {};
        const tag = (label, x, y, size = 2.2) => ink(label, size, x, y, { font: FONT.SB });
        const row_put = (sheet, pids, x0, y0, KS) => { let x = x0, ymax = y0; for (const pid of pids) { if (pid === 'SQUARES') { for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) lay.put(sheet, 'test-square', x + KS / 2 + (30 + KS) * i, y0 + KS / 2 + (20 + KS) * j, { gid: `test-square-${2 * j + i}`, share: true }); x += 60 + 2 * KS + 3; ymax = Math.max(ymax, y0 + 40 + 2 * KS); continue; } const [x1, y1] = lay.put_box(sheet, pid, x, y0); x = x1 + 3.0; ymax = Math.max(ymax, y1); } return [x, ymax]; };
        for (const s of stock_keys) {
          const S = F.stocks[s], name = `kerf-${s}`, pre = `kerf-${s}-`;
          setStock(pre + 'part', s); setStock(pre + 'hole', s);
          lay.add(pre + 'part', sbox(0, 0, 20, 20), tag('KERF', 10, 11), { kerf: S.kerf });
          lay.add(pre + 'hole', rrect(0, 0, 28, 28, 2).difference(sbox(4, 4, 24, 24)), tag('KERF', 14, 3.0, 1.8), { kerf: S.kerf });
          lay.sheet(name, `Kerf coupon / ${S.name} / kerf ${S.kerf} mm · a 20 mm square and a 20 mm hole: cut first, measure both, enter the kerf`, S.mat, S.t, { test: true, reference: false, kerf: S.kerf });
          row_put(name, [pre + 'part', pre + 'hole'], 9.0, 9.0, S.kerf);
          coupon_sheets[name] = { stock: s, what: 'kerf coupon' };
        }
        {   // the joint samples: one base and tab per (standee stock, base stock) pair in use, a box corner, four squares on shared lines
          const s = box.stock, S = F.stocks[s], KS = S.kerf, pairs = new Map();
          for (const p of spec.parts) if (p.kind === 'standee') pairs.set(`${p.stock}>${p.in}`, [p.stock, p.in, p.key === undefined ? null : p.key]);
          const rows = [], first = [];
          for (const [k, [st, bs, key]] of pairs) {
            const fs = F.standee(st, bs), site = K.leaf_site(fs.slot_len, fs.slot_w, F.stocks[bs].kerf, false, key, 11, 6), g = rrect(0, 0, 22, 18, 2);
            const bp = `test-base-${st}-${bs}`, tp = `test-tab-${st}-${bs}`; setStock(bp, bs); setStock(tp, st);
            add(bp, g, tag('BASE', 11, 15.8)); K.leaf_part(lay, bp, g, site); legend.push({ pid: bp, label: 'BASE and TAB', what: `a ${F.stocks[st].name} tab presses between the leaf springs of a ${F.stocks[bs].name} base` });
            add(tp, K.standee_shape(rrect(-8, -12, 8, 0, 1.5), fs.tab_depth, key), tag('TAB', 0, -7));
            first.push(bp, tp);
          }
          const FB = stock.tray(F, 'base');
          setStock('test-corner-a', s); setStock('test-corner-b', s); setStock('test-corner-floor', s); setStock('test-square', s);
          add('test-corner-a', BOX.wall_shape('A', true, FB).intersection(sbox(0, 0, FB.WALL_T + FB.EASE + F.TABS[0] + F.SLOT_W / 2 + 5, F.WALL_H)), tag('CORNER', (FB.WALL_T + F.TABS[0]) / 2, 8.0));
          legend.push({ pid: 'test-corner-a', label: 'CORNER', what: 'the end of a wall without a thumb notch, the end of one with it and a corner of the floor: the floor tab goes through the wall slot and the fingers meet' });
          add('test-corner-b', BOX.wall_shape('B', true, FB).intersection(sbox(0, 0, 20, F.WALL_H)), tag('CORNER', 12, 8.0));
          add('test-corner-floor', fl.intersection(sbox(-F.FLOOR_TAB - 1, -F.FLOOR_TAB - 1, F.TABS[0] + F.TAB_W / 2 + 5, 14)), tag('CORNER', 18, 8.0));
          add('test-square', rrect(0, 0, 30, 20, 4)); legend.push({ pid: 'test-square', label: 'The four squares', what: 'four squares on shared cut lines: all of them must drop out' });
          lay.sheet('sheet0', `Joint samples / ${S.name} / kerf ${KS} mm · cut on a scrap after entering the kerf, before any production sheet`, S.mat, S.t, { test: true, reference: false, kerf: KS });
          rows.push(first, ['test-corner-a', 'test-corner-b', 'test-corner-floor', 'SQUARES']);
          let y = 9.0, xmax = 0;
          for (const r of rows) { if (!r.length) continue; const [x1, y1] = row_put('sheet0', r, 9.0, y, KS); xmax = Math.max(xmax, x1); y = y1 + 3.0; }
          lay.meta.sheet0_size = [Math.ceil(xmax + 6), Math.ceil(y + 6)];
          coupon_sheets.sheet0 = { stock: s, what: 'joint samples' };
        }
        if (GAME.parts_only === 'sheet0') return { need: {}, meta: {} };
        // ------------------------------------------------------------ the production sheets: by stock, the box stock first, identical parts on shared lines
        step('sheets', 0.6);
        const sheets = [], sheet_stock = {};
        let n = 0;
        const SHEET_W = lay.W, SHEET_H = lay.H;   /* the spec's sheet, or the engine's 300 x 450 */
        const usable = sbox(lay.o.margin_x, TOP, SHEET_W - lay.o.margin_x, SHEET_H - lay.o.margin_bottom);
        const two_sided = new Set();
        const open_sheet = (s, name) => {
          if (name) { if (sheets.includes(name)) throw new Error(`sheet ${name} opened twice`); if (/^(kerf-|backs-|sheet0$)/.test(name)) throw new Error(`sheet name ${name} is reserved`); }
          else { n++; name = `sheet${n}`; }
          const S = F.stocks[s]; lay.sheet(name, `${name} · ${S.name}`, S.mat, S.t, { two_sided: true, kerf: S.kerf }); sheets.push(name); sheet_stock[name] = s; return name;
        };
        const order = [box.stock].concat(stock_keys.filter(s => s !== box.stock));
        const grouped = (s) => {   // the groups to nest for this stock, largest first: [{ members, rots, share, area, pids }]
          const groups = [];
          const KS = F.stocks[s].kerf;
          const parts_here = Object.keys(lay.parts).filter(pid => stock_of[pid] === s && lay.outlines[pid] && !/-back$/.test(pid) && !/^(test-|kerf-)/.test(pid) && !/-lid-up$/.test(pid));
          const counts = need();
          const singles = [];
          for (const pid of parts_here) {
            const cnt = counts[pid]; if (!cnt) continue;
            const g = lay.outlines[pid], b = g.bounds, w = b[2] - b[0], h = b[3] - b[1], area = g.area;
            const rect = Math.abs(area - w * h) < 0.02 * w * h && polys(g).length === 1, hex6 = !rect && is_regular_hex(g);
            if (/^(wall-|neck-)/.test(pid)) continue;   // grouped below: the walls of each tray and the four neck boards stacked on shared long edges
            if (/^(floor-base|lid-cut)$/.test(pid)) { singles.push([pid, 0]); continue; }
            if (rect || hex6) {
              const pw = w + KS, ph = h + KS, cols = Math.max(1, Math.min(cnt, Math.floor((SHEET_W - 2 * lay.o.margin_x - 2) / pw)));
              let k = 0;
              while (k < cnt) {
                const take = Math.min(cnt - k, cols * Math.max(1, Math.min(6, Math.floor((cnt - k) / cols) || 1)));
                const members = [];
                for (let i = 0; i < take; i++) { const r = Math.floor(i / cols), c = i % cols; const [dx, dy] = hex6 ? [c * pw + (r % 2 ? pw / 2 : 0), r * (h * 0.75 + KS * Math.sqrt(3) / 2)] : [c * pw, r * ph]; members.push([pid, dx, dy, `${pid}-${k + i}`]); }
                groups.push({ members, rots: [0, 90], share: true, area: area * take, pid });
                k += take;
              }
            } else for (let i = 0; i < cnt; i++) singles.push([pid, i]);
          }
          for (const [pid, i] of singles) groups.push({ members: [[pid, 0, 0, `${pid}-${i}`]], rots: [0, 90, 180, 270], share: false, area: lay.outlines[pid].area, pid });
          if (s === box.stock) for (const which of ['base', 'lid']) {   // the four walls of a tray in a stack, rims and bottoms one kerf apart
            const pids = [...'SENW'].map(side => `wall-${side}-${which}`), members = pids.map((pid, i) => [pid, 0, i * (F.WALL_H + KS), pid]);
            groups.push({ members, rots: [90, 0], share: true, area: pids.reduce((a, pid) => a + lay.outlines[pid].area, 0), pid: pids[0] });
          }
          if (s === (box.neck || box.stock)) { const pids = Object.keys(need()).filter(k => /^neck-/.test(k)).flatMap(k => Array(need()[k]).fill(k)), members = pids.map((pid, i) => [pid, 0, i * (F.NECK_H + KS), `${pid}-${i}`]); groups.push({ members, rots: [90, 0], share: true, area: pids.reduce((a, pid) => a + lay.outlines[pid].area, 0), pid: 'neck-A' }); }
          groups.sort((a, b) => b.area - a.area);
          return groups;
        };
        const is_regular_hex = g => { const ps = polys(g); if (ps.length !== 1) return false; const hull = g.convex_hull; if (Math.abs(hull.area - g.area) > 0.03 * g.area) return false; const b = g.bounds, w = b[2] - b[0], h = b[3] - b[1]; return Math.abs(h / w - 2 / Math.sqrt(3)) < 0.03 && Math.abs(g.area / (w * h) - 0.75) < 0.03; };
        /* a game may lay its own sheets (TUMBLER: floors with walls standing along the sheet edge, plugs cut from the well offcuts): spec.sheets(lay, ctx)
           opens sheets with ctx.sheet(stock) or ctx.sheet(stock, name) and places every needed part with lay.put / lay.put_box / lay.nest; the engine
           adds the box's art overlays, the titles, the backs and the checks as for its own nesting */
        if (typeof spec.sheets === 'function') {
          const test_sheet = (name, s, what) => { const S = F.stocks[s]; lay.sheet(name, `${name} · ${S.name} · ${what}`, S.mat, S.t, { two_sided: false, test: true, reference: false, kerf: S.kerf }); coupon_sheets[name] = { stock: s, what }; return name; };
          const add_test = (pid, s, cut, eng, o) => { setStock(pid, s); lay.add(pid, cut, eng === undefined ? EMPTY : eng, Object.assign({ kerf: F.stocks[s].kerf }, o || {})); };   /* a test piece of stock s, for a test sheet */
          spec.sheets(lay, { F, stocks: F.stocks, kerfs: Object.fromEntries(stock_keys.map(k => [k, F.stocks[k].kerf])), usable, TOP, SHEET_W, SHEET_H, need: need(), outlines: lay.outlines, stock_of: pid => stock_of[pid], sheet: open_sheet, test_sheet, add_test, sheets, score_lines: K.score_lines });
          const counts = need(), placed = {};
          for (const name of sheets) for (const it of lay.layout[name].items) if (it[0] && !/^(floor-base-under|lid-outer)$/.test(it[0])) placed[it[0]] = (placed[it[0]] || 0) + 1;
          const short = Object.entries(counts).filter(([pid, n]) => n && (placed[pid] || 0) !== n && !/-lid-up$/.test(pid) && !/-back$/.test(pid));
          if (short.length) throw new lg.LaserCheckError(short.map(([pid, n]) => `${pid}: ${placed[pid] || 0} placed of ${n}`), 'LAYOUT PROBLEM');
        } else
        for (const s of order) {
          const groups = grouped(s); if (!groups.length) continue;
          let sheet = open_sheet(s);
          const queue = groups.slice();
          while (queue.length) {
            const g = queue.shift();
            try { lay.nest(sheet, g.members, { rots: g.rots, share: g.share, region: usable }); }
            catch (e) {
              if (!(e instanceof lg.LaserCheckError)) throw e;
              if (g.members.length > 1) { const half = Math.ceil(g.members.length / 2); queue.unshift({ ...g, members: g.members.slice(half) }, { ...g, members: g.members.slice(0, half).map((m, i) => [m[0], m[1] - g.members[0][1], m[2] - g.members[0][2], m[3]]) }); continue; }
              const fresh = !(lay.placed_geoms[sheet] || []).length;
              if (fresh) throw new lg.LaserCheckError([`${g.pid} does not fit an empty sheet`], 'LAYOUT PROBLEM');
              sheet = open_sheet(s); queue.unshift(g);
            }
          }
        }
        // the overlays that share a placement with their plates: the box's front and back art
        for (const name of sheets) {
          const items = lay.layout[name].items;
          for (const it of items.slice()) {
            if (it[0] === 'floor-base') lay.put(name, 'floor-base-under', it[1], it[2], { rot: it[3], gid: 'floor-base-under', check: false });
            if (it[0] === 'lid-cut') lay.put(name, 'lid-outer', it[1], it[2], { rot: it[3], gid: 'lid-outer', check: false });
          }
        }
        for (const name of sheets) { const tests = lay.layout[name].items.filter(([pid]) => /^(test-|kerf-)/.test(pid)); if (tests.length) throw new lg.LaserCheckError([`${name}: production sheet contains test pieces ${tests.map(t => t[0]).join(', ')}`], 'LAYOUT PROBLEM'); }
        // sheet titles from their contents
        for (const name of sheets) {
          const cnt = {}; for (const it of lay.layout[name].items) if (it[0] && !/^(floor-base-under|lid-outer)$/.test(it[0])) cnt[it[0]] = (cnt[it[0]] || 0) + 1;
          const words = Object.entries(cnt).map(([pid, c]) => `${c} ${part_name[pid] || pid.replace(/-/g, ' ')}`).slice(0, 8).join(', ');
          const label = /^sheet\d+$/.test(name) ? `sheet ${name.slice(5)}` : name;
          lay.layout[name].title = `${spec.name} ${label} · ${F.stocks[sheet_stock[name]].name} · ${words}${Object.keys(cnt).length > 8 ? ', …' : ''}`;
        }
        step('backs', 0.9);
        if (typeof spec.sheets !== 'function') Object.keys(lay.layout).forEach(name => lay.center_across(name));   /* a game that laid its own sheets placed things where it wants them */
        for (const name of sheets) {
          const has_back = lay.layout[name].items.some(it => it[0] && (lay.parts[it[0] + '-back'] || lay.o.back_of[it[0]]));
          if (has_back) lay.add_backs(name, { what: 'the other faces' });
        }
        step('checks', 0.98);
        times[stage] = Date.now() - st0;
        const FB = stock.tray(F, 'base'), FLD = stock.tray(F, 'lid');
        const part_stock = Object.fromEntries(Object.keys(lay.parts).map(pid => [pid, stock_of[pid]]));
        for (const pid of Object.keys(part_stock)) if (!part_stock[pid]) throw new Error(`${pid}: no stock recorded`);
        const meta = {
          game: spec.name, T: F.T, T_LO: F.T_LO, stocks: Object.fromEntries(stock_keys.map(k => [k, { name: F.stocks[k].name, mat: F.stocks[k].mat, t: F.stocks[k].t, tlo: F.stocks[k].tlo, kerf: F.stocks[k].kerf, params: { lo: `${k}lo`, hi: `${k}hi`, kerf: `kerf_${k}` } }])),
          part_stock, part_kind, part_name, part_key, bases, standee_of, trays, leaf_slots: lay.meta.leaf_slots || {}, box_stock: box.stock, neck_stock: box.neck || box.stock,
          INNER: F.INNER, INNER_BASE: FB.INNER, INNER_LID: FLD.INNER, OUT_BASE: FB.OUT, OUT_LID: FLD.OUT, BASE_EASE: F.BASE_EASE, LID_EASE: F.LID_EASE, WALL_H: F.WALL_H, FLOOR_UP: F.FLOOR_UP, GAP: F.GAP, NECK_H: F.NECK_H, NECK_CL: F.NECK_CL, NECK_OUT: F.NECK_OUT, TABS: F.TABS,
          INNER_X: F.INNER_X, INNER_Y: F.INNER_Y, OUT_X: F.OUT_X, OUT_Y: F.OUT_Y, FLOOR: F.FLOOR, TABS_X: F.TABS_X, TABS_Y: F.TABS_Y, N_BANDS: F.N_BANDS, NECK_BANDS: F.NECK_BANDS, NECK_OUT_X: F.NECK_OUT_X, NECK_OUT_Y: F.NECK_OUT_Y, NECK_ON: F.NECK_ON, LID_HINGE: F.LID_HINGE,   /* the rectangle; a square box has INNER_X = INNER_Y = INNER */
          fits: { WALL_T: F.WALL_T, FLOOR_TAB: F.FLOOR_TAB, FLOOR_SPAN: F.FLOOR_SPAN, SLOT_W: F.SLOT_W, WALL_SLOT_H: F.WALL_SLOT_H, SLOT_Y0: F.SLOT_Y0, NECK_T: F.NECK_T, NECK_FINGER: F.NECK_FINGER, BAND_NOTCH: F.BAND_NOTCH, JIG_CL: F.JIG_CL, stock_hi: Object.fromEntries(stock_keys.map(k => [k, F.stocks[k].t])), stock_lo: Object.fromEntries(stock_keys.map(k => [k, F.stocks[k].tlo])) },
          kerfs: Object.fromEntries(stock_keys.map(k => [k, F.stocks[k].kerf])), sheet_stock: Object.assign({}, sheet_stock, Object.fromEntries(Object.entries(coupon_sheets).map(([n, c]) => [n, c.stock]))), coupon_sheets, sheet0_legend: legend, sheet0_size: lay.meta.sheet0_size, clamp_spots: { legs: lay.o.corner_keepout, sheet_h: SHEET_H },
          margin_x: lay.o.margin_x, margin_top: TOP, margin_bottom: lay.o.margin_bottom,   /* the layout's margins, for the lint (lasergeom writes sheet_w and sheet_h) */
          generate_ms: Date.now() - t0, stage_ms: times, cache: Object.assign({}, K.memo_stats),
        };
        return { need: need(), meta };
      },
    };
    return GAME;
  }
  return { make_game, make_tray, normalize, KINDS, SHEET_W, SHEET_H };
});
