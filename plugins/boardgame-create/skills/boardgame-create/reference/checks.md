# Automated checks: the gauntlet of gates

Every check is a command with an exit code. Run the whole chain after every change; never show the owner a page that has not passed it. Order matters: cheap and upstream first.

## The chain (`node engine/bin/bg.js all` runs it in this order; each step alone by name)

Once per machine: `cd engine && npm install && npx playwright install chromium && node bin/doctor.js`.

```
node engine/bin/bg.js parts ['#t3lo=2.67&t3hi=2.92&kerf_t3=0.18']   # parts/ and the engraving cache; lasergeom.build() throws on nesting/count/enclosure problems; repeat with each stock at one end of its range
node engine/bin/bg.js stats                          # self-play → stats.json, showcase.json (the most dramatic seed, by the sim's drama())
node engine/bin/bg.js balance [--tune key=lo:hi:step]   # seat wins, rounds, goals against the targets (game.json balance: {} sets them; exit 1 on a miss), plus the midpoint leader's win rate and the last-round swing
node engine/bin/bg.js balance --gates                    # the design gates from the sim's strategies/archetypes: --dumb (each ignored rule's cost), --gap (the obvious player), --blind (the interaction's weight), --paths (live paths that answer each other)
node engine/bin/bg.js pack                           # every piece packed into the closed box and verified as prisms → packing.json (FITS, or a named problem)
node engine/bin/bg.js jig                            # the box glue jig (and the game's jigs.js) → jig.json, parts/jig-sheet.svg; its FEM gate runs inside
node engine/bin/bg.js page --no-manual               # bootstrap: the manual captures its 3D figures from the page before the PDFs exist
node engine/bin/bg.js manual                         # sync-rules, assets (figures from the cut files and the page), the PDFs, manual/check.js, the game's verify.js
node engine/bin/bg.js page                           # the deliverable
node engine/bin/bg.js lint                           # svg_lint: colours, live text, open contours, engraving off its part, counts against manifest.json
node engine/bin/bg.js fit ['#t3lo=2.67&t3hi=2.67']   # fitcheck in every scene at the built stock, and at each hash given (both ends of the range)
node engine/bin/bg.js check                          # page_check (static), page_gate (live: structure, the book, the opening, the flow, phones, the files modal), qa_intersections + inventory, verify_anim
BG_GPU=1 node engine/checks/opening_check.js         # the interpenetration sweep of the opening (about 4 minutes on the GPU)
node engine/checks/scroll_sheet.js <slug>.html /tmp/sheet.png 1600,900 20   # contact sheet of the button opening, 20 frames (also 390,844 for phones)
node engine/checks/shot.js <slug>.html '#shot=table' shots/table.png 1400,1000 '.cwrap'   # and box, box&lift=1, box&p=128&y=-30, parts&id=…, '#intro=0.5'
node engine/checks/preview.js parts/parts.json preview preview_groups.json && node engine/checks/render_for_judge.js judge.json   # images for the art gauntlet
```
`BG_GPU=1` runs any browser check on the machine's GPU (ten times faster on a big page); without it SwiftShader gives the same answer everywhere.

## What each check catches

