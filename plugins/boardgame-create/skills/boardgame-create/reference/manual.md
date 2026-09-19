# The print rulebook: what goes in, how it reads, how it looks

BUMBLE & BLOOM's `manual/` is the reference (on the author's machine; ORCHARD's `manual/` in the engine's `starter/` is the small worked example): a 24-page 180 × 180 mm booklet generated from the engine, verified by 40 checks, imposed for a letter printer. This file is the standard the rules judge and the page judge hold a new game's rulebook to. The owner's words are quoted where a rule came from one.

## What goes in (and what does not)

The rulebook is **an end-user document**: "the instruction manual should not have anything in it about cutting/production or assembly." Nothing about kerf, thickness, glue, jigs, sheets, registration, or how the box is assembled; the neck, the frame's box position and the maker's steps live on the page's files modal and in this skill. `manual/check-references.js` fails on an "Assembly" or "For the maker" page.

The pages, in order (BUMBLE's, generalise the content, keep the shape):

1. **Cover**: title, one-line subtitle, "2 to 4 players · 20 to 40 minutes", the hero figure (a legal position rendered from the parts), the choking-hazard warning, a short "how to read this book" note (two reading paths: learn, then reference).
2. **What's in the box**: every component with a figure from the cut files, its count, and *what it does* in one sentence each ("near the beginning, it explained each piece and what it 'does'"). The warning again.
3. **Choose your pieces / your board**: what a player owns and how their pieces are told apart.
4. **Set up the game**: numbered steps; exact setup maps per player count, generated from the engine's opening data.
5. **The turn**: the steps in play order, one page per phase where a phase has rules, each with a figure.
6. **Worked examples**: at least one full turn drawn from an engine replay, lettered positions, arrows for movement, the state before and after.
7. **End and scoring**: when the game ends, how to score, tie-breaks, a scoring example with real numbers.
8. **Reference**: the goal cards or equivalents in full; rulings as questions and answers ("Flight questions", "Timing and supply questions"); a glossary ("Words at the table"); a one-page **keep-this-page-open** turn summary; a rule index.
9. **Inside back cover blank**; the back cover repeats the turn summary or the rewards table.

Not in the book: designer notes, thanks, marketing, "strategy tips" as filler, variants that were not playtested, anything the page already says about production.

## How it reads

- **Plain sentences a patient friend would say at the table.** "When you plant a flower with a wasp nest, move the wasp to any flower within two spaces." Not "NEST wasp to a flower within 2". No header-colon shorthand, no telegraphic fragments, no slogan fragments ("plant · fly · dance"), no AI patterns (hype adjectives, "not just X, it's Y", rhetorical questions, dash asides, triplets for rhythm, delve/journey/elevate/seamless/vibrant, closing summaries).
- **Everyday words.** "beehive", not "skep"; "nectar", not "resource cube"; define a term once and use it consistently.
- **Numbers where a player needs them**, in figures, never rounded ("3 nectar", "within 2 spaces"); every number is synced from the engine (`sync-rules.js` writes `rules-data.js`; the build fails if the prose and the engine disagree).
- **One idea per sentence; one rule per paragraph;** the exception stated right after the rule it modifies, with a small example.
- **Two reading paths**: a first read that teaches in play order and never forward-references; a reference half that settles questions alphabetically or by topic. The cover says which is which.
- **Every figure has a caption that says what to look at**, lettered positions in the text match the picture, and the picture is a legal state the engine produced.
- **The rules judge** (`templates/judge-rules.md`) plays three turns from the book alone and lists every GUESS (a question the book does not answer) and every wrong answer; the loop ends at none of either.

## How it looks

- **Trim** 180 × 180 mm (fits inside the box under the lid; any size that fits the box inside the neck, with 3 mm bleed and crop marks for commercial output); 24 pages, six nested sheets, saddle-stitched, plus a letter-sized imposition for a home printer (`manual/build.js` with `pdf-lib`; `imposition-guide.html`).
- **Type**: the game's own family (the same `fonts/` as the page and the engraving: regular body, semibold emphasis, bold display), embedded; body around 12.2 pt on 1.17 line height, captions 10.2 pt, page titles 23 pt, cover title 38 pt; short measures (two columns where a page is prose-heavy). ORCHARD's Fredoka-on-cream is an example, not the rule.
- **Colour**: a dark ink on a paper ground, one wood tint for figures, one accent for rules borders and callouts. Two-tone figures rendered from the parts on a wood swatch; the 3D cover shot uses each part's production material. The values live in the game's `manual/manual.css`.
- **Hierarchy**: a kicker line (section · topic) above every page title; numbered steps for setup and the turn; question-and-answer blocks for rulings; a reference table for rewards; bold for terms on first use only.
- **Figures**: from `manual/assets.js` (SVGs from `parts.json`, the cover shot from the page's renderer), at modest size, never hand-drawn, never stale: `verify.js` checks every asset against the current parts and the cover against a legal replay.
- **The safety warning** in its own bordered band on the cover and the components page (sizes in `art.md`).
- **Layout checks** (`review-layout.js`): no overflow on any page, no orphan words (`text-wrap: pretty`), no page over 100 % height, blank page markers hidden, the index fits.
- **The page embeds it**: the engine's `page/manual-embed.js` inlines the built pages so the web page's rulebook modal shows the same pages (`game.json.manual.pages`) offline as a page-turning book; `engine/checks/page_check.js` and `page_gate.js` compare the two.

## The pipeline (keep as machinery)

```
node engine/bin/bg.js manual      # sync-rules.js, assets (manual/figures.js or the game's assets.js), engine/manual/build.js, engine/manual/check.js, then the game's verify.js and check-references.js
```

`sync-rules.js` (the text from `rules.js`, the numbers from the engine) → `rules-data.js`; `figures.js` names the figures the engine's `assets.js` captures → `assets/`; the engine's `manual/build.js` (Playwright → PDF, `pdf-lib` imposition with bleed) → `output/<slug>-print.pdf` and `<slug>-letter-booklet.pdf`; `verify.js` (every printed number and figure against the engine; 40 checks in BUMBLE); `check-references.js` (no maker content, every cross-reference resolves); `review-layout.js` (overflow and orphans). Needs node, Chromium (Playwright) and Poppler.
