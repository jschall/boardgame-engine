/* table.js: ORCHARD on the engine's stage (engine/page/page.js). GameTable(api) returns the game's blocks: the table layout (the orchard, the
   barn, the baskets, the market, the box trays), initTable, setBoardFromState, animateEvents (one visible motion per event), the QA contract
   (assertLegal, noteShown, syncBoard), finale, what the players say, and the assemblies and views the parts list offers. Everything else on the
   page is the engine's. Browser global GameTable; build.js embeds this file after the engine's renderer and before page.js.
   No // line comments in this file: it is embedded inline. */
function GameTable(api) {
  'use strict';
  const { S, META, PARTS, need, part, mk, posed, setPose, rotXY, ez, STOCK_T, IN, tray, neck, standingPair, standee, exFor, addAsm, tween, wait, arc, log, pick } = api;
  const NP = 4, players = S.PLAYERS.map(p => ({ name: p.name, colour: p.colour, title: p.title }));
  const NAMES = players.map(p => p.name), FRUIT = S.FRUITS.map(f => f.key);
  const dot = c => api.dot(c), say = (c, line) => api.say(c, line);
  let G = null, qr = null;

  /* ------------------------------------------------------------ the table layout: the orchard in the middle, the barn beyond it, a seat on each side */
  const T = { static: [], dynamic: [], home: { pitch: 48, yaw: 0, dist: 2100, cx: 0, cy: 0, cz: 0, view: 780 } };
  const TILE = 40, PITCH = 46;   /* 6 mm between trees */
  const treeXY = i => { const [x, y] = S.XY(i); return [(x - (S.SIZE - 1) / 2) * PITCH, (y - (S.SIZE - 1) / 2) * PITCH]; };
  /* a seat's frame: the basket board lies beyond the orchard on the seat's side, turned to face the player; seats go round the table */
  const SEAT_R = 200;
  const seatAng = c => (-90 + 90 * c) * Math.PI / 180;
  const seatDeg = c => seatAng(c) * 180 / Math.PI + 90;
  const seatW = (c, u, v) => { const a = seatAng(c); const [rx, ry] = rotXY(seatDeg(c), u, v); return [Math.cos(a) * SEAT_R + rx, Math.sin(a) * SEAT_R + ry]; };
  const baskets = [];
  for (let c = 0; c < NP; c++) { const k = S.PLAYERS[c].key, [x, y] = seatW(c, 0, 0); const back = mk({ part: part('basket-' + k) }); setPose(back, [0, 0], x, y, 0, seatDeg(c)); T.static.push(back); baskets.push(back);
    if (PARTS['basket-' + k + '-frame']) { const fr = mk({ part: part('basket-' + k + '-frame') }); setPose(fr, [0, 0], x, y, 0, seatDeg(c)); posed(fr, () => ({ z: STOCK_T(stockOf('basket-' + k)) })); T.static.push(fr); } }
  /* the barn with the scarecrow beyond the far corner, the market (three cards) beside it */
  const BARN = [-230, -235];
  const barn = mk({ part: part('barn'), x: BARN[0], y: BARN[1], z: 0 }); T.static.push(barn, ...standingPair('scarecrow-a', 'scarecrow-b', BARN[0], BARN[1], 0, 'barn'));
  const MARKET = k => [-150 + k * 54, -262];
  const DECK = [30, -262];
  /* the lid tray holds the fruit tokens, the base tray sits at the other side */
  const LIDO = [110, 110]; const LIDA0 = T.static.length; tray(T.static, LIDO[0], LIDO[1], 'lid'); const LIDA = T.static.slice(LIDA0);
  const BOXO = [-110 - IN - 2 * 4, 110]; const BOXA_ = T.static.length; tray(T.static, BOXO[0], BOXO[1], 'base'); neck(T.static, BOXO[0], BOXO[1], 'NECK_TOP'); const BOXA = T.static.slice(BOXA_);
  /* the sixteen trees: one instance per physical tile; the game's shuffle says which tile stands where */
  const tiles = {}; for (const f of FRUIT) { tiles[f] = []; for (let n = 0; n < S.SIZE; n++) { const inst = mk({ part: part('tile-' + f), shadow: true }); tiles[f].push(inst); T.dynamic.push(inst); } }
  const tileAt = [];   /* tree index -> instance */
  /* the fruit tokens: fixed homes in the lid, in four rows */
  const tokens = []; for (let t = 0; t < FRUIT.length; t++) for (let i = 0; i < S.RULES.tokensPerKind; i++) { const inst = mk({ part: part('token-' + FRUIT[t]), shadow: true }); const home = [LIDO[0] + 22 + t * 20, LIDO[1] + 16 + (i % 5) * 20, 6 + Math.floor(i / 5) * STOCK_T('t3'), 0]; tokens.push({ inst, type: FRUIT[t], home, where: 'supply' }); T.dynamic.push(inst); }
  /* the farmers on their bases, the crow on its */
  const farmers = []; for (let c = 0; c < NP; c++) { const k = S.PLAYERS[c].key; const base = mk({ part: part('base-' + k), shadow: true }); const fig = mk({ part: part('farmer-' + k), back: part('farmer-' + k + '-back'), vertical: true, rot: 30 }); base.rot = 30; farmers.push({ base, fig }); T.dynamic.push(base, fig); }
  const crow = { base: mk({ part: part('base-crow'), shadow: true, rot: -20 }), fig: mk({ part: part('crow'), back: part('crow-back'), vertical: true, rot: -20 }) }; T.dynamic.push(crow.base, crow.fig);
  function placeStandee(P, x, y, z, rot) { P.base.x = x; P.base.y = y; P.base.z = z; P.fig.x = x; P.fig.y = y; P.fig.z = z + P.base.thick; if (rot !== undefined) { P.base.rot = rot; P.fig.rot = rot; } }
  /* the order cards: face down in the deck, face up at the market, face down by a seat when kept or delivered */
  const cards = S.ORDERS.map((o, i) => { const inst = mk({ part: part('order-' + i), back: part('order-' + i + '-back'), flipped: true, shadow: true }); T.dynamic.push(inst); return { i, inst, where: 'deck' }; });
  const CARD = [48, 68];
  const handHome = (c, k) => seatW(c, -64 + k * 30, 58);
  const doneHome = (c, k) => seatW(c, 64 + k * 6, 58 + k * 4);
  /* a farmer stands to the right of the tree's centre, the crow to the left, so two standing pieces on one tree never touch */
  const farmerXY = t => { const [x, y] = treeXY(t); return [x + 9, y + 9]; };
  const crowXY = t => { const [x, y] = treeXY(t); return [x - 10, y - 9]; };
  /* a fruit in its pocket: the basket tray's pockets (META.trays) in the seat's frame, on the tray's back */
  const TRAY = need(need(META, 'trays', 'META'), 'basket-red', 'META.trays');
  const basketXY = (c, j) => { const q = TRAY.pockets[j]; const [x, y] = seatW(c, q.x, q.y); return [x, y, STOCK_T(TRAY.back), seatDeg(c)]; };

  /* ------------------------------------------------------------ the assemblies and views the parts list offers */
  addAsm('asm-barn', 'Assemblies', 'The scarecrow in the barn', 'Two halves cross-lap at mid-height and stand in the + hole in the barn tile, held by its four leaf springs. Explode lifts the halves apart.', 'scarecrow-a',
    () => { const L = [exFor(mk({ part: part('barn'), x: 0, y: 0, z: 0 }))]; const pr = standingPair('scarecrow-a', 'scarecrow-b', 0, 0, 0, 'barn'); exFor(pr[0], [0, 0, 50]); exFor(pr[1], [0, 0, 100]); return L.concat(pr); }, { pitch: 66, yaw: 28, frame: 'assembled' });
  addAsm('view-orchard', 'Views', 'A corner of the orchard', 'Four trees with a farmer picking and the crow watching.', 'tile-apple',
    () => { const L = []; [['apple', 0, 0], ['pear', PITCH, 0], ['plum', 0, PITCH], ['cherry', PITCH, PITCH]].forEach(([f, x, y]) => L.push(mk({ part: part('tile-' + f), x, y, z: 0 }))); standee(L, 'base-red', 'farmer-red', 9, 9, 3, 30); standee(L, 'base-crow', 'crow', PITCH - 10, PITCH - 9, 3, -20); return L.map(i => exFor(i)); }, { pitch: 55, yaw: 15 });
  const partName = id => null;
  const groups = [
    ['Trees and the barn', FRUIT.map(f => 'tile-' + f).concat(['barn'])],
    ['Standing pieces', S.PLAYERS.map(p => 'farmer-' + p.key).concat(['crow', 'scarecrow-a', 'scarecrow-b'])],
    ['Bases, baskets and tokens', S.PLAYERS.map(p => 'base-' + p.key).concat(['base-crow'], S.PLAYERS.flatMap(p => ['basket-' + p.key, 'basket-' + p.key + '-frame']), FRUIT.map(f => 'token-' + f))],
    ['Order cards', S.ORDERS.map((o, i) => 'order-' + i)],
  ];

  const SAY = { pick: ['Lovely.', 'Into the basket.', 'Ripe, that one.'], deliver: ['Order up!', 'That is the one I wanted.', 'Paid in fruit.'], crow: ['Shoo!', 'Not my tree, please.', 'Off you go, bird.'], full: ['Basket is full.', 'No room left.'], drop: ['I will leave this one.'] };
  const fruitName = k => S.FRUITS.find(f => f.key === k).name;

  /* ------------------------------------------------------------ setting the table (initTable) and the moves (animateEvents, one visible motion per event) */
  function initTable(g) {
    const used = {}; for (const f of FRUIT) used[f] = 0;
    for (let t = 0; t < S.SIZE * S.SIZE; t++) { const f = g.trees[t], inst = tiles[f][used[f]++]; tileAt[t] = inst; const [x, y] = treeXY(t); Object.assign(inst, { x, y, z: 0, rot: 0, hidden: false }); }
    tokens.forEach(tk => { Object.assign(tk.inst, { x: tk.home[0], y: tk.home[1], z: tk.home[2], rot: 0 }); tk.where = 'supply'; });
    for (let c = 0; c < NP; c++) { const [x, y] = farmerXY(g.farmers[c]); placeStandee(farmers[c], x, y, 3, 30); }
    for (let c = g.players; c < NP; c++) { const [x, y] = seatW(c, 0, 58); placeStandee(farmers[c], x, y, 0, seatDeg(c)); }   /* seats not playing keep their farmer by their board */
    { const [x, y] = crowXY(g.crow); placeStandee(crow, x, y, 3, -20); }
    cards.forEach(cd => { cd.where = 'deck'; cd.inst.flipped = true; cd.inst.hidden = false; });
    g.hand.forEach((h, c) => h.forEach((oi, k) => { const cd = cards[oi]; cd.where = 'hand'; const [x, y] = handHome(c, k); setPose(cd.inst, [CARD[0] / 2, CARD[1] / 2], x, y, k * STOCK_T('t15'), seatDeg(c)); }));   /* a fan: each card a step along and one thickness up */
    g.market.forEach((oi, k) => { const cd = cards[oi]; cd.where = 'market'; cd.inst.flipped = false; const [x, y] = MARKET(k); setPose(cd.inst, [CARD[0] / 2, CARD[1] / 2], x, y, 0, 0); });
    g.deck.forEach((oi, k) => { const cd = cards[oi]; cd.where = 'deck'; setPose(cd.inst, [CARD[0] / 2, CARD[1] / 2], DECK[0], DECK[1], k * STOCK_T('t15'), 0); });
    g.done.forEach((d, c) => d.forEach((oi, k) => { const cd = cards[oi]; cd.where = 'done'; const [x, y] = doneHome(c, k); setPose(cd.inst, [CARD[0] / 2, CARD[1] / 2], x, y, k * STOCK_T('t15'), seatDeg(c)); }));
    basketTok = [0, 1, 2, 3].map(() => []);
    api.markDirty();
  }
  let basketTok = [[], [], [], []];
  const supplyToken = type => { const t = tokens.find(t => t.where === 'supply' && t.type === type); if (!t) throw new Error(`no ${type} token left in the lid for the engine's move`); return t; };
  async function flyToken(tok, dest, my, h = 60, ms = 650) { const a = [tok.inst.x, tok.inst.y, tok.inst.z]; const r0 = tok.inst.rot || 0; await tween(ms, u => { const p = arc(a, dest, u, h); tok.inst.x = p[0]; tok.inst.y = p[1]; tok.inst.z = p[2]; tok.inst.rot = r0 + ((dest[3] || 0) - r0) * u; }, my); }
  async function walk(c, to, my) { const P = farmers[c], a = [P.base.x, P.base.y, P.base.z], [x, y] = farmerXY(to); await tween(900, u => { const p = arc(a, [x, y, 3], u, 40); placeStandee(P, p[0], p[1], p[2]); P.fig.z += Math.abs(Math.sin(u * 12)) * 1.5 * Math.sin(Math.PI * u); }, my); }
  async function flyCard(cd, dest, deg, flip, my) { const a = [cd.inst.x, cd.inst.y, cd.inst.z], r0 = cd.inst.rot || 0; const [tx, ty] = rotXY(deg, CARD[0] / 2, CARD[1] / 2); await tween(700, u => { const p = arc(a, [dest[0] - tx, dest[1] - ty, dest[2]], u, 40); cd.inst.x = p[0]; cd.inst.y = p[1]; cd.inst.z = p[2]; cd.inst.rot = r0 + (deg - r0) * u; if (flip !== undefined && u > 0.5) cd.inst.flipped = flip; }, my); }
  async function animateEvents(evs, my) {
    for (const e of evs) {
      assertLegal(e);
      if (e.type === 'move') {
        log(`${dot(e.c)}<b>${NAMES[e.c]}</b> walks to the ${fruitName(G.trees[e.to])} tree.`); api.focus.cell = e.to;
        await walk(e.c, e.to, my);
      } else if (e.type === 'pass') { log(`${dot(e.c)}${NAMES[e.c]} cannot move.`, 'sys'); }
      else if (e.type === 'pick') {
        log(`${dot(e.c)}<b>${NAMES[e.c]}</b> picks a ${fruitName(e.fruit)}${e.full ? ' and the basket is full' : ''}.`);
        const tok = supplyToken(e.fruit); tok.where = 'basket'; const j = basketTok[e.c].length; basketTok[e.c].push(tok); await flyToken(tok, basketXY(e.c, j), my);
        if (qr() < .3) say(e.c, pick(e.full ? SAY.full : SAY.pick));
      } else if (e.type === 'drop') {
        log(`${dot(e.c)}${NAMES[e.c]} puts a ${fruitName(e.fruit)} back.`, 'sys');
        const j = basketTok[e.c].findIndex(t => t.type === e.fruit); const tok = basketTok[e.c].splice(j, 1)[0]; tok.where = 'supply'; await flyToken(tok, tok.home, my);
        for (let k = 0; k < basketTok[e.c].length; k++) { const p = basketXY(e.c, k), t = basketTok[e.c][k]; Object.assign(t.inst, { x: p[0], y: p[1], z: p[2], rot: p[3] }); }
        if (qr() < .5) say(e.c, pick(SAY.drop));
      } else if (e.type === 'deliver') {
        const o = S.ORDERS[e.order]; log(`${dot(e.c)}<b>${NAMES[e.c]}</b> delivers <b>${o.name}</b> for ${e.pts} points${e.from === 'hand' ? ' (a secret order)' : ''}.`);
        for (const k of e.gave) { const j = basketTok[e.c].findIndex(t => t.type === k); const tok = basketTok[e.c].splice(j, 1)[0]; tok.where = 'supply'; await flyToken(tok, tok.home, my, 70, 500); }
        for (let k = 0; k < basketTok[e.c].length; k++) { const p = basketXY(e.c, k), t = basketTok[e.c][k]; Object.assign(t.inst, { x: p[0], y: p[1], z: p[2], rot: p[3] }); }
        const cd = cards[e.order], n = G.done[e.c].indexOf(e.order); const [x, y] = doneHome(e.c, n); cd.where = 'done'; await flyCard(cd, [x, y, n * STOCK_T('t15')], seatDeg(e.c), false, my);
        /* the gap closes: each card still at the market, or still in that hand, slides to its new slot */
        const slides = [];
        for (const o of cards) {
          let to = null;
          if (e.from === 'market' && o.where === 'market') { const k = G.market.indexOf(o.i); if (k < 0) throw new Error(`card ${o.i} is shown at the market and the engine has it elsewhere`); const [mx, my_] = MARKET(k); to = [mx - CARD[0] / 2, my_ - CARD[1] / 2]; }
          if (e.from === 'hand' && o.where === 'hand' && G.hand[e.c].includes(o.i)) { const [hx, hy] = handHome(e.c, G.hand[e.c].indexOf(o.i)), [tx, ty] = rotXY(seatDeg(e.c), CARD[0] / 2, CARD[1] / 2); to = [hx - tx, hy - ty, G.hand[e.c].indexOf(o.i) * STOCK_T('t15')]; }
          if (!to) continue;
          const a = [o.inst.x, o.inst.y, o.inst.z]; slides.push(u => { o.inst.x = a[0] + (to[0] - a[0]) * ez(u); o.inst.y = a[1] + (to[1] - a[1]) * ez(u); if (to[2] !== undefined) o.inst.z = a[2] + (to[2] - a[2]) * ez(u); });
        }
        if (slides.length) await tween(500, u => slides.forEach(f => f(u)), my);
        if (qr() < .6) say(e.c, pick(SAY.deliver));
      } else if (e.type === 'market') {
        const cd = cards[e.order], k = G.market.indexOf(e.order); log(`${S.ORDERS[e.order].name} comes up at the market.`, 'sys');
        const [x, y] = MARKET(k); cd.where = 'market'; await flyCard(cd, [x, y, 0], 0, false, my);
        G.deck.forEach((oi, j) => { setPose(cards[oi].inst, [CARD[0] / 2, CARD[1] / 2], DECK[0], DECK[1], j * STOCK_T('t15'), 0); });
      } else if (e.type === 'crow') {
        log(`${dot(e.c)}${NAMES[e.c]} rolls ${e.roll}: the <b>crow</b> flies to the ${fruitName(G.trees[e.to])} tree.`, 'sys'); api.focus.cell = e.to;
        const a = [crow.base.x, crow.base.y, crow.base.z], [x, y] = crowXY(e.to); await tween(1000, u => { const p = arc(a, [x, y, 3], u, 90); placeStandee(crow, p[0], p[1], p[2]); }, my);
        for (let c = 0; c < G.players; c++) if (G.farmers[c] === e.to && qr() < .6) say(c, pick(SAY.crow));
      } else if (e.type === 'trigger') { log(e.reason === 'orders' ? `${dot(e.c)}<b>${NAMES[e.c]}</b> has delivered ${G.rules.ordersToEnd} orders: the round is the last.` : 'A fruit has run out: the round is the last.', 'round'); }
      else if (e.type === 'end') { }
      else throw new Error('the table cannot draw the event ' + e.type);
      noteShown(e);
      await wait(240, my);
    }
    api.focus.cell = null;
  }
  async function finale(my) {
    const { scores, winner } = G.final();
    log('The season is over', 'round');
    for (let c = 0; c < G.players; c++) {
      for (let k = 0; k < G.done[c].length; k++) { const cd = cards[G.done[c][k]]; const z0 = cd.inst.z; await tween(350, u => { cd.inst.z = z0 + 30 * ez(u); }, my); cd.inst.flipped = false; await tween(350, u => { cd.inst.z = z0 + 30 * (1 - ez(u)); }, my); }
      log(`${dot(c)}<b>${NAMES[c]}</b>: ${G.done[c].map(oi => S.ORDERS[oi].name).join(', ') || 'no orders'}. <b>${scores[c].total}</b>`, 'end');
      await wait(600, my);
    }
    log(`${dot(winner)}<b>${NAMES[winner]} wins with ${scores[winner].total}.</b>`, 'end');
    document.querySelectorAll('#chips .chip').forEach((el, c) => { el.querySelector('b').textContent = scores[c] ? scores[c].total : ''; if (c === winner) el.classList.add('turn'); });
  }

  /* ------------------------------------------------------------ assertLegal, noteShown, syncBoard, setBoardFromState (the QA contract) */
  let shown = null;
  function resetShown(g) { G = g; qr = api.qr; shown = { farmers: g.farmers.slice(), crow: g.crow, baskets: g.baskets.map(b => b.length) }; }
  function syncShown(g) { shown = { farmers: g.farmers.slice(), crow: g.crow, baskets: g.baskets.map(b => b.length) }; }
  function assertLegal(e) {
    const bad = why => api.illegal(e, why);
    if (e.type === 'move') {
      const from = shown.farmers[e.c], [fx, fy] = S.XY(from), [tx, ty] = S.XY(e.to), d = Math.abs(fx - tx) + Math.abs(fy - ty);
      if (from !== e.from) bad(`the farmer is shown on ${from}, and the engine walks it from ${e.from}`);
      else if (d < 1 || d > G.rules.moves) bad(`${d} steps is not 1 to ${G.rules.moves}`);
      else if (shown.farmers.some((t, c) => c !== e.c && t === e.to)) bad('another farmer stands there');
    } else if (e.type === 'pick') {
      if (shown.crow === shown.farmers[e.c]) bad('the crow is on that tree');
      else if (shown.baskets[e.c] >= G.rules.basket) bad('the basket shown is full');
      else if (G.trees[shown.farmers[e.c]] !== e.fruit) bad(`the tree shown grows ${G.trees[shown.farmers[e.c]]}, the engine picks ${e.fruit}`);
    } else if (e.type === 'deliver') {
      if (basketTok[e.c].length < e.gave.length) bad('the basket shown has too few fruit');
    }
  }
  function noteShown(e) {
    if (e.type === 'move') shown.farmers[e.c] = e.to; else if (e.type === 'crow') shown.crow = e.to;
    else if (e.type === 'pick') shown.baskets[e.c]++; else if (e.type === 'drop') shown.baskets[e.c]--; else if (e.type === 'deliver') shown.baskets[e.c] -= e.gave.length;
  }
  /** where every moving piece belongs for the engine's state G, using the pieces the animation assigned: [[inst, x, y, z, rot, rotation period], ...] */
  function syncBoard() {
    const out = [], FAR = 1e4;
    for (let t = 0; t < S.SIZE * S.SIZE; t++) { const [x, y] = treeXY(t); out.push([tileAt[t], x, y, 0, 0, 90]); }
    for (let c = 0; c < NP; c++) {
      const P = farmers[c]; let x, y, z, rot;
      if (c < G.players) { [x, y] = farmerXY(G.farmers[c]); z = 3; rot = 30; } else { [x, y] = seatW(c, 0, 58); z = 0; rot = seatDeg(c); }
      out.push([P.base, x, y, z, rot], [P.fig, x, y, z + P.base.thick, rot]);
      if (c < G.players) { if (basketTok[c].length !== G.baskets[c].length) out.push([P.base, FAR, FAR, 0]); basketTok[c].forEach((tok, j) => { const p = basketXY(c, j); out.push([tok.inst, p[0], p[1], p[2], p[3], 360]); }); }
    }
    { const [x, y] = crowXY(G.crow); out.push([crow.base, x, y, 3], [crow.fig, x, y, 3 + crow.base.thick]); }
    tokens.forEach(t => { if (t.where === 'supply') out.push([t.inst, t.home[0], t.home[1], t.home[2], 0, 360]); });
    G.market.forEach((oi, k) => { const [x, y] = MARKET(k), [tx, ty] = rotXY(0, CARD[0] / 2, CARD[1] / 2); out.push([cards[oi].inst, x - tx, y - ty, 0, 0]); });
    G.deck.forEach((oi, k) => { out.push([cards[oi].inst, DECK[0] - CARD[0] / 2, DECK[1] - CARD[1] / 2, k * STOCK_T('t15'), 0]); });
    G.done.forEach((d, c) => d.forEach((oi, k) => { const [x, y] = doneHome(c, k), [tx, ty] = rotXY(seatDeg(c), CARD[0] / 2, CARD[1] / 2); out.push([cards[oi].inst, x - tx, y - ty, k * STOCK_T('t15'), seatDeg(c)]); }));
    G.hand.forEach((h, c) => h.forEach((oi, k) => { const [x, y] = handHome(c, k), [tx, ty] = rotXY(seatDeg(c), CARD[0] / 2, CARD[1] / 2); out.push([cards[oi].inst, x - tx, y - ty, k * STOCK_T('t15'), seatDeg(c)]); }));
    return out;
  }
  /** every piece where the engine's state g puts it, assigned fresh (no animation): the mid-game scene the fit checker samples */
  function setBoardFromState(g) {
    initTable(g);
    for (let c = 0; c < g.players; c++) { const [x, y] = farmerXY(g.farmers[c]); placeStandee(farmers[c], x, y, 3, 30); g.baskets[c].forEach((type, j) => { const tok = supplyToken(type); tok.where = 'basket'; basketTok[c].push(tok); const p = basketXY(c, j); Object.assign(tok.inst, { x: p[0], y: p[1], z: p[2], rot: p[3] }); }); }
    { const [x, y] = crowXY(g.crow); placeStandee(crow, x, y, 3, -20); }
  }
  async function clearTable(my) {
    const moves = [];
    tokens.forEach(t => { const a = [t.inst.x, t.inst.y, t.inst.z]; moves.push(u => { const p = arc(a, t.home, u, 60); t.inst.x = p[0]; t.inst.y = p[1]; t.inst.z = p[2]; }); });
    cards.forEach((cd, k) => { const a = [cd.inst.x, cd.inst.y, cd.inst.z]; moves.push(u => { const p = arc(a, [DECK[0] - CARD[0] / 2, DECK[1] - CARD[1] / 2, k * STOCK_T('t15')], u, 50); cd.inst.x = p[0]; cd.inst.y = p[1]; cd.inst.z = p[2]; cd.inst.rot = (cd.inst.rot || 0) * (1 - u); if (u > 0.5) cd.inst.flipped = true; }); });
    await tween(1600, u => moves.forEach(f => f(u)), my);
  }

  const gameLine = g => `<b>Game ${g.seed}.</b> ${[...Array(g.players).keys()].map(c => `${dot(c)}${NAMES[c]} (${players[c].title})`).join(', ')}. Each keeps ${g.rules.handSize} secret orders.`;
  const roundLine = g => `Round ${g.round + 1}`;
  const chipTitle = (g, c) => `${players[c].title}: ${g.done[c].length} orders delivered, ${g.baskets[c].length} fruit in the basket`;
  const overlay = (ctx, cell) => { if (cell === null) return; const [x, y] = treeXY(cell); api.scene.ring(ctx, x, y, 3.4, TILE * 0.62, 'rgba(240,190,70,.95)', 3); };
  const qa = () => ({ tokensOnBoard: tokens.filter(t => t.where !== 'supply').length });

  return { NP, players, T, BOXO, LIDO, BOXA, LIDA, initTable, setBoardFromState, animateEvents, assertLegal, noteShown, resetShown, syncShown, syncBoard, finale, clearTable,
    gameLine, roundLine, chipTitle, overlay, qa, partName, groups, defaultPart: 'asm-farmer-red' };
}
