/* ORCHARD's parts, declared: every piece with its outline, its art, its stock and how many; the box. The engine (engine/src/geom.js) makes the cut
   files from this: kerf-compensated outlines, standee tabs and leaf-spring bases with keys, the + hole for the scarecrow, the box with its panels,
   the sheets, the kerf coupons and joint samples, the backs files and the META the page, packer and checks read.
   UMD: node (module.exports, for engine/bin/bg.js parts) or the page's worker (root.GameGeom; game.json's geom_files load in this order). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./engine/src/geom.js'), require('./engine/src/shapes.js'), require('./orchard-sim.js'), require('./art.js'), require('./rules.js'));
  else root.GameGeom = factory(root.BGEngine.geom, root.BGEngine.shapes, root.OrchardSim, root.OrchardArt, root.GameRules);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (GEOM, K, S, A, RULES) {
  'use strict';
  /* the stocks: two caliper readings each (the thinnest and thickest the owner measured) and the kerf measured on that stock's coupon */
  const stocks = {
    t3: { name: 'basswood 3 mm', mat: 'birch', lo: 2.67, hi: 2.92, kerf: 0.18, nominal: 3.0 },
    t15: { name: 'basswood 1.5 mm', mat: 'birch', lo: 1.35, hi: 1.65, kerf: 0.18, nominal: 1.5 },
  };
  const parts = [];
  for (const f of S.FRUITS) parts.push({ id: `tile-${f.key}`, kind: 'tile', count: S.SIZE, stock: 't3', shape: K.square_tile(A.TILE, 3.0), art: () => A.tile_art(f.key), name: `${f.name} tree` });
  parts.push({ id: 'barn', kind: 'tile', count: 1, stock: 't3', shape: K.square_tile(A.BARN, 3.0), art: () => A.barn_art(), plus: { pair: 'scarecrow', x: 0, y: 0 }, name: 'barn' });
  parts.push({ id: 'scarecrow', kind: 'pair', count: 1, stock: 't3', in: 't3', silhouette: A.SIL.scarecrow, art: () => A.scarecrow_art(), name: 'scarecrow' });
  S.PLAYERS.forEach((P, seat) => {
    const key = 2.0 + seat * 1.5;   /* the gap in the tab, mm from its left edge: only the base with the matching bridge takes this farmer */
    parts.push({ id: `farmer-${P.key}`, kind: 'standee', count: 1, stock: 't3', in: 't3', silhouette: A.SIL.farmer, art: () => A.farmer_art(seat), key, base: `base-${P.key}`, name: `${P.key} farmer` });
    parts.push({ id: `base-${P.key}`, kind: 'base', count: 1, stock: 't3', holds: 't3', shape: 'circle', size: 18, key, art: () => A.base_art(seat), name: `${P.key} base` });
    parts.push({ id: `basket-${P.key}`, kind: 'board', count: 1, stock: 't3', shape: K.plate(A.BASKET_W, A.BASKET_H, 3.0), art: () => A.basket_art(seat), name: `${P.key} basket board` });
  });
  parts.push({ id: 'crow', kind: 'standee', count: 1, stock: 't3', in: 't3', silhouette: A.SIL.crow, art: () => A.crow_art(), base: 'base-crow', name: 'crow' });
  parts.push({ id: 'base-crow', kind: 'base', count: 1, stock: 't3', holds: 't3', shape: 'oct', size: 20, art: null, name: 'crow base' });
  for (const f of S.FRUITS) parts.push({ id: `token-${f.key}`, kind: 'token', count: S.RULES.tokensPerKind, stock: 't3', shape: K.disc(A.TOKEN), art: () => A.token_art(f.key), name: `${f.name} token` });
  S.ORDERS.forEach((o, i) => parts.push({ id: `order-${i}`, kind: 'card', count: 1, stock: 't15', shape: K.card(A.CARD_W, A.CARD_H), art: () => A.card_art(i), back: () => A.card_back(), name: `${o.name} order` }));
  const spec = {
    name: 'ORCHARD', stocks, parts,
    box: { stock: 't3', neck: 't3', inner: 160, title: 'ORCHARD', tagline: 'Pick fruit, deliver orders, dodge the crow.', players: [2, 3, 4], minutes: '20 to 30', year: 2026, maker: 'made on a laser', code: '',
      medal: 'circle', cover: A.cover, corner: A.corner, setup_map: A.setup_map, mark: A.mark, lid: RULES.lid, art_key: 'orchard-v1' },
  };
  return GEOM.make_game(spec);
});
