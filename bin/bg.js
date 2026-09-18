#!/usr/bin/env node
/* bg.js (boardgame-engine): the one command a game folder needs. Run it from the game folder (the folder with game.json and the engine/ submodule):

     node engine/bin/bg.js doctor                        this machine can run the engine (node, the browser, poppler, rsvg)
     node engine/bin/bg.js parts ['#t3lo=2.67&t3hi=2.92&kerf_t3=0.18'] [--out DIR] [--jobs N] [--no-cache]
                                                         parts/parts.json, parts/<sheet>.svg, manifest.json, parts/engraving_cache.json (exit 1 on any check)
     node engine/bin/bg.js stats [games]                 stats.json and showcase.json from self-play (the sim contract; a game with its own stats.js keeps it)
     node engine/bin/bg.js balance [balance.js options]  seat wins, rounds, goals against the targets (game.json balance: {} sets them); --tune key=lo:hi:step; --gates the design gates
     node engine/bin/bg.js pack                          packing.json and pack/layer-N.png: every piece in the closed box (FITS, or exit 1)
     node engine/bin/bg.js jig [--no-render]             jig.json and parts/jig-sheet.svg: the box glue jig (and the game's jigs.js) with its FEM gate
     node engine/bin/bg.js page [--no-manual] [--no-geom] <slug>.html, the whole page
     node engine/bin/bg.js manual                        the print rulebook: sync, assets, the PDFs, the checks (needs the page built once with --no-manual)
     node engine/bin/bg.js lint                          svg_lint on parts.json against manifest.json
     node engine/bin/bg.js fit ['#hash' ...]             fitcheck at the built stock (and at each hash given: both ends of the range)
     node engine/bin/bg.js check                         the page gates: page_check, the repo gate, qa_intersections, verify_anim
     node engine/bin/bg.js all                           parts, stats, pack, jig, page --no-manual, manual, page, lint, fit, check
     node engine/bin/bg.js new <folder> --name "GAME NAME"   a new game folder from the starter, with this engine as its submodule

   Every step exits 1 on a failed check, so a chain stops at the first problem. */
'use strict';
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const ENGINE = path.join(__dirname, '..');
const argv = process.argv.slice(2), cmd = argv.shift();
const GAME_DIR = process.cwd();
/* every script runs with the engine's node_modules on NODE_PATH, so a game's own scripts (manual/assets.js, its checks) require sharp, pdf-lib and
   playwright from the engine without an install of their own; opts.env extends this one */
const ENV = Object.assign({}, process.env, { GAME_DIR, NODE_PATH: [path.join(ENGINE, 'node_modules')].concat(process.env.NODE_PATH ? [process.env.NODE_PATH] : []).join(path.delimiter) });
const node = (script, args, opts) => { const o = Object.assign({ stdio: 'inherit', cwd: GAME_DIR }, opts || {}); o.env = Object.assign({}, ENV, opts && opts.env || {}); const r = spawnSync(process.execPath, [script].concat(args || []), o); if (r.status !== 0) { console.error(`bg: ${path.relative(GAME_DIR, script)} ${(args || []).join(' ')} failed (exit ${r.status})`); process.exit(r.status || 1); } };
const cfg = () => { const f = path.join(GAME_DIR, 'game.json'); if (!fs.existsSync(f)) { console.error(`bg: no game.json in ${GAME_DIR}: run from the game folder (node engine/bin/bg.js new <folder> makes one)`); process.exit(2); } return JSON.parse(fs.readFileSync(f, 'utf8')); };
const has = f => fs.existsSync(path.join(GAME_DIR, f));

