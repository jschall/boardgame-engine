#!/usr/bin/env node
/* balance.js: self-play numbers for any game engine that follows the sim contract, judged against the engine's balance targets, with an optional
   grid search over rule tunables. The engine decides; the owner is never asked to pick numbers ("you make the decisions on gameplay").

   Usage:  node balance.js <slug>-sim.js [--games 400] [--players 2,3,4] [--rounds 6:9] [--seat 0.06] [--goals 0.2:0.7]
                                         [--tune key=lo:hi:step ...] [--out balance.json]

   The sim contract (engine/README.md; BUMBLE's bumble-sim.js and the starter's sim are the worked examples): the module exports
     RULES                       every tunable number, with the defaults
     playGame(seed, players, {rules}) -> a finished Game whose .round is the rounds played, .log the events, and .final() -> {scores, winner}
       where scores[i].total is the player's score and, if the game has hidden goals, scores[i].goals = {met, total} or scores[i].wishes = [{met}]
   {rules} are RULES overrides (BUMBLE: opts.rules).

   Targets (SKILL.md phase 3): seat-win rates within `seat` of even at every player count; rounds within the `rounds` window at four players;
   goals met between the `goals` bounds; no seed that fails to end. Exit 1 when a target is missed (so the chain stops), 0 when all pass.
   --tune sweeps the given tunables (a grid, every combination) and prints the best setting by a plain score: the sum of the seat spread,
   the rounds deviation and the goals deviation; it changes nothing (write the winner into RULES yourself, with the numbers in design.md). */
'use strict';
const fs = require('fs'), path = require('path');
const a = process.argv.slice(2);
const opt = (k, d) => { const i = a.indexOf(k); if (i < 0) return d; const v = a[i + 1]; a.splice(i, 2); return v; };
const tunes = []; for (let i; (i = a.indexOf('--tune')) >= 0;) { const [key, r] = a[i + 1].split('='); const [lo, hi, step] = r.split(':').map(Number); tunes.push({ key, lo, hi, step }); a.splice(i, 2); }
const GAMES = +opt('--games', 400), PLAYERS = opt('--players', '2,3,4').split(',').map(Number), [R0, R1] = opt('--rounds', '6:9').split(':').map(Number);
const SEAT = +opt('--seat', 0.06), [G0, G1] = opt('--goals', '0.2:0.7').split(':').map(Number), OUT = opt('--out', null);
const file = a[0]; if (!file) { console.error('usage: node balance.js <slug>-sim.js [options]'); process.exit(2); }
const S = require(path.resolve(file));
for (const k of ['RULES', 'playGame']) if (!(k in S)) throw new Error(`${file} does not export ${k}: follow the sim contract in engine/README.md`);

function measure(players, opts) {
  const wins = Array(players).fill(0); let rounds = 0, ties = 0, goalsMet = 0, goalsAll = 0, turns = 0;
  for (let i = 0; i < GAMES; i++) {
    const g = S.playGame(1000 + i, players, Object.keys(opts).length ? { rules: opts } : {}); if (!g.over) throw new Error(`seed ${1000 + i}, ${players} players: the game did not end`);
    const { scores, winner } = g.final(); rounds += g.round; turns += g.log.length;
    if (winner < 0) ties++; else wins[winner]++;
    for (const s of scores) { if (s.goals) { goalsMet += s.goals.met; goalsAll += s.goals.total; } else if (Array.isArray(s.wishes)) { goalsMet += s.wishes.filter(w => w.met).length; goalsAll += s.wishes.length; } }
  }
  return { players, games: GAMES, seatWins: wins.map(w => +(w / GAMES).toFixed(3)), ties: +(ties / GAMES).toFixed(3), rounds: +(rounds / GAMES).toFixed(2), events: Math.round(turns / GAMES), goals: goalsAll ? +(goalsMet / goalsAll).toFixed(3) : null };
}
function judge(rows) {
  const problems = [];
  for (const r of rows) {
    const even = 1 / r.players, spread = Math.max(...r.seatWins.map(w => Math.abs(w - even)));
    if (spread > SEAT) problems.push(`${r.players} players: seat wins ${r.seatWins.join(' / ')} (a seat is ${(spread * 100).toFixed(1)} points from even; allowed ${SEAT * 100})`);
    if (r.players === 4 && (r.rounds < R0 || r.rounds > R1)) problems.push(`4 players: ${r.rounds} rounds on average, wanted ${R0} to ${R1}`);
    if (r.goals !== null && (r.goals < G0 || r.goals > G1)) problems.push(`${r.players} players: goals met ${(r.goals * 100).toFixed(0)} %, wanted ${G0 * 100} to ${G1 * 100}`);
  }
  return problems;
}
const score = rows => rows.reduce((s, r) => s + Math.max(...r.seatWins.map(w => Math.abs(w - 1 / r.players))) + (r.players === 4 ? Math.max(0, R0 - r.rounds, r.rounds - R1) / 10 : 0) + (r.goals === null ? 0 : Math.max(0, G0 - r.goals, r.goals - G1)), 0);

const t0 = Date.now();
const base = PLAYERS.map(p => measure(p, {}));
console.log(`${file}: ${GAMES} games per player count in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
for (const r of base) console.log(`  ${r.players} players: seat wins ${r.seatWins.join(' / ')}, ties ${r.ties}, ${r.rounds} rounds, ${r.events} events${r.goals === null ? '' : `, goals met ${(r.goals * 100).toFixed(0)} %`}`);
const problems = judge(base);
let best = null;
if (tunes.length) {
  const grids = tunes.map(t => { const v = []; for (let x = t.lo; x <= t.hi + 1e-9; x += t.step) v.push(+x.toFixed(6)); return v; });
  const combos = grids.reduce((acc, g, i) => acc.flatMap(c => g.map(v => Object.assign({}, c, { [tunes[i].key]: v }))), [{}]);
  console.log(`tuning ${tunes.map(t => t.key).join(', ')}: ${combos.length} settings`);
  for (const c of combos) { const rows = PLAYERS.map(p => measure(p, c)); const s = score(rows); if (!best || s < best.score) best = { opts: c, score: s, rows }; }
  console.log(`best: ${JSON.stringify(best.opts)} (score ${best.score.toFixed(3)}; the current rules score ${score(base).toFixed(3)})`);
  for (const r of best.rows) console.log(`  ${r.players} players: seat wins ${r.seatWins.join(' / ')}, ${r.rounds} rounds${r.goals === null ? '' : `, goals ${(r.goals * 100).toFixed(0)} %`}`);
}
if (OUT) fs.writeFileSync(OUT, JSON.stringify({ file, games: GAMES, targets: { rounds: [R0, R1], seat: SEAT, goals: [G0, G1] }, base, problems, best }, null, 1));
if (problems.length) { console.log('BALANCE PROBLEMS:\n  ' + problems.join('\n  ')); process.exit(1); }
console.log('BALANCE OK');
