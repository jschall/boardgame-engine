#!/usr/bin/env node
// render_for_judge.js: renders every art-bearing group for an independent judge: one PNG per flat part (from preview.js pages) and
// 3D renders from the built page, each 3D shot on a freshly loaded page. Writes judge/<group>/*.png and judge/<group>/brief.txt.
// Usage:  node render_for_judge.js judge.json          (see templates/judge.json for the config shape)
// Each group's brief.txt is what the judge reads; keep it a description of INTENT, not a list of what you fixed.
'use strict';
const NAV_MS = +(process.env.NAV_TIMEOUT_MS || 180000);   // a 7 MB self-contained page can take over 30 s to reach its load event on a busy machine
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process'); 
if (process.argv.length < 3) { console.error('usage: node render_for_judge.js judge.json'); process.exit(2); }
const CFG = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')); const HERE = path.dirname(path.resolve(process.argv[2]));
const PAGE = 'file://' + path.join(HERE, CFG.page), OUT = path.join(HERE, CFG.out || 'judge'), PREV = path.join(HERE, CFG.preview || 'preview');
(async () => {
  fs.rmSync(OUT, { recursive: true, force: true });
  const groups = Object.fromEntries(Object.entries(CFG.groups).filter(([, s]) => s.flat).map(([g, s]) => [g, s.flat])); const gpath = path.join(HERE, '_judge_groups.json'); fs.writeFileSync(gpath, JSON.stringify(groups));
  const r = spawnSync(process.execPath, [path.join(__dirname, 'preview.js'), path.join(HERE, CFG.parts || 'parts/parts.json'), PREV, gpath], { encoding: 'utf8' }); if (r.status) { console.error(r.stderr || r.stdout); process.exit(1); }
  const b = await require('./browser.js').launch(); const errors = [];
  for (const [g, spec] of Object.entries(CFG.groups)) {
    const d = path.join(OUT, g); fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, 'brief.txt'), (spec.brief || '').trim() + '\n\n' + (CFG.common || '').trim() + '\n');
    if (spec.flat) { const pg = await b.newPage({ viewport: { width: 1900, height: 900 } }); pg.setDefaultTimeout(NAV_MS);   /* screenshots and waits too: 30 s is not enough under heavy machine load */ await pg.goto('file://' + path.join(PREV, g + '.html')); await pg.waitForTimeout(500);
      const figs = await pg.$$('figure'); for (let i = 0; i < figs.length; i++) { const cap = ((await figs[i].innerText()) || '').trim().replace(/\//g, '_') || String(i); await figs[i].screenshot({ path: path.join(d, `flat-${String(i).padStart(2, '0')}-${cap}.png`) }); } await pg.close(); }
    for (const [name, h] of Object.entries(spec.shots || {})) { const pg = await b.newPage({ viewport: { width: 1500, height: 1300 } }); pg.setDefaultTimeout(NAV_MS);   /* screenshots and waits too: 30 s is not enough under heavy machine load */ pg.on('pageerror', e => errors.push(String(e)));
      await pg.goto(PAGE + h, { timeout: NAV_MS }); await pg.waitForTimeout(CFG.settle_ms || 5000); const sel = CFG.canvas_selector || '.cwrap'; const el = await pg.$(sel); if (!el) throw new Error(`3D shot ${name}: selector ${sel} not found in the page at ${h}`); await el.screenshot({ path: path.join(d, `3d-${name}.png`) }); await pg.close(); }
  }
  await b.close();
  for (const g of Object.keys(CFG.groups)) console.log(g, fs.readdirSync(path.join(OUT, g)).sort().join(' '));
  if (errors.length) { console.log('PAGE ERRORS:', errors.slice(0, 5)); process.exit(1); }
})();
