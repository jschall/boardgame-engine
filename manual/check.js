#!/usr/bin/env node
/* SPDX-License-Identifier: MPL-2.0; Copyright (C) 2026 Jonathan Challinger; source: https://github.com/jschall/boardgame-engine
   This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at https://mozilla.org/MPL/2.0/. */
/* manual/check.js (boardgame-engine): what every print rulebook must satisfy, checked against the built PDFs and the page's cut files:
   the press PDF has the page count game.json promises with 180 mm trim and 186 mm bleed boxes; the booklet is US Letter with every logical page
   exactly once; the layout audit found no overflow, missing image or orphan; every part drawing in assets/ still carries the production paths
   (no cut or engraving changed since it was captured) and no laser colour; the fonts are embedded in the PDF; every "page N" reference in the
   text points inside the book; the safety warning appears. Game-specific checks belong in the game's manual/verify.js. */
'use strict';
const fs = require('fs'), path = require('path'), assert = require('assert/strict'), { execFileSync } = require('child_process');
const { PDFDocument } = require('pdf-lib');
async function main(GAME_DIR) {
  const ROOT = path.join(GAME_DIR, 'manual'), CFG = JSON.parse(fs.readFileSync(path.join(GAME_DIR, 'game.json'), 'utf8'));
  const PAGES = CFG.manual && CFG.manual.pages; if (!Number.isInteger(PAGES)) throw new Error('game.json manual.pages is required');
  const checks = [], check = (label, f) => { f(); checks.push(label); };
  const press = path.join(ROOT, 'output', `${CFG.slug}-print.pdf`), booklet = path.join(ROOT, 'output', `${CFG.slug}-letter-booklet.pdf`);
  const pdf = await PDFDocument.load(fs.readFileSync(press)), bk = await PDFDocument.load(fs.readFileSync(booklet));
  const LETTER = CFG.manual && CFG.manual.format === 'letter';
  if (LETTER) check(`the press PDF has ${PAGES} US Letter pages`, () => { assert.equal(pdf.getPageCount(), PAGES); for (const p of pdf.getPages()) { assert(Math.abs(p.getWidth() - 612) < 1 && Math.abs(p.getHeight() - 792) < 1); } });
  else check(`the press PDF has ${PAGES} pages with 180 mm trim and 186 mm bleed boxes`, () => { assert.equal(pdf.getPageCount(), PAGES); for (const p of pdf.getPages()) { assert(Math.abs(p.getTrimBox().width - 180 * 72 / 25.4) < .01); assert(Math.abs(p.getBleedBox().width - 186 * 72 / 25.4) < .01); } });
  if (LETTER) check('the booklet is Tabloid landscape with every logical page exactly once', () => { assert.equal(bk.getPageCount(), PAGES / 2); for (const p of bk.getPages()) { assert.equal(p.getWidth(), 1224); assert.equal(p.getHeight(), 792); } const imp = JSON.parse(fs.readFileSync(path.join(ROOT, 'qa/imposition.json'))); assert.deepEqual(imp.sheets.flat().sort((a, b) => a - b), [...Array(PAGES).keys()].map(i => i + 1)); });
  else check('the booklet is US Letter landscape with every logical page exactly once', () => { assert.equal(bk.getPageCount(), PAGES / 2); for (const p of bk.getPages()) { assert.equal(p.getWidth(), 792); assert.equal(p.getHeight(), 612); } const imp = JSON.parse(fs.readFileSync(path.join(ROOT, 'qa/imposition.json'))); assert.deepEqual(imp.sideOrder.flat().slice().sort((a, b) => a - b), Array.from({ length: PAGES }, (_, i) => i + 1)); });
  check('the layout audit found no overflow, missing image or orphan line', () => { const lay = JSON.parse(fs.readFileSync(path.join(ROOT, 'qa/layout.json'))); assert.deepEqual(lay.overflow, []); assert.deepEqual(lay.missingImages, []); assert.deepEqual(lay.orphanCaptions, []); assert.deepEqual(lay.orphanParagraphs, []); assert.equal(lay.pageCount, PAGES); });
  check('every part drawing keeps its production paths, in print colours', () => {
    const parts = JSON.parse(fs.readFileSync(path.join(GAME_DIR, 'parts/parts.json'))), meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/provenance.json')));
    const paths = svg => [...svg.matchAll(/<path\b[^>]*\bd="([^"]+)"/g)].map(m => m[1]).sort(), polylines = svg => [...svg.matchAll(/<polyline\b[^>]*\bpoints="([^"]+)"/g)].map(m => m[1]).sort();
    for (const id of meta.parts) {
      const drawing = fs.readFileSync(path.join(ROOT, 'assets', id + '.svg'), 'utf8'), production = (id === 'floor-base' ? parts.parts['floor-base-map'] : '') + parts.parts[id];
      assert.deepEqual(paths(drawing), paths(production), `Changed cut/engrave path: ${id}`); assert.deepEqual(polylines(drawing), polylines(production), `Changed leaf-cut polyline: ${id}`);
      assert(!/(?:stroke|fill)="#(?:ff0000|cc0000|0000ff)"/i.test(drawing), `Laser colour in print drawing: ${id}`);
    }
  });
  const have = cmd => { try { execFileSync(cmd, ['-v'], { stdio: 'ignore' }); return true; } catch (e) { return e.status !== undefined; } };
  if (have('pdffonts') && have('pdftotext')) {
    check('the fonts are embedded', () => { const f = execFileSync('pdffonts', [press], { encoding: 'utf8' }).split('\n').slice(2).filter(Boolean); assert(f.length, 'no fonts listed'); for (const line of f) assert(/\byes\b/.test(line.split(/\s{2,}/).slice(-4).join(' ')), 'a font is not embedded: ' + line); });
    const text = execFileSync('pdftotext', [press, '-'], { encoding: 'utf8' }).split('\f').slice(0, PAGES);
    check('every "page N" reference points inside the book', () => { for (const [i, t] of text.entries()) for (const m of t.matchAll(/\bpages? (\d+)(?:[–-](\d+))?/g)) { for (const n of [+m[1], +(m[2] || m[1])]) assert(n >= 1 && n <= PAGES, `page ${i + 1} refers to page ${n}`); } });
    check('the choking-hazard warning is in the book', () => assert(text.some(t => /CHOKING HAZARD/.test(t)), 'no CHOKING HAZARD warning in the text'));
  } else console.log('manual/check: poppler (pdffonts, pdftotext) is not installed: the font and text checks were skipped');
  console.log(`manual/check: ${checks.length} checks passed`);
}
module.exports = main;
if (require.main === module) main(process.cwd()).catch(e => { console.error(e); process.exit(1); });
