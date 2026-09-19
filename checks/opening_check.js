#!/usr/bin/env node
/* SPDX-License-Identifier: MPL-2.0; Copyright (C) 2026 Jonathan Challinger; source: https://github.com/jschall/boardgame-engine
   This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at https://mozilla.org/MPL/2.0/. */
/* Does anything pass through anything else while the box is unpacked? Freezes the opening at many values of its progress p (the #intro= hook, on the
   machine's GPU) and runs the same interior-sampling intersection test qa_intersections.js uses on the live scene at each one: every instance
   the page draws, in the pose the page draws it (groups, tilts, flights). Prints the intersecting pairs per position and exits 1 if any.
     node engine/checks/opening_check.js [<slug>.html] [p0] [p1] [step]      (defaults 0.38 0.96 0.005, the pieces' part of the opening; from the game folder) */
'use strict';
const { chromium } = require('./browser.js');
const path = require('path'); const { pathToFileURL } = require('url'); const fs = require('fs');
const file = path.resolve(process.argv[2] || (() => { const C = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'game.json'), 'utf8')); return `${C.slug}.html`; })());
const P0 = +(process.argv[3] || 0.38), P1 = +(process.argv[4] || 0.96), STEP = +(process.argv[5] || 0.005);
/* the in-page test, lifted from the skill's qa_intersections.js: rasterise each part's interior, sample it in 3D, test against every neighbour's solid */
const CHECK = fs.readFileSync(path.join(__dirname, 'qa_intersections.js'), 'utf8').match(/const CHECK = `([\s\S]*?)`;\n/)[1];
(async () => {
  const b = await require('./browser.js').launchGPU();
  const pg = await b.newPage({ viewport: { width: 1400, height: 900 } }); const errs = [];
  pg.on('pageerror', e => errs.push(String(e)));
  await pg.addInitScript('window.__signalReady = function () { window.__readyCalled = true; };');
  await pg.goto(pathToFileURL(file).href + '#intro=' + P0, { timeout: 300000 });
  await pg.waitForFunction('window.__readyCalled === true', null, { timeout: 300000 });
  const info = await pg.evaluate(() => ({ live: window.__intro.live, end: window.__intro.end, n: window.__intro.pieces.length }));
  console.log('opening live', info.live, 'pieces', info.n, 'last landing at p =', info.end && info.end.toFixed(3));
  let bad = 0; const seen = new Map();
  for (let p = P0; p <= P1 + 1e-9; p += STEP) {
    p = Math.round(p * 1000) / 1000;
    await pg.evaluate(p => window.__intro.set(p), p);
    await pg.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    const res = await pg.evaluate(CHECK);
    if (res.hits.length) { bad += res.hits.length; console.log(`p ${p.toFixed(3)}: ${res.hits.length} intersecting pair(s)`); for (const h of res.hits.slice(0, 6)) { const key = h.a.pid + ' x ' + h.b.pid; seen.set(key, (seen.get(key) || 0) + 1); console.log('   ', JSON.stringify(h)); } }
  }
  console.log(bad ? `opening_check: ${bad} intersecting pairs over the sweep; worst pairs: ${[...seen.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n]) => k + ' (' + n + ')').join(', ')}` : 'opening_check: no intersections over the sweep');
  if (errs.length) { console.log('PAGE ERRORS', JSON.stringify(errs.slice(0, 3))); bad++; }
  await b.close(); process.exit(bad ? 1 : 0);
})();
