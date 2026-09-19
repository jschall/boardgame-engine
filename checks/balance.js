#!/usr/bin/env node
/* SPDX-License-Identifier: MPL-2.0; Copyright (C) 2026 Jonathan Challinger; source: https://github.com/jschall/boardgame-engine
   This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at https://mozilla.org/MPL/2.0/. */
/* balance.js: self-play numbers for any game engine that follows the sim contract, judged against the engine's balance targets, with an optional
   grid search over rule tunables. The engine decides; the owner is never asked to pick numbers ("you make the decisions on gameplay").

   Usage:  node balance.js <slug>-sim.js [--games 400] [--players 2,3,4] [--rounds 6:9] [--seat 0.06] [--goals 0.2:0.7]
                                         [--tune key=lo:hi:step ...] [--dumb] [--gap] [--blind] [--paths] [--gates] [--out balance.json]

   The sim contract (engine/README.md; BUMBLE's bumble-sim.js and the starter's sim are the worked examples): the module exports
     RULES                       every tunable number, with the defaults
     playGame(seed, players, {rules}) -> a finished Game whose .round is the rounds played, .log the events, and .final() -> {scores, winner}
       where scores[i].total is the player's score and, if the game has hidden goals, scores[i].goals = {met, total} or scores[i].wishes = [{met}]
   {rules} are RULES overrides (BUMBLE: opts.rules). For the design gates (reference/design-procedure.md) the sim also exports
     strategies   { name: (g, rnd) => void }  turn functions for the current seat: the dumb players (onePiece, nearest, randomPlacement,
                  ignoreGoals, one per opt-in subsystem), `blind` (the AI with the opponents masked) and `obvious` (the greedy first-timer)
     archetypes   { name: (g, rnd) => void }  two or three full-strength styles that lean one way (racer, builder, blocker)
   setup(g, rnd)  optional: what happens before the first turn (an opening round of placements)
   and its Game has .current and .over, so this harness can give one seat another player and let playTurn play the rest.
   Always reported: the midpoint leader's win rate and the last-round swing (the two feedback-loop numbers).
   --dumb   each strategy but blind/obvious takes one seat in turn at the fewest and the most players; its win rate against fair share (1 / players);
            target under 60 % of fair share at two players and under 70 % at the most, the one-piece strategy near zero
   --gap    `obvious` the same way; target 30 to 60 % of fair share (near zero: unreadable; near one: the decisions do not matter)
   --blind  `blind` the same way; the drop from fair share is the interaction's real weight (over 90 % of fair share: the interaction is fake)
   --paths  each archetype at a mixed table of the AI (50 to 150 % of fair share), and every pair head to head at two players (each must have an
            answer: some other archetype beats it 55 % or better)
   --gates  all four. A gate that misses its target exits 1 like a balance target.

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
const flag = k => { const i = a.indexOf(k); if (i < 0) return false; a.splice(i, 1); return true; };
const GATES = flag('--gates'), DUMB = GATES || flag('--dumb'), GAP = GATES || flag('--gap'), BLIND = GATES || flag('--blind'), PATHS = GATES || flag('--paths');
const file = a[0]; if (!file) { console.error('usage: node balance.js <slug>-sim.js [options]'); process.exit(2); }
const S = require(path.resolve(file));
for (const k of ['RULES', 'playGame']) if (!(k in S)) throw new Error(`${file} does not export ${k}: follow the sim contract in engine/README.md`);

/* one game, turn by turn: seats in `seats` play their own strategy, the rest the sim's AI. `watch` sees the game at the start of every turn
   (for the midpoint leader and the last-round swing). Without strategies or a watcher the sim's own playGame runs (BUMBLE's has an opening). */
