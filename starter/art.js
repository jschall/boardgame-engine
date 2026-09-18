/* ORCHARD's art: every engraving on the wood, drawn once in each part's own frame (mm, y down; a standee stands on y = 0 with the figure above it in
   negative y; a card's origin is its top-left corner; tiles, tokens and bases are centred on the origin). Two tones only: engraved or bare.
   UMD: node (module.exports) or the page's worker (root.OrchardArt), on the engine's shapes (BGEngine.shapes: lasergeom + the helpers). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./engine/src/shapes.js'), require('./orchard-sim.js'));
  else root.OrchardArt = factory(root.BGEngine.shapes, root.OrchardSim);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (K, S) {
  'use strict';
  const { Polygon, LineString, sbox, unary_union, affinity, EMPTY, C, rrect, outline, ink, FONT, memo, range, hatch, stipple, finish, rng } = K;
  const RAD = Math.PI / 180;
  const move = (g, x, y) => affinity.translate(g, x, y);
  const scale = (g, k) => affinity.scale(g, k, k, 1, [0, 0]);
  /** a stroked polyline w wide */
  const L = (pts, w) => LineString(pts).buffer(w / 2);
  /** an ellipse */
  const E = (x, y, rx, ry, q = 24) => move(affinity.scale(C(0, 0, 1, q), rx, ry, 1, [0, 0]), x, y);

  // ------------------------------------------------------------------ the fruit glyphs (the same shape at every size: s = 1 is about 12 mm tall)
  const GLYPH = {
    apple(x, y, s) {   // a round body with a dimple, a stem and one leaf; a highlight kept bare
      const body = unary_union([C(x - 2.4 * s, y + 1.2 * s, 3.6 * s, 24), C(x + 2.4 * s, y + 1.2 * s, 3.6 * s, 24), rrect(x - 3.2 * s, y - 0.4 * s, x + 3.2 * s, y + 4.2 * s, 1.5 * s)]).difference(C(x, y - 2.3 * s, 1.1 * s, 12));
      const stem = L([[x, y - 2.6 * s], [x + 0.6 * s, y - 5.6 * s]], 0.9 * s), leaf = affinity.rotate(E(x + 2.6 * s, y - 4.6 * s, 2.2 * s, 0.9 * s), -30, [x + 2.6 * s, y - 4.6 * s]);
      return unary_union([body.difference(E(x - 1.6 * s, y - 0.6 * s, 1.0 * s, 1.6 * s)), stem, leaf]);
    },
    pear(x, y, s) {   // a teardrop, narrow at the top, a stem
      const top = C(x, y - 1.8 * s, 2.3 * s, 20), bottom = C(x, y + 2.4 * s, 3.6 * s, 24), neck = Polygon([[x - 2.2 * s, y - 1.4 * s], [x + 2.2 * s, y - 1.4 * s], [x + 3.5 * s, y + 2.2 * s], [x - 3.5 * s, y + 2.2 * s]]);
      const body = unary_union([top, bottom, neck]).difference(E(x - 1.3 * s, y + 1.4 * s, 0.9 * s, 1.8 * s));
      return unary_union([body, L([[x, y - 3.9 * s], [x + 0.8 * s, y - 6.2 * s]], 0.9 * s)]);
    },
    plum(x, y, s) {   // an oval with a crease and a short stem
      const body = E(x, y + 0.6 * s, 3.4 * s, 4.0 * s).difference(L([[x + 0.4 * s, y - 2.8 * s], [x + 1.4 * s, y + 3.6 * s]], 0.55 * s)).difference(E(x - 1.5 * s, y - 0.8 * s, 0.8 * s, 1.5 * s));
      return unary_union([body, L([[x, y - 3.3 * s], [x - 0.5 * s, y - 5.8 * s]], 0.9 * s)]);
    },
    cherry(x, y, s) {   // two cherries on a forked stalk
      const a = C(x - 2.6 * s, y + 2.2 * s, 2.5 * s, 20).difference(C(x - 3.4 * s, y + 1.3 * s, 0.7 * s, 10)), b = C(x + 2.6 * s, y + 2.6 * s, 2.5 * s, 20).difference(C(x + 1.8 * s, y + 1.7 * s, 0.7 * s, 10));
      const stalk = unary_union([L([[x - 2.6 * s, y + 0.2 * s], [x + 0.6 * s, y - 5.4 * s]], 0.8 * s), L([[x + 2.6 * s, y + 0.6 * s], [x + 0.6 * s, y - 5.4 * s]], 0.8 * s), affinity.rotate(E(x + 1.6 * s, y - 5.0 * s, 1.8 * s, 0.8 * s), -35, [x + 1.6 * s, y - 5.0 * s])]);
      return unary_union([a, b, stalk]);
    },
  };
  const fruit = (kind, x, y, s) => { if (!GLYPH[kind]) throw new Error('no glyph for ' + kind); return GLYPH[kind](x, y, s); };

  // ------------------------------------------------------------------ a tree: a round crown, a trunk, fruit hanging in it
  function tree(x, y, s, kind, seed) {
    const r = rng(seed || 1);
    const crown = unary_union([C(x, y - 6 * s, 6.5 * s, 24), C(x - 5 * s, y - 3 * s, 5 * s, 24), C(x + 5 * s, y - 3 * s, 5 * s, 24), C(x, y - 1 * s, 6 * s, 24)]);
    const trunk = Polygon([[x - 1.4 * s, y + 8 * s], [x + 1.4 * s, y + 8 * s], [x + 1.0 * s, y - 1 * s], [x - 1.0 * s, y - 1 * s]]);
    const roots = unary_union([L([[x - 1.2 * s, y + 7.5 * s], [x - 4 * s, y + 8.6 * s]], 0.8 * s), L([[x + 1.2 * s, y + 7.5 * s], [x + 4 * s, y + 8.6 * s]], 0.8 * s)]);
    /* the crown: an outline with hatched shade on its lower left, the fruit bare inside it */
    const spots = []; for (let i = 0; i < 5; i++) spots.push([x + (r.random() - 0.5) * 9 * s, y - 2 * s - r.random() * 7 * s]);
    const holes = unary_union(spots.map(([px, py]) => C(px, py, 1.5 * s, 12)));
    const shade = hatch(crown.intersection(sbox(x - 12 * s, y - 4 * s, x + 12 * s, y + 6 * s)).buffer(-1.2 * s), 1.4 * s, 0.45 * s, 30);
    const crownArt = unary_union([outline(crown, 0.8 * s), shade]).difference(holes.buffer(0.6 * s));
    const fruits = unary_union(spots.map(([px, py]) => C(px, py, 1.1 * s, 12)));
    return unary_union([crownArt, fruits, trunk, roots]);
  }

  // ------------------------------------------------------------------ silhouettes (standees): a farmer with a hat and a basket, the crow, the scarecrow pair
  const SIL = {
    farmer: memo('orchard:sil:farmer', () => {   // 36 mm tall, 24 wide, standing on y = 0
      const hat = unary_union([rrect(-9, -36, 9, -33, 1.2), rrect(-5.5, -41, 5.5, -34, 2)]);
      const head = C(0, -29.5, 4.6, 20), body = rrect(-6, -26, 6, -9, 3.5), legs = unary_union([rrect(-5.5, -12, -1, 0, 1.2), rrect(1, -12, 5.5, 0, 1.2)]);
      const arm = rrect(5, -24, 9.5, -12, 2), basket = rrect(7, -14, 14, -6, 1.5).union(L([[8, -14], [10.5, -19], [13, -14]], 1.2));
      const arm2 = rrect(-9.5, -24, -5, -13, 2);
      return unary_union([hat, head, body, legs, arm, arm2, basket]).buffer(0.4, { join_style: 'round' }).buffer(-0.4, { join_style: 'round' });
    }),
    crow: memo('orchard:sil:crow', () => {   // 26 mm tall, perched: a body, a raised wing, the beak and the tail
      const body = affinity.rotate(E(0, -12, 9, 5.5), -20, [0, -12]), head = C(7, -19, 4, 20), beak = Polygon([[10.5, -20.5], [16, -18.5], [10.5, -17]]);
      const wing = affinity.rotate(E(-2, -14, 8, 3.2), -40, [-2, -14]), tail = Polygon([[-8, -10], [-15, -6], [-13, -2.5], [-6, -7]]);
      const legs = unary_union([L([[2, -7], [3, 0]], 1.4), L([[-2, -7], [-1.5, 0]], 1.4), rrect(-4, -2, 6, 0, 0.8)]);
      return unary_union([body, head, beak, wing, tail, legs]).buffer(0.3, { join_style: 'round' }).buffer(-0.3, { join_style: 'round' }).intersection(sbox(-60, -60, 60, 0));
    }),
    scarecrow: memo('orchard:sil:scarecrow', () => {   // 46 mm tall on a post: a hat, a round head, the crossbar with sleeves, a ragged coat
      /* the post is 8 mm wide (the cross-lap slot takes 3.1 of it and leaves 2 mm each side) and flares to 12 at the foot, wider than the 10 mm tab */
      const post = Polygon([[-6, 0], [6, 0], [4, -12], [4, -30], [-4, -30], [-4, -12]]), bar = rrect(-15, -31, 15, -27.5, 1), hat = unary_union([rrect(-8, -41, 8, -38.5, 1), rrect(-5, -46, 5, -39, 1.5)]);
      const head = C(0, -35, 4.5, 20), coat = Polygon([[-9, -28], [9, -28], [11, -14], [7, -15], [5, -12], [1, -14], [-3, -12], [-6, -15], [-11, -14]]);
      const sleeves = unary_union([rrect(-16, -30.5, -8, -25, 1.5), rrect(8, -30.5, 16, -25, 1.5)]);
      return unary_union([post, bar, hat, head, coat, sleeves]).buffer(0.3, { join_style: 'round' }).buffer(-0.3, { join_style: 'round' });
    }),
  };
  /** the art on a farmer: a band of the seat's number of dots on the hat, the basket weave, a face */
  function farmer_art(seat) {
    return memo('orchard:farmer_art:' + seat, () => {
      const sil = SIL.farmer, room = sil.buffer(-1.0);
      const g = [outline(C(0, -29.5, 4.6, 20), 0.6).intersection(room), C(-1.6, -30.5, 0.55, 8), C(1.6, -30.5, 0.55, 8), L([[-1.2, -27.8], [1.2, -27.8]], 0.5)];
      g.push(outline(rrect(-9, -36, 9, -33, 1.2), 0.5).intersection(room));
      for (let i = 0; i < seat + 1; i++) g.push(C(-3 + i * 2, -37.5, 0.7, 8));   /* the seat's number of dots on the hatband: 1 to 4 */
      g.push(hatch(rrect(7.6, -13.4, 13.4, -6.6, 1), 1.1, 0.4, 45).intersection(room));
      g.push(outline(rrect(-6, -26, 6, -9, 3.5), 0.5).intersection(room), L([[0, -25], [0, -10]], 0.5), C(0, -20, 0.6, 8), C(0, -16, 0.6, 8));
      return finish(unary_union(g), sil, 0.8);
    });
  }
  function crow_art() { return memo('orchard:crow_art', () => { const sil = SIL.crow, room = sil.buffer(-1.0); const g = [C(7.6, -19.8, 0.9, 10), outline(affinity.rotate(E(-2, -14, 8, 3.2), -40, [-2, -14]), 0.6).intersection(room), hatch(affinity.rotate(E(-2, -14, 7, 2.4), -40, [-2, -14]), 1.2, 0.4, 130)]; return finish(unary_union(g), sil, 0.8); }); }
  function scarecrow_art() { return memo('orchard:scarecrow_art', () => { const sil = SIL.scarecrow, room = sil.buffer(-1.0); const g = [C(-1.6, -36, 0.7, 8), C(1.6, -36, 0.7, 8), L([[-1.5, -33.2], [0, -32.4], [1.5, -33.2]], 0.5), hatch(rrect(-5, -46, 5, -39, 1.5), 1.3, 0.4, 0), outline(Polygon([[-9, -28], [9, -28], [11, -14], [7, -15], [5, -12], [1, -14], [-3, -12], [-6, -15], [-11, -14]]), 0.6).intersection(room), hatch(Polygon([[-3.2, -11], [3.2, -11], [4.6, -1.2], [-4.6, -1.2]]), 1.6, 0.4, 90).intersection(room)]; return finish(unary_union(g), sil, 0.8); }); }

  // ------------------------------------------------------------------ the flat pieces
  const TILE = 40.0, TOKEN = 16.0, CARD_W = 48.0, CARD_H = 68.0, BASKET_W = 80.0, BASKET_H = 28.0, BARN = 44.0;
  /** an orchard tile: a tree of its kind, the fruit's name along the bottom, a fine border */
  function tile_art(kind) {
    return memo('orchard:tile:' + kind, () => {
      const shape = K.square_tile(TILE, 3.0);
      const g = [outline(rrect(-17.5, -17.5, 17.5, 17.5, 2.0), 0.5), tree(0, -3, 1.55, kind, kind.length), fruit(kind, 12.5, 11.5, 0.55), ink(kind.toUpperCase(), 3.6, -3, 16.0, { font: FONT.SB, spacing: 0.6 })];
      return finish(unary_union(g), shape, 1.2);
    });
  }
  /** the barn tile: a barn front with the + hole's place kept bare */
  function barn_art() {
    return memo('orchard:barn', () => {
      const shape = K.square_tile(BARN, 3.0);
      const roof = Polygon([[-19, -4], [0, -17], [19, -4]]), wall = rrect(-16, -4, 16, 15, 1.0), door = rrect(-5, 2, 5, 15, 0.8);
      const g = [outline(roof, 0.8), hatch(roof.buffer(-1.6), 1.6, 0.45, 0), outline(wall, 0.7), outline(door, 0.6), L([[-5, 2], [5, 15]], 0.5), L([[5, 2], [-5, 15]], 0.5), C(0, -8, 2.2, 16).difference(C(0, -8, 1.4, 16))];
      return finish(unary_union(g), shape, 1.2).difference(sbox(-8, -8, 8, 8));   /* the + hole and its leaf springs sit in the bare middle */
    });
  }
  /** a token: the fruit glyph, big */
  function token_art(kind) { return memo('orchard:token:' + kind, () => finish(fruit(kind, 0, 0.2, 0.95), K.disc(TOKEN), 1.0)); }
  /** an order card: the name, the fruit it needs in a row, the points in a corner badge */
  function card_art(i) {
    return memo('orchard:card:' + i, () => {
      const o = S.ORDERS[i], g = [outline(rrect(3, 3, CARD_W - 3, CARD_H - 3, 3), 0.5)];
      g.push(ink(o.name.toUpperCase(), K.fit_text(o.name.toUpperCase(), 4.2, FONT.SB, CARD_W - 12, 0.4), CARD_W / 2, 12, { font: FONT.SB, spacing: 0.4 }));
      g.push(L([[8, 15.5], [CARD_W - 8, 15.5]], 0.4));
      const n = o.needs.length, pitch = Math.min(13, (CARD_W - 12) / n);
      o.needs.forEach((k, j) => g.push(fruit(k, CARD_W / 2 + (j - (n - 1) / 2) * pitch, 34, 0.9)));
      g.push(C(CARD_W - 10, CARD_H - 10, 5.2, 24).difference(C(CARD_W - 10, CARD_H - 10, 4.4, 24)), ink(String(o.pts), 5.5, CARD_W - 10, CARD_H - 8, { font: FONT.B }));
      g.push(ink('POINTS', 2.4, CARD_W - 10, CARD_H - 17.5, { font: FONT.SB, spacing: 0.4 }));
      g.push(ink(`needs ${n} fruit`, 3.0, 8, CARD_H - 8.5, { anchor: 'start', font: FONT.R }));
      return finish(unary_union(g), K.card(CARD_W, CARD_H), 1.0);
    });
  }
  /** every card's back: the same tree in a frame, so no back tells a card apart */
  function card_back() { return memo('orchard:card_back', () => finish(unary_union([outline(rrect(3, 3, CARD_W - 3, CARD_H - 3, 3), 0.6), outline(rrect(5.5, 5.5, CARD_W - 5.5, CARD_H - 5.5, 2), 0.35), tree(CARD_W / 2, CARD_H / 2 - 2, 1.5, 'apple', 7), ink('ORCHARD', 4.0, CARD_W / 2, CARD_H - 9, { font: FONT.B, spacing: 0.9 })]), K.card(CARD_W, CARD_H), 1.0)); }
  /** a basket board: four rings for the fruit a farmer carries, the seat's colour name */
  function basket_art(seat) {
    return memo('orchard:basket:' + seat, () => {
      const P = S.PLAYERS[seat], shape = K.plate(BASKET_W, BASKET_H, 3.0), g = [outline(rrect(-BASKET_W / 2 + 2, -BASKET_H / 2 + 2, BASKET_W / 2 - 2, BASKET_H / 2 - 2, 2), 0.5)];
      for (let i = 0; i < S.RULES.basket; i++) { const x = -27 + i * 18; g.push(C(x, 1.5, 9.0, 32).difference(C(x, 1.5, 8.3, 32))); }
      for (let i = 0; i < seat + 1; i++) g.push(C(-34 + i * 2.6, -10.5, 0.7, 8));
      g.push(ink(`${P.name.toUpperCase()} · ${P.key.toUpperCase()}`, 2.6, 12, -9.6, { font: FONT.SB, spacing: 0.4 }));
      return finish(unary_union(g), shape, 1.0);
    });
  }
  /** a base: the seat's number of dots on two edges (a keyed base for a keyed farmer) */
  function base_art(seat) { return memo('orchard:base:' + seat, () => { const g = []; for (let i = 0; i < seat + 1; i++) for (const sy of [-1, 1]) g.push(C((i - seat / 2) * 2.4, sy * 6.6, 0.7, 8)); return unary_union(g); }); }

  // ------------------------------------------------------------------ the box panels
  /** the lid medallion: a big tree with the crow on a branch, the four fruits round the foot */
  function cover(cx, cy, r, room) {
    const g = [tree(cx, cy - r * 0.15, r / 12, 'apple', 3)];
    const crow = move(scale(SIL.crow, r / 60), cx - r * 0.42, cy - r * 0.52);
    g.push(crow);
    ['apple', 'pear', 'plum', 'cherry'].forEach((k, i) => g.push(fruit(k, cx + (i - 1.5) * r * 0.42, cy + r * 0.66, r / 60)));
    return finish(unary_union(g), room, 0);
  }
  /** the corners of the lid: a small fruit each */
  function corner(x, y, s, qx, qy) { return fruit(['apple', 'pear', 'plum', 'cherry'][(qx > 0 ? 1 : 0) + (qy > 0 ? 2 : 0)], x, y, 0.8 * s); }
  /** the setup map inside the base: the 4 x 4 orchard with the farmers' corners numbered and the crow's start */
  function setup_map(W) {
    const cx = W / 2, cy = W / 2 - 6, pitch = 24, g = [];
    for (let i = 0; i < S.SIZE * S.SIZE; i++) { const [x, y] = S.XY(i); const px = cx + (x - 1.5) * pitch, py = cy + (y - 1.5) * pitch; g.push(outline(rrect(px - 10, py - 10, px + 10, py + 10, 1.5), 0.5)); }
    S.CORNERS.forEach((t, seat) => { const [x, y] = S.XY(t); const px = cx + (x - 1.5) * pitch, py = cy + (y - 1.5) * pitch; g.push(C(px, py, 6, 24).difference(C(px, py, 5.2, 24)), ink(String(seat + 1), 6, px, py + 2.2, { font: FONT.B })); });
    { const [x, y] = S.XY(S.PATH[Math.floor(S.SIZE * S.SIZE / 2)]); g.push(move(scale(SIL.crow, 0.45), cx + (x - 1.5) * pitch, cy + (y - 1.5) * pitch + 8)); }
    g.push(ink('SETUP', 7, cx, cy - 66, { font: FONT.B, spacing: 1.2 }));
    g.push(ink('Shuffle the 16 trees into a 4 by 4 orchard. Farmers start on the numbered corners; the crow starts on this tree.', 3.6, cx, cy + 66, { font: FONT.R }));
    g.push(ink('Deal each farmer 2 secret orders. Turn 3 orders face up at the market. Fruit tokens in the lid.', 3.6, cx, cy + 72, { font: FONT.R }));
    return finish(unary_union(g), sbox(8, 8, W - 8, W - 8), 0);
  }
  const mark = (cx, cy, r) => fruit('apple', cx, cy + r * 0.1, r / 6.2);

  return { GLYPH, fruit, tree, SIL, farmer_art, crow_art, scarecrow_art, TILE, TOKEN, CARD_W, CARD_H, BASKET_W, BASKET_H, BARN, tile_art, barn_art, token_art, card_art, card_back, basket_art, base_art, cover, corner, setup_map, mark };
});
