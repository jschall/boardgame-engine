# boardgame-engine

Everything hard about producing a laser-cut board game, in one repository a game folder takes as its `engine/` submodule:

- **the cut files**: kerf-compensated outlines and engraving on 300 × 450 mm sheets, from measured stock (two caliper readings and a kerf per stock), with standee tabs, keyed leaf-spring bases, + holes for cross-lapped pairs, shared cut lines, registration crosses, edge scores, vector fill, the kerf coupons and joint samples, the backs files (`src/geom.js`, `src/shapes.js`, `src/stock.js`, `lib/lasergeom.js`);
- **the shoulder box**: two trays from one frame (the lid roomier than the base), a symmetric neck, thumb notches, the lid top with a medallion, the title ribbon and the choking warning, the rules inside the lid, the setup map inside the base, the medallion and product code under it (`src/box.js`), and **its glue jig** with sixteen torsion-bar spring stations and a working-stress gate (`src/jig.js`, `src/jig_mech.js`);
- **the packer**: every piece into the closed box, verified as prisms (`src/pack.js`);
- **the page**: one self-contained HTML file whose one button opens the box in 3D, every piece flying to its place, a table that plays the game by itself, a parts viewer with assemblies, the rulebook as a page-turning book, the laser files with a stock panel that regenerates them in a worker (`page/`, `lib/render3d.js`);
- **the print rulebook**: a press PDF and a US Letter booklet from the game's HTML, its figures from the real cut files (`manual/`);
- **the checks**: lint, fit (interference in every scene at both ends of the stock range), balance, the page gates, intersections in the live page, the animation, the opening (`checks/`), and the estimated engraving time of every sheet with what the layout drew as concentric lines instead of rastering (`checks/laser_time.js`);
- **the tools**: a shape as a concentric scoring path (`tools/concentric.js`, for a logo or a border drawn by hand);
- **the CLI**: `node engine/bin/bg.js <parts|stats|balance|pack|jig|page|manual|lint|fit|check|lasertime|concentric|all|new|doctor>`.

**The skill.** `plugins/boardgame-create` is the Claude Code plugin that drives all of this from one prompt ("recreate Catan for my laser"): the `boardgame-create` skill (workflow, standards, design procedure, judge templates) and the `fable-reviewer` agent. Install it in Claude Code with

```
/plugin install boardgame-create --marketplace jschall/boardgame-engine
```

(or `/plugin marketplace add jschall/boardgame-engine` then `/plugin install boardgame-create@boardgame-engine`); this repository is the marketplace (`.claude-plugin/marketplace.json`). Without the plugin system, copy `plugins/boardgame-create/skills/boardgame-create` into `~/.claude/skills/`. Then, in an empty folder, a prompt like

> Recreate Catan for my laser: 3 mm birch ply and 1.5 mm birch, kerf 0.18, a 40 W diode with a 300 x 450 mm bed. Keep the trading and the robber, replace the dice with something the wood can make, and design the box so every piece stores in a tray.

yields the game folder with its cut sheets, the box and its glue jig, the packing, the page and the rulebook (`plugins/boardgame-create/README.md` has a longer example).

BUMBLE & BLOOM (`~/junk/boardgame/bumble`) is the first game on it and the reference: everything here was cut and validated on its wood. ORCHARD (`starter/`) is a complete small game every new game begins as.

```
git clone <this repo> && cd boardgame-engine && npm install && npx playwright install chromium && node bin/doctor.js
node bin/new_game.js ../my-game --name "MY GAME"      # a folder with engine/ as a submodule, ORCHARD renamed inside it
cd ../my-game && node engine/bin/bg.js all               # the whole chain; then replace the game one file at a time
```

Needs Node 18+, Chromium (Playwright installs it), poppler (`pdftotext`, `pdffonts`) and librsvg (`rsvg-convert`); ImageMagick's `montage` for the scroll contact sheet.

## A game folder

