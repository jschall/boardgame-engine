---
name: boardgame-create
description: Design and fully produce a laser-cut board game (2–4 players, diode laser, plywood, shoulder box and glue jig included) from one prompt, on the boardgame-engine: a self-contained HTML page whose one button opens the box in 3D, every piece flying to its place, and a self-playing AI game, the print rulebook (press PDF and booklet), and kerf-compensated cut SVGs. Use whenever the user asks to brainstorm, design, build, iterate on, judge, or cut-file a board game for a laser cutter (xTool, Glowforge, any diode/CO2), asks to "recreate" or "make a laser version of" a known game, or mentions BUMBLE & BLOOM, ORCHARD, TUMBLER, SNOOZY HOLLOW, gauntlet loops, cut sheets, shoulder boxes, standees, or a 3D render of laser parts.
---

# boardgame-create

Produce a complete laser-cut board game for a 40 W diode laser on the **boardgame-engine** (`https://github.com/jschall/boardgame-engine`): the rules engine and AI, the parts as kerf-compensated SVG sheets, the shoulder box with its glue jig, the print rulebook, and one self-contained HTML page whose 3D stage unboxes the game at the press of one button and then plays it. The engine solves every hard problem (geometry, fits validated on cut wood, the box, the jig with its FEM gate, the packer, the page machinery and opening, the rulebook build, every check); the game is a folder with the engine as a git submodule and about eight files of its own. BUMBLE & BLOOM is the finished game the engine came from; ORCHARD is the small complete starter every new game begins as.

One prompt like "recreate Catan" should end with all three deliverables: run the phases below without stopping for approval except where the owner's word is needed (the concept, if the game is not chosen; the design gate; nothing else).

## Setup (once per machine, once per game)

