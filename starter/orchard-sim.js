/* ORCHARD: the rules engine and a greedy AI, one source of truth for the rules. The page animates its event log, stats.js and balance.js measure
   it, verify.js replays it. UMD: node and the browser share it (global OrchardSim; build.js finds the global's name in this header).

   THE SIM CONTRACT (engine/README.md): the engine's page, packer, stats and balance rely on exactly this
     RULES                              every tunable number, with its default
     new Game({ players, seed, rules })  a game set up and ready; .players, .seed, .round, .turn, .current, .over, .log
     playTurn(game, rnd)                plays the current player's whole turn: it appends events to game.log, each one visible thing that
                                        happens on the table ({ type, c: player, ...data }); the page animates exactly these
     game.score(c) -> { total, ... }    the player's score as the table shows it now
     game.final() -> { scores: [{ total, goals: { met, total } }], winner (index, or -1 for a tie) }
     game.check()                       throws on a broken invariant (a piece in two places, a supply below zero)
     playGame(seed, players, { rules }) -> a finished Game;  mulberry(seed) -> a random function;  names { title, players: [{ name, colour, key }] }
     drama(game) -> number              optional: how good a showcase this game is (the most dramatic seed is the one the page plays first)
     strategies { name: (game, rnd) }   the design gates' players (balance.js --gates): dumb players that ignore one rule each, blind, obvious
     archetypes { name: (game, rnd) }   two or three full-strength styles that lean one way; each must be live and each must have an answer */
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.OrchardSim = factory(); }(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const shuffle = (a, rnd) => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };

  const FRUITS = [{ key: 'apple', name: 'apple', plural: 'apples' }, { key: 'pear', name: 'pear', plural: 'pears' }, { key: 'plum', name: 'plum', plural: 'plums' }, { key: 'cherry', name: 'cherry', plural: 'cherries' }];
  const PLAYERS = [{ name: 'Ada', colour: '#c8443a', key: 'red', title: 'the red farmer' }, { name: 'Ben', colour: '#3d7ac7', key: 'blue', title: 'the blue farmer' }, { name: 'Cleo', colour: '#d9a520', key: 'yellow', title: 'the yellow farmer' }, { name: 'Dev', colour: '#3f8f4a', key: 'green', title: 'the green farmer' }];
  const SIZE = 4;   // the orchard is SIZE x SIZE trees
  /** the twelve orders: the fruit each needs and its points (two fruit 3, three fruit 7, all four 11: the big orders pay for the turns they take, so
      building for them is a live path against racing the cheap ones). Every player keeps two hidden; three more lie face up at the market. */
  const ORDERS = [
    { key: 'o0', name: 'Apple pie', needs: ['apple', 'apple'], pts: 3 }, { key: 'o1', name: 'Pear tart', needs: ['pear', 'pear'], pts: 3 },
    { key: 'o2', name: 'Plum jam', needs: ['plum', 'plum'], pts: 3 }, { key: 'o3', name: 'Cherry crumble', needs: ['cherry', 'cherry'], pts: 3 },
    { key: 'o4', name: 'Fruit salad', needs: ['apple', 'pear', 'plum'], pts: 7 }, { key: 'o5', name: 'Summer bowl', needs: ['pear', 'plum', 'cherry'], pts: 7 },
    { key: 'o6', name: 'Cider press', needs: ['apple', 'apple', 'pear'], pts: 7 }, { key: 'o7', name: 'Cherry brandy', needs: ['cherry', 'cherry', 'plum'], pts: 7 },
    { key: 'o8', name: 'Market basket', needs: ['apple', 'cherry'], pts: 3 }, { key: 'o9', name: 'Picnic', needs: ['pear', 'cherry'], pts: 3 },
    { key: 'o10', name: 'Harvest festival', needs: ['apple', 'pear', 'plum', 'cherry'], pts: 11 }, { key: 'o11', name: 'Plum pudding', needs: ['plum', 'plum', 'apple'], pts: 7 },
  ];
  /* crowMoves: after a turn the player flies the crow 1 to crowMoves trees along its path (chosen, never rolled: the crow is the players' way at
     each other); unfilled: what a secret order still in the hand costs at the end, as a multiple of its points (the private hope has a price) */
  const RULES = { tokensPerKind: 10, basket: 4, moves: 2, handSize: 2, market: 3, ordersToEnd: 3, crowMoves: 3, crowSteals: 1, crowStart: 8, unfilled: 1, rounds: 12 };
  /** the crow's path: a snake over the trees, row by row */
  const PATH = []; for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) PATH.push(y * SIZE + (y % 2 ? SIZE - 1 - x : x));
  const XY = i => [i % SIZE, Math.floor(i / SIZE)];
  const neighbours = i => { const [x, y] = XY(i), out = []; if (x > 0) out.push(i - 1); if (x < SIZE - 1) out.push(i + 1); if (y > 0) out.push(i - SIZE); if (y < SIZE - 1) out.push(i + SIZE); return out; };
  const CORNERS = [0, SIZE * SIZE - 1, SIZE - 1, SIZE * (SIZE - 1)];   // where the farmers start, seat by seat

  class Game {
    constructor(opts) {
      opts = opts || {};
      this.rules = Object.assign({}, RULES, opts.rules || {});
      this.players = opts.players || 4; if (!(this.players >= 2 && this.players <= 4)) throw new Error('2 to 4 players');
      this.seed = opts.seed || 1; this.rnd = mulberry(this.seed);
      this.round = 0; this.turn = 0; this.current = 0; this.over = false; this.endReason = null; this.endTriggered = null; this.log = [];
      this.setup();
    }
    setup() {
      const kinds = []; for (let n = 0; n < SIZE; n++) for (const f of FRUITS) kinds.push(f.key);
      this.trees = shuffle(kinds, this.rnd);                    // tree i (index y * SIZE + x) grows this fruit
      const seen = {}; this.treeId = this.trees.map(k => { seen[k] = (seen[k] || 0) + 1; return `${k}-${seen[k]}`; });   // which physical tile stands there: tile-<kind>-<n>
      this.farmers = []; for (let p = 0; p < this.players; p++) this.farmers.push(CORNERS[p]);
      this.baskets = []; for (let p = 0; p < this.players; p++) this.baskets.push([]);
      this.supply = {}; for (const f of FRUITS) this.supply[f.key] = this.rules.tokensPerKind;
      const deck = shuffle(ORDERS.map((o, i) => i), this.rnd);
      this.hand = []; for (let p = 0; p < this.players; p++) this.hand.push(deck.splice(0, this.rules.handSize));
      this.hidden = this.hand.map(h => h.slice());
      this.market = deck.splice(0, this.rules.market); this.deck = deck; this.done = []; for (let p = 0; p < this.players; p++) this.done.push([]);
      this.crow = PATH[this.rules.crowStart];
    }
    crowAfter(n) { return PATH[(PATH.indexOf(this.crow) + n) % PATH.length]; }
    /** the trees a farmer may end on: 1 to `moves` orthogonal steps, not through or onto another farmer */
    reach(p) {
      const out = new Set(), start = this.farmers[p], others = new Set(this.farmers.filter((t, q) => q !== p));
      let frontier = [start];
      for (let step = 0; step < this.rules.moves; step++) {
        const next = [];
        for (const t of frontier) for (const n of neighbours(t)) if (!others.has(n) && n !== start && !out.has(n)) { out.add(n); next.push(n); }
        frontier = next;
      }
      return [...out];
    }
    canDeliver(p, oi) { const b = this.baskets[p].slice(); for (const k of ORDERS[oi].needs) { const j = b.indexOf(k); if (j < 0) return false; b.splice(j, 1); } return true; }
    /** the score as the table shows it: delivered orders; at the end each secret order still in the hand costs its points (× rules.unfilled) */
    score(p, atEnd = false) { const done = this.done[p].reduce((a, oi) => a + ORDERS[oi].pts, 0), owed = atEnd ? this.hand[p].reduce((a, oi) => a + ORDERS[oi].pts, 0) * this.rules.unfilled : 0;
      return { total: done - owed, delivered: done, owed, goals: { met: this.done[p].filter(oi => this.hidden[p].includes(oi)).length, total: this.rules.handSize } }; }
    final() { const scores = []; for (let p = 0; p < this.players; p++) scores.push(this.score(p, true)); const best = Math.max(...scores.map(s => s.total)); let w = scores.map((s, i) => s.total === best ? i : -1).filter(i => i >= 0);
      /* ties: the fuller basket, then the seat that acted later in the round (it had the fewer first picks) */
      if (w.length > 1) { const bk = Math.max(...w.map(p => this.baskets[p].length)); w = w.filter(p => this.baskets[p].length === bk); }
      if (w.length > 1) w = [w[w.length - 1]];
      return { scores, winner: w[0] }; }
    check() {
      const seen = new Set(); for (const t of this.farmers) { if (seen.has(t)) throw new Error('two farmers on one tree'); seen.add(t); }
      for (const f of FRUITS) { const out = this.baskets.reduce((a, b) => a + b.filter(k => k === f.key).length, 0); if (this.supply[f.key] < 0 || this.supply[f.key] + out !== this.rules.tokensPerKind) throw new Error(`${f.key} tokens do not add up`); }
      for (let p = 0; p < this.players; p++) if (this.baskets[p].length > this.rules.basket) throw new Error('a basket over its limit');
      const cards = [].concat(...this.hand, this.market, this.deck, ...this.done); if (new Set(cards).size !== ORDERS.length || cards.length !== ORDERS.length) throw new Error('an order card is lost or doubled');
    }
    emit(e) { this.log.push(e); return e; }
  }
  /* ---- the moves, one helper each, shared by the AI, the dumb strategies and the archetypes: every strategy plays through these */
  const haveOf = (g, p) => { const have = {}; for (const k of g.baskets[p]) have[k] = (have[k] || 0) + 1; return have; };
  /** how much each fruit is wanted: every order's points spread over the fruit it still needs, hand orders weighted `hand`, market orders `market` */
  const wantsOf = (g, p, hand = 2, market = 1) => { const want = {}, have = haveOf(g, p);
    const add = (oi, w) => { const o = ORDERS[oi], b = Object.assign({}, have), short = []; for (const k of o.needs) { if (b[k] > 0) b[k]--; else short.push(k); } if (!short.length) return; for (const k of short) want[k] = (want[k] || 0) + w * o.pts / short.length / short.length; };
    for (const oi of g.hand[p]) add(oi, hand); for (const oi of g.market) add(oi, market); return want; };
  /** the fruit an opponent of p is one pick from completing a market order with (public: the market and every basket are face up) */
  function missingFor(g, p) {
    const miss = {};
    for (let q = 0; q < g.players; q++) { if (q === p) continue; for (const oi of g.market) { const b = g.baskets[q].slice(); let short = null, n = 0; for (const k of ORDERS[oi].needs) { const j = b.indexOf(k); if (j >= 0) b.splice(j, 1); else { short = k; n++; } } if (n === 1) miss[short] = (miss[short] || 0) + ORDERS[oi].pts; } }
    return miss;
  }
  function moveTo(g, p, to) { if (to === g.farmers[p]) return; g.emit({ type: 'move', c: p, from: g.farmers[p], to }); g.farmers[p] = to; }
  function pass(g, p) { g.emit({ type: 'pass', c: p }); }
  /** a full basket with nothing to deliver: set down the fruit the orders want least, back into the supply, before picking */
  function dropWorst(g, p, want, have) {
    if (!(g.baskets[p].length >= g.rules.basket) || g.hand[p].concat(g.market).some(oi => g.canDeliver(p, oi))) return;
    let worst = 0, wv = Infinity; g.baskets[p].forEach((kk, j) => { const v = (want[kk] || 0) - (have[kk] || 0); if (v < wv) { wv = v; worst = j; } });
    const kk = g.baskets[p].splice(worst, 1)[0]; g.supply[kk]++; g.emit({ type: 'drop', c: p, fruit: kk });
  }
  function pickHere(g, p) {
    const t = g.farmers[p], k = g.trees[t];
    if (t !== g.crow && g.supply[k] > 0 && g.baskets[p].length < g.rules.basket) { g.supply[k]--; g.baskets[p].push(k); g.emit({ type: 'pick', c: p, tree: t, fruit: k, full: g.baskets[p].length === g.rules.basket }); }
  }
  function deliver(g, p, oi) {
    const o = ORDERS[oi], gave = [];
    for (const kk of o.needs) { const j = g.baskets[p].indexOf(kk); g.baskets[p].splice(j, 1); g.supply[kk]++; gave.push(kk); }
    const hi = g.hand[p].indexOf(oi), mi = g.market.indexOf(oi); if (hi >= 0) g.hand[p].splice(hi, 1); else g.market.splice(mi, 1);
    g.done[p].push(oi); g.emit({ type: 'deliver', c: p, order: oi, from: hi >= 0 ? 'hand' : 'market', gave, pts: o.pts });
    if (mi >= 0 && g.deck.length) { const next = g.deck.shift(); g.market.push(next); g.emit({ type: 'market', c: p, order: next }); }
  }
  /** where the crow can fly: 1 to crowMoves trees on along its path */
  const crowOptions = g => { const out = []; for (let n = 1; n <= g.rules.crowMoves; n++) out.push({ steps: n, to: g.crowAfter(n) }); return out; };
  /** the crow flown `steps` trees on, the end trigger (a third order or an empty fruit; the round is finished so every seat has had the same number of turns) and the next seat */
  function endTurn(g, p, rnd, steps) {
    const R = g.rules; if (!(steps >= 1 && steps <= R.crowMoves)) throw new Error(`the crow flies 1 to ${R.crowMoves} trees`); const to = g.crowAfter(steps); g.emit({ type: 'crow', c: p, steps, from: g.crow, to }); g.crow = to;
    /* the crow scares: a farmer standing on the tree it lands on drops one fruit (the one its orders want least); with crowSteals the crow carries it
       to the farmer who flew it (room in the basket allowing), else it goes back into the supply */
    for (let q = 0; q < g.players; q++) if (g.farmers[q] === to && g.baskets[q].length) {
      const want = wantsOf(g, q, 1 + R.unfilled, 1), have = haveOf(g, q); let worst = 0, wv = Infinity; g.baskets[q].forEach((kk, j) => { const v = (want[kk] || 0) - (have[kk] || 0); if (v < wv) { wv = v; worst = j; } });
      const kk = g.baskets[q].splice(worst, 1)[0];
      if (R.crowSteals && q !== p && g.baskets[p].length < R.basket) { g.baskets[p].push(kk); g.emit({ type: 'steal', c: p, from: q, fruit: kk, full: g.baskets[p].length === R.basket }); }
      else { g.supply[kk]++; g.emit({ type: 'drop', c: q, fruit: kk, scared: true }); }
    }
    const trigger = g.done[p].length >= R.ordersToEnd ? 'orders' : FRUITS.some(f => g.supply[f.key] === 0) ? 'supply' : null;
    if (trigger && !g.endTriggered) { g.endTriggered = trigger; g.emit({ type: 'trigger', c: p, reason: trigger }); }
    const lastSeat = g.current === g.players - 1;
    if (lastSeat && (g.endTriggered || g.round + 1 >= R.rounds)) { g.over = true; g.endReason = g.endTriggered || 'rounds'; g.emit({ type: 'end', c: p, reason: g.endReason }); return; }
    g.turn++; g.current = (g.current + 1) % g.players; if (g.current === 0) g.round++;
  }
  /** the greedy AI, with a style: walk to the reachable tree whose fruit the player's orders want most (and, unless blind, the fruit a rival is one
      pick from a market order with, while that fruit is scarce), pick, deliver the best order it can (a market order a rival could take first),
      roll the crow. style: { hand, market: the weight of a hand or market order's fruit; spite: the denial term; blind: no look at the rivals;
      minPts: deliver nothing worth less until the end is triggered; deny: take the market order a rival is closest to } */
  function turn(g, rnd, style) {
    const p = g.current, R = g.rules, st = Object.assign({ hand: 1 + R.unfilled, market: 1, spite: 0.6, blind: false, minPts: 0, deny: true, noise: 0.05, now: 0.5, plan: true }, style);
    const want = wantsOf(g, p, st.hand, st.market), have = haveOf(g, p), miss = st.blind ? {} : missingFor(g, p);
    /* a tree's worth: the fruit's want, the denial of a scarce fruit a rival is short of, and the risk of the crow reaching it next turn (a rival flies it) */
    /* completing an order this turn is worth the order now (the fruit is paid back and the basket has room again); a fruit no order names is worth nothing */
    const completes = k => { let best = 0; for (const oi of g.hand[p].concat(g.market)) { const b = g.baskets[p].concat([k]); if (ORDERS[oi].needs.every(kk => { const j = b.indexOf(kk); if (j < 0) return false; b.splice(j, 1); return true; })) best = Math.max(best, ORDERS[oi].pts * (g.hand[p].includes(oi) ? st.hand : st.market)); } return best; };
    /* the planner: after picking k at t, each order's points over the turns it still needs (a pick per missing fruit, plus the walking to the nearest
       trees that grow them); the best order's rate is the tree's worth. The first-timer (st.plan false) adds up wants instead */
    const dist = (a, b) => { const [ax, ay] = XY(a), [bx, by] = XY(b); return Math.abs(ax - bx) + Math.abs(ay - by); };
    const nearest = (t, k) => { let d = 99; for (let u = 0; u < SIZE * SIZE; u++) if (g.trees[u] === k && g.supply[k] > 0 && u !== g.crow) d = Math.min(d, dist(t, u)); return d; };
    const rateFrom = (t, k) => { let best = 0; const b0 = g.baskets[p].concat([k]);
      for (const oi of g.hand[p].concat(g.market)) { const b = b0.slice(), need = []; for (const kk of ORDERS[oi].needs) { const j = b.indexOf(kk); if (j >= 0) b.splice(j, 1); else need.push(kk); }
        if (need.length > R.basket - b0.length + need.length) continue; const eff = ORDERS[oi].pts * (g.hand[p].includes(oi) ? st.hand : st.market);
        let walk = 0; for (const kk of need) { const d = nearest(t, kk); if (d > 50) { walk = 99; break; } walk += Math.max(0, d - R.moves) / R.moves; }
        best = Math.max(best, eff / (1 + need.length + walk)); }
      return best; };
    const value = t => { const k = g.trees[t]; if (t === g.crow || g.supply[k] <= 0 || g.baskets[p].length >= R.basket) return 0;
      const own = st.plan ? rateFrom(t, k) : (want[k] || 0) + st.now * completes(k), deny = (miss[k] || 0) * (g.supply[k] <= 2 ? 0.4 : 0.1), risk = st.blind ? 0 : (crowOptions(g).some(o => o.to === t) ? 0.3 * (g.baskets[p].length + 1) : 0);
      return own + st.spite * deny - risk + 0.1 + rnd() * st.noise; };
    const reach = g.reach(p);
    if (reach.length) { let best = reach[0], bv = -1; for (const t of reach) { const v = value(t); if (v > bv) { bv = v; best = t; } } moveTo(g, p, best); } else pass(g, p);
    dropWorst(g, p, want, have); pickHere(g, p);
    const rivalWants = oi => st.deny && !st.blind && g.market.includes(oi) && [...Array(g.players).keys()].some(q => q !== p && ORDERS[oi].needs.filter(k => g.baskets[q].includes(k)).length >= ORDERS[oi].needs.length - 1) ? ORDERS[oi].pts : 0;
    const worth = oi => ORDERS[oi].pts * (g.hand[p].includes(oi) ? st.hand : st.market) + rivalWants(oi) * st.spite;
    const options = g.hand[p].concat(g.market).filter(oi => g.canDeliver(p, oi) && (g.endTriggered || ORDERS[oi].pts >= st.minPts)).sort((a, b) => worth(b) - worth(a));
    if (options.length) deliver(g, p, options[0]);
    endTurn(g, p, rnd, chooseCrow(g, p, st, rnd));
  }
  /** the crow goes where it hurts a rival most: a tree a rival can reach next turn, worth more when that fruit is one the rival is short of for a
      market order, or the tree a rival stands on; never my own tree. Blind: as far as it goes */
  function chooseCrow(g, p, st, rnd) {
    if (st.randomCrow) return 1 + Math.floor(rnd() * g.rules.crowMoves);
    if (st.simpleCrow) { const hit = crowOptions(g).find(o => g.farmers.some((t, q) => q !== p && t === o.to)); return hit ? hit.steps : g.rules.crowMoves; }   /* the first-timer: onto a rival if one is in reach, else as far as it goes */
    if (st.blind) return g.rules.crowMoves;
    const dist = (a, b) => { const [ax, ay] = XY(a), [bx, by] = XY(b); return Math.abs(ax - bx) + Math.abs(ay - by); };
    let best = 1, bv = -Infinity;
    for (const o of crowOptions(g)) {
      const k = g.trees[o.to]; let harm = 0;
      for (let q = 0; q < g.players; q++) { if (q === p) continue; const d = dist(g.farmers[q], o.to);
        const lead = Math.max(0, g.score(q).total - g.score(p).total) * 0.15;   /* the leader is the one to hurt */
        if (d === 0 && g.baskets[q].length) harm += (2 + g.baskets[q].length + (g.rules.crowSteals && g.baskets[p].length < g.rules.basket ? 2 : 0)) * (1 + lead);   /* a scare: the rival drops a fruit, the fuller its basket the better, and the crow brings it to me */
        else if (d <= g.rules.moves && g.supply[k] > 0) { const want = wantsOf(g, q, 1, 1); harm += (0.3 + (want[k] || 0) * 0.3) * (1 + lead); } }   /* a tree the rival could want next turn */
      if (o.to === g.farmers[p]) harm -= 3 + g.baskets[p].length;
      harm += rnd() * st.noise;
      if (harm > bv) { bv = harm; best = o.steps; }
    }
    return best;
  }
  function playTurn(g, rnd) { turn(g, rnd, {}); }
  /* ---- the design gates (engine/checks/balance.js --gates; reference/design-procedure.md): dumb players, the blind and obvious AIs, the archetypes */
  const strategies = {
    /** the full AI with the rivals masked: no denial, no first-take of a contested market order (the opponent-blindness drop) */
    blind: (g, rnd) => turn(g, rnd, { blind: true }),
    /** the first-timer: the nearest tree with a fruit any order of mine names, deliver the first order I can, never look at anyone (the obvious-strategy gap) */
    obvious: (g, rnd) => turn(g, rnd, { hand: 1, market: 1, spite: 0, blind: true, noise: 1.0, simpleCrow: true, now: 0, plan: false }),
    /** the nearest tree with fruit on it, whatever it is; deliver when a delivery happens to be possible (ignores the orders) */
    nearest: (g, rnd) => { const p = g.current; const reach = g.reach(p); const dist = t => { const [ax, ay] = XY(g.farmers[p]), [bx, by] = XY(t); return Math.abs(ax - bx) + Math.abs(ay - by); };
      const ok = reach.filter(t => t !== g.crow && g.supply[g.trees[t]] > 0); if (ok.length) { ok.sort((a, b) => dist(a) - dist(b)); moveTo(g, p, ok[0]); } else pass(g, p);
      dropWorst(g, p, {}, haveOf(g, p)); pickHere(g, p); const o = g.hand[p].concat(g.market).find(oi => g.canDeliver(p, oi)); if (o !== undefined) deliver(g, p, o); endTurn(g, p, rnd, 1 + Math.floor(rnd() * g.rules.crowMoves)); },
    /** a random reachable tree, the AI's deliveries (ignores the board) */
    randomMove: (g, rnd) => { const p = g.current; const reach = g.reach(p); if (reach.length) moveTo(g, p, reach[Math.floor(rnd() * reach.length)]); else pass(g, p);
      const want = wantsOf(g, p), have = haveOf(g, p); dropWorst(g, p, want, have); pickHere(g, p); const os = g.hand[p].concat(g.market).filter(oi => g.canDeliver(p, oi)).sort((a, b) => ORDERS[b].pts - ORDERS[a].pts); if (os.length) deliver(g, p, os[0]); endTurn(g, p, rnd, chooseCrow(g, p, { noise: 0.05 }, rnd)); },
    /** the AI that flies the crow anywhere (ignores the crow) */
    randomCrow: (g, rnd) => turn(g, rnd, { randomCrow: true }),
    /** the AI that never looks at its hidden orders: only the market is wanted (ignores the private hope) */
    ignoreGoals: (g, rnd) => turn(g, rnd, { hand: 0.01, market: 1 }),
    /** the AI that never delivers a market order: the hand only (ignores the shared market) */
    handOnly: (g, rnd) => { const p = g.current; const keep = g.market; g.market = []; const want = wantsOf(g, p, 2, 0), have = haveOf(g, p); g.market = keep;
      const value = t => { const k = g.trees[t]; if (t === g.crow || g.supply[k] <= 0 || g.baskets[p].length >= g.rules.basket) return 0; return Math.max(0, (want[k] || 0) - (have[k] || 0)) + 0.1 + rnd() * 0.05; };
      const reach = g.reach(p); if (reach.length) { let best = reach[0], bv = -1; for (const t of reach) { const v = value(t); if (v > bv) { bv = v; best = t; } } moveTo(g, p, best); } else pass(g, p);
      dropWorst(g, p, want, have); pickHere(g, p); const os = g.hand[p].filter(oi => g.canDeliver(p, oi)).sort((a, b) => ORDERS[b].pts - ORDERS[a].pts); if (os.length) deliver(g, p, os[0]); endTurn(g, p, rnd, chooseCrow(g, p, { noise: 0.05 }, rnd)); },
  };
  const archetypes = {
    /** the racer: cheap orders as fast as they come, mostly from the market, to trigger the end with three deliveries */
    racer: (g, rnd) => turn(g, rnd, { hand: 1 + g.rules.unfilled, market: 2, spite: 0.2, noise: 0.05 }),
    /** the builder: the hand's big orders, nothing under five points until the end is in sight */
    builder: (g, rnd) => turn(g, rnd, { hand: 2 + g.rules.unfilled, market: 0.5, spite: 0.2, minPts: 5 }),
    /** the blocker: denial first, the scarce fruit a rival needs and the market order a rival is closest to */
    blocker: (g, rnd) => turn(g, rnd, { spite: 2.0 }),
  };
  function playGame(seed, players, opts) { const g = new Game({ seed, players, rules: opts && opts.rules }); const rnd = mulberry(seed * 13 + 5); let guard = 0; while (!g.over && guard++ < 5000) playTurn(g, rnd); if (!g.over) throw new Error(`game ${seed} did not end`); g.check(); return g; }
  /** a showcase: a close finish, several deliveries and market refills, a middling length */
  function drama(g) { const f = g.final(), tot = f.scores.map(s => s.total).sort((a, b) => b - a), L = g.log; return -2 * Math.abs((tot[0] - tot[1]) - 1) + 0.5 * Math.min(8, L.filter(e => e.type === 'deliver').length) + 0.3 * L.filter(e => e.type === 'market').length - Math.abs(g.round - 7) - (f.winner < 0 ? 8 : 0); }
  const names = { title: 'ORCHARD', players: PLAYERS };
  return { Game, RULES, FRUITS, PLAYERS, ORDERS, SIZE, PATH, XY, neighbours, CORNERS, crowOptions, mulberry, playTurn, playGame, strategies, archetypes, drama, names };
}));