| check | catches | how |
|---|---|---|
| `lasergeom.build()` / `Layout.check()` (`bg parts`) | parts crossing the usable area (3 mm margins, 1.5 mm from a datum edge), parts closer than 1.5 mm, overlapping outlines, wrong copy counts against the manifest | jsts distance on the placed outlines; throws `LaserCheckError` listing every problem; also the enclosure check, one-piece outlines and holes within 0.3 mm of an outline |
| `svg_lint.js` | errors: colours outside the laser set (red cut, dark red shared, blue score, yellow vector fill, orange corner marks, black engrave; greys, white fills and opacity are errors), live `<text>`, open cut contours, engraving beyond the bleed allowance outside a part, anything outside a sheet, bad counts; warnings only: engraving stopping just short of an edge, islands thinner than about 0.45 mm, bare gaps under about 0.6 mm, specks, thin engraved strips across the raster direction (legibility guidance, not rules). Score lines, including the edge scores along engraving boundaries, are expected and never flagged | SVG parsed with the renderer's parser, geometry on jsts; exit 1 on errors, `--strict` on warnings |
| `stats.js` | games too short or too long, runaway economies, seat bias (a seat above ~30% at 4 players), tie rates, hidden goals met < 20% or > 70%, supply exhaustion | self-play with the greedy AI, 300 games per player count |
| `verify_events.js` | the engine's `apply()` producing an illegal event (a move through a shut route, a pickup over the cap, a piece on an occupied space) | a separately written referee replays every event against the reconstructed state |
| `fitcheck.js` | parts interfering in the closed box, the packed box, the open table, standees in bases, pieces mid-motion; slivers and corner errors in outlines; notches out of phase; walls placed rim-up; assembled pieces too tall for the box | rasterised solids sampled pairwise at 0.2 mm in scenes you describe with the same numbers `build.js` uses; with `meta.kerf_comp: "file"` each part is first eroded by half its own kerf (`meta.part_kerf[pid]`) back to finished size |
| `qa_intersections.js` | intersections in the placements the page **actually** uses (initial table, N turns in, assemblies, the box); with `--parts parts/parts.json` also the **inventory**: every part cut on the game sheets appears in the unstarted table exactly as many times, and nothing is `hidden` | samples `window.__scene` instances in the live page; counts `part.pid` per instance against the sheet layout (backs sheets and the test sheet excluded; `--alias lid=lid-cut` for parts placed under another id; `--ignore fitcomb` for calibration coupons) |
| `verify_anim.js` | JavaScript errors during a whole game, assertion failures (`illegal`), teleports (`__maxSnap`), an animation that never reaches N turns; produces the screenshot sequence for the animation judge | playwright in real time |
| `page_check.js` | a `<script>` that does not parse (a `//` comment in single-line JS, an unescaped quote), sections missing or out of order, no fixed-height log, external resources, no sheet downloads | static; run right after `build.js` |
| `checks/scroll_sheet.js` | the opening as the reader sees it: press the box button, 20 frames on one sheet (`node engine/checks/scroll_sheet.js <slug>.html /tmp/sheet.png 1600,900 20`; also 390,844 for phones) | playwright with `--use-angle=default --enable-gpu --ignore-gpu-blocklist`; frames in `out-frames/` |
| `checks/opening_check.js` | anything passing through anything else while the box is unpacked: the opening sampled through the button's progress, interior-sampling on the live scene at each; exits 1 on any pair (BUMBLE's went from 797 pairs to a handful; the named pairs say which rule of the flight plan is missing) | playwright on the GPU, about 4 minutes |
| `checks/page_gate.js` | the embedded rulebook differing from the standalone one, the opening not reversible or not skipped for reduced motion, the HUD visible too early, the log resizing, deleted elements coming back, a stock change breaking the viewer, console errors | playwright, real time, desktop and phone viewports |
| `src/pack.js` (`bg pack`) | a piece that does not fit the closed box (height, footprint, a pile too tall), a packing the page could not draw | packs and verifies as prisms |
| `shot.js` | a section or tab that does not render; lighting or texture faults you can see | playwright viewport or element capture after the page's first frame |
| `render_for_judge.js` | nothing by itself: it makes the evidence for the art gauntlet | flat per-part captures + fresh-page 3D shots |

## Page-level assertions to keep in the page itself

- `assertLegal(e)` in `animateEvents`: the animation's own state must agree with the rules for every hop; on disagreement log `ILLEGAL HOP …`, increment `illegal`, and stop.
- `measureSnap()` after each turn: re-derive every piece's pose from the engine (`syncBoard`) and record the largest correction as `window.__maxSnap`.
- Supply limits enforced in the engine (`supplyLeft`), never only in the page.
- An unhandled-rejection handler that writes `Script error` into the log so a broken animation is visible.

## Manual checks the owner will do anyway (so do them first)

- Watch a whole animated game at slow speed; read every log line; look for a piece that appears without moving, a piece entering by another piece's door, two pieces on one space, a disc passing through a standee, something eaten that vanished.
- Orbit under the table (the tabletop must disappear), look at the lid top and the base underside, lift the lid, look at every part in the viewer from behind.
- Read the rules against the animation and against the parts table (counts, sizes, names).
- Look at each sheet preview for text across the raster direction, backs at the wrong end, notches as separate rectangles, parts nearer than 1.5 mm.
- Confirm the clamp strip (≥ 15 mm) and that the corner marks are inside the nominal sheet.

## Exit criteria before the owner sees a build

All commands exit 0; `illegal = 0`; `__maxSnap < 1 mm`; no page errors; no lint errors (warnings explained); the fit checker clean in every scene; art gauntlet at `NO FLAWS` for every group; the page judge at `SHIP`.
