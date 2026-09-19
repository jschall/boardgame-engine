#!/usr/bin/env node
/* SPDX-License-Identifier: MPL-2.0; Copyright (C) 2026 Jonathan Challinger; source: https://github.com/jschall/boardgame-engine
   This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at https://mozilla.org/MPL/2.0/. */
/* manual/assets.js (boardgame-engine): the rulebook's figures from the real cut files and the built page, so nothing in the book is drawn twice.
   The game's manual/figures.js says what to capture: module.exports = ({ META, PARTS, S }) => ({
     parts: ['tile-apple-1', 'farmer-red', ...],                               each becomes assets/<id>.svg (the production paths in print colours)
     renders: { cover: { hash: '#shot=table&p=48&y=0', width: 2000, height: 625 }, ... }   each becomes assets/render-<name>.png, shot from the built page
     extra(ctx)                                                                 optional: more assets (composites) written by the game
   })
   Writes assets/provenance.json (source hashes) and copies the three Fredoka weights and OFL.txt beside them. All output stays in manual/. */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const sharp = require('sharp');
async function main(GAME_DIR) {
  const ROOT = path.join(GAME_DIR, 'manual'), CFG = JSON.parse(fs.readFileSync(path.join(GAME_DIR, 'game.json'), 'utf8'));
  const raw = fs.readFileSync(path.join(GAME_DIR, 'parts/parts.json'), 'utf8'), P = JSON.parse(raw);
  const pageFile = path.join(GAME_DIR, `${CFG.slug}.html`);
  if (!fs.existsSync(pageFile)) throw Error(`${pageFile} is missing: build the page first (node engine/bin/bg.js page --no-manual)`);
  const S = require(path.join(GAME_DIR, CFG.sim));
  const figures = require(path.join(ROOT, 'figures.js'))({ META: P.meta, PARTS: P.parts, S });
  if (!Array.isArray(figures.parts)) throw Error('manual/figures.js must return parts: [ids]');
  const materials = {};
  for (const sheet of Object.values(P.layout)) for (const [pid] of sheet.items) { if (pid && materials[pid] && materials[pid] !== sheet.mat) throw Error('Conflicting production materials for ' + pid); if (pid) materials[pid] = sheet.mat; }
  fs.mkdirSync(path.join(ROOT, 'assets'), { recursive: true }); fs.mkdirSync(path.join(ROOT, 'tmp'), { recursive: true });
  const browser = await require('../checks/browser.js').launch({ headless: true });
  const page = await browser.newPage();
  const meta = { captured: new Date().toISOString(), sha256: {}, parts: [], renders: {} };
  for (const f of ['parts/parts.json', `${CFG.slug}.html`, CFG.sim, 'table.js']) meta.sha256[f] = crypto.createHash('sha256').update(f === 'parts/parts.json' ? raw : fs.readFileSync(path.join(GAME_DIR, f))).digest('hex');
  for (const id of figures.parts) {
    if (!P.parts[id]) throw Error(`figures.js names ${id}, which parts.json does not have`);
    await page.setContent(`<svg xmlns="http://www.w3.org/2000/svg">${id === 'floor-base' ? P.parts['floor-base-map'] : ''}${P.parts[id]}</svg>`);
    const bounds = await page.locator('svg').evaluate(el => { const b = el.getBBox(); return [b.x, b.y, b.width, b.height]; });
    const el = await page.locator('svg').evaluate(el => Array.from(el.children).map(e => ({ html: e.outerHTML, cut: ['#ff0000', '#cc0000'].includes(e.getAttribute('stroke')) })));
    const cut = el.filter(x => x.cut), outer = cut.pop();
    const walnut = materials[id] === 'walnut', wood = walnut ? '#6b4a2e' : '#ead5af', ink = walnut ? '#e8cfaa' : '#34251c';
    /* nested leaf-cut polylines are open cuts: keep their geometry and fill="none", printed in the same ink as the other cut and score lines */
    const body = (outer ? outer.html.replace('fill="none"', `fill="${wood}"`).replace(/stroke="[^"]+"/, `stroke="${ink}"`).replace(/stroke-width="[^"]+"/, 'stroke-width="0.3"') : '') + el.filter(x => !x.cut).map(x => x.html.replaceAll('#000000', ink).replaceAll('#0000ff', ink).replaceAll('#ff0000', ink).replaceAll('#cc0000', ink)).join('') + cut.map(x => x.html.replace('fill="none"', 'fill="#fffaf0"').replace(/stroke="[^"]+"/, `stroke="${ink}"`)).join('');
    const [x, y, w, h] = bounds, vb = [x - 1, y - 1, w + 2, h + 2];
    fs.writeFileSync(path.join(ROOT, 'assets', id + '.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.join(' ')}">${body}</svg>`);
    meta.parts.push(id);
  }
  await page.close();
  for (const [name, r] of Object.entries(figures.renders || {})) {
    const pg = await browser.newPage({ viewport: { width: 1500, height: 1100 }, deviceScaleFactor: 2 });
    await pg.addInitScript(() => { window.__manualReady = false; window.__signalReady = () => window.__manualReady = true; });
    await pg.goto('file://' + pageFile + r.hash, { waitUntil: 'domcontentloaded', timeout: 180000 });
    await pg.waitForFunction(() => window.__manualReady, {}, { timeout: 180000 });
    await pg.waitForTimeout(400);
    /* project every part's complete solid bounds; never crop a tile or standee */
    const capture = await pg.evaluate(() => {
      const s = window.__scene, points = [];
      for (const inst of s.static.concat(s.dynamic)) { if (inst.hidden || !inst.part) continue; const b = inst.part.bbox, B = s.basis(inst); for (const u of [b[0], b[2]]) for (const v of [b[1], b[3]]) for (const z of [0, inst.thick || 3]) points.push(s.project(...s.world(B, u, v, z))); }
      const pad = 12, x = Math.max(0, Math.floor(Math.min(...points.map(p => p[0])) - pad)), y = Math.max(0, Math.floor(Math.min(...points.map(p => p[1])) - pad));
      const right = Math.min(s.W, Math.ceil(Math.max(...points.map(p => p[0])) + pad)), bottom = Math.min(s.H, Math.ceil(Math.max(...points.map(p => p[1])) + pad));
      if (![x, y, right, bottom].every(Number.isFinite) || right <= x || bottom <= y) throw Error('Figure has invalid projected bounds');
      const rect = s.canvas.getBoundingClientRect();
      return { clip: { x: rect.x + x, y: rect.y + y, width: right - x, height: bottom - y }, yaw: s.opts.yaw, pitch: s.opts.pitch };
    });
    await pg.screenshot({ path: path.join(ROOT, 'tmp', name + '.png'), timeout: 90000, clip: capture.clip });
    await sharp(path.join(ROOT, 'tmp', name + '.png')).resize(r.width && r.height ? { width: r.width, height: r.height, fit: 'contain', background: r.background || '#e4d6b8' } : { width: r.width || 1500 }).png().toFile(path.join(ROOT, 'assets', 'render-' + name + '.png'));
    meta.renders[name] = { hash: r.hash, capture };
    await pg.close();
  }
  if (typeof figures.extra === 'function') await figures.extra({ P, materials, ROOT, GAME_DIR, browser, meta });
  const fonts = require('../src/game_fonts.js')(GAME_DIR, CFG);
  for (const f of Object.keys(fonts.files)) fs.copyFileSync(path.join(fonts.dir, f), path.join(ROOT, 'assets', f));
  if (fonts.license) fs.writeFileSync(path.join(ROOT, 'assets', 'OFL.txt'), fs.readFileSync(fonts.license, 'utf8').replace(/[ \t]+$/gm, ''));
  for (const [f, hash] of Object.entries(meta.sha256)) if (crypto.createHash('sha256').update(fs.readFileSync(path.join(GAME_DIR, f))).digest('hex') !== hash) throw Error('Source regenerated during capture; rerun assets.js: ' + f);
  fs.writeFileSync(path.join(ROOT, 'assets', 'provenance.json'), JSON.stringify(meta, null, 2) + '\n');
  await browser.close(); console.log(`Refreshed ${meta.parts.length} real part drawings and ${Object.keys(meta.renders).length} 3D renders.`);
}
module.exports = main;
if (require.main === module) main(path.resolve(process.cwd(), '..')).catch(e => { console.error(e); process.exit(1); });
