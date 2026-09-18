#!/usr/bin/env node
/* page_gate.js (boardgame-engine): the live page gate: structure, the real manual embedded, offline assets, the opening (scroll-driven, reversible,
   sticky), the reader's flow (auto-start at the bottom, pack and resume), the rulebook modal, phones, the parts panel, the files modal with a stock
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
  for (const weight of ['Medium', 'SemiBold', 'Bold']) assert(html.includes(fs.readFileSync(path.join(root, 'manual/assets', `Fredoka-${weight}.ttf`)).toString('base64')));
  pass('Every manual SVG, the lossless PNGs and three Fredoka weights are embedded');
  /* the machine's GPU when headless Chromium can reach it (PAGE_CHECK_GPU=1), else the software rasterizer */
  const browser = await require('./browser.js').launch();
  const errors = [], external = [];
  try {
    const pg = await browser.newPage({ viewport:{ width:1400, height:1000 } });
    pg.on('pageerror', e => errors.push(String(e)));
    pg.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    pg.on('request', r => { if (!r.url().startsWith('data:') && !r.url().startsWith('blob:') && r.url() !== pathToFileURL(file).href) external.push(r.url()); });
    const ready = () => pg.waitForFunction(() => window.__manual && window.__qa && window.__intro && (window.__intro.live || window.__intro.p >= 0 || window.__qa().playing), null, { timeout:300000 });
    const frame = () => pg.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    const shot = (sel, name) => pg.locator(sel).screenshot({ path:path.join(shots, name), animations:'disabled', timeout:120000 });
    await pg.goto(pathToFileURL(file).href, { timeout:300000 });
    await ready(); await pg.evaluate(() => document.fonts.ready);
    /* the page: one stage that is the whole scroll, then the two modals; nothing else */
    assert.deepEqual(await pg.locator('body > section, body > main, body > header, body > .modal').evaluateAll(es => es.map(e => e.id || e.tagName)), ['demo', 'modal-rules', 'modal-files']);
    assert.deepEqual(await pg.locator('#modal-rules > .modal-box > section, #modal-files > .modal-box > section').evaluateAll(es => es.map(e => e.id)), ['rules', 'files']);
    for (const sel of ['#btn-play', '#btn-new', '#speed', '#btn-view', '.tabs', '[data-mode]', '.pill', 'header.hero', '#below', '#manual-zoom', '#btn-lift']) assert.equal(await pg.locator(sel).count(), 0, 'no ' + sel);
    assert.deepEqual(await pg.locator('#nav button').evaluateAll(es => es.map(e => [e.dataset.open, e.textContent])), [['rules', 'Rulebook'], ['parts', 'Parts'], ['files', 'Laser files']]);
    assert.equal(await pg.locator('#stage > canvas#c3d, #stage > .cue, #stage > #btn-skip, #stage > #intro-title h1, #stage > #nav, #stage > .hud > #chips, #stage > .hud > #log, #stage > #panel[hidden]').count(), 8, 'the stage: canvas, cue, skip, title, nav, chips and log in the HUD, the parts panel closed');
    assert.deepEqual(await pg.locator('#log').evaluate(e => [getComputedStyle(e).overflowY, getComputedStyle(e).pointerEvents]), ['hidden', 'none'], 'the log neither scrolls under the wheel nor takes the pointer');
    assert.equal(await pg.locator('a[href*="manual/output"]').count(), 2, 'the two PDF links, once each, in the rulebook modal');
    const GP = require(path.join(root, 'page.js'))(CFG, JSON.parse(fs.readFileSync(path.join(root, 'parts/parts.json'))));
    const expected = GP.SHEET_GROUPS.flatMap(g => g.sheets.flatMap(s => [s.id].concat(s.back ? [s.back] : []))).sort();
    assert.deepEqual(await pg.locator('#sheets .sheet').evaluateAll(es => es.map(e => e.dataset.sheetId).sort()), expected);
    assert(await pg.locator('#sheets .sheet').evaluateAll(es => es.every(e => { const a = e.querySelector('a[download]'); return a && a.download.endsWith('.svg') && a.href.startsWith('blob:'); })), 'every sheet card downloads its SVG (a blob URL)');
    assert.equal(await pg.locator('#stock input').count(), 3 * Object.keys(JSON.parse(fs.readFileSync(path.join(root, 'parts/parts.json'))).meta.stocks).length);
    assert.equal(await pg.locator('#sheet-status').count(), 1);
    for (const a of await pg.locator('.rulebook-top a').all()) assert(fs.existsSync(path.resolve(path.dirname(file), await a.getAttribute('href'))));
    assert.equal(await pg.evaluate(() => getComputedStyle(document.documentElement).scrollbarWidth), 'none', 'no scrollbar');
    pass(`One stage, two modals, three nav buttons, no controls, ${expected.length} sheet downloads, stock and PDF links`);
    /* the opening: scroll-driven, reversible, sticky, skipped for #shot= and reduced motion, handed back to the table by the hooks */
    const poses = () => pg.evaluate(() => window.__scene.static.concat(window.__scene.dynamic).map(i => [i.part && i.part.pid, i.x, i.y, i.z, i.hidden, i.alpha, JSON.stringify(i.group)]));
    await frame(); assert.deepEqual(await pg.evaluate(() => [window.__intro.live, window.__intro.p, scrollY]), [true, 0, 0], 'the page opens at the top with the boxes closed');
    assert(await pg.evaluate(() => window.__intro.end < 0.985), 'the last piece lands before the bottom');
    assert.equal(await pg.evaluate(() => getComputedStyle(document.getElementById('hud')).visibility), 'hidden');
    assert(await pg.locator('#cue').isVisible() && await pg.locator('#intro-title').isVisible() && await pg.locator('#nav').isVisible());
    const stage = await pg.locator('#stage').boundingBox(); assert.equal(Math.round(stage.height), 1000, 'the stage fills the viewport'); assert.equal(Math.round(stage.y), 0);
    assert.equal(await pg.evaluate(() => getComputedStyle(document.getElementById('stage')).position), 'sticky', 'the stage is sticky (the renderer must not override it)');
    assert(await pg.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal overflow');
    const at0 = await poses();
    await pg.evaluate(() => window.__intro.set(0.5)); await frame(); const at50 = await poses();
    assert(at50.some((r, i) => r[1] !== at0[i][1] || r[2] !== at0[i][2] || r[3] !== at0[i][3]), 'scrolling moves the pieces');
    assert.equal(await pg.evaluate(() => window.__scene.opts.tableAlpha), 1);
    await pg.evaluate(() => window.__intro.set(0)); await frame(); assert.deepEqual(await poses(), at0, 'the opening runs backwards to the same frame');
    assert.equal(await pg.evaluate(() => window.__scene.opts.tableAlpha), 0, 'no table before the lights come up');
    await pg.evaluate(() => window.__intro.set(1)); await frame();
    assert.equal(await pg.evaluate(() => getComputedStyle(document.getElementById('hud')).visibility), 'visible');
    assert(!(await pg.locator('#cue').isVisible()) && !(await pg.locator('#intro-title').isVisible()));
    assert.equal(await pg.evaluate(() => window.__qa().playing), false, 'a frozen frame at the bottom does not start the game');
    await shot('#stage', 'stage-unpacked.png');
    const range = await pg.evaluate(() => { const t = document.getElementById('track'), s = document.getElementById('stage'); return [t.offsetHeight - s.offsetHeight, t.getBoundingClientRect().top + scrollY]; });
    assert(range[0] > 2000, 'a long scroll track');
    const tablePose = await pg.evaluate(() => window.__placements.table().map(i => [i.part.pid, i.x, i.y, i.z, i.group === undefined]));
    assert(tablePose.every(r => r[4]) && !(await pg.evaluate(() => window.__intro.live)), 'asking for the table pose ends the opening and clears every group');
    pass('The opening: scroll-driven and reversible, sticky, HUD veiled until the end, hooks see the table pose');
    /* the reader's flow: the real scrollbar drives it; the game starts at the bottom by itself; scrolling up returns the pieces and re-arms it */
    await pg.reload(); await ready(); await frame();
    await pg.evaluate(y => window.scrollTo(0, y), range[1] + range[0] * 0.5);
    await pg.waitForFunction(() => Math.abs(window.__intro.p - 0.5) < 0.005, null, { timeout:20000 });
    assert.equal(await pg.evaluate(() => document.getElementById('stage').getBoundingClientRect().top), 0, 'the stage stays put while the track scrolls');
    await shot('#stage', 'stage-opening.png');
    await pg.evaluate(y => window.scrollTo(0, y), range[1] + range[0]);
    await pg.waitForFunction(() => !window.__intro.live && window.__qa().playing, null, { timeout:20000 });
    await pg.waitForFunction(() => document.querySelectorAll('#log .le').length > 2, null, { timeout:60000 });
    const logH = await pg.locator('#log').evaluate(e => e.getBoundingClientRect().height);
    await pg.waitForFunction(n => document.querySelectorAll('#log .le').length > n + 3, await pg.locator('#log .le').count(), { timeout:60000 });
    assert.equal(await pg.locator('#log').evaluate(e => e.getBoundingClientRect().height), logH, 'the log keeps its height as it fills');
    assert.equal(await pg.locator('#chips .chip').count(), NPLAY);
    await shot('#stage', 'stage-game.png');
    await pg.evaluate(y => window.scrollTo(0, y), range[1] + range[0] * 0.7);
    await pg.waitForFunction(() => window.__intro.live && !window.__qa().playing && Math.abs(window.__intro.p - 0.7) < 0.01, null, { timeout:20000 });
    const turnAtPack = await pg.evaluate(() => window.__qa().turn);
    await pg.evaluate(y => window.scrollTo(0, y), range[1] + range[0]);
    await pg.waitForFunction(() => window.__qa().playing, null, { timeout:60000 });
    await pg.waitForFunction(t => window.__qa().turn > t, turnAtPack, { timeout:90000 });
    assert(await pg.locator('#log .le').filter({ hasText: 'The game goes on.' }).count() >= 1, 'scrolling up packs the live game; scrolling down unpacks it and it goes on');
    await pg.evaluate(() => window.scrollTo(0, 0));
    await pg.waitForFunction(() => window.__intro.live && window.__intro.p === 0, null, { timeout:20000 });
    await pg.locator('#btn-skip').click(); await pg.waitForFunction(() => !window.__intro.live && window.__qa().playing, null, { timeout:20000 });
    assert(!(await pg.locator('#btn-skip').isVisible()), 'Skip scrolls to the bottom and the game starts');
    await pg.emulateMedia({ reducedMotion:'reduce' }); await pg.reload(); await ready(); await frame();
    assert.deepEqual(await pg.evaluate(() => [window.__intro.live, document.getElementById('track').offsetHeight === document.getElementById('stage').offsetHeight, getComputedStyle(document.getElementById('hud')).visibility, window.__qa().playing]), [false, true, 'visible', true], 'reduced motion: the assembled table, no scroll track, the game plays');
    await pg.emulateMedia({ reducedMotion:'no-preference' });
    pass('The reader\'s flow: the scrollbar drives the opening, the game starts at the bottom, scrolling up packs the live game and down resumes it, Skip, reduced motion');
    /* the rulebook modal: the real manual, page turning, keyboard, index links, phones */
    await pg.reload(); await ready(); await frame();
    await pg.locator('#nav [data-open="rules"]').click(); assert(await pg.locator('#modal-rules').isVisible());
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
    assert(await pg.locator('#manual-prev').isDisabled());
    await pg.locator('#manual-next').click();
    await pg.waitForFunction(() => window.__manual.progress > .15 && window.__manual.progress < .95);
    assert(await pg.locator('#book .turning').evaluate(e => getComputedStyle(e).transform.startsWith('matrix3d(')));
    await pg.screenshot({ path:path.join(shots, 'manual-turn.png'), animations:'allow' });
    await pageIs(2);
    assert.equal(await pg.locator('#book .sheet[aria-hidden="false"]').count(), 2);
    await pg.locator('#manual-reader').focus(); await pg.keyboard.press('ArrowRight'); await pageIs(4);
    await pg.keyboard.press('ArrowLeft'); await pageIs(2);
    await pg.keyboard.press('Home'); await pageIs(1);
    await pg.keyboard.press('End'); await pageIs(PAGES); assert(await pg.locator('#manual-next').isDisabled());
    /* an index page, when the manual has one (a .index with links to pages): the first link leads to its page */
    const idx = await pg.evaluate(() => { const a = document.querySelector('#book .index a'); if (!a) return null; return { from: +a.closest('.sheet').id.slice(1), to: +a.querySelector('b').textContent }; });
    if (idx) { await pg.locator('#manual-page').selectOption(String(idx.from)); await pageIs(idx.from); await pg.locator('#book .index a').first().click(); await pageIs(idx.to % 2 ? idx.to : idx.to); }
    const mid = Math.max(2, Math.floor(PAGES / 2)) & ~1;   /* an even page: the left of a spread */
    await pg.locator('#manual-page').selectOption(String(mid)); await pageIs(mid);
    await shot('#modal-rules .modal-box', 'manual-spread.png');
    const r = await pg.locator(`#p${mid + 1}`).boundingBox();
    await pg.mouse.move(r.x + r.width * .9, r.y + r.height * .6); await pg.mouse.down();
    await pg.mouse.move(r.x + r.width * .55, r.y + r.height * .6, { steps:8 });
    assert(await pg.evaluate(() => window.__manual.turning && window.__manual.progress > .2));
    await pg.screenshot({ path:path.join(shots, 'manual-drag.png'), animations:'allow' });
    await pg.mouse.up(); await pageIs(mid + 2);
    await pg.keyboard.press('Escape'); assert(!(await pg.locator('#modal-rules').isVisible()), 'Escape closes the modal');
    pass('Rulebook modal: real 3D turn, drag, keyboard, page selector, index links, facing example, bounded first/last pages, Escape');
    await pg.setViewportSize({ width:390, height:844 });
    assert(await pg.evaluate(() => { const s = document.getElementById('stage').getBoundingClientRect(); return Math.round(s.height) === innerHeight && document.documentElement.scrollWidth <= innerWidth; }), 'mobile: the stage fills the viewport, no horizontal overflow');
    await pg.locator('#nav [data-open="rules"]').click();
    await pg.waitForFunction(() => window.__manual.single);
    await pg.locator('#manual-page').selectOption('1'); await pageIs(1);
    assert.equal(await pg.locator('#book .sheet[aria-hidden="false"]').count(), 1);
    await shot('#modal-rules .modal-box', 'manual-mobile.png');
    const m = await pg.locator('#p1').boundingBox();
    await pg.mouse.click(m.x + m.width * .93, m.y + m.height * .8); await pageIs(2);
    await pg.locator('#manual-next').click(); await pageIs(3);
    await pg.locator('#manual-prev').click(); await pageIs(2);
    await pg.emulateMedia({ reducedMotion:'reduce' });
    await pg.locator('#manual-next').click(); await pageIs(3);
    await pg.emulateMedia({ reducedMotion:'no-preference' });
    await pg.locator('#modal-rules .close').click(); assert(!(await pg.locator('#modal-rules').isVisible()));
    pass('390 px: single pages, corner click, previous/next, reduced motion, full-viewport stage');
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
    const firstSheet = expected.find(s => /^sheet\d+$/.test(s));
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
    assert.deepEqual(external, [], 'Page load must not request companion assets or network resources');
    assert.deepEqual(errors, [], 'No console errors or uncaught exceptions');
    pass('No external page resources, console errors or uncaught exceptions');
  } finally { await browser.close(); }
  console.log(`page_check: ${checks.length} groups passed`);
}
main().catch(e => { console.error(e); process.exitCode = 1; });
