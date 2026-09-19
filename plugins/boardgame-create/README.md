# boardgame-create

A Claude Code plugin: one skill that designs and fully produces a laser-cut board game from one prompt ("recreate Catan for my laser"), and the `fable-reviewer` agent its gauntlets use. It runs on the [boardgame-engine](https://github.com/jschall/boardgame-engine), which the skill clones as the game's `engine/` submodule.

## Install

In Claude Code (v2.1.275 or later):

```
/plugin install boardgame-create --marketplace jschall/boardgame-engine
```

or in two steps: `/plugin marketplace add jschall/boardgame-engine`, then `/plugin install boardgame-create@boardgame-engine`. Without the plugin system, copy `skills/boardgame-create/` into `~/.claude/skills/` and `agents/fable-reviewer.md` into a project's `.claude/agents/`.

## Needs

node 18+, git, and for the checks a Chromium (playwright installs one), `rsvg-convert` (librsvg) and `pdftoppm` (poppler). `node engine/bin/bg.js doctor` names anything missing.

## Example prompt

Start Claude Code in an empty folder and say what you want as you would to a game designer with a laser in the next room. The skill asks nothing it can decide itself; it designs, measures the design in self-play, then builds every file and checks it.

> Make me a laser-cut board game about lighthouse keepers on a stormy coast for 2 to 4 players, about 30 minutes, for adults and kids from 8. Diode laser, 300 x 450 mm bed. I have 3 mm basswood ply (caliper 2.78 to 2.95 mm) and 1.5 mm basswood (1.42 to 1.58 mm), kerf about 0.18 mm on both. Standing pieces for the keepers, a shared map that fills in as the game goes, something the players do to each other, and a rulebook my kids can read. Box no bigger than 200 mm. Build everything: the cut files, the box with its glue jig, the page and the rulebook.

Or, shorter, for a known game:

> Recreate Catan for my laser: 3 mm birch ply and 1.5 mm birch, kerf 0.18, a 40 W diode. Keep the trading and the robber, replace the dice with something the wood can make, and design the box so every piece stores in a tray.

Either way you end up with a folder like `lighthouse/` holding `lighthouse-sim.js` (the rules and AI), `parts/` (the sheets to cut), `jig.json` and the jig sheet, `packing.json`, `lighthouse.html` (the page) and `manual/output/` (the PDFs), with `engine/` as a git submodule and `design.md` recording every decision and number.

## What you get

One prompt in an empty folder yields a game folder: the rules engine with its AI and design gates, the cut sheets (SVG, kerf-compensated, with the kerf coupons), the shoulder box and its glue jig, the packing plan, a self-contained HTML page (press the button: the box opens in 3D, every piece flies to its place, the AI plays), and the rulebook as a press PDF and a booklet. `skills/boardgame-create/SKILL.md` is the workflow; `reference/` the standards and the design procedure; `templates/` the judges.

License: MPL-2.0 (the repository's `LICENSE`); a game made with it is its author's, under any license (the engine README, License).
