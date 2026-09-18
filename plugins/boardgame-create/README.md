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

## What you get

One prompt in an empty folder yields a game folder: the rules engine with its AI and design gates, the cut sheets (SVG, kerf-compensated, with the kerf coupons), the shoulder box and its glue jig, the packing plan, a self-contained HTML page (press the button: the box opens in 3D, every piece flies to its place, the AI plays), and the rulebook as a press PDF and a booklet. `skills/boardgame-create/SKILL.md` is the workflow; `reference/` the standards and the design procedure; `templates/` the judges.

License: GPL-3.0-or-later (see the repository's `LICENSE`).
