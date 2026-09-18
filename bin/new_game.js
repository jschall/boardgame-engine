#!/usr/bin/env node
/* new_game.js (boardgame-engine): a new game folder from the starter (ORCHARD, a complete small game on the engine), renamed, with this engine as
   its git submodule, ready for `node engine/bin/bg.js all`.
     node <engine>/bin/new_game.js <folder> --name "GAME NAME" [--slug game-name] [--engine <git url or path>] [--no-submodule]
   The folder becomes a git repository with engine/ as a submodule of --engine (default: this engine's own origin, else this engine's path).
   --no-submodule copies the engine in instead (an offline machine). The starter's files keep working under the new name; replace them one at a
   time with the check chain green: game.json, <slug>-sim.js, art.js, geom.js, rules.js, table.js, page.js, pack.js, manual/. */
'use strict';
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const ENGINE = path.resolve(__dirname, '..'), a = process.argv.slice(2);
const opt = (k, d) => { const i = a.indexOf(k); if (i < 0) return d; const v = a[i + 1]; a.splice(i, 2); return v; };
const flag = k => { const i = a.indexOf(k); if (i < 0) return false; a.splice(i, 1); return true; };
const name = opt('--name', null), engineArg = opt('--engine', null), noSub = flag('--no-submodule');
const slugOpt = opt('--slug', null);
const dest = a[0];
if (!dest || !name) { console.error('usage: node engine/bin/new_game.js <folder> --name "GAME NAME" [--slug slug] [--engine <git url or path>] [--no-submodule]'); process.exit(2); }
const slug = slugOpt || name.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
if (!/^[a-z][a-z0-9-]*$/.test(slug)) { console.error(`slug ${slug}: lower-case letters, digits and hyphens`); process.exit(2); }
const DIR = path.resolve(dest);
if (fs.existsSync(DIR) && fs.readdirSync(DIR).length) { console.error(`${DIR} exists and is not empty`); process.exit(2); }
fs.mkdirSync(DIR, { recursive: true });
const git = (args, cwd) => { const r = spawnSync('git', args, { cwd: cwd || DIR, encoding: 'utf8' }); if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr || r.stdout}`); return r.stdout.trim(); };
/* the engine: a submodule of the given url or path, else of this engine's origin, else of this engine's folder */
let origin = engineArg;
if (!origin) { const r = spawnSync('git', ['remote', 'get-url', 'origin'], { cwd: ENGINE, encoding: 'utf8' }); origin = r.status === 0 && r.stdout.trim() ? r.stdout.trim() : ENGINE; }
/* a GitHub SSH origin becomes the https URL, which any machine can clone without keys */
{ const m = origin.match(/^git@github\.com:(.+?)(?:\.git)?$/); if (m) origin = `https://github.com/${m[1]}`; }
/* the starter, renamed */
const SRC = path.join(ENGINE, 'starter');
const copy = (from, to) => { for (const f of fs.readdirSync(from)) { const s = path.join(from, f), d = path.join(to, f); if (fs.statSync(s).isDirectory()) { fs.mkdirSync(d, { recursive: true }); copy(s, d); } else fs.copyFileSync(s, d); } };
copy(SRC, DIR);
for (const skip of ['parts', 'pack', 'preview', 'shots', 'anim-shots', 'manual/output', 'manual/tmp', 'manual/qa']) fs.rmSync(path.join(DIR, skip), { recursive: true, force: true });
fs.renameSync(path.join(DIR, 'orchard-sim.js'), path.join(DIR, `${slug}-sim.js`));
const camel = slug.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join('');
const textFiles = f => /\.(js|json|md|html|css)$/.test(f);
const walk = d => fs.readdirSync(d).flatMap(f => { const p = path.join(d, f); return fs.statSync(p).isDirectory() ? (f === 'engine' ? [] : walk(p)) : textFiles(f) ? [p] : []; });
for (const f of walk(DIR)) {
  let t = fs.readFileSync(f, 'utf8');
  t = t.split('orchard-sim.js').join(`${slug}-sim.js`).split('OrchardSim').join(`${camel}Sim`).split('OrchardArt').join(`${camel}Art`).split("'orchard'").join(`'${slug}'`).split('"orchard"').join(`"${slug}"`).split('ORCHARD').join(name.toUpperCase()).split('orchard.html').join(`${slug}.html`);
  fs.writeFileSync(f, t);
}
const cfg = JSON.parse(fs.readFileSync(path.join(DIR, 'game.json'), 'utf8')); cfg.name = name; cfg.slug = slug; cfg.sim = `${slug}-sim.js`; fs.writeFileSync(path.join(DIR, 'game.json'), JSON.stringify(cfg, null, 2) + '\n');
fs.writeFileSync(path.join(DIR, '.gitignore'), ['node_modules/', 'parts/', 'pack/', 'preview/', 'shots/', 'anim-shots/', 'judge/', 'manual/output/', 'manual/tmp/', 'manual/qa/', 'manual/assets/render-*.png', `${slug}.html`, 'packing.json', 'jig.json', 'stats.json', 'showcase.json', 'manifest.json', 'manual/rules-data.js', 'manual/assets/provenance.json', ''].join('\n'));
git(['init', '-q']);
if (noSub) { fs.mkdirSync(path.join(DIR, 'engine')); copy(ENGINE, path.join(DIR, 'engine')); fs.rmSync(path.join(DIR, 'engine', '.git'), { recursive: true, force: true }); }
else git((fs.existsSync(origin) ? ['-c', 'protocol.file.allow=always'] : []).concat(['submodule', 'add', '-q', origin, 'engine']));   /* a local engine path needs git's file transport allowed */
if (!fs.existsSync(path.join(DIR, 'engine', 'node_modules'))) { const r = spawnSync('npm', ['install', '--no-audit', '--no-fund'], { cwd: path.join(DIR, 'engine'), stdio: 'inherit' }); if (r.status !== 0) console.error('npm install in engine/ failed: run it by hand, then npx playwright install chromium'); }
fs.writeFileSync(path.join(DIR, 'START.md'), `# ${name}

A game on the boardgame-engine (engine/, a git submodule of ${origin}). It starts as ORCHARD, the engine's starter, under this name: every file runs.
Replace the game one file at a time, with the chain green after each:

    node engine/bin/bg.js doctor        this machine can run the engine
    node engine/bin/bg.js all           parts, stats, pack, jig, page, manual, checks (the whole chain; each step alone: parts, stats, balance, pack, jig, page, manual, lint, fit, check)

1. game.json: the name, slug, players, minutes, tagline, maker, year, product code, manual page count.
2. ${slug}-sim.js: the rules engine and its AI (the sim contract in engine/README.md). Then \`bg balance\` and the design gates.
3. art.js and geom.js: the pieces (the parts spec: tiles, tokens, cards, boards, plates, standees on keyed bases, cross-lapped pairs in + holes) and the box's panels. Then \`bg parts\`, \`bg lint\`.
4. rules.js: the lid text and the rulebook's pages; manual/figures.js names the figures. Then \`bg manual\`.
5. table.js: the table layout and the animation of every event (the GameTable contract in engine/README.md). Then \`bg page\`, \`bg fit\`, \`bg check\`.
6. page.js: the sheet catalogue and banned words; pack.js (optional): the piles; jigs.js (optional): extra glue jigs.
7. design.md, iterations.md: the design record and every gauntlet round.
`);
git(['add', '-A']);
console.log(`${name} started in ${DIR} (slug ${slug}; engine ${noSub ? 'copied' : 'submodule of ' + origin})\nnext: cd ${dest} && node engine/bin/bg.js doctor && node engine/bin/bg.js all`);