```
git clone https://github.com/jschall/boardgame-engine ~/boardgame-engine && cd ~/boardgame-engine && npm install && npx playwright install chromium && node bin/doctor.js
node ~/boardgame-engine/bin/new_game.js <folder> --name "GAME NAME"     # a git repo with engine/ as a submodule, ORCHARD renamed inside it
cd <folder> && node engine/bin/bg.js all                                 # everything runs before a line of the new game exists
```
`doctor` names anything missing (node 18+, chromium, poppler, librsvg). If the engine is already on the machine (an existing game's `engine/`, or `~/boardgame-engine`), pass it with `--engine <path>`; with no network, `--no-submodule` copies it. From then on every command is `node engine/bin/bg.js <parts|stats|balance|pack|jig|page|manual|lint|fit|check|all>` from the game folder; `engine/README.md` is the contract and `START.md` in the folder is the replacement order.

Read `reference/standards.md` first, then `reference/corrections.md`: every line is a mistake the owner already corrected once. Everything is JavaScript; never code a fallback (a missing library, font, file or field throws); the owner's direct requests always pre-empt an autonomous loop.

## What the game writes, and what the engine does

| deliverable | the engine (never touched) | the game (`<folder>/`) |
|---|---|---|
| rules engine and AI | `checks/balance.js`, `checks/stats.js` (the sim contract) | `<slug>-sim.js` |
| the parts, sheets, coupons, backs, pocket trays | `src/geom.js` `src/shapes.js` `src/stock.js` `lib/lasergeom.js` | `geom.js` (the parts spec) + `art.js` (the engraving) |
| the box, its panels, the neck | `src/box.js` | `box` in the spec: title, cover art, corner motifs, the setup map, the medallion mark, the lid text |
| the glue jig | `src/jig.js` (+ the FEM in `src/jig_mech.js`) | nothing (`jigs.js` for an extra jig) |
| packing | `src/pack.js` | nothing (`pack.js` for hand-placed piles) |
| the page, opening, demo, parts viewer, files | `page/page.js` `page/build.js` `lib/render3d.js` | `table.js` (the table layout and the animation), `page.js` (the sheet catalogue, banned words) |
| the print rulebook | `manual/build.js` `manual/assets.js` `manual/check.js` | `rules.js` (lid text and pages), `manual/manual.js` (layout), `manual/figures.js` |
| the checks | `checks/*` | `qa_scenes.json`, `judge.json`, `preview_groups.json` |

`game.json` names the game (name, slug, sim, players, minutes, tagline, maker, year, product code, `geom_files`, `manual.pages`). ORCHARD's files are the worked examples of every contract; BUMBLE's (`~/junk/boardgame/bumble` on the author's machine) show a hand-written generator with several stocks, a frame with shared cuts, and a rich table.

## Hard rules (the owner's standing preferences; the full set is `reference/standards.md`)

1. **Two-tone engraving**: engraved or bare; a second tone is a second wood. Lettering outlined. Strokes under about 0.45 mm and gaps under 0.6 mm are legibility guidance, never enforced.
2. **Kerf compensation lives in the files** (machine compensation OFF): the engine does it from a kerf measured on each stock's coupon. Fits are the engine's design values from two caliper readings per stock, never tuned inputs. Interference on long edges or leaf springs, never on sub-millimetre ribs or the ply thickness.
3. **Wood carries no secrets** (grain betrays identical backs). Randomness at the input.
4. **Every piece is on the table at all times**; nothing teleports, nothing overlaps, the animation obeys the rules exactly (`assertLegal`, `syncBoard`); one fixed-height log; free orbit; the game plays itself once the box is open.
5. **Dimensionality**: press-fit standees on keyed leaf-spring bases (the engine's), cross-lapped pairs in + holes. Minimal glue, never zero presence; no multi-part tokens.
5b. **Pieces and trays are the engine's `tray` kind** (standard D10): every pocket is the piece's outline + 0.30 mm; the piece stands ≥ 1 mm proud or the pocket gets a finger notch; pockets are cut from the thin stock and laminated on a back when the game has thin stock (a back of thin or thick stock as material allows), engraved into the tray when it has not. Player boards with wells, token trays, card holders and the lid's supply are trays. The pieces are stored in their trays: `bg pack` loads every pocket and stacks the trays, so design the trays and pocket counts so the game's pieces fit the box that way.
6. **The box**: the engine's shoulder box (INNER 80 to 205 mm), packed inside closed (checked), the glue jig on one sheet, a beautiful external engraving, the rules inside the lid, the safety warning on the lid, a medallion and the product code under the base.
7. **Sheets**: 300 × 450 mm nominal stock; the engine nests, registers and marks them. Test coupons on their own strips, never on production sheets.
8. **No seat compensation**; fix turn-order bias structurally (finish the round, then score).
9. **Every figure comes from the cut files**, at modest size. The page is one self-contained file with no header: the stage, three modals, nothing nobody reads.
10. **Independent judges, fresh every round, until NO FLAWS**, each reporting the standards as MET or NOT MET.
11. **Instruction text is plain sentences** in everyday words, everywhere; the rulebook is an end-user document (`reference/manual.md`).
12. **Never code a fallback.** 13. **No useless text on the wood.** 14. **The wood outranks the model**: a cut part that contradicts a check corrects the check. 15. **Never edit `engine/`** from a game: an engine change is an engine commit, tested on ORCHARD and BUMBLE.

## Phases and gates

### 0. Brief
**Ask about the shop before any design work** (standard K4), in one message, only for what the prompt does not already say, and wait for the answer: the machine (make and model, laser type and power, bed size, whether it engraves); each material they will cut (kind, nominal thickness, and two caliper readings per stock, thinnest and thickest, if they have calipers; how many sheets and their size); kerf per stock only if they know it (the engine draws for 0.18 mm and sheet 0's coupons measure the true kerf after the first cut: say so, do not make them guess); the components they are happy to buy (dice, cubes, meeples, cards) if any. The geometry, the joints, the box size and the sheet budget all derive from these, so a design made before knowing them is made twice. Write the answers into `design.md` under `## The shop`.
Then capture the rest: players, time, audience (adults by default), theme, sheet budget (4), box style (the shoulder box), the product code if any. Ask now about 3D presence and token ergonomics if the brief leaves them open; otherwise decide. For a "recreate X" prompt: the mechanics are known; write `design.md` from them, with the numbers, and go on. `design.md` (ORCHARD's headings) is the single source of truth.

### 1. Concepts (only if the game is not chosen)
Fan out concept writers by lens (`templates/concept-writer.md`; `templates/brainstorm.workflow.js` when the user opted into multi-agent orchestration), judge with three personas against `reference/principles.md`, present the ranking. **The owner picks.**

### 2. Design gate
Follow `reference/design-procedure.md`: the action budget in one sentence, the throughput ledger, interaction on the main path, one budget / currency / clock / verb, a complexity budget counted in aid-card sentences. Fill `reference/principles.md`'s table in `design.md`; write the rules with real numbers, an example turn, the component list with mm sizes and stocks, and a sheet-area estimate (the engine's sheets are 294 × 444 mm usable; the box block takes about 340 × 280 of one). Run `templates/judge-gameplay.md` with a fresh agent (standards A1–A7). For a game the owner named, this gate is a report, not a question: say what the design is and go on unless something in it needs a decision only the owner can make.

### 3. Rules engine, self-play, balance
`new_game.js` first, so the whole chain exists. Replace `<slug>-sim.js` following the sim contract (`engine/README.md`; every tunable in `RULES`; typed events, one visible thing each; supply limits in the engine; `check()` invariants; thousands of games per second). Then the gates in `reference/design-procedure.md`, in order: the dumb-strategy gate and the breaker, the obvious-strategy gap, the one-sentence test, the opponent-blindness drop, the live-paths gate (two or three archetypes that answer each other), the two feedback-loop numbers, rewards counted by their uses (the sim exports `strategies` and `archetypes`; `node engine/bin/bg.js balance --gates` runs them all); only then `node engine/bin/bg.js balance` (seat wins within 6 points of even at every count, about 6–9 rounds at four players, goals met 20–70 %; `--tune key=lo:hi:step` sweeps tunables), `bg stats`. Balance by tuning numbers and counts, never by adding rule text. Decide balance questions yourself from the numbers; report after.

### 4. Parts
Replace `art.js` and `geom.js` (the parts spec: tiles, tokens, cards, boards, plates, standees on keyed bases, pairs in + holes, trays with pockets for the pieces; the box's `cover`, `corner`, `setup_map`, `mark`, `lid`, and its `inner` (80–205 mm) and `wall_h` (24–40) for the size the game needs), keeping the stocks measured in the brief. `bg parts` at the built stock, then `bg lint`; `bg fit '#<stock>lo=<lo>&<stock>hi=<lo>'` and at the thickest reading too. Art rules in `reference/art.md`; numbers in `reference/mechanical.md`; process in `reference/manufacturing.md`.

### 5. Box, jig, packing (automatic)
`bg pack && bg jig`. The packer's default piles (by kind and size) fit most games; `pack.js` places piles by hand (BUMBLE's frame). A box that does not fit its pieces is a design change (a smaller tile, a bigger INNER), not a packer change.

### 6. The page, the opening, the AI game
Replace `table.js` (the GameTable contract: the layout with the trays at `BOXO`/`LIDO`, `initTable`, `setBoardFromState`, `animateEvents` with one visible motion per event, `assertLegal`, `noteShown`, `syncBoard`, `finale`, the assemblies and groups) and `page.js`. Then `bg page --no-manual && bg manual && bg page && bg check`. What goes on the page and what does not: `reference/page.md`.

### 7. The rulebook
Replace `rules.js` (the lid text: two columns and a footer; the pages: kicker, title, HTML with `<figure><img class="part" src="assets/<id>.svg">`), `manual/figures.js` (the parts and renders the figures use) and `manual/manual.js` if the starter's layout does not fit. `game.json.manual.pages` is the count (a multiple of four). `bg manual` builds, checks and verifies; `reference/manual.md` is the content, voice and design.

### 8. Gauntlets (`reference/gauntlet.md`)
Fresh `fable-reviewer` agents (or general-purpose) with the judge templates, each given `reference/standards.md`: art per group (`node engine/checks/preview.js parts/parts.json preview preview_groups.json && node engine/checks/render_for_judge.js judge.json`) until `NO FLAWS`; animation (`anim-shots/` from `bg check`) until `CLEAN`; rules until no GUESS and no wrong answers; page until `SHIP`; the owner's final gates on gameplay, fit at both stock extremes and aesthetics. Log every round in `iterations.md`.

### 9. Deliver
Update `iterations.md`, `design.md` and the memory file. Tell the owner what to cut first (the kerf coupons and the joint samples on sheet 0), which fits are untested, rounds run per gauntlet, and anything left unfixed and why. Nothing changes after "ready to cut" except on request.

## Working habits that paid off

- Regenerate everything from code in one command (`bg all`); never hand-edit an output.
- Grep the anchor before every patch; patch small; keep a backup before a large rewrite.
- Playwright in real time for anything animated; `BG_GPU=1` for anything judged by eye or long (the checks are ten times faster on the GPU); press the button and watch the opening before believing it (`node engine/checks/scroll_sheet.js` makes the contact sheet).
- Report at real milestones; subagents hand back once; no polling loops; answer the owner's requests before running another judge round; decide small things yourself; deliver a requested sheet first and finish the long gates after.
- Several sessions may share one repository: commit only your own game's paths with an explicit pathspec, never `git add -A`; regenerated outputs are regenerated, never auto-merged.
- The engine's author keeps it current from BUMBLE: `tools/split_bumble_page.py` re-splits BUMBLE's page.js into the engine's `page/page.js` and BUMBLE's `table.js` when the stage machinery improves there; `lib/lasergeom.js` and `lib/render3d.js` come from `~/junk/boardgame/common`.
