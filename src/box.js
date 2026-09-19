/* boardgame-create engine: the shoulder box. Two trays cut from one INNER frame (the lid 0.50 mm a side roomier than the base's 0.10), floors
   with finger tabs on every edge, walls with three-band finger corners and thumb notches, a symmetric neck of four boards, and the panel art:
   the lid top (frame, medallion holding the game's cover art, title ribbon, choking warning), the lid inside (the rules panel typeset from
   rules.js), the base underside (medallion, product code) and the base inside (the setup map). The shapes come from BUMBLE & BLOOM, validated on
   cut wood. Node (module.exports) or browser (BGEngine.box). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./shapes.js'), require('./stock.js'));
  else (root.BGEngine = root.BGEngine || {}).box = factory(root.BGEngine.shapes, root.BGEngine.stock);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (K, stock) {
  'use strict';
  const lg = K.lg;
  const { Polygon, Point, LineString, sbox, unary_union, affinity, EMPTY, polys, hexagon, C, rrect, outline, twidth, centered, memo, range, FONT, ink } = K;
  const RAD = Math.PI / 180;

  // ------------------------------------------------------------------ shapes (all in a tray's own frame: the drawn inside corner at the origin, y down on the sheet)
  /** the floor plate: it reaches FLOOR_EDGE past the drawn inside on every edge; each tab runs from the plate's edge out to the tray's outside plane */
  function floor_shape(F) {
    const t = F.FLOOR_TAB, e = F.FLOOR_EDGE, tw = F.TAB_W, lo = -F.EASE, hx = F.INNER0_X + F.EASE, hy = F.INNER0_Y + F.EASE, g = [sbox(lo - e, lo - e, hx + e, hy + e)];   /* INNER0: the drawn frame; the tray's ease is added once on each side */
    for (const c of F.TABS_X) g.push(sbox(c - tw / 2, lo - t, c + tw / 2, lo - e), sbox(c - tw / 2, hy + e, c + tw / 2, hy + t));   /* the S and N edges */
    for (const c of F.TABS_Y) g.push(sbox(lo - t, c - tw / 2, lo - e, c + tw / 2), sbox(hx + e, c - tw / 2, hx + t, c + tw / 2));   /* the W and E edges */
    return unary_union(g);
  }
  /** a wall kind's span: 'A' walls (S and N) run along x, 'B' walls (E and W) along y */
  const out_of = (kind, F) => kind === 'A' ? F.OUT_X : F.OUT_Y, tabs_of = (kind, F) => kind === 'A' ? F.TABS_X : F.TABS_Y, neck_out_of = (kind, F) => kind === 'A' ? F.NECK_OUT_X : F.NECK_OUT_Y;
  const notched_band = (a, b, H, notch) => [a > 1e-9 ? a + notch : a, b < H - 1e-9 ? b - notch : b];
  const NOTCH_R = 9.0, NOTCH_DEPTH = 6.0, NOTCH_FILLET = 1.0;   // thumb notch in the open rim of the E and W walls, to push the trays apart
  function thumb_notch(rim_y, into, F, O = F.OUT_Y) {
    const x = O / 2, off = NOTCH_R - NOTCH_DEPTH, f = NOTCH_FILLET;
    const cut = [Point(x, rim_y - into * off).buffer(NOTCH_R, { quad_segs: 64 })];
    const fx = Math.sqrt((NOTCH_R + f) ** 2 - (off + f) ** 2), chord = Math.sqrt(NOTCH_R ** 2 - off ** 2), ty = NOTCH_R / (NOTCH_R + f) * (off + f) - off;
    for (const sg of [-1, 1]) {
      const ab = [rim_y - into * 0.1, rim_y + into * (ty + 0.05)].sort((p, q) => p - q);
      const cusp = sbox(Math.min(x + sg * (chord - 0.5), x + sg * fx), ab[0], Math.max(x + sg * (chord - 0.5), x + sg * fx), ab[1]);
      cut.push(cusp.difference(Point(x + sg * fx, rim_y + into * f).buffer(f, { quad_segs: 32 })));
    }
    return unary_union(cut);
  }
  /** a wall's slot centres: the floor tabs sit at TABS in the frame, which a tray's ease moves in from the wall's end */
  const slot_x = (F, kind = 'A') => tabs_of(kind, F).map(c => F.WALL_T + F.EASE + c);
  /** the floor tabs' openings in a wall: slots through it (a raised floor), or notches open at the bottom edge (a flush floor, whose tabs come in from below) */
  const slot_boxes = (y0, F, kind = 'A') => { const open = F.FLOOR === 'flush', far = y0 > 1e-9;   /* a flush floor's notch opens through the edge it sits on */
    return unary_union(slot_x(F, kind).map(x => sbox(x - F.SLOT_W / 2, y0 - (open && !far ? 1 : 0), x + F.SLOT_W / 2, y0 + F.WALL_SLOT_H + (open && far ? 1 : 0)))); };
  /** a wall: kind 'A' (S and N) owns the outer finger bands (or, with two bands, the rim band), 'B' (E and W) the middle (or bottom) band and the
      thumb notch; rim_top: the rim at y = 0 */
  function wall_shape(kind, rim_top, F) {
    const t = F.WALL_T, O = out_of(kind, F), H = F.WALL_H, BAND = F.BAND, r = kind === 'B' ? F.CORE_RELIEF : 0;
    const three = F.N_BANDS === 3;
    const mid = three ? [BAND, 2 * BAND] : (rim_top ? [BAND, 2 * BAND] : [0, BAND]);   /* B's band: the middle one, or the one away from the rim */
    const core = r > 0 ? unary_union([sbox(t, mid[0], O - t, mid[1]), sbox(t + r, 0, O - t - r, H)]) : sbox(t, 0, O - t, H);
    const owned = kind === 'A' ? (three ? [[0, BAND], [2 * BAND, 3 * BAND]] : [rim_top ? [0, BAND] : [BAND, 2 * BAND]]) : [mid];
    const bandInset = kind === 'B' ? -F.BAND_NOTCH : F.BAND_NOTCH;   // B fills A's notched opening across the complete finger end
    let g = unary_union([core].concat(owned.map(([a, b]) => { const [p, q] = notched_band(a, b, H, bandInset); return sbox(0, p, O, q); })));
    const y0 = rim_top ? F.SLOT_Y0 : H - F.SLOT_Y0 - F.WALL_SLOT_H;
    g = g.difference(slot_boxes(y0, F, kind));
    if (kind === 'B') {
      const cut = rim_top ? thumb_notch(0.0, 1, F, O) : thumb_notch(H, -1, F, O);
      if (cut.distance(slot_boxes(y0, F, kind)) < 3.0 || !sbox(BAND, -1, O - BAND, H + 1).contains(cut.intersection(sbox(0, 0, O, H)))) throw new Error('thumb notch runs into a slot or finger band');
      g = g.difference(cut);
    }
    return g;
  }
  /** a neck board: symmetric end for end, five finger bands; the middle band's fingers stop behind the mating board's face */
  function neck_shape(kind, F) {
    const t = F.NECK_T, H = F.NECK_H, NB = F.NECK_BAND, NO = neck_out_of(kind, F), s = t - F.NECK_FINGER, n = F.NECK_BANDS, midb = (n - 1) / 2;
    if (!(s >= 0)) throw new Error(`neck fingers ${F.NECK_FINGER} mm long are longer than the neck body's ${t} mm recess`);
    // the bands at each end (grip bands) reach NECK_CL past the body on both ends, to the tray's real inside at the thickest reading;
    // the middle band, the one that shows in the shadow line, keeps its fingers s short of the board end
    const out = [sbox(t, 0, NO - t, H)];
    for (let b = 0; b < n; b++) { if ((b % 2 === 0) !== (kind === 'A')) continue;
      const y1 = H - b * NB, y0 = y1 - NB, [p, q] = notched_band(y0, y1, H, F.BAND_NOTCH), reach = b === midb ? -s : F.NECK_CL;
      out.push(sbox(-reach, p, NO + reach, q));
    }
    return unary_union(out);
  }

  // ------------------------------------------------------------------ panel art helpers
  const ELEMENT_GAP = 1.5;
  function rosette(x, y, R) {
    const ring = C(x, y, R, 40).difference(C(x, y, R - 0.8, 40));
    const room = R - 0.8 - 0.8, pr = 0.38 * room, pd = room - pr;
    const petals = unary_union(range(5).map(i => (-90 + 72 * i) * RAD).map(a => C(x + pd * Math.cos(a), y + pd * Math.sin(a), pr, 20)));
    return [unary_union([ring, petals.difference(C(x, y, 1.05, 20)), C(x, y, 0.5, 16)]), C(x, y, R + 0.3, 40)];
  }
  /** double-rule ribbon plaque with swallowtail ends and folds: [art, silhouette, inner rule rectangle] */
  function ribbon_banner(cx, y0, y1, half_w, k = 1.0) {
    const h = y1 - y0, tail_in = h * 0.2, tail_len = h * 0.5, notch = h * 0.25;
    const ban = rrect(cx - half_w, y0, cx + half_w, y1, 3 * k), inset = 2.0 * k;
    const inner = rrect(cx - half_w + inset, y0 + inset, cx + half_w - inset, y1 - inset, Math.max(0.8, 2 * k));
    const g = [outline(ban, 1.0 * k), outline(inner, 0.55)], sil = [ban];
    for (const s of [-1, 1]) {
      const e = cx + s * half_w;
      const tail = Polygon([[e, y0 + tail_in], [e + s * tail_len, y0 + tail_in], [e + s * (tail_len - notch), (y0 + y1) / 2], [e + s * tail_len, y1 - tail_in], [e, y1 - tail_in]]);
      g.push(outline(tail, 0.8).difference(ban.buffer(-0.3)));
      g.push(Polygon([[e, y1 - tail_in], [e + s * tail_len * 0.5, y1 - tail_in], [e, y1]]));
      sil.push(tail);
    }
    return [unary_union(g), unary_union(sil), inner];
  }
  const WARN_CLEAR = 2.5, CAP = 0.6989;   // clear space round the warning (16 CFR 1500.121); Fredoka's capital height per unit of font size
  function safety_alert(x, baseline, h) {
    const w = h * 1.155, tri = Polygon([[x, baseline - h], [x + w / 2, baseline], [x - w / 2, baseline]]).buffer(-0.35).buffer(0.35);
    const ring = tri.difference(tri.buffer(-0.7));
    const inner_top = h - 1.4, bar_top = inner_top - (0.9 + 1.2) / 1.155;
    const mark = unary_union([rrect(x - 0.45, baseline - bar_top, x + 0.45, baseline - 3.1, 0.45), C(x, baseline - 1.95, 0.5, 16)]);
    return unary_union([ring, mark]);
  }
  const WARNING = ['WARNING: CHOKING HAZARD', 'Small parts. Not for children under 3 years.'];
  /** 16 CFR 1500.19(b)(1): the safety alert symbol, then the warning. Returns [engraving, its bounding box]. */
  function choking_warning(cx, baseline2) {
    const s1 = 4.3 / CAP, s2 = 3.6 / CAP, [l1, l2] = WARNING, y1 = baseline2 - 3.6 - 3.2, sym_h = 7.5, gap = 1.6;
    const w1 = twidth(l1, s1, FONT.B, 0.75), x0 = cx - (sym_h * 1.155 + gap + w1) / 2;
    const art = unary_union([safety_alert(x0 + sym_h * 1.155 / 2, y1 + 1.0, sym_h), ink(l1, s1, x0 + sym_h * 1.155 + gap, y1, { anchor: 'start', font: FONT.B, spacing: 0.75 }), ink(l2, s2, cx, baseline2, { font: FONT.R, spacing: 0.55 })]);
    const b = art.bounds; return [art, sbox(b[0], b[1], b[2], b[3])];
  }
  /** the medallion outline of the chosen kind, r = half the size across flats */
  const medallion = (kind, cx, cy, r) => kind === 'hex' ? hexagon(cx, cy, 2 * r, 30) : kind === 'square' ? rrect(cx - r, cy - r, cx + r, cy + r, 6) : C(cx, cy, r, 72);

  // ------------------------------------------------------------------ the lid top: frame, medallion, cover art, ribbon, warning
  /** spec: { title, cover(cx, cy, r, room) -> art, medal: 'circle'|'hex'|'square', corner(x, y, s, qx, qy) -> art | null, ribbon: true } */
  function lid_outer_art(spec, INNER, INNER_Y = INNER) {
    return memo(`box:lid_outer:${INNER}x${INNER_Y}:${spec.title}:${spec.medal || 'circle'}:${spec.art_key || ''}`, () => {
      const W = INNER, L = INNER_Y, cx = W / 2, g = [];
      /* a game may draw the whole lid top itself (TUMBLER's cover scene); it must carry the choking warning (C6) */
      if (typeof spec.lid_top === 'function') { const a = spec.lid_top(W, L); if (!a || a.is_empty) throw new Error('box.lid_top drew nothing'); if (!sbox(1, 1, W - 1, L - 1).contains(a)) throw new Error('box.lid_top leaves the lid'); return a; }
      const FR0 = 9.0, FR1 = 12.0, RC = 10.5, ros = [];
      for (const x of [RC, W - RC]) for (const y of [RC, L - RC]) ros.push(rosette(x, y, 5.2));
      const ros_sil = unary_union(ros.map(r => r[1]));
      const rules = unary_union([outline(sbox(FR0, FR0, W - FR0, L - FR0), 1.0), outline(sbox(FR1, FR1, W - FR1, L - FR1), 0.55)]);
      const frame = [rules.difference(ros_sil.buffer(-0.35))].concat(ros.map(r => r[0]));
      const RIB_H = 19.0, RIB_GAP = 5.5, warn_h = 12.0;
      const avail = (L - FR1 - 3.4 - warn_h - WARN_CLEAR) - (FR1 + 3.0);   // vertical room between the frame's top rule and the warning band
      const R = Math.min((W - 2 * FR1 - 8) / 2, (avail - RIB_H - RIB_GAP) / 2) - 1.0;
      const kind = spec.medal || 'circle', MC = [cx, FR1 + 3.0 + R];
      const medal = medallion(kind, MC[0], MC[1], R), inner_edge = medallion(kind, MC[0], MC[1], R - 5.0);
      g.push(unary_union([outline(medal, 1.0), outline(inner_edge, 0.7), K.hatch(medal.difference(inner_edge.buffer(0.9)).difference(medal.buffer(-0.9)), 1.6, 0.5, 45)]));
      const room = inner_edge.buffer(-2.2);
      if (typeof spec.cover !== 'function') throw new Error('box.cover(cx, cy, r, room) must draw the lid medallion\'s art');
      const cover = spec.cover(MC[0], MC[1], R - 7.2, room);
      if (!cover || cover.is_empty) throw new Error('box.cover drew nothing');
      if (!room.buffer(0.3).contains(cover)) throw new Error('box.cover pokes out of the lid medallion: keep the art inside `room`');
      g.push(cover);
      const rib0 = MC[1] + R + RIB_GAP, rib1 = rib0 + RIB_H, half_w = Math.min(68.0, (W - 2 * FR1 - 2 * 14) / 2);
      const [ban_art, ban_sil] = ribbon_banner(cx, rib0, rib1, half_w, 1.0);
      g.push(ban_art);
      const size = K.fit_text(spec.title, 11.5, FONT.B, 2 * half_w - 12, 1.2);
      g.push(ink(spec.title, size, cx, (rib0 + rib1) / 2 + size * 0.36, { font: FONT.B, spacing: 1.2 }));
      const [warn, warn_box] = choking_warning(cx, L - FR1 - 3.4);
      let comp = unary_union(g); const [, top_y, , bot_y] = comp.bounds;
      const shift = (FR1 + warn_box.bounds[1] - WARN_CLEAR) / 2 - (top_y + bot_y) / 2;
      comp = affinity.translate(comp, 0, shift);
      if (comp.intersects(warn_box.buffer(WARN_CLEAR - 0.05))) throw new Error('the choking hazard warning is not separated from the cover art');
      let corners = EMPTY;
      if (typeof spec.corner === 'function') {
        const blocked = unary_union([affinity.translate(medal, 0, shift), affinity.translate(ban_sil, 0, shift), ros_sil, warn_box.buffer(WARN_CLEAR)]).buffer(ELEMENT_GAP);
        const cs = [];
        for (const [qx, qy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const c = spec.corner(cx + qx * (W / 2 - FR1 - 12), MC[1] + shift + qy * (R * 0.9), 1.0, qx, qy); if (c && !c.is_empty && !c.intersects(blocked)) cs.push(c); }
        corners = unary_union(cs);
      }
      return unary_union([K.finish(unary_union(frame.concat([comp, corners])), sbox(1, 1, W - 1, L - 1)), warn]);
    });
  }

  // ------------------------------------------------------------------ the lid inside: the rules panel
  const split_ws = s => s.split(/\s+/).filter(Boolean);
  function wrap(s, size, font, width, sp = 0.0) {
    const lines = []; let cur = '';
    for (const w of split_ws(s)) { const t = (cur + ' ' + w).trim(); if (twidth(t, size, font, sp) <= width || !cur) cur = t; else { lines.push(cur); cur = w; } }
    if (cur) lines.push(cur);
    return lines;
  }
  /** words set in a column from (x, y) downwards: returns [art, bottom y] */
  function words(s, x, y, width, size, lead, font = FONT.SB) {
    const lines = wrap(s, size, font, width - 0.3, 0.08), g = [];
    lines.forEach((line, i) => g.push(ink(line, size, x, y + i * lead, { anchor: 'start', font, spacing: 0.08 })));
    return [g.length ? unary_union(g) : EMPTY, y + lines.length * lead];
  }
  /** spec.lid = { title, intro, columns: [{ heading, text }], footer } typeset in two columns; the game's `figures(x, y, w, h, column)` may add art above each column */
  function lid_inner_art(spec, INNER, INNER_Y = INNER) {
    return memo(`box:lid_inner:${INNER}x${INNER_Y}:${JSON.stringify(spec.lid)}:${spec.art_key || ''}`, () => {
      const W = INNER, L = INNER_Y;
      if (typeof spec.lid_inside === 'function') { const a = spec.lid_inside(W, L); if (!a || a.is_empty) throw new Error('box.lid_inside drew nothing'); if (!sbox(4.5, 4.5, W - 4.5, L - 4.5).contains(a)) throw new Error('box.lid_inside leaves the inner face / neck clearance'); return a; }
      const R = spec.lid; if (!R || !R.title || !Array.isArray(R.columns) || !R.columns.length) throw new Error('rules.js lid: needs title and columns [{ heading, text }]');
      const INSET = 5.0, LINE = 0.85, X0 = 10, X1 = W - 10, g = [outline(rrect(INSET, INSET, W - INSET, L - INSET, 2), LINE)];
      const cols = R.columns.length, gutter = 6, cw = (X1 - X0 - gutter * (cols - 1)) / cols;
      let y = 14;
      let [t, y2] = words(R.title, X0, y, X1 - X0, 6.4, 7, FONT.SB); g.push(t); y = y2 + 0.2;
      if (R.intro) { [t, y2] = words(R.intro, X0, y + 0.5, X1 - X0, 4.0, 4.5); g.push(t); y = y2 + 0.5; }
      g.push(LineString([[X0, y + 1], [X1, y + 1]]).buffer(0.35));
      const top = y + 6, footer_h = R.footer ? 4.5 * Math.max(1, wrap(R.footer, 4.0, FONT.SB, X1 - X0).length) + 4 : 0, bottom = L - 11 - footer_h;
      for (let size = 4.0; ; size -= 0.2) {
        if (size < 3.4) throw new Error('rules.js lid: the columns do not fit the lid at 3.4 mm type: shorten the text');
        const lead = size * 1.125, gg = [], fig_h = typeof spec.figures === 'function' ? 26 : 0;
        let ok = true;
        R.columns.forEach((col, i) => {
          const x = X0 + i * (cw + gutter); let yy = top;
          if (i) gg.push(LineString([[x - gutter / 2, top - 3], [x - gutter / 2, bottom]]).buffer(0.35));
          if (col.heading) { gg.push(outline(C(x + 4, yy - 2.1, 4.2, 20), LINE), centered(ink(String(i + 1), 6, 0, 0, { font: FONT.SB }), x + 4, yy - 2.1)); const [h, hy] = words(col.heading, x + 11, yy, cw - 11, 5.2, 6, FONT.SB); gg.push(h); yy = hy + 1; }
          if (fig_h) { const f = spec.figures(x, yy, cw, fig_h, i); if (f && !f.is_empty) { if (!sbox(x - 0.5, yy - 0.5, x + cw + 0.5, yy + fig_h + 0.5).contains(f)) throw new Error(`rules.js lid: the figure for column ${i + 1} leaves its ${cw.toFixed(0)} x ${fig_h} mm frame`); gg.push(f); } yy += fig_h + 2; }
          const [w, wy] = words(col.text, x, yy + size, cw, size, lead); gg.push(w);
          if (wy > bottom) ok = false;
        });
        if (!ok) continue;
        g.push(...gg); break;
      }
      if (R.footer) { g.push(LineString([[X0, bottom + 2], [X1, bottom + 2]]).buffer(0.35)); const [f] = words(R.footer, X0, bottom + 7, X1 - X0, 4.0, 4.5); g.push(f); }
      const art = unary_union(g);
      if (!sbox(4.5, 4.5, W - 4.5, L - 4.5).contains(art)) throw new Error('lid engraving leaves the inner face / neck clearance');
      return art;
    });
  }

  // ------------------------------------------------------------------ the base underside: medallion and product code
  function upc_bits(code) {
    if (!(code.length === 12 && /^\d+$/.test(code))) throw new Error('UPC-A needs 12 digits');
    const d = [...code].map(Number);
    if ((10 - (3 * (d[0] + d[2] + d[4] + d[6] + d[8] + d[10]) + (d[1] + d[3] + d[5] + d[7] + d[9])) % 10) % 10 !== d[11]) throw new Error('bad UPC check digit');
    const Lc = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'], Rc = Lc.map(c => [...c].map(b => b === '0' ? '1' : '0').join(''));
    const bits = '101' + d.slice(0, 6).map(v => Lc[v]).join('') + '01010' + d.slice(6).map(v => Rc[v]).join('') + '101';
    if (bits.length !== 95) throw new Error('bad UPC bits');
    return bits;
  }
  /** UPC-A as engraved bars with its digits under them; module 0.66 mm, bars 17 mm tall, a 0.06 mm bar-width reduction for burn spread */
  function upc_a(code, x0, y0, module_ = 0.66, height = 17.0, bwr = 0.06, digit = 3.6) {
    const bits = upc_bits(code), guard = new Set([0, 1, 2, 45, 46, 47, 48, 49, 92, 93, 94]), out = [];
    for (let i = 0; i < 95;) { if (bits[i] === '1') { let j = i; while (j < 95 && bits[j] === '1') j++; out.push(sbox(x0 + i * module_ + bwr / 2, y0, x0 + j * module_ - bwr / 2, y0 + height + (guard.has(i) ? 1.6 : 0.0))); i = j; } else i++; }
    const label = `${code[0]} ${code.slice(1, 6)} ${code.slice(6, 11)} ${code[11]}`;
    out.push(ink(label, digit, x0 + 95 * module_ / 2, y0 + height + 1.6 + 1.2 + digit * 0.73, { font: FONT.SB, spacing: 0.35 }));
    return unary_union(out);
  }
  /** spec: { title, tagline, players: [2,3,4], minutes, year, maker, code (UPC-A, 12 digits, or ''), mark(cx, cy, r) -> art | null } */
  function base_under_art(spec, INNER, INNER_Y = INNER) {
    return memo(`box:base_under:${INNER}x${INNER_Y}:${JSON.stringify([spec.title, spec.tagline, spec.players, spec.minutes, spec.year, spec.maker, spec.code])}:${spec.art_key || ''}`, () => {
      const W = INNER, L = INNER_Y;
      if (typeof spec.base_under === 'function') { const a = spec.base_under(W, L); if (!a || a.is_empty) throw new Error('box.base_under drew nothing'); if (!sbox(1, 1, W - 1, L - 1).contains(a)) throw new Error('box.base_under leaves the floor'); return a; }
      const g = [], has_code = !!(spec.code && spec.code.length), R = Math.min(52, Math.min(W, L) / 2 - 16), MX = has_code ? Math.max(R + 12, W / 2 - 16) : W / 2, MY = L / 2 - (has_code ? 8 : 0);
      const disc = C(MX, MY, R, 72), ring = C(MX, MY, R - 4.0, 72);
      g.push(outline(disc, 1.0), outline(ring, 0.55), K.stipple(disc.difference(ring.buffer(0.8)).difference(disc.buffer(-0.8)), 1.7, 0.6));
      const title = String(spec.title || '').toUpperCase(), ts = Math.min(7.0, K.fit_text(title, 7.0, FONT.B, 2 * (R - 12), 1.0));
      g.push(lg.arc_text(title, ts, MX, MY, R - 9.5, { font: FONT.B, spacing: 1.0 }));
      if (typeof spec.mark === 'function') { const m = spec.mark(MX, MY - 2, R * 0.42); if (m && !m.is_empty) { if (!C(MX, MY - 2, R * 0.5, 48).contains(m)) throw new Error('box.mark pokes out of the medallion'); g.push(m); } }
      const lines = [spec.tagline || '', `${spec.players ? spec.players[0] + ' to ' + spec.players[spec.players.length - 1] + ' players' : ''}${spec.minutes ? ' · ' + spec.minutes + ' minutes' : ''}`, [spec.maker, spec.year].filter(Boolean).join(' · ')].filter(s => s.trim());
      lines.forEach((s, i) => { const size = i === 0 ? 3.9 : 3.4; g.push(ink(s, K.fit_text(s, size, FONT.SB, 2 * (R - 12)), MX, MY + R * 0.5 + i * 4.6, { font: FONT.SB, spacing: 0.15 })); });
      let art = K.finish(unary_union(g), sbox(12, 12, W - 12, L - 12));
      if (has_code) {
        const code = upc_a(spec.code, W - 12 - 95 * 0.66, L - 12 - 17 - 7.4);
        const keep = sbox(...code.bounds).buffer(4.0);
        if (keep.intersects(art)) throw new Error('the product code touches the medallion');
        art = unary_union([art, code]);
      }
      return art;
    });
  }

  // ------------------------------------------------------------------ the base inside: the setup map
  /** spec.setup_map(W) -> art drawn in the W x W frame, or null for a plain rule and the title */
  function base_inner_art(spec, INNER, INNER_Y = INNER) {
    return memo(`box:base_inner:${INNER}x${INNER_Y}:${spec.title}:${spec.art_key || ''}`, () => {
      const W = INNER, L = INNER_Y;
      if (typeof spec.base_inside === 'function') { const a = spec.base_inside(W, L); if (!a) return EMPTY; if (!sbox(1, 1, W - 1, L - 1).contains(a)) throw new Error('box.base_inside leaves the floor'); return a; }   /* the whole inside face, or nothing (a bare floor the board lies on) */
      const g = [outline(sbox(6, 6, W - 6, L - 6), 0.8)];
      const map = typeof spec.setup_map === 'function' ? spec.setup_map(W, L) : null;
      if (map && !map.is_empty) { if (!sbox(7, 7, W - 7, L - 7).contains(map)) throw new Error('box.setup_map leaves its frame: keep it inside 7 mm of the floor edge'); g.push(map); }
      else g.push(ink(spec.title, 7, W / 2, L / 2 + 2.5, { font: FONT.B, spacing: 1.0 }));
      return K.finish(unary_union(g), sbox(1, 1, W - 1, L - 1));
    });
  }

  // ------------------------------------------------------------------ walls: a rule under the rim and the title on the lid's front wall (a game may draw its own)
  const EDGE = 1.0;
  function wall_art_nominal(spec, side, half, F0) {
    const O = out_of('SN'.includes(side) ? 'A' : 'B', F0);
    return memo(`box:wall:${side}:${half}:${O}:${spec.title}:${spec.art_key || ''}`, () => {
      if (typeof spec.wall_art === 'function') { const a = spec.wall_art(side, half, O, F0.WALL_H); if (a && !a.is_empty) return a; }
      const H = F0.WALL_H, g = [];
      if (half === 'lid') {   // the lid wall in its upright frame: rim at y = H, the floor slots near y = FLOOR_UP
        g.push(LineString([[F0.WALL_T + 6, H - 3.2], [O - F0.WALL_T - 6, H - 3.2]]).buffer(0.3));
        if (side === 'S') { const s = 5.0; g.push(ink(String(spec.title).toUpperCase(), K.fit_text(String(spec.title).toUpperCase(), s, FONT.B, O - 60, 1.0), O / 2, H - 6.2, { font: FONT.B, spacing: 1.0 })); }
      } else {   // the base wall: rim at y = 0
        g.push(LineString([[F0.WALL_T + 6, H - 3.2], [O - F0.WALL_T - 6, H - 3.2]]).buffer(0.3));
      }
      return unary_union(g);
    });
  }

  // ------------------------------------------------------------------ registering the box's parts and nesting them on their sheet
  /** the standard part ids: floor-base (+ floor-base-under front, floor-base-map back), lid-cut (+ lid-outer front, lid-inner back), wall-<S|E|N|W>-<base|lid>, wall-<side>-lid-up (the art frame), neck-A x2, neck-B x2 */
  const NEED = () => { const n = { 'floor-base': 1, 'lid-cut': 1, 'neck-A': 2, 'neck-B': 2 }; for (const s of 'SENW') { n[`wall-${s}-base`] = 1; n[`wall-${s}-lid`] = 1; } return n; };
  /** add every box part to the layout. F: the built fits; F0: the nominal fits (the art frame); spec: the box spec from the game; keyed/add: the registrars from geom.js */
  function add_parts(reg, F, F0, spec) {
    const { keyed, add } = reg, INNER = F.INNER_X, INNER_Y = F.INNER_Y, SZ = F.SQUARE ? String(INNER) : `${INNER}x${INNER_Y}`, FB = stock.tray(F, 'base'), FLD = stock.tray(F, 'lid');
    const mirrored = shape => K.back_art(shape, shape);
    const fl = floor_shape(FB), flL = floor_shape(FLD), flnom = memo(`box:floor:${SZ}`, () => floor_shape(F0));
    add('floor-base', fl);
    keyed('floor-base-under', null, 'box:floor-under', () => base_under_art(spec, INNER, INNER_Y), { edge: flnom });
    keyed('floor-base-map', null, 'box:floor-map', () => base_inner_art(spec, INNER, INNER_Y), { edge: mirrored(flnom), back: true });
    add('lid-cut', flL);
    keyed('lid-inner', null, 'box:lid-inner', () => lid_inner_art(spec, INNER, INNER_Y), { edge: mirrored(flnom), back: true });
    keyed('lid-outer', null, 'box:lid-outer', () => lid_outer_art(spec, INNER, INNER_Y), { edge: flnom });
    const keep = (FT, y0, kind) => slot_boxes(y0, FT, kind).buffer(EDGE + 0.2, { join_style: 'mitre' });
    const wall_post = (FT, y0, kind) => { const sx = out_of(kind, FT) / out_of(kind, F0); return { eng_post: g => K.clip_out(sx === 1 ? g : affinity.scale(g, sx, 1, 1, [0, 0]), keep(FT, y0, kind)), eng_post_key: [sx, FT.SLOT_W, FT.WALL_T, FT.EASE, FT.WALL_SLOT_H, y0].concat(F.SQUARE ? [] : [kind, FT.FLOOR]).join('|') }; };
    for (const side of 'SENW') {
      const kind = 'SN'.includes(side) ? 'A' : 'B', O0 = out_of(kind, F0);
      const edge_top = memo(`box:wall_edge:${kind}:${SZ}:top`, () => wall_shape(kind, true, F0)), edge_up = memo(`box:wall_edge:${kind}:${SZ}:up`, () => wall_shape(kind, false, F0));
      keyed(`wall-${side}-base`, wall_shape(kind, true, FB), `box:wall:${side}:base`, () => wall_art_nominal(spec, side, 'base', F0), Object.assign({ edge: edge_top }, wall_post(FB, F.SLOT_Y0, kind)));
      keyed(`wall-${side}-lid-up`, wall_shape(kind, false, FLD), `box:wall:${side}:lid-up`, () => wall_art_nominal(spec, side, 'lid', F0), Object.assign({ edge: edge_up }, wall_post(FLD, F.FLOOR_UP, kind)));
      keyed(`wall-${side}-lid`, wall_shape(kind, true, FLD), `box:wall:${side}:lid`, () => affinity.rotate(wall_art_nominal(spec, side, 'lid', F0), 180, [O0 / 2, F0.WALL_H / 2]), Object.assign({ edge: edge_top }, wall_post(FLD, F.SLOT_Y0, kind)));
    }
    for (const kind of ['A', 'B']) add(`neck-${kind}`, neck_shape(kind, F));
    return { FB, FLD, fl };
  }
  /** the box sheet: floor and lid tab to tab along the sheet, the eight walls standing against them on shared lines. Returns the y the block ends at. */
  function nest(lay, sheet, F, KS, TOP, SHEET_H) {
    const FB = stock.tray(F, 'base'), FLD = stock.tray(F, 'lid'), WALL_H = F.WALL_H, ROW_GAP = 1.6;
    const X1 = 8.0 - F.FLOOR_TAB, Y1 = TOP + 3.0;
    const [fx, fy] = lay.put_box(sheet, 'floor-base', X1, Y1, { rot: 90, share: true });
    { const it = lay.last_item(sheet); lay.put(sheet, 'floor-base-under', it[1], it[2], { rot: 90, gid: 'floor-base-under', check: false }); }
    lay.put_box(sheet, 'lid-cut', X1 - FLD.EASE + FB.EASE, fy, { rot: 90, gid: 'lid', share: true });
    { const it = lay.last_item(sheet); lay.put(sheet, 'lid-outer', it[1], it[2], { rot: 90, gid: 'lid-outer', check: false }); }
    const walls = [...'SENW'].map(s => `wall-${s}-base`).concat([...'SENW'].map(s => `wall-${s}-lid`));
    walls.forEach((w, k) => lay.put(sheet, w, fx + (k < 4 ? 0 : FLD.EASE - FB.EASE) + KS / 2 + WALL_H + (WALL_H + KS) * (k % 4), Y1 + KS / 2 + Math.floor(k / 4) * (FB.OUT + KS + ROW_GAP), { rot: 90, share: true }));
    return Y1 + FB.OUT + KS + ROW_GAP + FLD.OUT + KS + 2;
  }
  /** what a box of this size needs on the sheet: the length of the block along the sheet (two trays' outsides plus the walls) and across */
  const block_size = F => { const FB = stock.tray(F, 'base'), FLD = stock.tray(F, 'lid'); return { along: FB.OUT + FLD.OUT + 6, across: 8 + FB.FLOOR_SPAN + 2 * F.FLOOR_TAB + 8 + 4 * (F.WALL_H + 0.3) + 2 }; };

  return { floor_shape, wall_shape, neck_shape, thumb_notch, slot_boxes, slot_x, rosette, ribbon_banner, choking_warning, WARNING, medallion, lid_outer_art, lid_inner_art, base_under_art, base_inner_art, upc_a, wall_art_nominal, NEED, add_parts, nest, block_size, EDGE, NOTCH_R, NOTCH_DEPTH };
});
