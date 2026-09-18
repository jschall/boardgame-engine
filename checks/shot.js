#!/usr/bin/env node
// shot.js: screenshot of the game page (WebGL, no GPU) with playwright, waiting for the page's first drawn frame.
// Usage:  node shot.js page.html '<hash>' out.png [WxH] [css-selector]
//    e.g. node shot.js game.html '#shot=table&p=40&y=0' table.png 1400,1000           # the viewport, after the first frame
//         node shot.js game.html '#shot=box&lift=1' lid.png 1400,1000 '.cwrap'          # just the 3D stage
//         node shot.js game.html '' rules.png 1300,1000 '#rules'                        # one section, whatever its height
// The page must call window.__signalReady() after its first rendered frame (the page template does); this script defines it and waits for it,
// and fails loudly if the page never calls it. Prints console errors and page errors.
// Never use Chrome's --virtual-time-budget for anything animated: it stalls requestAnimationFrame tweens after the first one.
'use strict';
const NAV_MS = +(process.env.NAV_TIMEOUT_MS || 180000);   // a 7 MB self-contained page can take over 30 s to reach its load event on a busy machine
const path = require('path'); 
const a = process.argv.slice(2); if (a.length < 3) { console.error('usage: node shot.js page.html hash out.png [WxH] [selector]'); process.exit(2); }
const PAGE = 'file://' + path.resolve(a[0]), H = a[1], OUT = a[2]; const [W, HT] = (a[3] || '1100,900').replace('x', ',').split(',').map(Number); const SEL = a[4] || '';
const TIMEOUT = +(process.env.SHOT_TIMEOUT_MS || 90000);
(async () => {
  const errs = [], cons = []; let ready = true;
  const b = await require('./browser.js').launch();
  const pg = await b.newPage({ viewport: { width: W, height: HT } }); pg.setDefaultTimeout(NAV_MS);   /* screenshots and waits too: 30 s is not enough under heavy machine load */
  pg.on('pageerror', e => errs.push(String(e))); pg.on('console', m => { if (m.type() === 'error') cons.push(m.text()); });
  await pg.addInitScript('window.__signalReady = function () { window.__readyCalled = true; };');
  await pg.goto(PAGE + H, { timeout: NAV_MS });
  try { await pg.waitForFunction('window.__readyCalled === true', null, { timeout: TIMEOUT }); } catch (e) { await b.close(); for (const x of errs) console.log('PAGE ERROR:', x.slice(0, 300)); throw new Error(`the page never called window.__signalReady() within ${TIMEOUT} ms: the page template calls it after its first drawn frame; a page without it cannot be screenshotted reliably`); }
  await pg.waitForTimeout(400);
  if (SEL) { const el = pg.locator(SEL).first(); await el.scrollIntoViewIfNeeded(); await pg.waitForTimeout(300); await el.screenshot({ path: OUT }); } else await pg.screenshot({ path: OUT });
  await b.close();
  for (const e of errs) console.log('PAGE ERROR:', e.slice(0, 300)); for (const c of cons.slice(0, 10)) console.log('CONSOLE ERROR:', c.slice(0, 300));
  console.log('ready', OUT); process.exit(errs.length ? 1 : 0);
})();
