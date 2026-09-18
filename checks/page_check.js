#!/usr/bin/env node
// page_check.js: static checks on the built single-page HTML before any browser run.
//   - every inline <script> block parses (node --check): catches a stray // comment swallowing single-line page JS, unescaped quotes, etc.
//   - the required sections exist in order: #demo, #rules, #files (#art between rules and files is optional); the stage has The table and Parts tabs; a fixed-height log; download links for every sheet
//   - no external resources (the page must open from file:// offline)
// Usage: node page_check.js game.html      exit 1 on any failure
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), { spawnSync } = require('child_process');
if (process.argv.length < 3) { console.error('usage: node page_check.js game.html'); process.exit(2); }
const html = fs.readFileSync(process.argv[2], 'utf8'); const bad = [];
const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)(?![^>]*type="text\/plain")[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);   /* text/plain blocks carry data (the sheet SVGs), not code */
scripts.forEach((src, i) => {
  const p = path.join(os.tmpdir(), `pagecheck-${process.pid}-${i}.js`); fs.writeFileSync(p, src);
  const r = spawnSync(process.execPath, ['--check', p], { encoding: 'utf8' }); fs.unlinkSync(p);
  if (r.status) { const lines = (r.stderr || '').trim().split('\n'); bad.push(`script #${i} does not parse: ${lines[lines.length - 1]}`); }
});
const ids = ['demo', 'rules', 'art', 'files'].filter(s => s !== 'art' || html.includes('id="art"')); const pos = ids.map(s => html.indexOf(`id="${s}"`));
if (pos.includes(-1)) bad.push('missing section id(s): ' + ids.filter((s, i) => pos[i] < 0).join(', '));
else if (pos.some((p, i) => i && p < pos[i - 1])) bad.push('sections out of order: demo, rules, [art], files expected');
/* the stage's views: the reference page (BUMBLE) has one stage with a nav (Rulebook, Parts, Laser files) and the parts panel over it; the older
   pages had tabs (data-mode="table" / "parts"). Either shape is complete. */
const nav = html.includes('data-open="parts"') && html.includes('data-open="rules"') && html.includes('data-open="files"');
if (!nav) for (const m of ['data-mode="table"', 'data-mode="parts"']) if (!html.includes(m)) bad.push('stage tab missing: ' + m + ' (or a nav with data-open="rules|parts|files")');
if (html.includes('id="track"') && !/id="(scrollhint|btn-skip)"/.test(html)) bad.push('a scroll-driven opening (#track) needs its Skip button (#btn-skip, or the older #scrollhint)');
if (html.includes('id="track"') && !/id="loading"/.test(html)) bad.push('a scroll-driven opening needs the #loading screen shown until the first frame (owner: "a loading animation until we\'re ready to display")');
if (!html.includes('id="log"')) bad.push('no #log element (the single scrolling action log)');
if (!/\.log\s*\{[^}]*height\s*:/.test(html)) bad.push('.log has no fixed height in CSS');
if (/<(script|link|img)[^>]+(src|href)="https?:\/\//.test(html)) bad.push('external resource reference: the page must be self-contained');
const nSheets = (html.match(/download="[^"]+\.svg"/g) || []).length;
if (!nSheets) bad.push('no sheet download links');
for (const b of bad) console.log('E', b);
console.log(`page_check: ${scripts.length} scripts, ${nSheets} sheet downloads, ${bad.length} problems`);
process.exit(bad.length ? 1 : 0);
