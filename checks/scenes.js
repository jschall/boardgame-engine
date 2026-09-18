// scenes.js (boardgame-engine): the 3D placements fitcheck.js samples for interference, for any game on the engine.
// Nothing here is copied by hand: it runs the engine's page.js and the game's table.js in node with a stub DOM, so every tray, wall, neck, tile,
// standee, token and card sits exactly where the page puts it, and reads the scenes through the page's window.__placements hook:
//   the open table unstarted and mid-game (the showcase game after MID_TURNS turns, set straight from the engine's state), the box as the viewer
//   shows it, the closed box packed for storage (packing.json's placements), and every assembly collapsed.
//   node engine/checks/fitcheck.js parts/parts.json engine/checks/scenes.js      (from the game folder; GAME_DIR names another folder)
// packing.json must have been made from the same stock as parts.json.
'use strict';
const fs = require('fs'), path = require('path');
const MID_TURNS = 20;
const GAME_DIR = process.env.GAME_DIR || process.cwd();

module.exports = function (PARTS, DATA) {
  if (typeof DOMParser === 'undefined') throw new Error('scenes.js runs under fitcheck.js, which provides the DOMParser the renderer\'s part parser needs');
  const CFG = JSON.parse(fs.readFileSync(path.join(GAME_DIR, 'game.json'), 'utf8'));
  const cutView = require('../src/cut_view.js');
  if (!DATA.meta.leaf_slots) throw new Error('parts.json is missing leaf_slots; regenerate it.');
  for (const [pid, model] of Object.entries(DATA.meta.leaf_slots)) {
    PARTS[pid] = cutView(PARTS[pid], model);
    // These solids already include the beam width; do not erode them twice.
    DATA.meta.part_kerf[pid] = 0;
  }
  const R3 = require(path.join(__dirname, '..', 'lib', 'render3d.js'));   // the renderer build.js embeds in the page
  const packFile = path.join(GAME_DIR, 'packing.json');
  const PACK = JSON.parse(fs.readFileSync(packFile, 'utf8'));
  if (!Array.isArray(PACK.placements)) throw new Error(`${packFile} has no placements: run node engine/bin/bg.js pack`);
  if (PACK.interior && PACK.interior.stock) for (const [k, t] of Object.entries(PACK.interior.stock)) if (DATA.meta.stocks[k] && DATA.meta.stocks[k].t !== t) throw new Error(`${packFile} was packed for ${k} = ${t}, parts.json has ${DATA.meta.stocks[k].t}: run the packer on this parts.json`);
  const SHOW = JSON.parse(fs.readFileSync(path.join(GAME_DIR, 'showcase.json'), 'utf8'));
  // Match build.js: the two jig assemblies use their own cut shapes and assembled
  // placements. Extend the caller's parts and kerfs so fitcheck can sample them too.
  const jig = JSON.parse(fs.readFileSync(path.join(GAME_DIR, 'jig.json'), 'utf8'));
  if (jig.meta.kerf_comp !== DATA.meta.kerf_comp) throw new Error('jig.json and parts.json must use the same kerf compensation mode');
  const JV = require(path.join(__dirname, '..', 'src', 'jig_view.js'));   // shared with build.js so the page and this harness never disagree
  const jigStock = JV.jig_stock(jig, DATA.meta);
  for (const [id, body] of Object.entries(jig.parts)) {
    const pid = JV.JIG_PREFIX + id;
    PARTS[pid] = body;
    DATA.meta.part_stock[pid] = jigStock;
    DATA.meta.part_kerf[pid] = jig.meta.part_kerf[id];
  }
  const JIG = JV.jig_view(jig);

  // ---- a stub DOM: every element exists and swallows what the page does to it
  const fake = () => new Proxy(function () {}, {
    get(t, k) {
      if (k === Symbol.toPrimitive) return () => '';
      if (k === 'classList') return { toggle() {}, add() {}, remove() {}, contains: () => false };
      if (k === 'style') return { setProperty() {} };
      if (k === 'dataset') return {};
      if (k === 'querySelectorAll') return () => [];
      if (k in t) return t[k];
      return fake();
    },
    set(t, k, v) { t[k] = v; return true; },
    apply() { return fake(); },
  });
  const elements = new Map();
  const document = { getElementById: id => { if (!elements.has(id)) elements.set(id, fake()); return elements.get(id); }, createElement: () => fake(), querySelectorAll: () => [], body: fake() };
  const window = { addEventListener() {}, location: { hash: '' } };
  /* The camera and canvas size are inert here, but they must EXIST: page.js reads scene.cam.right/up in framed() and scene.W / scene.H when it
     frames a mode, so a stub without them throws and fitcheck goes blind while the browser still draws. Same shape as render3d's this.cam. */
  class Scene {
    constructor(canvas, opts) {
      this.opts = Object.assign({}, opts); this.static = []; this.dynamic = [];
      this.W = 1400; this.H = 1000;
      this.cam = { pos: [0, 0, 1000], v: [0, 0, -1], right: [1, 0, 0], up: [0, 1, 0] };
    }
    setView(v) { Object.assign(this.opts, v || {}); } render() {} resize() {} ring() {}
  }
  const Render3D = { parsePart: R3.parsePart, Scene, prepareTextures: () => Promise.resolve() };
  const globals = {
    document, window, location: window.location, history: { replaceState() {} }, requestAnimationFrame: () => 0, setTimeout: () => 0, clearTimeout: () => {}, performance,
    CutView: cutView, GameSim: require(path.join(GAME_DIR, CFG.sim)), Render3D,
    PARTS, LAYOUT: DATA.layout, SHEETS: DATA.sheets, META: DATA.meta, JIG, PACKING: PACK.placements, SHOWCASE: SHOW, GEOM_SOURCES: null, FONTS: null, ENG_CACHE: null,
  };
  /* the game's table.js defines the global function GameTable; it runs first, then the engine's page.js, with the globals the built page has */
  const src = fs.readFileSync(path.join(GAME_DIR, 'table.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, '..', 'page', 'page.js'), 'utf8');
  new Function(...Object.keys(globals), src)(...Object.values(globals));
  const P = window.__placements;
  if (!P) throw new Error('page.js does not expose window.__placements');

  // ---- the page's instances as fitcheck instances
  const insts = (list, tag) => list.filter(i => !i.hidden).map((i, n) => {
    if (!i.part || !i.part.pid) throw new Error(`${tag}: an instance without a part id`);
    return { name: `${i.part.pid} #${n}`, pid: i.part.pid, x: i.x, y: i.y, z: i.z, rot: i.rot || 0, vertical: !!i.vertical, flipped: !!i.flipped, flipV: !!i.flipV, thick: i.thick, group: i.group };
  });
  const scenes = [
    { name: 'open table, unstarted', insts: insts(P.table(), 'table') },
    { name: `open table, showcase game after ${MID_TURNS} turns`, insts: insts(P.midgame(MID_TURNS), 'mid-game') },
    { name: 'the box as the viewer shows it (closed)', insts: insts(P.box(), 'box') },
  ];
  for (const id of P.assemblies()) scenes.push({ name: `assembly ${id}`, insts: insts(P.assembly(id), id) });
  return scenes;
};