const leader = (g, n) => { let best = -1, who = -1, tie = false; for (let c = 0; c < n; c++) { const t = g.score(c).total; if (t > best) { best = t; who = c; tie = false; } else if (t === best) tie = true; } return tie ? -1 : who; };
function play(seed, players, opts, seats = {}, watch = null) {
  const rules = Object.keys(opts).length ? { rules: opts } : {};
  if (!Object.keys(seats).length && !watch) return S.playGame(seed, players, rules);
  if (!S.Game) throw new Error('the sim does not export Game: the gates need new Game({ players, seed, rules }), .current and .over (engine/README.md)');
  const g = new S.Game({ seed, players, rules: rules.rules }), rnd = S.mulberry(seed * 13 + 5); let guard = 0;
  if (S.setup) S.setup(g, rnd);   /* the opening before the first turn (BUMBLE's opening plants) */
  while (!g.over && guard++ < 5000) { if (watch) watch(g); (seats[g.current] || S.playTurn)(g, rnd); }
  if (!g.over) throw new Error(`seed ${seed}, ${players} players: the game did not end (a loop or a stalemate)`);
  if (g.check) g.check(); return g;
}
function measure(players, opts) {
  const wins = Array(players).fill(0); let rounds = 0, ties = 0, goalsMet = 0, goalsAll = 0, turns = 0, midWins = 0, midLed = 0, swings = 0, lastLed = 0;
  const MID = Math.round((R0 + R1) / 4);   /* half the expected rounds */
  for (let i = 0; i < GAMES; i++) {
    let mid = null, last = null, lastRound = -1;
    const g = play(1000 + i, players, opts, {}, S.Game && S.Game.prototype.score ? gg => { if (gg.round !== lastRound) { lastRound = gg.round; last = leader(gg, players); if (gg.round === MID && mid === null) mid = last; } } : null);   /* at each round's first turn (whoever starts it) */
    if (!g.over) throw new Error(`seed ${1000 + i}, ${players} players: the game did not end`);
    const { scores, winner } = g.final(); rounds += g.round; turns += g.log.length;
    if (winner < 0) ties++; else wins[winner]++;
    if (mid !== null && mid >= 0) { midLed++; if (mid === winner) midWins++; }
    if (last !== null && last >= 0) { lastLed++; if (last !== winner) swings++; }
    for (const s of scores) { if (s.goals) { goalsMet += s.goals.met; goalsAll += s.goals.total; } else if (Array.isArray(s.wishes)) { goalsMet += s.wishes.filter(w => w.met).length; goalsAll += s.wishes.length; } }
  }
  return { players, games: GAMES, seatWins: wins.map(w => +(w / GAMES).toFixed(3)), ties: +(ties / GAMES).toFixed(3), rounds: +(rounds / GAMES).toFixed(2), events: Math.round(turns / GAMES), goals: goalsAll ? +(goalsMet / goalsAll).toFixed(3) : null,
    midLeaderWins: midLed ? +(midWins / midLed).toFixed(3) : null, lastRoundSwing: lastLed ? +(swings / lastLed).toFixed(3) : null };
}
/* a named player in one seat at a time (rotating), the AI in the rest: its win rate and its share of fair */
function trial(fn, players, seedBase = 3000) {
  let w = 0; for (let i = 0; i < GAMES; i++) { const s = i % players; const g = play(seedBase + i, players, {}, { [s]: fn }); if (g.final().winner === s) w++; }
  const rate = w / GAMES; return { rate: +rate.toFixed(3), share: +(rate * players).toFixed(2) };
}
/* the gates: each returns problems */
function gate_dumb() {
  const out = [], P = [Math.min(...PLAYERS), Math.max(...PLAYERS)], names = Object.keys(S.strategies || {}).filter(n => n !== 'blind' && n !== 'obvious');
  if (!names.length) return ['--dumb: the sim exports no strategies (design-procedure.md: onePiece, nearest, randomPlacement, ignoreGoals, one per opt-in rule)'];
  console.log('dumb-strategy gate (win rate, share of fair; targets: under 60 % of fair at the fewest players, under 70 % at the most, the one-piece line near zero)');
  for (const n of names) for (const p of new Set(P)) { const r = trial(S.strategies[n], p); const cap = p === P[0] ? 0.6 : 0.7; const bad = r.share > cap; console.log(`  ${p} players: '${n}' wins ${(100 * r.rate).toFixed(0)} % = ${(100 * r.share).toFixed(0)} % of fair${bad ? '  <- costs nothing to ignore' : ''}`); if (bad) out.push(`${p} players: the dumb strategy '${n}' wins ${(100 * r.share).toFixed(0)} % of its fair share (allowed ${cap * 100})`); }
  return out;
}
function gate_gap() {
  if (!S.strategies || !S.strategies.obvious) return ['--gap: the sim exports no strategies.obvious (the greedy first-timer)'];
  const out = []; console.log('obvious-strategy gap (target: the obvious player wins 30 to 60 % of its fair share)');
  for (const p of new Set([Math.min(...PLAYERS), Math.max(...PLAYERS)])) { const r = trial(S.strategies.obvious, p); console.log(`  ${p} players: obvious wins ${(100 * r.rate).toFixed(0)} % = ${(100 * r.share).toFixed(0)} % of fair`); if (r.share < 0.3) out.push(`${p} players: the obvious play wins only ${(100 * r.share).toFixed(0)} % of fair: the decisions are unreadable`); if (r.share > 0.6) out.push(`${p} players: the obvious play wins ${(100 * r.share).toFixed(0)} % of fair: the decisions do not matter`); }
  return out;
}
function gate_blind() {
  if (!S.strategies || !S.strategies.blind) return ['--blind: the sim exports no strategies.blind (the AI with the opponents masked)'];
  const out = []; console.log('opponent-blindness drop (the interaction\'s weight; over 90 % of fair: the interaction is fake)');
  for (const p of new Set([Math.min(...PLAYERS), Math.max(...PLAYERS)])) { const r = trial(S.strategies.blind, p); console.log(`  ${p} players: blind wins ${(100 * r.rate).toFixed(0)} % = ${(100 * r.share).toFixed(0)} % of fair (drop ${(100 * (1 - r.share)).toFixed(0)} points)`); if (r.share > 0.9) out.push(`${p} players: the blind AI wins ${(100 * r.share).toFixed(0)} % of fair: seeing the opponents is worth nothing, the interaction is fake`); }
  return out;
}
function gate_paths() {
  const names = Object.keys(S.archetypes || {}); if (names.length < 2) return ['--paths: the sim exports fewer than two archetypes (design-procedure.md 9b: racer, builder, blocker)'];
  const out = []; console.log('live paths (each 50 to 150 % of fair at a mixed table; each answered head to head by another at 55 % or better)');
  for (const n of names) for (const p of new Set([Math.min(...PLAYERS), Math.max(...PLAYERS)])) { const r = trial(S.archetypes[n], p); console.log(`  ${p} players: '${n}' wins ${(100 * r.rate).toFixed(0)} % = ${(100 * r.share).toFixed(0)} % of fair`); if (r.share > 1.5) out.push(`${p} players: the archetype '${n}' wins ${(100 * r.share).toFixed(0)} % of fair: the script the game collapses into`); if (r.share < 0.5) out.push(`${p} players: the archetype '${n}' wins ${(100 * r.share).toFixed(0)} % of fair: decoration`); }
  const answered = {};
  for (const x of names) for (const y of names) if (x !== y) { let w = 0; for (let i = 0; i < GAMES; i++) { const s = i % 2; const g = play(5000 + i, 2, {}, { [s]: S.archetypes[x], [1 - s]: S.archetypes[y] }); if (g.final().winner === s) w++; } const r = w / GAMES; console.log(`  head to head: '${x}' beats '${y}' ${(100 * r).toFixed(0)} %`); if (r >= 0.55) answered[y] = x; }
  for (const n of names) if (!answered[n]) out.push(`no archetype answers '${n}' (none beats it 55 % head to head)`);
  return out;
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
for (const r of base) console.log(`  ${r.players} players: seat wins ${r.seatWins.join(' / ')}, ties ${r.ties}, ${r.rounds} rounds, ${r.events} events${r.goals === null ? '' : `, goals met ${(r.goals * 100).toFixed(0)} %`}${r.midLeaderWins === null ? '' : `; the midpoint leader wins ${(r.midLeaderWins * 100).toFixed(0)} %, the last round changes the winner ${(r.lastRoundSwing * 100).toFixed(0)} %`}`);
const problems = judge(base);
for (const r of base) { if (r.players === 4 && r.midLeaderWins !== null && r.midLeaderWins > 0.75) problems.push(`4 players: the midpoint leader wins ${(r.midLeaderWins * 100).toFixed(0)} % (a runaway: name the brake on the loop)`); if (r.lastRoundSwing !== null && r.lastRoundSwing < 0.05) problems.push(`${r.players} players: the last round changes the winner in ${(r.lastRoundSwing * 100).toFixed(0)} % of games (the end decides nothing)`); }
const gates = [];
if (DUMB) gates.push(...gate_dumb()); if (GAP) gates.push(...gate_gap()); if (BLIND) gates.push(...gate_blind()); if (PATHS) gates.push(...gate_paths());
let best = null;
if (tunes.length) {
  const grids = tunes.map(t => { const v = []; for (let x = t.lo; x <= t.hi + 1e-9; x += t.step) v.push(+x.toFixed(6)); return v; });
  const combos = grids.reduce((acc, g, i) => acc.flatMap(c => g.map(v => Object.assign({}, c, { [tunes[i].key]: v }))), [{}]);
  console.log(`tuning ${tunes.map(t => t.key).join(', ')}: ${combos.length} settings`);
  for (const c of combos) { const rows = PLAYERS.map(p => measure(p, c)); const s = score(rows); if (!best || s < best.score) best = { opts: c, score: s, rows }; }
  console.log(`best: ${JSON.stringify(best.opts)} (score ${best.score.toFixed(3)}; the current rules score ${score(base).toFixed(3)})`);
  for (const r of best.rows) console.log(`  ${r.players} players: seat wins ${r.seatWins.join(' / ')}, ${r.rounds} rounds${r.goals === null ? '' : `, goals ${(r.goals * 100).toFixed(0)} %`}`);
}
if (OUT) fs.writeFileSync(OUT, JSON.stringify({ file, games: GAMES, targets: { rounds: [R0, R1], seat: SEAT, goals: [G0, G1] }, base, problems, gates, best }, null, 1));
if (gates.length) console.log('GATE PROBLEMS:\n  ' + gates.join('\n  '));
if (problems.length) console.log('BALANCE PROBLEMS:\n  ' + problems.join('\n  '));
if (problems.length || gates.length) process.exit(1);
console.log('BALANCE OK');
