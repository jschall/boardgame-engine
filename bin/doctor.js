#!/usr/bin/env node
// doctor.js (boardgame-engine): can this machine run the engine? Prints the fix for anything missing; exit 1 if something required is.
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), { spawnSync } = require('child_process');
const ENGINE = path.join(__dirname, '..'), bad = [];
const ok = m => console.log('ok     ', m), no = (m, fix) => { console.log('MISSING', m, fix ? `\n        -> ${fix}` : ''); bad.push(m); };
const [maj] = process.versions.node.split('.').map(Number); maj >= 18 ? ok(`node ${process.versions.node}`) : no(`node ${process.versions.node} (need 18+)`, 'install Node 18 or newer');
for (const m of ['playwright', 'pdf-lib', 'sharp']) fs.existsSync(path.join(ENGINE, 'node_modules', m)) ? ok(`npm package ${m}`) : no(`npm package ${m}`, `cd ${ENGINE} && npm install`);
try { const lg = require(path.join(ENGINE, 'lib', 'lasergeom.js')); const c = lg.C(0, 0, 5); if (Math.abs(c.area - 78.5) > 1) throw new Error('buffer area off'); ok('lasergeom loads and buffers'); } catch (e) { no('lasergeom does not load: ' + e.message, 'reinstall the engine (git submodule update --init)'); }
const pw = path.join(os.homedir(), '.cache/ms-playwright'); const chrom = fs.existsSync(pw) ? fs.readdirSync(pw).filter(d => d.startsWith('chromium')) : [];
chrom.length ? ok(`playwright chromium (${chrom.slice(-1)})`) : no('playwright chromium', `cd ${ENGINE} && npx playwright install chromium`);
const tool = (cmd, args, fix) => { const r = spawnSync(cmd, args, { encoding: 'utf8' }); r.error ? no(cmd, fix) : ok(`${cmd} (${(r.stdout || r.stderr).split('\n')[0].trim().slice(0, 60)})`); };
tool('rsvg-convert', ['--version'], 'install librsvg (apt: librsvg2-bin; brew: librsvg): the packer draws its layer pictures with it');
tool('pdftotext', ['-v'], 'install poppler (apt: poppler-utils; brew: poppler): the rulebook checks read the PDFs with it');
tool('montage', ['-version'], 'install ImageMagick: the scroll contact sheet is montaged with it (optional)');
try { require(path.join(ENGINE, 'src', 'geom.js')); ok('engine modules load'); } catch (e) { no('engine modules: ' + e.message); }
console.log(bad.length ? `doctor: ${bad.length} problem(s)` : 'doctor: ready'); process.exit(bad.filter(m => !/montage/.test(m)).length ? 1 : 0);
