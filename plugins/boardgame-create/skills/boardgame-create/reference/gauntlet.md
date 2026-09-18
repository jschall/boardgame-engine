# Gauntlet loops

The Gauntlet Loop (Matt Shumer's method, packaged as a Claude Code skill by others): **do not let the same agent build something, judge its own work, and stop.** A lead decomposes the goal into independently judgeable parts; builders produce each part; a *fresh-context, harsh* critic compares the real output against a **named, fetchable, comparable reference bar**, side by side and blind; failed parts go back for another round; the loop ends when the work wins the blind comparison, never after a fixed number of rounds. A vague bar ("award-winning") makes the critic invent a comparison and approve everything, so the bar must be a specific thing the critic can open.

The owner's own version, given during BUMBLE & BLOOM: "every assembly with art on it needs to go through a loop where an independent agent judges the art and it is iterated on until the judge can't find any flaws." My own review of generated art missed clipped outlines, collisions and ugly shapes every time; fresh judges found 20–27 flaws per group in round one.

Every judge is given `reference/standards.md` and reports each applicable standard as MET or NOT MET with evidence; a loop does not end with a NOT MET, and a standard that a game deliberately departs from is recorded in `design.md` with the reason before the judge sees it.

This skill runs four gauntlets. Each uses a prompt in `templates/` and the evidence the scripts produce.

## 1. Concept gauntlet (before design)

Fan out concept writers (one per lens, `templates/concept-writer.md`), write every concept to disk and keep it, judge with a three-judge panel (buyer, critic, maker), vet finalists (prior art, cut-list feasibility, simulated playthrough), and present the ranking. **The owner picks.** Reference bar: a named published game the panel can look up (Ticket to Ride, Carcassonne) at the same weight.

## 2. Gameplay gauntlet (before geometry)

Design doc + self-play stats → `templates/judge-gameplay.md` with a fresh judge each round. Fix the ranked problems, re-run self-play, repeat until `SHIP` (every part ≥ 7) or the owner approves. Stop condition is the owner's word: when the owner says "don't run the judge, just work on my requests", stop the loop and do that.

## 3. Art gauntlet (per group, until NO FLAWS)

1. Group the art: tiles/board, standees and pieces, boards and cards, the box. Each group gets a `brief` describing intent (what each thing depicts and how it is used), not what you changed.
2. `node engine/checks/preview.js parts/parts.json preview preview_groups.json && node engine/checks/render_for_judge.js judge.json` → `judge/<group>/`: one PNG per flat part at 5–8 px/mm and 3D shots from a freshly loaded page (assemblies, the closed box, the lid lifted, the base from below).
3. Spawn one **fresh** general-purpose agent per group with `templates/judge-art.md`, the image paths, the brief, and the reference bar (a named product's component photos the agent can open, or reference images you provide). Ask for concrete flaws only and a blind A/B.
4. Fix every flaw in the generator (parts.js), regenerate, run the check chain, re-render, spawn **new** judges. Never reuse a judge; never argue with one; if a flaw is impossible under two-tone or the laser's limits, say so in the next brief.
5. Stop only when a fresh judge returns `NO FLAWS` for that group and prefers ours in the blind A/B. Report the number of rounds and the last flaw lists to the owner. Round counts of 3–5 per group are normal.

Judges must be told: the wood grain in renders is procedural (ignore it); two tones; the minimum feature sizes; the viewing distance; which files are backs.

## 4. Animation and page gauntlet (before delivery)

`verify_anim.js` screenshots + the log text + the engine event log → `templates/judge-animation.md` (rules compliance, teleports, overlaps, legibility). `shot.js` section screenshots → `templates/judge-page.md`. Fix, rebuild, fresh judges, until `CLEAN` and `SHIP`.

## The reviewer agent

The owner's final gates use a dedicated agent type, `fable-reviewer` (Fable 5.1 at xhigh effort; judges only from files, renders, simulations and measurements it opens or runs itself; concrete flaws most serious first with evidence, consequence and fix; ends with exactly `VERDICT: PASS` or `VERDICT: FAIL`; never modifies project files). The plugin provides it (`agents/fable-reviewer.md`, spawned as `boardgame-create:fable-reviewer`); without the plugin it is a project agent, `<project>/.claude/agents/fable-reviewer.md`, and `templates/fable-reviewer.agent.md` is the copy to install. Spawn a fresh one for every review and never let a builder review its own work. Use it for every gauntlet judge when it is available, with the prompts in `templates/`; fall back to a general-purpose agent with the same prompts otherwise.

Final gates before delivery, each a fresh reviewer: **gameplay** (rules, engine, self-play), **fit** (clearances and tolerances at both ends of the measured stock thickness, with a finite-element check of flexures and press fits at the extremes if needed), **aesthetics** (the art gauntlet's last round and the page). All three must return `VERDICT: PASS`.

## Running loops

- With `/loop` or a `Workflow` when the owner has opted in; otherwise a plain sequence of Agent calls. Each round: render → judge → fix → check chain.
- Keep an `iterations.md` log: round, judges' flaws, fixes, self-play numbers. The owner reads it.
- Builders and critics are different agents. The main session is the lead: it dispatches, applies fixes, and never grades its own art.
- Report honestly: rounds run, flaws remaining, what could not be fixed and why.