```
my-game/
  engine/          this repo, a git submodule
  game.json        name, slug, sim, players, minutes, tagline, maker, year, code, geom, geom_files, manual.pages
  <slug>-sim.js    the rules engine and its AI (the sim contract)
  art.js           the engraving, drawn once per part (on BGEngine.shapes)
  geom.js          the parts spec -> BGEngine.geom.make_game(spec), or a hand-written GAME (BUMBLE)
  rules.js         the lid text and the rulebook's pages
  table.js         GameTable(api): the table layout and the animation (the page contract)
  page.js          the sheet catalogue and the banned words
  pack.js          optional: the piles (else piles by part kind);  jigs.js  optional: extra glue jigs on the jig sheet
  manual/          manual.html, manual.js, manual.css, sync-rules.js, figures.js (+ verify.js, check-references.js if the game has them)
  qa_scenes.json   the scenes qa_intersections samples;  judge.json, preview_groups.json  the art gauntlet's groups
  design.md, iterations.md, START.md
  built:  parts/  manifest.json  stats.json  showcase.json  packing.json  pack/  jig.json  <slug>.html  manual/output/
```

## The contracts

### The sim (`<slug>-sim.js`, UMD, `root.<Name>Sim = factory()`)
`RULES` (every tunable, with defaults) · `new Game({ players, seed, rules })` with `.players .seed .round .turn .current .over .log` · `playTurn(game, rnd)` plays the current seat's whole turn, appending events `{ type, c, ... }` to `game.log`, one visible thing per event · `game.score(c) -> { total, ... }` · `game.final() -> { scores: [{ total, goals: { met, total } }], winner | -1 }` · `game.check()` throws on a broken invariant · `playGame(seed, players, { rules }) -> finished Game` · `mulberry(seed)` · `names { title, players: [{ name, colour, key }] }` · optional `drama(game) -> number` for the showcase seed · for the design gates (`bg balance --gates`): `strategies { name: (game, rnd) }` turn functions for the current seat (dumb players that ignore one rule each, `blind`, `obvious`), `archetypes { name: (game, rnd) }` (two or three full-strength styles), optional `setup(game, rnd)` for anything that happens before the first turn. Supply limits live in the engine. `checks/balance.js` and `checks/stats.js` read exactly this.

