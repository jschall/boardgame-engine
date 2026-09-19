#!/usr/bin/env node
/* SPDX-License-Identifier: MPL-2.0; Copyright (C) 2026 Jonathan Challinger; source: https://github.com/jschall/boardgame-engine
   This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at https://mozilla.org/MPL/2.0/. */
/* stats.js (boardgame-engine): self-play numbers for the page (stats.json) and the showcase game it animates (showcase.json), from any engine
   that follows the sim contract: playGame(seed, players) -> a finished Game with .round, .log and .final(); optional stats(games, players) -> the
   object written to stats.json; drama(game) -> a number (the game's own measure of a showcase: a close finish, its signature moments, a reasonable
   length), else the engine's default below.
     node engine/bin/bg.js stats [games]           (400 four-player games are searched for the showcase; stats over `games` per player count) */
'use strict';
const fs = require('fs'), path = require('path');
const GAME_DIR = process.env.GAME_DIR || process.cwd();
const simFile = process.argv[2]; if (!simFile) { console.error('usage: stats.js <sim.js> [games]'); process.exit(2); }
const S = require(path.resolve(GAME_DIR, simFile));
const games = +(process.argv[3] || 300);
for (const k of ['playGame', 'RULES']) if (!(k in S)) throw new Error(`${simFile} does not export ${k}: the sim contract (engine/README.md)`);
const players = (S.names && S.names.players && S.names.players.length) ? [2, 3, 4].filter(p => p <= S.names.players.length) : [2, 3, 4];
const out = {};
for (const p of players) {
  if (typeof S.stats === 'function') {
    out[p] = S.stats(games, p);
    if (!out[p] || typeof out[p] !== 'object') throw new Error(`${simFile}: stats(${games}, ${p}) did not return an object`);
  } else {
    const seats = new Array(p).fill(0); let rounds = 0, ties = 0, events = 0; const ends = {};
    for (let s = 1; s <= games; s++) { const g = S.playGame(9000 + s, p); const f = g.final(); rounds += g.round; events += g.log.length; if (f.winner < 0) ties++; else seats[f.winner]++; ends[g.endReason || 'end'] = (ends[g.endReason || 'end'] || 0) + 1; }
    out[p] = { games, players: p, rounds: +(rounds / games).toFixed(1), events: Math.round(events / games), ties: +(100 * ties / games).toFixed(0), seatWins: seats.map(n => +(100 * n / games).toFixed(0)), ends };
  }
  console.error('players', p, JSON.stringify(out[p]));
}
fs.writeFileSync(path.join(GAME_DIR, 'stats.json'), JSON.stringify(out));
/* the showcase: the most dramatic of 400 four-player seeds by the game's own measure, or by a close finish and a middling length */
const drama = S.drama || (g => { const f = g.final(), tot = f.scores.map(s => s.total).sort((a, b) => b - a); return -2 * Math.abs((tot[0] - tot[1]) - 1) - Math.abs(g.round - 8) - (f.winner < 0 ? 8 : 0); });
let best = null;
const NP = Math.min(4, players[players.length - 1]);
for (let seed = 1; seed <= 400; seed++) { const g = S.playGame(seed, NP); const v = drama(g); if (!best || v > best.v) best = { seed, v, rounds: g.round, players: NP, totals: g.final().scores.map(s => s.total), winner: g.final().winner }; }
fs.writeFileSync(path.join(GAME_DIR, 'showcase.json'), JSON.stringify(best));
console.error('showcase', JSON.stringify(best));
