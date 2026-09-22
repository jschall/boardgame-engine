#!/usr/bin/env node
/* SPDX-License-Identifier: MPL-2.0; Copyright (C) 2026 Jonathan Challinger; source: https://github.com/jschall/boardgame-engine
   This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at https://mozilla.org/MPL/2.0/. */
/* page_gate.js (boardgame-engine): the live page gate: structure, the real manual embedded, offline assets, the opening (the box button runs it
   forward and back, the hooks freeze it), the reader's flow (the game starts by itself when the box is open, closing packs the live game, opening
   resumes it), the rulebook modal (the book alone, a click or a swipe turns a bending page), phones, the parts panel, the files modal with a stock
   regeneration, no console errors. node engine/bin/bg.js check runs it. Game facts come from game.json (manual pages, players).
     node engine/checks/page_gate.js <slug>.html     (from the game folder; BG_GPU=1 uses the machine's GPU) */
'use strict';
const assert = require('assert/strict'), fs = require('fs'), path = require('path'), vm = require('vm'), zlib = require('zlib');
const { pathToFileURL } = require('url');
const root = process.env.GAME_DIR || process.cwd(), CFG = JSON.parse(fs.readFileSync(path.join(root, 'game.json'), 'utf8'));
const file = path.resolve(process.argv[2] || path.join(root, `${CFG.slug}.html`));
const shots = process.env.PAGE_CHECK_SHOTS || path.join(root, 'shots', 'gate');
const PAGES = CFG.manual && CFG.manual.pages; if (!Number.isInteger(PAGES)) throw new Error('game.json manual.pages (the rulebook page count) is required');
const NPLAY = 4;   /* the table always seats four */
const checks = [], pass = s => { checks.push(s); console.log('PASS ' + s); };
function pixels(bytes) {
  const chunks = [];
  for (let i = 8; i < bytes.length;) {
    const n = bytes.readUInt32BE(i);
    if (bytes.toString('ascii', i + 4, i + 8) === 'IDAT') chunks.push(bytes.subarray(i + 8, i + 8 + n));
    i += n + 12;
  }
  return zlib.inflateSync(Buffer.concat(chunks));
}
async function main() {
  const html = fs.readFileSync(file, 'utf8');
  const scripts = [...html.matchAll(/<script(?![^>]*type="text\/plain")[^>]*>([\s\S]*?)<\/script>/g)];   /* the sheet SVGs sit in text/plain blocks */
  for (const [i, m] of scripts.entries()) new vm.Script(m[1], { filename:`inline-${i}.js` });
  assert(!/@@[A-Z_]+@@/.test(html));
  assert(!/^\s*\/\//m.test(fs.readFileSync(path.join(root, 'table.js'), 'utf8')), 'table.js has a line comment');
  pass(`${scripts.length} inline scripts parse; no unfilled placeholders or page JS line comments`);
  const assets = JSON.parse(html.match(/const assets = (\{[^\n]*\});/)[1]);
  const onDisk = fs.readdirSync(path.join(root, 'manual', 'assets'));
  assert.equal(Object.keys(assets).filter(f => f.endsWith('.svg')).length, onDisk.filter(f => f.endsWith('.svg')).length, 'every manual SVG asset is embedded');
  assert.equal(Object.keys(assets).filter(f => f.endsWith('.png')).length, onDisk.filter(f => f.endsWith('.png')).length, 'every manual PNG asset is embedded');
  for (const [name, data] of Object.entries(assets)) {
    assert(data.startsWith('data:image/'));
    const source = fs.readFileSync(path.join(root, 'manual', name)), embedded = Buffer.from(data.split(',')[1], 'base64');
    assert.deepEqual(name.endsWith('.png') ? pixels(embedded) : embedded, name.endsWith('.png') ? pixels(source) : source, name);
  }
  const fontSpec = CFG.fonts; if (!fontSpec || !fontSpec.R || !fontSpec.SB || !fontSpec.B) throw new Error('game.json.fonts { family, R, SB, B } is required');
  for (const role of ['R', 'SB', 'B']) {
    const f = fontSpec[role], p = path.join(root, 'manual/assets', f);
    assert(fs.existsSync(p), `manual/assets/${f} (game.json.fonts.${role})`);
    assert(html.includes(fs.readFileSync(p).toString('base64')), `the page embeds ${f}`);
  }
  pass('Every manual SVG, the lossless PNGs and the game\'s three font weights are embedded');
  /* the machine's GPU when headless Chromium can reach it (PAGE_CHECK_GPU=1), else the software rasterizer */
  const browser = await require('./browser.js').launch();
  const errors = [], external = [];
  try {
    const pg = await browser.newPage({ viewport:{ width:1400, height:1000 } });
    pg.on('pageerror', e => errors.push(String(e)));
    pg.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    const pageHref = pathToFileURL(file).href;
    pg.on('request', r => { const u = r.url(); if (!u.startsWith('data:') && !u.startsWith('blob:') && u !== pageHref && !u.startsWith(pageHref + '?')) external.push(u); });
    /* ready: the page's own signal (the first frame, and the flight plan when there is an opening; the plan is made between frames) */
    const ready = () => pg.waitForFunction(() => window.__manual && window.__qa && window.__intro && window.__intro.ready && (window.__intro.live || window.__intro.p >= 0 || window.__qa().playing), null, { timeout:300000 });
    const frame = () => pg.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    const shot = (sel, name) => pg.locator(sel).screenshot({ path:path.join(shots, name), animations:'disabled', timeout:120000 });
    await pg.goto(pathToFileURL(file).href, { timeout:300000 });
    await ready(); await pg.evaluate(() => document.fonts.ready);
    /* the page: one stage that is the whole viewport, then the two modals; nothing else */
    assert.deepEqual(await pg.locator('body > section, body > main, body > header, body > .modal').evaluateAll(es => es.map(e => e.id || e.tagName)), ['demo', 'modal-rules', 'modal-files']);
    assert.deepEqual(await pg.locator('#modal-rules > .modal-box > section, #modal-files > .modal-box > section').evaluateAll(es => es.map(e => e.id)), ['rules', 'files']);
    for (const sel of ['#btn-play', '#btn-new', '#speed', '#btn-view', '.tabs', '[data-mode]', '.pill', 'header.hero', '#below', '#manual-zoom', '#btn-lift', '#track', '#cue', '#btn-skip', '.manual-toolbar', '#manual-help', '#manual-prev', '#manual-next', '#manual-page', '#rules > h2', '#rules > p:not(.rulebook-top)']) assert.equal(await pg.locator(sel).count(), 0, 'no ' + sel);
    assert.deepEqual(await pg.locator('#nav button').evaluateAll(es => es.map(e => [e.dataset.open, e.textContent])), [['rules', 'Rulebook'], ['parts', 'Parts'], ['files', 'Laser files']]);
    assert.equal(await pg.locator('#stage > canvas#c3d, #stage > #btn-box, #stage > #intro-title h1, #stage > #nav, #stage > .hud > #chips, #stage > .hud > #log, #stage > #panel[hidden], #stage > #loading').count(), 8, 'the stage: canvas, the box button, title, nav, chips and log in the HUD, the parts panel closed, the loading screen');
    assert.deepEqual(await pg.locator('#log').evaluate(e => [getComputedStyle(e).overflowY, getComputedStyle(e).pointerEvents]), ['hidden', 'none'], 'the log neither scrolls under the wheel nor takes the pointer');
    assert.equal(await pg.locator('#modal-rules a[href*="manual/output"]').count(), 2, 'the two PDF links, once each, under the book in the rulebook modal');
    assert.equal(await pg.locator('#modal-files a[href*="manual/output"]').count(), 0, 'the files modal does not also link the PDFs');
    const GP = require(path.join(root, 'page.js'))(CFG, JSON.parse(fs.readFileSync(path.join(root, 'parts/parts.json'))));
    const expected = GP.SHEET_GROUPS.flatMap(g => g.sheets.flatMap(s => [s.id].concat(s.back ? [s.back] : []))).sort();
    assert.deepEqual(await pg.locator('#sheets .sheet').evaluateAll(es => es.map(e => e.dataset.sheetId).sort()), expected);
    assert(await pg.locator('#sheets .sheet').evaluateAll(es => es.every(e => { const a = e.querySelector('a[download]'); return a && a.download.endsWith('.svg') && a.href.startsWith('blob:'); })), 'every sheet card downloads a blob made from its plain-text SVG block');
    assert.equal(await pg.locator('script.sheet-svg').count(), expected.length, 'one plain-text SVG block per sheet, after page.js');
    assert(await pg.locator('#loading').evaluate(e => e.hidden), 'the loading screen is gone once the first frame is drawn');
    assert.equal(await pg.locator('#stock input').count(), 3 * Object.keys(JSON.parse(fs.readFileSync(path.join(root, 'parts/parts.json'))).meta.stocks).length);
    assert.equal(await pg.locator('#sheet-status').count(), 1);
    for (const a of await pg.locator('.rulebook-top a').all()) assert(fs.existsSync(path.resolve(path.dirname(file), await a.getAttribute('href'))));
    assert(await pg.evaluate(() => document.documentElement.scrollHeight <= innerHeight && getComputedStyle(document.documentElement).overflow === 'hidden'), 'nothing scrolls: the stage is the page');
    pass(`One stage, two modals, three nav buttons, no controls but the box button, ${expected.length} sheet downloads, stock and PDF links`);
    /* the opening: the box button runs it forward and back, the hooks freeze it, #shot= and reduced motion skip it, the table pose hook ends it */
    const poses = () => pg.evaluate(() => window.__scene.static.concat(window.__scene.dynamic).map(i => [i.part && i.part.pid, i.x, i.y, i.z, i.hidden, i.alpha, JSON.stringify(i.group)]));
    await frame(); assert.deepEqual(await pg.evaluate(() => [window.__intro.live, window.__intro.p, window.__intro.dir, window.__intro.open]), [true, 0, 0, false], 'the page opens with the boxes closed and still');
    assert(await pg.evaluate(() => window.__intro.end < 0.985), 'the last piece lands before the end of the opening');
    assert.equal(await pg.evaluate(() => getComputedStyle(document.getElementById('hud')).visibility), 'hidden');
    assert(await pg.locator('#btn-box').isVisible() && await pg.locator('#intro-title').isVisible() && await pg.locator('#nav').isVisible());
    assert.equal(await pg.locator('#btn-box').textContent(), 'Open the box');
    const stage = await pg.locator('#stage').boundingBox(); assert.equal(Math.round(stage.height), 1000, 'the stage fills the viewport'); assert.equal(Math.round(stage.y), 0);
    assert(await pg.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal overflow');
    const at0 = await poses();
    await pg.evaluate(() => window.__intro.set(0.5)); await frame(); const at50 = await poses();
    assert(at50.some((r, i) => r[1] !== at0[i][1] || r[2] !== at0[i][2] || r[3] !== at0[i][3]), 'progress moves the pieces');
    assert.equal(await pg.evaluate(() => window.__scene.opts.tableAlpha), 1);
    assert(!(await pg.locator('#btn-box').isVisible()), 'the button hides while a hook drives the opening');
    await pg.evaluate(() => window.__intro.set(0)); await frame(); assert.deepEqual(await poses(), at0, 'the opening runs backwards to the same frame');
    assert.equal(await pg.evaluate(() => window.__scene.opts.tableAlpha), 0, 'no table before the lights come up');
    await pg.evaluate(() => window.__intro.set(1)); await frame();
    assert.equal(await pg.evaluate(() => getComputedStyle(document.getElementById('hud')).visibility), 'visible');
    assert(!(await pg.locator('#intro-title').isVisible()));
    assert.equal(await pg.evaluate(() => window.__qa().playing), false, 'a frozen frame at the end does not start the game');
    await shot('#stage', 'stage-unpacked.png');
    const tablePose = await pg.evaluate(() => window.__placements.table().map(i => [i.part.pid, i.x, i.y, i.z, i.group === undefined]));
    assert(tablePose.every(r => r[4]) && !(await pg.evaluate(() => window.__intro.live)), 'asking for the table pose ends the opening and clears every group');
    pass('The opening: driven by progress, reversible, HUD veiled until the end, the button hides under the hooks, hooks see the table pose');
    /* the reader's flow: the box button opens the box, the game starts by itself, the same button closes the box on the game and opens it again */
    await pg.reload(); await ready(); await frame();
    await pg.evaluate(() => { window.__intro.rate = 4; });   /* four times the pace, so the check takes seconds */
    await pg.locator('#btn-box').click();
    await pg.waitForFunction(() => window.__intro.dir > 0 && window.__intro.p > 0.45, null, { timeout:20000 }).catch(async e => { throw new Error(`the box did not open on the button: ${await pg.evaluate(() => JSON.stringify({ p: window.__intro.p, dir: window.__intro.dir, live: window.__intro.live, ready: window.__intro.ready, open: window.__intro.open, button: document.getElementById('btn-box').hidden }))}`); });
    assert.equal(await pg.locator('#btn-box').textContent(), 'Close the box');
    assert.equal(await pg.evaluate(() => document.getElementById('stage').getBoundingClientRect().top), 0, 'the stage stays put');
    await shot('#stage', 'stage-opening.png');
    await pg.waitForFunction(() => !window.__intro.live && window.__qa().playing, null, { timeout:30000 });
    assert.deepEqual(await pg.evaluate(() => { const v = window.__scene.opts; return [Math.round(v.view), Math.round(v.pitch)]; }), await pg.evaluate(() => { const K = window.__intro.box.cam, last = K[K.length - 1][1]; return [Math.round(last.view), Math.round(last.pitch)]; }), 'the game starts from the opening\'s last camera, no step');
    await pg.waitForFunction(() => document.querySelectorAll('#log .le').length > 2, null, { timeout:60000 });
    const logH = await pg.locator('#log').evaluate(e => e.getBoundingClientRect().height);
    await pg.waitForFunction(n => document.querySelectorAll('#log .le').length > n + 3, await pg.locator('#log .le').count(), { timeout:60000 });
    assert.equal(await pg.locator('#log').evaluate(e => e.getBoundingClientRect().height), logH, 'the log keeps its height as it fills');
    assert.equal(await pg.locator('#chips .chip').count(), NPLAY);
    await shot('#stage', 'stage-game.png');
    const turnAtPack = await pg.evaluate(() => window.__qa().turn);
    await pg.locator('#btn-box').click();   /* close the box on the game: the plan is rebuilt from the live table, then the box closes */
    await pg.waitForFunction(() => window.__intro.live && !window.__qa().playing && window.__intro.dir < 0, null, { timeout:20000 });
    await pg.waitForFunction(() => window.__intro.p < 0.7 && window.__intro.p > 0.1, null, { timeout:40000 });
    assert.equal(await pg.locator('#btn-box').textContent(), 'Open the box');
    await pg.locator('#btn-box').click();   /* open it again before it is closed: it turns round */
    await pg.waitForFunction(() => window.__intro.dir > 0, null, { timeout:5000 });
    await pg.waitForFunction(() => window.__qa().playing, null, { timeout:60000 });
    await pg.waitForFunction(t => window.__qa().turn > t, turnAtPack, { timeout:90000 });
    assert(await pg.locator('#log .le').filter({ hasText: 'The game goes on.' }).count() >= 1, 'closing the box packs the live game; opening it unpacks it and it goes on');
    await pg.locator('#btn-box').click();
    await pg.waitForFunction(() => window.__intro.live && window.__intro.p <= 0 && window.__intro.dir === 0, null, { timeout:60000 });
    assert(await pg.locator('#intro-title').isVisible() && await pg.locator('#btn-box').evaluate(e => e.classList.contains('closed')), 'closed all the way: the title is back and the button beckons');
    await pg.emulateMedia({ reducedMotion:'reduce' }); await pg.reload(); await ready(); await frame();
    assert.deepEqual(await pg.evaluate(() => [window.__intro.live, document.getElementById('btn-box').hidden, getComputedStyle(document.getElementById('hud')).visibility, window.__qa().playing]), [false, false, 'visible', true], 'reduced motion: the assembled table, the game playing');
    await pg.emulateMedia({ reducedMotion:'no-preference' });
    pass('The reader\'s flow: the button opens the box, the game starts by itself, closing packs the live game and opening resumes it, closing all the way, reduced motion');
    /* the rulebook modal: the real manual, page turning, keyboard, index links, phones */
    await pg.reload(); await ready(); await frame();
    await pg.locator('#nav [data-open="rules"]').click(); assert(await pg.locator('#modal-rules').isVisible());
    await pg.waitForFunction(() => window.__manual && window.__manual.single === false);
    const outside = () => [...document.querySelectorAll('#log, #nav button, #files h2, #sheets .sheet')].map(e => { const s = getComputedStyle(e); return [s.color, s.font, s.margin, s.padding, s.width, s.backgroundColor]; });
    const before = await pg.evaluate(outside);
    await pg.evaluate(() => document.getElementById('manual-style').disabled = true);
    assert.deepEqual(await pg.evaluate(outside), before);
    await pg.evaluate(() => document.getElementById('manual-style').disabled = false);
    const source = await browser.newPage();
    await source.goto(pathToFileURL(path.join(root, 'manual/manual.html')).href);
    await source.evaluate(() => document.fonts.ready);
    const rendered = () => [...document.querySelectorAll('#book .sheet')].map(e => ({
      id:e.id, text:e.textContent, bodyHeight:e.querySelector('.body').offsetHeight,
      svg:[...e.querySelectorAll('svg path, svg text, svg circle')].map(p => { const s = getComputedStyle(p); return [s.fill, s.stroke, s.strokeWidth, s.fontSize]; })
    }));
    const actual = await pg.evaluate(rendered), original = await source.evaluate(rendered);
    assert.equal(actual.length, PAGES); assert.equal(await pg.evaluate(() => window.__manualPageCount), PAGES);
    assert.deepEqual(actual, original, 'The embedded manual must retain the real text, page layout and SVG art');
    assert(await pg.locator('#book img').evaluateAll(es => es.every(e => e.complete && e.naturalWidth && e.src.startsWith('data:'))));
    assert(await pg.locator('#book image').evaluateAll(es => es.every(e => e.getAttribute('href').startsWith('data:'))));
    await source.close();
    pass(`${PAGES} generated pages match the standalone manual text, layout and inline SVGs; CSS does not leak; images load offline`);
    fs.mkdirSync(shots, { recursive:true });
    await shot('#modal-rules .modal-box', 'manual-cover.png');
    const idle = () => pg.waitForFunction(() => !window.__manual.turning);
    const pageIs = async n => { await idle(); assert.equal(await pg.evaluate(() => window.__manual.page), n); };
    const clickPage = async (id, fx = .5) => { const r = await pg.locator(id).boundingBox(); await pg.mouse.click(r.x + r.width * fx, r.y + r.height * .5); };
    await clickPage('#p1');   /* a click on the right page turns forward */
    /* the leaf is in the air for about 900 ms: read the strips and the shadow in one evaluate at mid-turn, so a second round trip cannot land after the curl is gone (2026-09-22: a four-page book turned before a separate locator found the ground) */
    const inAir = await pg.waitForFunction(() => {
      const p = window.__manual.progress; if (!(p > .2 && p < .8)) return null;
      const strips = [...document.querySelectorAll('#book .manual-strip')], ground = document.querySelector('#book .manual-ground');
      return { strips: window.__manual.strips, hinged: strips.length > 0 && strips.every(e => getComputedStyle(e).transform.startsWith('matrix3d(')), shadow: ground ? +getComputedStyle(ground).opacity : -1 };
    }, null, { polling: 'raf' });
    const turning = await inAir.jsonValue();
    assert(turning.strips >= 5 && turning.hinged, 'the turning leaf is drawn as hinged strips in 3D');
    assert(turning.shadow > 0, 'the turning leaf throws a shadow on the table');
    await pg.screenshot({ path:path.join(shots, 'manual-turn.png'), animations:'allow' });
    await pageIs(2);
    assert.equal(await pg.locator('#book .manual-curl').count(), 0, 'the strips are gone once the leaf has landed');
    assert.equal(await pg.locator('#book .sheet[aria-hidden="false"]').count(), 2);
    await clickPage('#p2'); await pageIs(1);   /* a click on the left page turns back */
    await pg.locator('#manual-reader').focus(); await pg.keyboard.press('ArrowRight'); await pageIs(2);
    await pg.keyboard.press('ArrowRight'); await pageIs(4);
    await pg.keyboard.press('ArrowLeft'); await pageIs(2);
    await pg.keyboard.press('Home'); await pageIs(1);
    await pg.keyboard.press('End'); await pageIs(PAGES);
    await clickPage(`#p${PAGES}`); await pageIs(PAGES - 2);   /* the last page lies on the left, so a click on it turns back */
    /* an index page, when the manual has one (a .index with links to pages): the first link leads to its page */
    const idx = await pg.evaluate(() => { const a = document.querySelector('#book .index a'); if (!a) return null; return { from: +a.closest('.sheet').id.slice(1), to: +a.querySelector('b').textContent }; });
    if (idx) { await pg.evaluate(n => window.__manual.go(n), idx.from); await pageIs(idx.from & ~1 || 1); await pg.locator('#book .index a').first().click(); await pageIs(idx.to === 1 ? 1 : idx.to & ~1); }   /* a spread shows its even (left) page */
    const mid = Math.max(2, Math.floor(PAGES / 2)) & ~1;   /* an even page: the left of a spread */
    await pg.evaluate(n => window.__manual.go(n), mid); await pageIs(mid);
    await shot('#modal-rules .modal-box', 'manual-spread.png');
    const r = await pg.locator(`#p${mid + 1}`).boundingBox();
    await pg.mouse.move(r.x + r.width * .9, r.y + r.height * .6); await pg.mouse.down();
    await pg.mouse.move(r.x + r.width * .55, r.y + r.height * .6, { steps:8 });
    assert(await pg.evaluate(() => window.__manual.turning && window.__manual.progress > .2));
    await pg.screenshot({ path:path.join(shots, 'manual-drag.png'), animations:'allow' });
    await pg.mouse.up(); await pageIs(mid + 2);
    await pg.keyboard.press('Escape'); assert(!(await pg.locator('#modal-rules').isVisible()), 'Escape closes the modal');
    pass('Rulebook modal: the book alone; a click turns the page, the leaf bends and throws a shadow, drag, keyboard, index links, facing example, bounded first/last pages, Escape');
    await pg.setViewportSize({ width:390, height:844 });
    assert(await pg.evaluate(() => { const s = document.getElementById('stage').getBoundingClientRect(); return Math.round(s.height) === innerHeight && document.documentElement.scrollWidth <= innerWidth; }), 'mobile: the stage fills the viewport, no horizontal overflow');
    await pg.locator('#nav [data-open="rules"]').click();
    await pg.waitForFunction(() => window.__manual.single); await idle();   /* the viewer relays out; a click during a turn is ignored */
    await pg.evaluate(() => window.__manual.go(1)); await pageIs(1);
    assert.equal(await pg.locator('#book .sheet[aria-hidden="false"]').count(), 1);
    await shot('#modal-rules .modal-box', 'manual-mobile.png');
    const m = await pg.locator('#p1').boundingBox();
    await pg.mouse.click(m.x + m.width * .8, m.y + m.height * .8); await pageIs(2);   /* the right half turns forward */
    const m2 = await pg.locator('#p2').boundingBox();
    await pg.mouse.click(m2.x + m2.width * .8, m2.y + m2.height * .5); await pageIs(3);
    const m3 = await pg.locator('#p3').boundingBox();
    await pg.mouse.click(m3.x + m3.width * .2, m3.y + m3.height * .5); await pageIs(2);   /* the left half turns back */
    await pg.emulateMedia({ reducedMotion:'reduce' });
    await pg.mouse.click(m2.x + m2.width * .8, m2.y + m2.height * .5); await pageIs(3);
    await pg.emulateMedia({ reducedMotion:'no-preference' });
    await pg.locator('#modal-rules .close').click(); assert(!(await pg.locator('#modal-rules').isVisible()));
    pass('390 px: single pages, a click on either half, reduced motion, full-viewport stage');
    /* the parts panel and the files modal */
    await pg.setViewportSize({ width:1400, height:1000 });
    await pg.locator('#nav [data-open="parts"]').click();
    assert.equal(await pg.evaluate(() => window.__qa().mode), 'parts'); assert(await pg.locator('#panel').isVisible());
    assert(await pg.locator('#plist .pitem').count() > 20);
    await pg.locator('#pv-explode').click();
    await pg.locator('#plist .pitem').last().click(); await frame();
    await shot('#stage', 'stage-parts.png');
    await pg.locator('#panel [data-close="parts"]').click();
    assert.equal(await pg.evaluate(() => window.__qa().mode), 'table'); assert(!(await pg.locator('#panel').isVisible()));
    await pg.locator('#nav [data-open="files"]').click(); assert(await pg.locator('#modal-files').isVisible());
    const firstSheet = await pg.locator('#production-sheets .sheet[data-generated="true"]').first().getAttribute('data-sheet-id');
    assert(firstSheet, 'a generated production sheet to regenerate');
    const old = await pg.locator(`#sheets [data-sheet-id="${firstSheet}"] a`).getAttribute('href');
    const kerfKey = await pg.evaluate(() => Object.values(META.stocks)[0].params.kerf);
    await pg.evaluate(k => window.__setStock({ [k]: 0.19 }), kerfKey);
    await pg.waitForFunction(() => window.__regen.log.length && !window.__regen.busy, null, { timeout:300000 });
    assert.equal(await pg.locator('#st-status').getAttribute('class'), 'ok');
    assert.notEqual(await pg.locator(`#sheets [data-sheet-id="${firstSheet}"] a`).getAttribute('href'), old);
    assert.equal(await pg.locator('#book .sheet').count(), PAGES);
    await shot('#modal-files .modal-box', 'files-modal.png');
    await pg.locator('#modal-files .close').click(); assert(!(await pg.locator('#modal-files').isVisible()));
    pass('Parts panel with Explode and part selection; files modal with stock regeneration');
    /* GET string: each modal writes its place; a reload opens that same view */
    await pg.locator('#nav [data-open="rules"]').click();
    await pg.waitForFunction(() => window.__manual && window.__manual.single === false);
    await pg.evaluate(() => window.__manual.set(4));
    assert.equal(await pg.evaluate(() => window.__manual.page), 4);
    assert.match(await pg.evaluate(() => location.search), /(?:\?|&)rules=4(?:&|$)/);
    await pg.reload({ timeout:180000 }); await ready(); await frame();
    assert(await pg.locator('#modal-rules').isVisible(), 'reload restores the rulebook modal');
    assert.equal(await pg.evaluate(() => window.__manual.page), 4, 'reload restores the rulebook page');
    await pg.keyboard.press('Escape'); assert(!(await pg.locator('#modal-rules').isVisible()));
    assert.equal(await pg.evaluate(() => location.search), '', 'closing the rulebook clears the GET string');
    const partId = await pg.locator('#plist .pitem').nth(1).getAttribute('data-id');
    await pg.locator('#nav [data-open="parts"]').click();
    await pg.locator(`#plist .pitem[data-id="${partId}"]`).click(); await frame();
    assert.equal(await pg.evaluate(() => new URLSearchParams(location.search).get('parts')), partId);
    await pg.reload({ timeout:180000 }); await ready(); await frame();
    assert.equal(await pg.evaluate(() => window.__qa().mode), 'parts', 'reload restores the parts panel');
    assert.equal(await pg.evaluate(() => document.querySelector('#plist .pitem.on') && document.querySelector('#plist .pitem.on').dataset.id), partId);
    await pg.locator('#panel [data-close="parts"]').click();
    const sheetId = await pg.locator('#sheets .sheet').first().getAttribute('data-sheet-id');
    await pg.locator('#nav [data-open="files"]').click();
    await pg.locator(`#sheets .sheet[data-sheet-id="${sheetId}"] .sheet-preview`).click();
    assert(await pg.evaluate(() => window.__lightbox && window.__lightbox.open));
    assert.equal(await pg.evaluate(() => new URLSearchParams(location.search).get('files')), sheetId);
    await pg.reload({ timeout:180000 }); await ready(); await frame();
    assert(await pg.locator('#modal-files').isVisible(), 'reload restores the files modal');
    assert(await pg.evaluate(id => window.__lightbox && window.__lightbox.open && window.__lightbox.id === id, sheetId), 'reload restores the sheet lightbox');
    await pg.keyboard.press('Escape');
    assert(await pg.locator('#modal-files').isVisible());
    assert.equal(await pg.evaluate(() => new URLSearchParams(location.search).get('files')), '');
    await pg.locator('#modal-files .close').click();
    pass('GET string: reload restores the rulebook page, the selected part, and the files lightbox');
    assert.deepEqual(external, [], 'Page load must not request companion assets or network resources');
    assert.deepEqual(errors, [], 'No console errors or uncaught exceptions');
    pass('No external page resources, console errors or uncaught exceptions');
  } finally { await browser.close(); }
  console.log(`page_check: ${checks.length} groups passed`);
}
main().catch(e => { console.error(e); process.exitCode = 1; });