const commands = {
  doctor() { node(path.join(ENGINE, 'bin', 'doctor.js'), argv); },
  parts() { cfg(); node(path.join(ENGINE, 'src', 'cli.js'), argv); },
  stats() { const C = cfg(); node(has('stats.js') ? path.join(GAME_DIR, 'stats.js') : path.join(ENGINE, 'checks', 'stats.js'), (has('stats.js') ? [] : [C.sim]).concat(argv)); },   /* a game with its own showcase criteria keeps its stats.js */
  balance() { const C = cfg(); const args = [];   /* game.json's balance: { rounds: '5:9', seat: 0.06, goals: '0.2:0.7', games: 400 } are the defaults the command line overrides */
    for (const [k, v] of Object.entries(C.balance || {})) if (!argv.includes('--' + k)) args.push('--' + k, String(v));
    node(path.join(ENGINE, 'checks', 'balance.js'), [C.sim].concat(args, argv)); },
  pack() { cfg(); node(path.join(ENGINE, 'src', 'pack.js'), argv); },
  jig() { cfg(); node(path.join(ENGINE, 'src', 'jig.js'), argv); },
  page() { cfg(); node(path.join(ENGINE, 'page', 'build.js'), argv); },
  manual() {
    const C = cfg(), M = path.join(GAME_DIR, 'manual');
    if (!fs.existsSync(path.join(M, 'manual.html'))) { console.error('bg manual: the game has no manual/manual.html'); process.exit(2); }
    if (!has(`${C.slug}.html`)) { console.error(`bg manual: build the page first (node engine/bin/bg.js page --no-manual): the figures are captured from it`); process.exit(2); }
    if (fs.existsSync(path.join(M, 'sync-rules.js'))) node(path.join(M, 'sync-rules.js'), [], { cwd: M });
    node(fs.existsSync(path.join(M, 'assets.js')) ? path.join(M, 'assets.js') : path.join(ENGINE, 'manual', 'assets.js'), [], { cwd: M });
    node(path.join(ENGINE, 'manual', 'build.js'), [], { cwd: GAME_DIR });
    node(path.join(ENGINE, 'manual', 'check.js'), [], { cwd: GAME_DIR });
    for (const f of ['verify.js', 'check-references.js']) if (fs.existsSync(path.join(M, f))) node(path.join(M, f), [], { cwd: M });
  },
  lint() { cfg(); node(path.join(ENGINE, 'checks', 'svg_lint.js'), ['parts/parts.json', '--counts', 'manifest.json'].concat(argv)); },
  fit() {
    cfg(); const hashes = argv.filter(a => a.startsWith('#'));
    node(path.join(ENGINE, 'checks', 'fitcheck.js'), ['parts/parts.json', path.join(ENGINE, 'checks', 'scenes.js')]);
    for (const h of hashes) {   // the same scenes on a build at another stock: parts and packing in a scratch folder
      const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'bg-fit-'));
      node(path.join(ENGINE, 'src', 'cli.js'), [h, '--out', path.join(dir, 'parts'), '--quiet']);
      node(path.join(ENGINE, 'src', 'pack.js'), [path.join(dir, 'parts', 'parts.json'), '--out', dir]);
      node(path.join(ENGINE, 'src', 'jig.js'), ['--parts', path.join(dir, 'parts', 'parts.json'), '--out', dir, '--no-render']);
      for (const f of ['game.json', 'table.js', 'showcase.json', cfg().sim].concat(fs.existsSync(path.join(GAME_DIR, 'geom')) ? ['geom'] : [])) fs.cpSync(path.join(GAME_DIR, f), path.join(dir, f), { recursive: true });
      for (const f of fs.readdirSync(GAME_DIR).filter(f => /\.js$/.test(f) && !fs.existsSync(path.join(dir, f)))) fs.copyFileSync(path.join(GAME_DIR, f), path.join(dir, f));
      fs.symlinkSync(fs.realpathSync(path.join(GAME_DIR, 'engine')), path.join(dir, 'engine'));
      console.log(`fitcheck at ${h} (${dir})`);
      node(path.join(ENGINE, 'checks', 'fitcheck.js'), [path.join(dir, 'parts', 'parts.json'), path.join(ENGINE, 'checks', 'scenes.js')], { env: { GAME_DIR: dir } });
    }
  },
  check() {
    const C = cfg(), page = `${C.slug}.html`;
    if (!has(page)) { console.error(`bg check: no ${page}: build the page first`); process.exit(2); }
    node(path.join(ENGINE, 'checks', 'page_check.js'), [page]);
    node(path.join(ENGINE, 'checks', 'page_gate.js'), [page]);
    const skip = Object.keys(JSON.parse(fs.readFileSync(path.join(GAME_DIR, 'parts', 'parts.json'), 'utf8')).layout).filter(s => /^(kerf-|sheet0$|.*-coupons$)/.test(s));
    node(path.join(ENGINE, 'checks', 'qa_intersections.js'), [page, 'qa_scenes.json', '--parts', 'parts/parts.json'].concat(skip.length ? ['--skip-sheets', skip.join(',')] : [], has('qa_options.json') ? JSON.parse(fs.readFileSync(path.join(GAME_DIR, 'qa_options.json'), 'utf8')).args || [] : []));
    node(path.join(ENGINE, 'checks', 'verify_anim.js'), [page, '--turns', '12', '--out', 'anim-shots']);
    if (has('verify_events.js')) node(path.join(GAME_DIR, 'verify_events.js'), []);   /* the game's independent referee, when it has one */
  },
  all() {
    for (const [c, a] of [['parts', []], ['stats', []], ['pack', []], ['jig', []], ['page', ['--no-manual']], ['manual', []], ['page', []], ['lint', []], ['fit', []], ['check', []]]) { console.log(`\n== bg ${c} ${a.join(' ')}`); argv.length = 0; argv.push(...a); commands[c](); }
  },
  new() { node(path.join(ENGINE, 'bin', 'new_game.js'), argv); },
};
if (!cmd || !commands[cmd]) { console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(1, 20).join('\n')); process.exit(cmd ? 2 : 0); }
commands[cmd]();
