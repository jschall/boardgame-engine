#!/usr/bin/env node
// verify_anim.js: real-time animation QA with playwright (never headless virtual time: it stalls requestAnimationFrame tweens after the first).
// Plays the page's animated game, watches for page errors, reads the page's own QA hooks and takes periodic screenshots for the animation judge.
// The page must implement (see reference/page.md):
//     #shot=table&anim=N&speed=S    start the animation at speed S and pause after N turns
//     window.__qa()                 -> {turn, over, illegal (count of rule violations the animation asserted), ...}
//     window.__maxSnap              largest distance (mm) any piece would jump when the board is re-synced from the engine: the teleport metric, should stay near 0
// Usage:  node verify_anim.js page.html [--turns 12] [--speed 8] [--out anim-shots] [--every 4] [--timeout 600] [--snap 1.0]
// Exit 1 on page errors, illegal moves, or __maxSnap above --snap.
'use strict';
const NAV_MS = +(process.env.NAV_TIMEOUT_MS || 180000);   // a 7 MB self-contained page can take over 30 s to reach its load event on a busy machine
const fs = require('fs'), path = require('path'); 
const a = process.argv.slice(2); if (!a.length) { console.error('usage: node verify_anim.js page.html [--turns N] [--speed S] [--out dir] [--every s] [--timeout s] [--snap mm]'); process.exit(2); }
const opt = (k, d) => { const i = a.indexOf(k); return i >= 0 ? (typeof d === 'number' ? +a[i + 1] : a[i + 1]) : d; };
const PAGE = 'file://' + path.resolve(a[0]), TURNS = opt('--turns', 12), SPEED = opt('--speed', 8), OUT = opt('--out', 'anim-shots'), EVERY = opt('--every', 4), TIMEOUT = opt('--timeout', 600), SNAP = opt('--snap', 1.0);
(async () => {
  fs.mkdirSync(OUT, { recursive: true }); const errs = [], cons = [];
  const b = await require('./browser.js').launch();
  const pg = await b.newPage({ viewport: { width: 1500, height: 1000 } }); pg.setDefaultTimeout(NAV_MS);   /* screenshots and waits too: 30 s is not enough under heavy machine load */
  pg.on('pageerror', e => errs.push(String(e))); pg.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') cons.push(m.text()); });
  await pg.goto(`${PAGE}#shot=table&anim=${TURNS}&speed=${SPEED}`, { timeout: NAV_MS });
  let last = -1, k = 0, t = 0, q = null;
  while (t < TIMEOUT) {
    await pg.waitForTimeout(1000); t++;
    q = await pg.evaluate('window.__qa ? window.__qa() : null');
    if (q === null) { if (t > 20) { console.log('page has no window.__qa'); errs.push('no __qa'); break; } continue; }
    if (t % EVERY === 0) { await pg.screenshot({ path: path.join(OUT, `t${String(t).padStart(4, '0')}_turn${q.turn || 0}.png`) }); k++; }
    if (q.turn !== last) { last = q.turn; console.log(`t=${t}s turn=${last} over=${q.over} illegal=${q.illegal === undefined ? '-' : q.illegal} maxSnap=${(await pg.evaluate('window.__maxSnap || 0')).toFixed(2)}`); }
    const stopAfter = await pg.evaluate('window.__stopAfter || 0');
    if (q.over || ((q.turn || 0) >= TURNS && !stopAfter)) break;
  }
  await pg.waitForTimeout(1500); await pg.screenshot({ path: path.join(OUT, 'final.png') });
  q = (await pg.evaluate('window.__qa ? window.__qa() : {}')) || {}; const snap = await pg.evaluate('window.__maxSnap || 0'); const logN = await pg.evaluate("document.querySelectorAll('.log .le, #log > *').length");
  await b.close();
  let bad = errs.length + (+q.illegal || 0) + (snap > SNAP ? 1 : 0);
  console.log(JSON.stringify({ turns: q.turn, over: q.over, illegal: q.illegal || 0, maxSnap: +snap.toFixed(2), log_entries: logN, page_errors: errs.slice(0, 5), console_errors: cons.slice(0, 5), screenshots: k + 1, out: OUT }, null, 1));
  if (t >= TIMEOUT) { console.log('TIMEOUT: the animation did not reach', TURNS, 'turns'); bad++; }
  process.exit(bad ? 1 : 0);
})();
