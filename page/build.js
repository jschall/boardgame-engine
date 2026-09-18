#!/usr/bin/env node
/* build.js (boardgame-engine): builds the game's single self-contained page: the stage (the opening the box button runs, the self-playing table, the parts
   viewer), the rulebook modal (the print manual embedded as a book) and the laser-files modal (every sheet, downloadable, and the stock inputs
   that regenerate them in a worker).
   Run from the game folder:  node engine/bin/bg.js page [--out FILE] [--no-geom] [--no-manual]
   --no-manual builds the page without the rulebook PDFs (the section keeps the book, the links are left out): the bootstrap build the manual's
   assets.js captures its 3D figures from, before the PDFs exist. The deliverable is always built without it.
   Inputs (game folder): game.json, parts/parts.json, parts/engraving_cache.json, <slug>-sim.js, table.js, page.js (the sheet catalogue and the word
   list), showcase.json, packing.json, jig.json, parts/jig-sheet.svg and the game's other test sheets, manual/ (the built rulebook). */
'use strict';
const fs = require('fs'), path = require('path');
const ENGINE = path.join(__dirname, '..');
module.exports = function build(GAME_DIR, argv) {
  const rd = f => fs.readFileSync(path.join(GAME_DIR, f), 'utf8');
  const outArg = (() => { const i = argv.indexOf('--out'); return i >= 0 ? argv[i + 1] : null; })();
  const CFG = JSON.parse(rd('game.json'));
  for (const k of ['name', 'slug', 'sim', 'players', 'minutes', 'tagline', 'geom_files']) if (CFG[k] === undefined) throw new Error(`game.json has no ${k}`);
  const PJ = JSON.parse(rd('parts/parts.json'));
  const SIM_JS = rd(CFG.sim);
  const simGlobal = (SIM_JS.match(/root\.(\w+)\s*=\s*factory\(\)/) || [])[1];
  if (!simGlobal) throw new Error(`${CFG.sim}: the sim must be a UMD that sets root.<Name>Sim = factory()`);
  const R3_JS = fs.readFileSync(path.join(ENGINE, 'lib', 'render3d.js'), 'utf8');
  const CUT_VIEW_JS = fs.readFileSync(path.join(ENGINE, 'src', 'cut_view.js'), 'utf8');
  const SHOW = JSON.parse(rd('showcase.json'));
  const JIG = JSON.parse(rd('jig.json'));
  const META = PJ.meta;
  const PACK_REPORT = JSON.parse(rd('packing.json'));
  const JV = require(path.join(ENGINE, 'src', 'jig_view.js'));
  const GP = require(path.join(GAME_DIR, 'page.js'))(CFG, PJ);   /* the game's page module: SHEET_GROUPS, banned words, an optional title */
  for (const k of ['SHEET_GROUPS']) if (!GP[k]) throw new Error(`page.js must export ${k}`);
  const SHEET_GROUPS = GP.SHEET_GROUPS;
  /* the manual's fonts are the engine's: they sit beside its assets so manual.html opens from disk, and the bootstrap build (before the assets are captured) has them */
  fs.mkdirSync(path.join(GAME_DIR, 'manual', 'assets'), { recursive: true });
  for (const f of ['Fredoka-Medium.ttf', 'Fredoka-SemiBold.ttf', 'Fredoka-Bold.ttf', 'OFL.txt']) if (!fs.existsSync(path.join(GAME_DIR, 'manual', 'assets', f))) fs.copyFileSync(path.join(ENGINE, 'fonts', f), path.join(GAME_DIR, 'manual', 'assets', f));
  const manual = require(path.join(ENGINE, 'page', 'manual-embed.js'))(GAME_DIR);
  const CSS = fs.readFileSync(path.join(ENGINE, 'page', 'page.css'), 'utf8') + (fs.existsSync(path.join(GAME_DIR, 'page.css')) ? '\n' + rd('page.css') : '');
  /* the hero title in Fredoka, the face of every engraved letter and of the manual, embedded so the page works from file:// */
  const HERO_FONT = fs.readFileSync(path.join(ENGINE, 'fonts', 'Fredoka-SemiBold.ttf')).toString('base64');
  const PAGE_JS = fs.readFileSync(path.join(ENGINE, 'page', 'page.js'), 'utf8');
  const TABLE_JS = rd('table.js');
  for (const [name, text] of [['engine/page/page.js', PAGE_JS], ['table.js', TABLE_JS]]) if (/^\s*\/\//m.test(text)) throw new Error(`${name} has a // line comment: the page embeds it inline, where a line comment can swallow the rest of a line`);
  /* the stock panel: each stock's thinnest and thickest caliper reading and its kerf, with the built stock as the starting values */
  function stock_inputs() {
    const num = (id, v, min, max) => `<input id="st-${id}" type="number" step="0.01" min="${min}" max="${max}" value="${v}">`;
    const rows = Object.entries(META.stocks).map(([k, s]) => { const p = s.params; return `<span class="stockrow"><b>${esc(s.name)}</b><label>thinnest ${num(p.lo, META.params[p.lo], 0.3, 10)}</label><label>thickest ${num(p.hi, META.params[p.hi], 0.3, 10)}</label><label>kerf ${num(p.kerf, META.params[p.kerf], 0.01, 0.5)}</label></span>`; });
    return `<div class="stock" id="stock"><b>Your stock</b><span class="muted">caliper each sheet in several spots and type its thinnest and thickest reading: slots, bars and fingers are drawn for the thickest, tab depths for the thinnest, so every fit holds anywhere on the sheet</span>${rows.join('')}<span id="st-status"></span></div>`;
  }

  /* JSON as Python's json.dumps(separators=(",", ":")) writes it: ASCII only, and no "</" that could end the script element */
  const js = o => JSON.stringify(o).replace(/[-￿]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')).replace(/<\//g, '<\\/');
  /* html.escape with quote=True */
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
  const rep = (s, a, b) => s.split(a).join(b);

  function sheet_text_blocks(svgs) {
    return Object.keys(svgs).filter(id => SHEET_GROUPS.some(g => g.sheets.some(s => s.id === id || s.back === id))).map(id => {
      if (/<\/script/i.test(svgs[id])) throw new Error(`${id}: the SVG text contains </script and cannot be embedded as plain text`);
      return `<script type="text/plain" class="sheet-svg" data-sheet-id="${id}">${svgs[id]}</script>`;
    }).join('\n');
  }
  function sheet_groups(svgs) {
    const seen = new Set();
    const groups = SHEET_GROUPS.map(group => `<section class="sheet-group" id="${group.id}" aria-labelledby="${group.id}-title">
      <h3 id="${group.id}-title">${group.name}</h3>
  ${group.id === 'test-sheets' ? '<p class="muted">Fit tests, kerf coupons and assembly jigs. Each download is separate from the production sheets. Standalone base tests and jigs retain the stock and kerf recorded in their files when the stock panel changes.</p>' : ''}
      ${group.id === 'test-sheets' ? '<div class="test-sheet-grid">' : ''}${group.sheets.map(sheet => {
        if (group.id === 'test-sheets') {
          const id = sheet.id;
          if (seen.has(id) || !svgs[id]) throw new Error(`duplicate or missing sheet: ${id}`);
          seen.add(id);
          return `<article class="sheet test-card" id="sheet-${id}" data-sheet-id="${id}" data-generated="${!sheet.file}" data-description="${esc(sheet.description)}">
            <button class="sheet-preview" type="button" aria-label="Preview ${esc(sheet.name)}"><img alt="${esc(sheet.name)}" loading="lazy"></button>
            <h4>${esc(sheet.name)}</h4><a download="${esc(sheet.name)}.svg">Download SVG</a>
            <p class="sheet-unavailable" hidden>Unavailable for this stock.</p>
          </article>`;
        }
        const cards = [sheet.id, sheet.back].filter(Boolean).map((id, i) => {
          if (seen.has(id) || !svgs[id]) throw new Error(`duplicate or missing sheet: ${id}`);
          seen.add(id);
          const side = i ? 'Back' : 'Front', title = `${sheet.name} · ${side}`, filename = `${sheet.name} - ${side}.svg`;
          return `<div class="sheet" data-sheet-id="${id}" data-generated="${!sheet.file}">
            <p class="sheet-side"><b>${side}</b>${!sheet.back ? ' · Single-sided — no back' : ''}</p>
            <button class="sheet-preview" type="button" aria-label="Preview ${esc(title)}"><img alt="${esc(title)}" loading="lazy"></button>
            <a download="${esc(filename)}">Download ${esc(filename)}</a>
            <p class="sheet-unavailable" hidden>Unavailable for this stock.</p>
          </div>`;
        }).join('\n');
        return `<article class="sheet-block" id="sheet-${sheet.id}" aria-labelledby="sheet-${sheet.id}-title">
          <h4 id="sheet-${sheet.id}-title">${esc(sheet.name)}</h4>
          <div class="sheet-row${sheet.back ? '' : ' single-sided'}">${cards}</div>
          <p class="sheet-description">${esc(sheet.description)}</p>
        </article>`;
      }).join('\n')}${group.id === 'test-sheets' ? '</div>' : ''}
    </section>`).join('\n');
    for (const id of Object.keys(svgs)) if (!seen.has(id)) throw new Error(`sheet ${id} needs a stable name and group in SHEET_GROUPS`);
    return groups;
  }

  /* the print rulebook: both PDFs are required, and a missing one fails the build. [[file under manual/, link text], ...] */
  const MANUAL_FILES = [[`output/${CFG.slug}-print.pdf`, 'Rulebook'], [`output/${CFG.slug}-letter-booklet.pdf`, 'US Letter fold-and-staple booklet']];
  function manual_links() {
    const missing = MANUAL_FILES.map(([f]) => path.join(GAME_DIR, 'manual', f)).filter(f => !fs.existsSync(f));
    if (missing.length) throw new Error(`the page links the print manual, and ${missing.join(', ')} ${missing.length > 1 ? 'are' : 'is'} missing (node engine/bin/bg.js manual)`);
    return MANUAL_FILES;
  }

  /* the geometry generator for the page's worker: game.json's geom_files in load order (the engine's library first, the game's geom.js last, which
     sets the GameGeom global), and the Fredoka fonts as base64; null only with --no-geom. A missing file is an error. */
  const FONT_FILES = ['Fredoka-Medium.ttf', 'Fredoka-SemiBold.ttf', 'Fredoka-Bold.ttf'];
  function geom_sources() {
    const files = CFG.geom_files.map(f => path.join(GAME_DIR, f));
    if (argv.includes('--no-geom')) return null;
    const missing = files.filter(f => !fs.existsSync(f));
    if (missing.length) throw new Error(`the page's geometry generator needs ${missing.join(', ')} (or build with --no-geom)`);
    const sources = files.map(f => fs.readFileSync(f, 'utf8'));
    if (!/GameGeom/.test(sources[sources.length - 1])) throw new Error(`${CFG.geom_files[CFG.geom_files.length - 1]}: the last geometry file must set the GameGeom global`);
    return { sources, fonts: Object.fromEntries(FONT_FILES.map(f => [f, fs.readFileSync(path.join(ENGINE, 'fonts', f)).toString('base64')])) };
  }

  /* the page body: the stage with its one button (the box opens and closes on it; nothing scrolls), the nav, the rulebook modal (the book alone)
     and the files modal (which also carries the rulebook's PDF links) */
  const BODY = String.raw`
<section id="demo">
      <div class="stage cwrap" id="stage">
        <canvas id="c3d"></canvas>
        <div class="loading" id="loading"><div class="cells"><i></i><i></i><i></i></div><span>Loading</span></div>
        <div class="spot" id="spot"></div>
        <div class="vignette"></div>
        <div class="title" id="intro-title"><h1>@@TITLE@@</h1><p>@@TAGLINE@@</p><p class="meta">@@META_LINE@@</p></div>
        <button type="button" class="boxbtn" id="btn-box">Open the box</button>
        <nav class="nav" id="nav"><button type="button" data-open="rules">Rulebook</button><button type="button" data-open="parts">Parts</button><button type="button" data-open="files">Laser files</button></nav>
        <div class="hud" id="hud">
          <div class="chips" id="chips"></div>
          <div class="log" id="log"></div>
          <p class="orbit-help">drag to orbit · right-drag to pan · scroll to zoom</p>
        </div>
        <aside class="panel" id="panel" hidden>
          <div class="panel-bar"><b>Every part, as cut</b><button type="button" id="pv-explode">Explode</button><button type="button" class="close" data-close="parts" aria-label="Close">×</button></div>
          <div class="pvdesc" id="pv-desc"></div><div class="plist" id="plist"></div>
        </aside>
      </div>
</section>
<div class="modal" id="modal-rules" hidden><div class="modal-box book-box">
    <button type="button" class="close" data-close="rules" aria-label="Close">×</button>
    <section id="rules">
      <div class="manual-reader" id="manual-reader" role="region" aria-label="The rulebook. Click or swipe a page to turn it; the arrow keys turn pages too." tabindex="0">
        <div id="manual-stage"><div id="book"></div></div>
      </div>
    </section>
</div></div>
<div class="modal" id="modal-files" hidden><div class="modal-box wide">
    <button type="button" class="close" data-close="files" aria-label="Close">×</button>
    <section id="files">
      <h2>Laser files <small id="files-legend">300 × 450 mm sheets · kerf drawn into every cut: machine kerf compensation OFF · black engrave, yellow vector fill, blue score, orange corner marks, red cut</small></h2>
      @@RULEBOOK_RULES@@
      @@STOCK@@
      <p id="sheet-status" role="status" hidden></p>
      <div class="sheets" id="sheets">@@SHEET_GROUPS@@</div>
    </section>
</div></div>
`;

  function page() {
    let body = rep(BODY, '@@STOCK@@', stock_inputs());
    body = rep(rep(rep(body, '@@TITLE@@', esc(CFG.name)), '@@TAGLINE@@', esc(CFG.tagline)), '@@META_LINE@@', esc(`${CFG.players[0]} to ${CFG.players[CFG.players.length - 1]} players · ${CFG.minutes} minutes`));
    const man = argv.includes('--no-manual') ? null : manual_links();
    const PAGES = CFG.manual && CFG.manual.pages; if (!Number.isInteger(PAGES) || PAGES % 4) throw new Error('game.json manual.pages (the rulebook page count, a multiple of four) is required');
    body = rep(body, '@@RULEBOOK_RULES@@', man ? `<p class="rulebook-top">The rules as a printed booklet: the <a href="manual/${esc(man[0][0])}">rulebook</a> (trim size, with bleed) or the <a href="manual/${esc(man[1][0])}">US Letter fold-and-staple booklet</a>.</p>` : '<p class="rulebook-top">Bootstrap build: the rulebook PDFs are not built yet.</p>');
    const SHEETS_ALL = Object.assign({}, PJ.sheets);
    for (const sheet of SHEET_GROUPS.flatMap(g => g.sheets)) if (sheet.file) SHEETS_ALL[sheet.id] = rd(sheet.file);
    const PACK = PACK_REPORT.placements;
    body = rep(body, '@@SHEET_GROUPS@@', sheet_groups(SHEETS_ALL));
    const sheetText = sheet_text_blocks(SHEETS_ALL);
    if (!Array.isArray(PACK)) throw new Error('packing.json has no placements list: rerun node engine/bin/bg.js pack');
    /* the jig shapes join the page's parts under prefixed ids so the viewer can show the jigs assembled; JIG carries the placements that stand them up */
    const JIG_PARTS = JV.jig_parts(JIG), JIG_VIEW = JV.jig_view(JIG);
    const jigStock = JV.jig_stock(JIG, META);
    const META_VIEW = Object.assign({}, META, { part_stock: Object.assign({}, META.part_stock, Object.fromEntries(Object.keys(JIG_PARTS).map(id => [id, jigStock]))) });
    const data = `const PARTS=${js(Object.assign({}, PJ.parts, JIG_PARTS))};\nconst LAYOUT=${js(PJ.layout)};\nconst SHEETS={};\nconst PACKING=${js(PACK)};\nconst META=${js(META_VIEW)};\nconst JIG=${js(JIG_VIEW)};\n\nconst SHOWCASE=${js(SHOW)};\n`;
    const geom = geom_sources();
    /* the generator's engraving cache for this build (bg parts writes parts/engraving_cache.json): the page's worker starts warm, so a new thickness never draws art */
    const ecf = path.join(GAME_DIR, 'parts', 'engraving_cache.json');
    if (geom && !fs.existsSync(ecf)) throw new Error(`${ecf} is missing: node engine/bin/bg.js parts writes it (without --no-cache) and the page's worker needs it`);
    const engCache = geom ? fs.readFileSync(ecf, 'utf8') : 'null';
    const geomData = geom ? `const GEOM_SOURCES=${js(geom.sources)};\nconst FONTS=${js(geom.fonts)};\nconst ENG_CACHE=${engCache.replace(/<\//g, '<\\/')};\n` : 'const GEOM_SOURCES=null;const FONTS=null;const ENG_CACHE=null;\n';
    return '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">\n<title>' + esc(GP.title || `${CFG.name} · a laser-cut board game for ${CFG.players[0]} to ${CFG.players[CFG.players.length - 1]} players`) + '</title>\n' +
      `<style>@font-face { font-family: Fredoka; src: url(data:font/ttf;base64,${HERO_FONT}) format('truetype'); font-weight: 600; }\n${CSS}</style><style id="manual-style">${manual.styles()}</style></head><body><script>window.__manualPagesExpected = ${man ? PAGES : 0};</script>${body}\n${man ? manual.scripts() : `<script>window.__manualPageCount = 0; document.getElementById('book').innerHTML = '';</script>\n<script>${manual.viewerOnly()}</script>`}\n<script>${data}</script>\n<script>${geomData}</script>\n<script>${SIM_JS}\nwindow.GameSim = window.${simGlobal};</script>\n<script>${R3_JS}</script>\n<script>${CUT_VIEW_JS}</script>\n<script>${TABLE_JS}</script>\n<script>${PAGE_JS}</script>\n${sheetText}\n</body></html>\n`;
  }

  const out = outArg ? path.resolve(outArg) : path.join(GAME_DIR, `${CFG.slug}.html`);
  const html = page();
  /* the game's banned words (page.js: banned, with strip_ids to take part ids out of the text first): nothing a player can read may say them */
  if (GP.banned && GP.banned.length) {
    const visible = html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]*>/g, ' ');
    const strip = GP.strip_ids || (t => t), said = [];
    for (const w of GP.banned) {
      const re = new RegExp(`.{0,40}\\b${w}.{0,40}`, 'i'), has = new RegExp(`\\b${w}`, 'i');
      { const m = visible.match(re); if (m) said.push(`page text: …${m[0].trim()}…`); }
      for (const [n, L] of Object.entries(PJ.layout)) if (has.test(L.title)) said.push(`sheet ${n} title: ${L.title}`);
      { const m = strip(TABLE_JS).match(re); if (m) said.push(`table.js: …${m[0].trim()}…`); }
      for (const leg of Object.keys(META).filter(k => /_legend$/.test(k))) if (Array.isArray(META[leg]) && has.test(strip(JSON.stringify(META[leg].map(r => [r.label, r.what]))))) said.push(`the ${leg}`);
    }
    if (said.length) throw new Error(`build: player-facing text says a banned word (${GP.banned.join(', ')}):\n  ` + said.join('\n  '));
  }
  fs.writeFileSync(out, html);
  console.log('wrote', out, Buffer.byteLength(html), 'bytes');
  return out;
};
if (require.main === module) module.exports(process.cwd(), process.argv.slice(2));
