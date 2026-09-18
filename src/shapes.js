/* boardgame-create engine: geometry the games draw with. Tiles, tokens, cards, bases, keyed standee tabs, leaf-spring slots, + holes and
   cross-laps, the engraving hygiene pass, lettering, seeded random, and the memo cache that keeps thickness-independent art across rebuilds.
   Everything is lasergeom geometry in mm, SVG y down. Node (module.exports) or browser (BGEngine.shapes, needs the lasergeom global). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../lib/lasergeom.js'), require('./stock.js'));
  else (root.BGEngine = root.BGEngine || {}).shapes = factory(root.lasergeom, root.BGEngine.stock);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (lg, stock) {
  'use strict';
  const { Polygon, Point, LineString, box: sbox, unary_union, affinity, EMPTY, polys, hexagon, C, rrect, rounded, outline, text_min_stroke, twidth, centered } = lg;
  const D = stock.DESIGN, RAD = Math.PI / 180;

  // ------------------------------------------------------------------ fonts: Fredoka (OFL), three weights, registered from bytes by the caller
  const FONT = Object.freeze({ R: 'fredoka-medium', SB: 'fredoka-semibold', B: 'fredoka-bold' });
  const FONT_FILES = Object.freeze({ [FONT.R]: 'Fredoka-Medium.ttf', [FONT.SB]: 'Fredoka-SemiBold.ttf', [FONT.B]: 'Fredoka-Bold.ttf' });
  /** bytes = { 'Fredoka-Medium.ttf': Buffer | ArrayBuffer | base64, ... } */
  function register_fonts(bytes) {
    for (const [name, file] of Object.entries(FONT_FILES)) {
      if (!bytes[file]) throw new Error('missing font ' + file);
      if (!lg.has_font(name)) lg.register_font(name, bytes[file], { default: name === FONT.R });
    }
  }

  // ------------------------------------------------------------------ memo: art does not depend on stock thickness, so it is made once per process, and kept on disk with a store
  const CACHE = new Map(), memo_stats = { hits: 0, misses: 0, disk: 0 };
  let STORE = null;
  function set_store(store) { STORE = store; }
  const encode = v => {
    if (v === null || typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') return v;
    if (v instanceof lg.Geom) { const j = lg.geom_to_json(v); return j ? { $g: j } : undefined; }
    if (Array.isArray(v)) { const out = v.map(encode); return out.includes(undefined) ? undefined : out; }
    if (typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) { const out = {}; for (const [k, x] of Object.entries(v)) { const e = encode(x); if (e === undefined) return undefined; out[k] = e; } return out; }
    return undefined;
  };
  const decode = j => {
    if (j === null || typeof j !== 'object') return j;
    if (Array.isArray(j)) return j.map(decode);
    if (j.$g) return lg.geom_from_json(j.$g);
    return Object.fromEntries(Object.entries(j).map(([k, x]) => [k, decode(x)]));
  };
  function memo(key, fn) {
    if (CACHE.has(key)) { memo_stats.hits++; return CACHE.get(key); }
    if (STORE) { const hit = STORE.get('M|' + key); if (hit !== undefined) { const v = decode(hit); CACHE.set(key, v); memo_stats.disk++; return v; } }
    memo_stats.misses++;
    const t0 = Date.now(), v = fn(); CACHE.set(key, v);
    if (STORE && Date.now() - t0 >= 200) { const j = encode(v); if (j !== undefined) STORE.set('M|' + key, j); }
    return v;
  }
  const warnings = [];
  const warn = msg => { warnings.push(msg); };

  // ------------------------------------------------------------------ small helpers
  const range = (a, b, s = 1) => { if (b === undefined) { b = a; a = 0; } const out = []; for (let i = a; s > 0 ? i < b : i > b; i += s) out.push(i); return out; };
  const dist = (p, q) => Math.hypot(q[0] - p[0], q[1] - p[1]);
  const pymod = (a, b) => ((a % b) + b) % b;
  /** a seeded random (mulberry32): random(), uniform(a, b), int(n), choice(list), shuffle(list) */
  function rng(seed) {
    let s = (seed * 2654435761 + 12345) >>> 0 || 1;
    const random = () => { s += 0x6D2B79F5; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    return { random, uniform: (a, b) => a + (b - a) * random(), int: n => Math.floor(random() * n), choice: l => l[Math.floor(random() * l.length)],
      shuffle: l => { const a = l.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; } };
  }

  // ------------------------------------------------------------------ flat pieces
  /** a hexagonal tile `af` across flats (pointy-top), corners rounded */
  const hex_tile = (af, r = 1.5, rot = 0) => memo(`shapes:hex_tile:${af}:${r}:${rot}`, () => rounded(hexagon(0, 0, af, rot), r));
  /** a round token of diameter d (24 or more segments so it reads as a circle at 16 mm) */
  const disc = (d, q = 32) => C(0, 0, d / 2, q);
  /** a square tile `s` on a side, corners rounded */
  const square_tile = (s, r = 2.0) => rrect(-s / 2, -s / 2, s / 2, s / 2, r);
  /** a card w x h with 4 mm corners, its origin at the top-left corner (the art frame the games draw in) */
  const card = (w, h, r = 4.0) => rrect(0, 0, w, h, r);
  /** a rectangle w x h centred on the origin, corners rounded */
  const plate = (w, h, r = 2.0) => rrect(-w / 2, -h / 2, w / 2, h / 2, r);
  /** the standee base outlines a game may use: circle, hex, square, log (a rounded bar), oct, scallop; d is the size across */
  function base_shape(kind, d = 18.0) {
    const r = d / 2;
    if (kind === 'circle') return C(0, 0, r, 24);
    if (kind === 'hex') return hexagon(0, 0, d * 0.8875, 0);
    if (kind === 'square') { const h = d * 0.44; return rrect(-h, -h, h, h, 4.0); }
    if (kind === 'log') return rrect(-r, -r * 0.42, r, r * 0.42, r * 0.42 - 0.05);
    if (kind === 'oct') return Polygon(range(8).map(k => [r * Math.cos((22.5 + 45 * k) * RAD), r * Math.sin((22.5 + 45 * k) * RAD)]));
    if (kind === 'scallop') return unary_union([C(0, 0, r * 0.84, 24)].concat(range(12).map(k => C(r * 0.83 * Math.cos(30 * k * RAD), r * 0.83 * Math.sin(30 * k * RAD), r * 0.17, 8))));
    throw new Error(`unknown base shape ${kind} (circle, hex, square, log, oct, scallop)`);
  }

  // ------------------------------------------------------------------ standing pieces
  /** lasergeom's spring tab with the design slit and ramp: [tab, slit] */
  function spring_tab(width, depth, slit_up, slit_w = null) {
    return lg.spring_tab(width, depth, slit_up, { slit_w: slit_w === null ? D.SPRING_SLIT : slit_w, ramp: D.SPRING_RAMP });
  }
  /** a standee's cut outline: the silhouette `fig` (drawn with its base line on y = 0, the figure above it in negative y) plus the 10 mm tab
   *  going `depth` below the base line; `key` (mm from the tab's left edge) cuts the gap only that key's bridge clears */
  function standee_shape(fig, depth, key = null) {
    const [tab] = spring_tab(D.STANDEE_TAB, depth, 2.5);
    const b = fig.bounds;
    if (b[3] > 0.6) throw new Error(`a standee silhouette stands on y = 0 and reaches above it; this one reaches ${b[3].toFixed(2)} below`);
    if (!(b[0] < -D.STANDEE_TAB / 2 - 1.0 && b[2] > D.STANDEE_TAB / 2 + 1.0)) throw new Error(`a standee silhouette must span its 10 mm tab with at least 1 mm to spare each side (got ${b[0].toFixed(1)} to ${b[2].toFixed(1)})`);
    let whole = unary_union([fig, tab]).buffer(0.001).buffer(-0.001);
    whole = polys(whole).sort((p, q) => q.area - p.area)[0];
    if (key === null) return whole;
    if (!(key >= 1.0 && key <= D.STANDEE_TAB - D.KEY_GAP - 1.0)) throw new Error(`a key sits 1 to ${(D.STANDEE_TAB - D.KEY_GAP - 1).toFixed(1)} mm from the tab's left edge, got ${key}`);
    const x = -D.STANDEE_TAB / 2 + key;
    return whole.difference(sbox(x, -D.KEY_HEADROOM, x + D.KEY_GAP, depth + 1));
  }
  /** a round-topped bump of material standing out of a straight face (kept for + hole ribs; production uses none) */
  function bump(face, across, dir, w, h, along_x = true) {
    const r = w / 2, back = face - dir * 0.01, at = (u, v) => along_x ? [u, v] : [v, u];
    const bx = (u0, u1, v0, v1) => { const [a, b] = at(Math.min(u0, u1), v0), [c, d] = at(Math.max(u0, u1), v1); return sbox(Math.min(a, c), Math.min(b, d), Math.max(a, c), Math.max(b, d)); };
    if (h >= r) { const tip = face + dir * (h - r), [cx, cy] = at(tip, across); return unary_union([bx(back, tip, across - r, across + r), C(cx, cy, r, 8)]); }
    const Rr = (r * r + h * h) / (2 * h), cc = face + dir * (h - Rr), [cx, cy] = at(cc, across);
    return C(cx, cy, Rr, 16).intersection(bx(back, face + dir * (h + 1), across - Rr - 1, across + Rr + 1));
  }
  /** the + hole for a cross-lapped pair standing in a tile: bars `bar` long and `width` wide, centred at (cx, cy) */
  function plus_hole(cx, cy, bar, width) {
    return unary_union([sbox(cx - bar / 2, cy - width / 2, cx + bar / 2, cy + width / 2), sbox(cx - width / 2, cy - bar / 2, cx + width / 2, cy + bar / 2)]);
  }
  /** halve a silhouette H tall for a cross-lapped pair: from_top slots down to half height, else up from `below` past the base line; each slot runs `over` past the halving line */
  function crosslap(sil, H, from_top, width, over, below, name = 'a cross-lapped pair') {
    const slot = from_top ? sbox(-width / 2, -H - 5, width / 2, -H / 2 + over) : sbox(-width / 2, -H / 2 - over, width / 2, below);
    /* the slot's run through the wood, measured along each of its two walls (0.2 mm outside the slot, where the wood that bears actually is: a spring slit
       up the centre line does not count against it): from the silhouette's own edge to the halving line for the top slot, from the halving line down
       through the tab for the bottom one (the slot is cut through the tab and bears on the other half's tab there). The shorter wall is at least XLAP_MIN_SLOT */
    const y0 = from_top ? -H - 5 : -H / 2 - over, y1 = from_top ? -H / 2 + over : below + 5, wall = x => { const r = sil.intersection(sbox(x - 0.05, y0, x + 0.05, y1)); return r.is_empty ? 0 : r.bounds[3] - r.bounds[1]; };
    const len = Math.min(wall(-width / 2 - 0.2), wall(width / 2 + 0.2));
    if (len < D.XLAP_MIN_SLOT - 1e-6) throw new Error(`${name}: its ${from_top ? 'top' : 'bottom'} slot runs ${len.toFixed(1)} mm through the wood along its wall; a cross-lap slot is ${D.XLAP_MIN_SLOT} mm at least (a taller silhouette, or more of it beside the centre line)`);
    return sil.difference(slot);
  }
  /** the band an engraving keeps clear of a standing pair's centre line (the crossing half hides it) */
  const centre_band = half => sbox(-half, -400, half, 10);

  /** the leaf-spring slot in a base: the production centreline construction (owner's cut sweep, 8 mm span, 9.50 finished slot), with an optional
   *  key bridge. Returns { lines (open single-pass cuts), removed (the waste and beam), opening, ... }; the base's solid is whole minus removed. */
  function leaf_site(length, width, kerf, cross, key = null, cx = 0, cy = 0) {
    if (![length, width, kerf].every(Number.isFinite) || !(kerf > 0 && width > kerf && length > width)) throw new Error('leaf_site needs a length, ply clearance width and positive kerf');
    const hl = (length - kerf) / 2, hw = (width - kerf) / 2, hs = D.LEAF_SPAN / 2, out = hl + D.LEAF_GAP;
    if (!(hs > hw && D.LEAF_GAP > kerf)) throw new Error('leaf span or gap cannot clear the ply and kerf');
    const lines = [], H = (x0, y, x1) => LineString([[cx + x0, cy + y], [cx + x1, cy + y]]), V = (x, y0, y1) => LineString([[cx + x, cy + y0], [cx + x, cy + y1]]);
    let opening;
    if (cross) {
      if (key !== null) throw new Error('cross slots cannot have keys');
      if (hl - hs < D.LEAF_MIN_CORNER_WEB) throw new Error('leaf corner web is below the cut-validated 0.60 mm minimum');
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) { lines.push(H(sx * hw, sy * hw, sx * hl), V(sx * hw, sy * hw, sy * hl)); }
      opening = unary_union([sbox(-length / 2, -width / 2, length / 2, width / 2), sbox(-width / 2, -length / 2, width / 2, length / 2)]);
    } else {
      opening = sbox(-length / 2, -width / 2, length / 2, width / 2);
      if (key === null) for (const sy of [-1, 1]) lines.push(H(-hl, sy * hw, hl));
      else {
        const left = -D.STANDEE_TAB / 2 + key + (D.KEY_GAP - D.KEY_BRIDGE) / 2, right = left + D.KEY_BRIDGE, a = left - kerf / 2, b = right + kerf / 2;
        for (const sy of [-1, 1]) lines.push(H(-hl, sy * hw, a), H(b, sy * hw, hl));
        lines.push(V(a, -hw, hw), V(b, -hw, hw));
        opening = opening.difference(sbox(left, -width, right, width));
      }
    }
    for (const sign of [-1, 1]) {
      lines.push(V(sign * hl, -hs, hs), V(sign * out, -hs, hs));
      if (cross) lines.push(H(-hs, sign * hl, hs), H(-hs, sign * out, hs));
    }
    opening = affinity.translate(opening, cx, cy);
    const cuts = unary_union(lines), beam = cuts.buffer(kerf / 2);
    const slugs = lg.polygonize(cuts);
    if (slugs.length !== (key === null ? 1 : 2)) throw new Error('leaf cut network does not release exactly the intended slot waste');
    const removed = unary_union(slugs).union(beam);
    return { lines, cuts, removed, opening, length, width, kerf, cross, key, web: cross ? hl - hs : null, out, cx, cy };
  }
  /** a base outline must leave 3 mm of wood beyond each slot end and 1.5 mm of chord for each leaf's anchors */
  function leaf_base_check(whole, site) {
    const { cx, cy, out, kerf, length } = site;
    const axis = whole.intersection(LineString([[cx - 200, cy], [cx + 200, cy]])).bounds;
    const endWood = Math.min(cx - length / 2 - axis[0], axis[2] - cx - length / 2);
    if (endWood < D.BASE_END_WOOD - 1e-6) throw new Error(`base leaves ${endWood.toFixed(2)} mm behind the slot end: 3 mm is the minimum (a wider base, or a shorter slot direction)`);
    let anchor = Infinity;
    for (const sign of [-1, 1]) {
      const chord = whole.intersection(LineString([[cx + sign * (out + kerf / 2), cy - 200], [cx + sign * (out + kerf / 2), cy + 200]])).bounds;
      anchor = Math.min(anchor, cy - D.LEAF_SPAN / 2 - kerf / 2 - chord[1], chord[3] - cy - D.LEAF_SPAN / 2 - kerf / 2);
    }
    if (anchor < D.LEAF_ANCHOR) throw new Error(`base leaf has ${anchor.toFixed(2)} mm of chord for its anchors: 1.5 mm is the minimum (a taller base)`);
    return { end_wood: endWood, chord_anchor: anchor };
  }
  /** register the leaf cuts of a plate already added to the layout: open polylines on the cut layer, and the finished solid in meta.leaf_slots */
  function leaf_part(lay, pid, whole, site) {
    if (!(pid in lay.parts)) throw new Error(pid + ': register the plate before its leaf cuts');
    const solid = whole.difference(site.removed);
    if (solid.geom_type !== 'Polygon' || !solid.is_valid) throw new Error(pid + ': leaf cuts disconnect the plate');
    const raw = site.lines.map(c => '<polyline points="' + c.coords.map(p => p.map(n => +n.toFixed(4)).join(',')).join(' ') + '" ' + lg.CUT + '/>').join('');
    lay.holes_svg[pid] = '<g class="leaf-cuts">' + raw + '</g>';
    lay.parts[pid] = lay.engr[pid] + lay.holes_svg[pid] + lay.outer_svg[pid];
    if (!lay.meta.leaf_slots) lay.meta.leaf_slots = {};
    lay.meta.leaf_slots[pid] = { length: site.length, width: site.width, span: D.LEAF_SPAN, gap: D.LEAF_GAP, leaf: D.LEAF_GAP - site.kerf,
      web: site.web, split: site.key, kerf: site.kerf, lines: site.lines.map(l => l.coords), model_svg: lg.cut_svg(solid) };
  }

  // ------------------------------------------------------------------ engraving helpers
  /** lettering as engraving with its strokes held at the laser's minimum: the everyday text call */
  const ink = (s, size, x, y, o = {}) => text_min_stroke(s, size, x, y, { anchor: o.anchor || 'middle', font: o.font || FONT.SB, spacing: o.spacing || 0, min_line: 0.45 });
  /** the biggest size at or under `size` at which `s` fits `width` */
  const fit_text = (s, size, font, width, spacing = 0) => lg.fit_size(s, size, font || FONT.SB, width, spacing);
  /** parallel hatch lines over a region: pitch, line width, angle (degrees) */
  function hatch(region, pitch = 1.3, w = 0.5, ang = 45.0) {
    const [x0, y0, x1, y1] = region.bounds, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, R = Math.hypot(x1 - x0, y1 - y0) / 2 + pitch;
    const lines = [];
    for (let d = -R; d <= R; d += pitch) lines.push(LineString([[cx - R, cy + d], [cx + R, cy + d]]));
    return affinity.rotate(unary_union(lines).buffer(w / 2, { cap_style: 'flat' }), ang, [cx, cy]).intersection(region);
  }
  /** a field of dots over a region: pitch, dot diameter, staggered rows */
  function stipple(region, pitch = 1.6, d = 0.7) {
    const [x0, y0, x1, y1] = region.bounds, dots = [];
    for (let j = 0, y = y0; y <= y1; y += pitch * 0.866, j++) for (let x = x0 + (j % 2 ? pitch / 2 : 0); x <= x1; x += pitch) dots.push(C(x, y, d / 2, 8));
    return unary_union(dots).intersection(region);
  }
  /** the production hygiene pass on a panel's art: clip 0.8 mm inside its cut edge, open slivers under 0.45, drop specks */
  function finish(art, shape, inset = 0.8) {
    return lg.finish_engraving(art, { shape, min_line: 0.45, inset, min_area: 0.12, min_len: 0.5 });
  }
  /** a back face's art, mirrored into the back's frame */
  const back_art = lg.back_art;
  const mirror = g => lg.mirror(g, 0.0);
  /** subtract a keepout from art, touching only the pieces near it (the same object comes back when nothing is removed) */
  function clip_out(art, keepout, min_area = 0.12, min_len = 0.5) {
    if (!art || !keepout) throw new Error('clip_out needs an engraving and a keepout geometry');
    if (art.is_empty || keepout.is_empty) return art;
    const kb = keepout.bounds, ps = polys(art), near = [], far = [];
    for (const p of ps) { const b = p.bounds; (b[2] < kb[0] || b[0] > kb[2] || b[3] < kb[1] || b[1] > kb[3]) ? far.push(p) : near.push(p); }
    if (!near.length) return art;
    const hit = near.filter(p => p.intersects(keepout));
    if (!hit.length) return art;
    const cut = unary_union(hit).difference(keepout);
    return lg.drop_specks(unary_union(far.concat(near.filter(p => !hit.includes(p)), polys(cut))), min_area, min_len);
  }
  /** an arrow from a to b: a shaft w wide with a head */
  function arrow(a, b, w = 0.9, head = 2.4) {
    const ux = b[0] - a[0], uy = b[1] - a[1], l = Math.hypot(ux, uy) || 1, dx = ux / l, dy = uy / l;
    const tip = b, base = [b[0] - dx * head, b[1] - dy * head];
    const shaft = LineString([a, base]).buffer(w / 2, { cap_style: 'flat' });
    const tri = Polygon([tip, [base[0] - dy * head * 0.55, base[1] + dx * head * 0.55], [base[0] + dy * head * 0.55, base[1] - dx * head * 0.55]]);
    return unary_union([shaft, tri]);
  }
  /** a hexagonal grid's centre for axial (q, r), pointy-top hexes `af` across flats (pitch = af + gap) */
  const hex_xy = (q, r, pitch) => [pitch * (q + r / 2), pitch * Math.sqrt(3) / 2 * r];
  /** the six corners of a pointy-top hex at (x, y), af across flats, from the top going clockwise */
  const hex_corners = (x, y, af) => range(6).map(i => { const a = (-90 + 60 * i) * RAD, R = af / Math.sqrt(3); return [x + R * Math.cos(a), y + R * Math.sin(a)]; });

  return {
    lg, FONT, FONT_FILES, register_fonts, memo, memo_stats, set_store, warnings, warn, range, dist, pymod, rng, RAD,
    hex_tile, disc, square_tile, card, plate, base_shape, spring_tab, standee_shape, bump, plus_hole, crosslap, centre_band,
    leaf_site, leaf_base_check, leaf_part, ink, fit_text, hatch, stipple, finish, back_art, mirror, clip_out, arrow, hex_xy, hex_corners,
    Polygon, Point, LineString, sbox, unary_union, affinity, EMPTY, polys, hexagon, C, rrect, rounded, outline, twidth, centered, DESIGN: D,
  };
});
