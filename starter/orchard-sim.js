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
     drama(game) -> number              optional: how good a showcase this game is (the most dramatic seed is the one the page plays first) */
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.OrchardSim = factory(); }(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const shuffle = (a, rnd) => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };

  const FRUITS = [{ key: 'apple', name: 'apple', plural: 'apples' }, { key: 'pear', name: 'pear', plural: 'pears' }, { key: 'plum', name: 'plum', plural: 'plums' }, { key: 'cherry', name: 'cherry', plural: 'cherries' }];
  const PLAYERS = [{ name: 'Ada', colour: '#c8443a', key: 'red', title: 'the red farmer' }, { name: 'Ben', colour: '#3d7ac7', key: 'blue', title: 'the blue farmer' }, { name: 'Cleo', colour: '#d9a520', key: 'yellow', title: 'the yellow farmer' }, { name: 'Dev', colour: '#3f8f4a', key: 'green', title: 'the green farmer' }];
  const SIZE = 4;   // the orchard is SIZE x SIZE trees
  /** the twelve orders: the fruit each needs and its points. Every player keeps two hidden; three more lie face up at the market. */
  const ORDERS = [
    { key: 'o0', name: 'Apple pie', needs: ['apple', 'apple'], pts: 3 }, { key: 'o1', name: 'Pear tart', needs: ['pear', 'pear'], pts: 3 },
    { key: 'o2', name: 'Plum jam', needs: ['plum', 'plum'], pts: 3 }, { key: 'o3', name: 'Cherry crumble', needs: ['cherry', 'cherry'], pts: 3 },
    { key: 'o4', name: 'Fruit salad', needs: ['apple', 'pear', 'plum'], pts: 5 }, { key: 'o5', name: 'Summer bowl', needs: ['pear', 'plum', 'cherry'], pts: 5 },
    { key: 'o6', name: 'Cider press', needs: ['apple', 'apple', 'pear'], pts: 5 }, { key: 'o7', name: 'Cherry brandy', needs: ['cherry', 'cherry', 'plum'], pts: 5 },
    { key: 'o8', name: 'Market basket', needs: ['apple', 'cherry'], pts: 3 }, { key: 'o9', name: 'Picnic', needs: ['pear', 'cherry'], pts: 3 },
    { key: 'o10', name: 'Harvest festival', needs: ['apple', 'pear', 'plum', 'cherry'], pts: 7 }, { key: 'o11', name: 'Plum pudding', needs: ['plum', 'plum', 'apple'], pts: 5 },
  ];
  const RULES = { tokensPerKind: 10, basket: 4, moves: 2, handSize: 2, market: 3, ordersToEnd: 3, crowDie: 6, rounds: 12 };
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
      this.crow = PATH[Math.floor(SIZE * SIZE / 2)];
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
    score(p) { const total = this.done[p].reduce((a, oi) => a + ORDERS[oi].pts, 0); return { total, goals: { met: this.done[p].filter(oi => this.hidden[p].includes(oi)).length, total: this.rules.handSize } }; }
    final() { const scores = []; for (let p = 0; p < this.players; p++) scores.push(this.score(p)); const best = Math.max(...scores.map(s => s.total)); let w = scores.map((s, i) => s.total === best ? i : -1).filter(i => i >= 0);
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
  /** the greedy AI: walk to the reachable tree whose fruit the player's orders want most, pick, deliver the best order it can, roll the crow */
  function playTurn(g, rnd) {
    const p = g.current, R = g.rules;
    const want = {}; for (const oi of g.hand[p].concat(g.market)) for (const k of ORDERS[oi].needs) want[k] = (want[k] || 0) + (g.hand[p].includes(oi) ? 2 : 1);
    const have = {}; for (const k of g.baskets[p]) have[k] = (have[k] || 0) + 1;
    const value = t => { const k = g.trees[t]; if (t === g.crow || g.supply[k] <= 0 || g.baskets[p].length >= R.basket) return 0; return Math.max(0, (want[k] || 0) - (have[k] || 0)) + 0.1 + rnd() * 0.05; };
    const reach = g.reach(p);
    if (reach.length) { let best = reach[0], bv = -1; for (const t of reach) { const v = value(t); if (v > bv) { bv = v; best = t; } } g.emit({ type: 'move', c: p, from: g.farmers[p], to: best }); g.farmers[p] = best; }
    else g.emit({ type: 'pass', c: p });
    const t = g.farmers[p], k = g.trees[t];
    /* a full basket with nothing to deliver: set down the fruit the orders want least, back into the supply, before picking */
    if (g.baskets[p].length >= R.basket && !g.hand[p].concat(g.market).some(oi => g.canDeliver(p, oi))) {
      let worst = 0, wv = Infinity; g.baskets[p].forEach((kk, j) => { const v = (want[kk] || 0) - (have[kk] || 0); if (v < wv) { wv = v; worst = j; } });
      const kk = g.baskets[p].splice(worst, 1)[0]; g.supply[kk]++; g.emit({ type: 'drop', c: p, fruit: kk });
    }
    if (t !== g.crow && g.supply[k] > 0 && g.baskets[p].length < R.basket) { g.supply[k]--; g.baskets[p].push(k); g.emit({ type: 'pick', c: p, tree: t, fruit: k, full: g.baskets[p].length === R.basket }); }
    const options = g.hand[p].concat(g.market).filter(oi => g.canDeliver(p, oi)).sort((a, b) => ORDERS[b].pts - ORDERS[a].pts || (g.hand[p].includes(b) ? 1 : 0) - (g.hand[p].includes(a) ? 1 : 0));
    if (options.length) {
      const oi = options[0], o = ORDERS[oi], gave = [];
      for (const kk of o.needs) { const j = g.baskets[p].indexOf(kk); g.baskets[p].splice(j, 1); g.supply[kk]++; gave.push(kk); }
      const hi = g.hand[p].indexOf(oi), mi = g.market.indexOf(oi); if (hi >= 0) g.hand[p].splice(hi, 1); else g.market.splice(mi, 1);
      g.done[p].push(oi); g.emit({ type: 'deliver', c: p, order: oi, from: hi >= 0 ? 'hand' : 'market', gave, pts: o.pts });
      if (mi >= 0 && g.deck.length) { const next = g.deck.shift(); g.market.push(next); g.emit({ type: 'market', c: p, order: next }); }
    }
    const roll = 1 + Math.floor(rnd() * R.crowDie), to = g.crowAfter(roll); g.emit({ type: 'crow', c: p, roll, from: g.crow, to }); g.crow = to;
    /* the end is triggered by a third order or an empty fruit; the round is finished so every seat has had the same number of turns */
    const trigger = g.done[p].length >= R.ordersToEnd ? 'orders' : FRUITS.some(f => g.supply[f.key] === 0) ? 'supply' : null;
    if (trigger && !g.endTriggered) { g.endTriggered = trigger; g.emit({ type: 'trigger', c: p, reason: trigger }); }
    const lastSeat = g.current === g.players - 1;
    if (lastSeat && (g.endTriggered || g.round + 1 >= R.rounds)) { g.over = true; g.endReason = g.endTriggered || 'rounds'; g.emit({ type: 'end', c: p, reason: g.endReason }); return; }
    g.turn++; g.current = (g.current + 1) % g.players; if (g.current === 0) g.round++;
  }
  function playGame(seed, players, opts) { const g = new Game({ seed, players, rules: opts && opts.rules }); const rnd = mulberry(seed * 13 + 5); let guard = 0; while (!g.over && guard++ < 5000) playTurn(g, rnd); if (!g.over) throw new Error(`game ${seed} did not end`); g.check(); return g; }
  /** a showcase: a close finish, several deliveries and market refills, a middling length */
  function drama(g) { const f = g.final(), tot = f.scores.map(s => s.total).sort((a, b) => b - a), L = g.log; return -2 * Math.abs((tot[0] - tot[1]) - 1) + 0.5 * Math.min(8, L.filter(e => e.type === 'deliver').length) + 0.3 * L.filter(e => e.type === 'market').length - Math.abs(g.round - 7) - (f.winner < 0 ? 8 : 0); }
  const names = { title: 'ORCHARD', players: PLAYERS };
  return { Game, RULES, FRUITS, PLAYERS, ORDERS, SIZE, PATH, XY, neighbours, CORNERS, mulberry, playTurn, playGame, drama, names };
}));
