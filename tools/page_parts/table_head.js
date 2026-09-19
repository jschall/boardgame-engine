/* SPDX-License-Identifier: MPL-2.0; Copyright (C) 2026 Jonathan Challinger; source: https://github.com/jschall/boardgame-engine
   This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at https://mozilla.org/MPL/2.0/. */
/* table.js: BUMBLE & BLOOM on the engine's stage (engine/page/page.js). GameTable(api) returns the game's blocks: the table layout (seats,
   boards, tiles, tokens, standees, cards), initTable, setBoardFromState, animateEvents, the QA contract (assertLegal, noteShown, syncBoard),
   finale, what the players say, the assemblies and views the parts list offers, and the part groups. Everything else on the page is the
   engine's. Browser global GameTable; build.js embeds this file after the engine's renderer and before page.js. */
function GameTable(api) {
  'use strict';
  const { S, META, PARTS, PACKING, JIG, SHOWCASE, scene, $, el, need, part, mk, posed, setPose, rotXY, ez, STOCK_T, stockOf, IN, tray, neck, standingPair, standee, exFor, addAsm, trayEx, neckEx, lidOn, tween, wait, arc, log, pick } = api;
  const AF = need(need(META, 'meadow', 'META'), 'pitch', 'META.meadow'), SQ3 = Math.sqrt(3), NP = 4;
  const players = S.COLONIES.map((k, c) => ({ name: ['Ada', 'Basil', 'Clem', 'Dot'][c], colour: ['#f0cf6a', '#d69a3a', '#a9a293', '#6a4428'][c], title: k.name }));
  const NAMES = players.map(p => p.name);
  const cellXY = id => { const [q, r] = S.QR(id); return [AF * (q + r / 2), AF * SQ3 / 2 * r]; };
  const HSLOT = need(META, 'HSLOT', 'META');
  const dot = c => api.dot(c), say = (c, line) => api.say(c, line);
  let G = null, qr = null;   /* the live game and its patter random, handed over by the engine in resetShown before every run */