### The parts spec (`geom.js` -> `make_game(spec)`)
```js
{ name, stocks: { t3: { name, mat: 'birch'|'walnut', lo, hi, kerf, nominal } }, parts: [ ... ],
  box: { stock, neck, inner (80..205), wall_h (24..40), title, tagline, players, minutes, year, maker, code, medal: 'circle'|'hex'|'square',
         cover(cx, cy, r, room) -> art, corner(x, y, s, qx, qy) -> art, setup_map(W) -> art, mark(cx, cy, r) -> art, lid: rules.lid, art_key } }
```
A part is `{ id, kind, count, stock, name, art: () => geometry | null, back: () => geometry | true | null, raster: true | geometry }` (`raster`: this part's engraving, or the region of it the geometry touches, is never drawn as concentric lines by the sheet's vector fill, whatever that would save: a face, a texture, anything whose look is the raster's) with, by kind: `tile|token|card|board|plate`: `shape` (a polygon in the part's own frame; a tile may carry `plus: { pair, x, y }`); `standee`: `silhouette` standing on y = 0, `in` (the stock of the base or tile it stands in), `key` (1..7.2 mm, matched by its base), `base` (the base's id); `base`: `holds` (the standee's stock), `shape` ('circle'|'hex'|'square'|'log'|'oct'|'scallop' or a polygon), `size`, `key`; `pair`: `silhouette`, `in` (16 mm tabs; each half's cross-lap slot must run at least 12 mm through the wood along its walls, the bottom one through the tab; the engine refuses a shorter one); `tray`: `pockets: [{ piece: id | shape, x, y, rot, notch }]`, `margin` (6), `shape` (else a rounded rectangle round the pockets), `frame` (the pocket layer's stock; default the thinnest stock thinner than three quarters of the pieces, `null` for engraved pockets), `frame_art` (engraving on the pocket layer; `art` is the back's, seen only through the pockets). **Trays**: every pocket is its piece's outline plus 0.30 mm all round; with a thinner stock in the game the pockets are cut out of it and laminated on the back (`stock`, thin or thick as material allows); a piece must stand 1 mm proud of the pocket layer, else the pocket gets a 12 mm finger notch on its long side; with no thinner stock the pockets are engraved into the tray. `META.trays[id]` gives `table.js` every pocket's place, and by default the packer stores the pieces in their trays: each pocket is loaded with its piece (or any piece of the same kind and outline), trays of one outline stack in one pile (`pack.js` hooks: `ctx.loaded_tray(pid)`, `ctx.stack_trays([...])`; a stack is `[dx, dy, pids, dz, srot, group]`); when that does not fit the box, `store: false` on a tray keeps it empty and the pieces pile as usual (a preference, not a rule). The engine adds the tabs, the leaf-spring slots, the + holes, the box, the coupons, the sheets and the backs. Art is engraved (black fill) or bare: two tones. `BGEngine.shapes` (`src/shapes.js`) has the geometry: `hex_tile, disc, square_tile, card, plate, base_shape, ink (lettering), fit_text, hatch, stipple, finish (the hygiene pass), outline, arrow, hex_xy, rng, memo` and lasergeom itself.

`game.json.geom_files` lists what the page's worker loads, in order: `engine/lib/lasergeom.js`, the engine's `src/stock.js src/shapes.js src/box.js src/geom.js`, the sim, `rules.js`, `art.js`, `geom.js` (the last sets `root.GameGeom`). A hand-written generator (BUMBLE) exports the GAME object lasergeom.build runs, with `register_fonts`, `set_store` and `warnings` on it, and writes `META.stocks` (name, mat, t, tlo, kerf, params {lo, hi, kerf}), `box_stock`, `neck_stock`, `part_stock`, `part_kind`, `leaf_slots`, `INNER`, `WALL_H`, `FLOOR_UP`, `GAP`, `NECK_H`, `NECK_OUT`, `NECK_CL`, `BASE_EASE`, `LID_EASE`, `OUT_BASE`, `OUT_LID`, `fits.WALL_T` and the rest `src/geom.js` writes.

### The page (`table.js`: `function GameTable(api) { ... return { ... } }`)
`api` gives the game: `S` (the sim), `META`, `PARTS`, `PACKING`, `JIG`, `SHOWCASE`, `scene`, `part(id)`, `mk({ part, x, y, z, rot, vertical, flipped, back, shadow })` (stock, wood and thickness follow the part), `posed`, `setPose`, `rotXY`, `ez`, `STOCK_T`, `stockOf`, `IN`, `tray(list, ox, oy, 'base'|'lid')`, `walls`, `neck`, `standingPair(a, b, x, y, tileZ, tilePid)`, `standee(list, basePid, pid, x, y, z, rot)`, `exFor`, `addAsm(id, group, name, desc, rep, build, opts)`, `trayEx`, `neckEx`, `lidOn`, `tween(ms, fn, my)`, `wait`, `arc`, `log(html, cls)`, `say(c, line)`, `dot(c)`, `pick`, `qr` (the patter random), `illegal(e, why)`, `focus.cell`, `markDirty()`, `chips`, `NAMES`, `COLC`.

It returns, required: `NP` (seats on the table, 4), `players [{ name, colour, title }]`, `T { static, dynamic, home }` (the table's instances, the box's base tray at `BOXO` and the open lid at `LIDO` among them), `BOXO`, `LIDO`, `BOXA`, `LIDA` (the trays' instance lists), `initTable(g)`, `setBoardFromState(g)`, `animateEvents(events, my)` (one visible motion per event; call `assertLegal` and `noteShown` for each), `resetShown(g)` (also keeps `g` and `api.qr` for the game), `syncShown(g)`, `syncBoard(roundShown) -> [[inst, x, y, z, rot, period], ...]` (where every moving piece belongs for the engine's state: the teleport metric), `finale(my)`, `clearTable(my)`. Optional: `assertLegal`, `noteShown`, `gameLine(g)`, `openingLine(g)`, `opening(g, rng)`, `roundLine(g)`, `onRound(g, my)`, `shownScore(g, c)`, `chipTitle(g, c)`, `overlay(ctx, cell)`, `qa()`, `partName(id)`, `groups [[name, ids]]`, `defaultPart`, `jigAssemblies()`, `glued` (pairs `[carrier pid, mate pid]` of parts glued together, a frame on its backing: the mate lies on its carrier in the box and on the table and leaves the box riding on it, one piece; a laminated tray's pocket layer is glued to its back by default). No `//` line comments (the file is embedded inline). The engine's `page/page.js` does the rest, including the opening from `packing.json` (every table piece must have a packed slot of the same outline and stock).

### The rest
`page.js` exports `(game.json, parts.json) => { SHEET_GROUPS, banned, strip_ids, title }`; `pack.js` exports `ctx => { columns, place, after, flat_top, balance, clearance }` (see `src/pack.js`); `jigs.js` exports `tray => { parts, items, bounds, meta, assembly }`; `manual/figures.js` exports `({ META, PARTS, S }) => { parts: [ids], renders: { name: { hash, width, height } }, extra }`; `manual/manual.js` lays out `#book` from `rules-data.js` and sets `window.__manualPageCount` (a multiple of four, the count in `game.json`).

**Other box sizes.** Everything follows `inner` and `wall_h`: the floor tabs (one per 60 mm, two at least), the walls' finger bands, the neck's five bands, the panels' frames and medallion, the packing interior, and the jig (a spring station per gap between floor tabs, 4 to 16; its ramps nest inside the base's centre opening and under it; the sheet is 300 × 450). Tested at 100, 130, 160, 190 and 205 mm inside and 24 to 32 mm walls: parts, packing and the jig's working-stress gate all pass. Walls under 24 mm fail the jig gate (the pads sit lower on the wall and the springs overstress), so the engine refuses them.

## Checks, in the order `bg all` runs them
`parts` (lasergeom's layout checks) · `stats` · `pack` (FITS or a named problem) · `jig` (the working-stress gate) · `page --no-manual` · `manual` (sync, assets, the PDFs, `manual/check.js`, the game's verify) · `page` · `lint` (colours, open contours, engraving off its part, counts) · `fit` (interference in every scene: the table, mid-game, the closed box, packed, every assembly; `bg fit '#t3lo=2.67&t3hi=2.67'` at the other end of the stock) · `check` (`page_check`, `page_gate`, `qa_intersections` with the inventory, `verify_anim`). `BG_GPU=1` runs the browser checks on the machine's GPU. `checks/opening_check.js` and `checks/scroll_sheet.js` look at the opening the way a reader does; `checks/render_for_judge.js` and `checks/preview.js` make the evidence for the art gauntlet.

## Keeping the engine current
`tools/split_bumble_page.py <bumble page.js> <engine> <bumble>` re-splits BUMBLE's page.js into `page/page.js` and BUMBLE's `table.js` when the stage machinery improves there. `lib/lasergeom.js` is built in `~/junk/boardgame/common/lasergeom` (`node build.mjs`) and `lib/render3d.js` is `common/render3d.js`.

## License

boardgame-engine is free software under the GNU General Public License, version 3 or (at your option) any later version: see `LICENSE`. Copyright (C) 2026 Jonathan Challinger. The `boardgame-create` skill in `plugins/` is part of it. A page built with `bg page` embeds the engine's JavaScript, so a published page is a GPL work too: keep the game's source (its folder, with `engine/` as the submodule) available with it.

Third-party components with their own licenses: `lib/lasergeom.js` bundles JSTS (EPL-2.0 / EDL-1.0) and opentype.js (MIT); `fonts/` carries Fredoka under the SIL Open Font License 1.1 (`fonts/OFL.txt`). `npm install` brings playwright, sharp and pdf-lib under their own licenses.
