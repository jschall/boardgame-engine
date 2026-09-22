# The print rulebook: what goes in, how it reads, how it looks

TUMBLER's four-page book (`tumbler/manual/manual.js`, 2026-09-21) is the reference. BUMBLE's 24-page book is the older, longer form; the owner has since called that kind of book an encyclopedia and cut TUMBLER's from sixteen pages to four. This file is the standard the rules judge and the page judge hold a new game's rulebook to. The owner's words are quoted where a rule came from one.

## The measure

"If every rule were explained succinctly, exactly once, how many pages would there be? Like 3 at most?" That is the book: every rule once, in the order the game is played, and nothing else. "The manual isn't the place for fun text. It's the place to avoid making the players read an encyclopedia and still feel stupid and frustrated." A rule stated twice will one day contradict itself; a paragraph that states no rule is weight. The page count is a multiple of four for the imposition, so a light game is four US Letter pages: the cover, the pieces and the setup, the turn, the special piece and the end.

## What goes in (and what does not)

1. **The cover**: the title art (the lid engraving, rendered from the cut files), one line that says exactly "A game for two to four players" (the owner struck "from eight years up, in about thirty minutes"), and the small-parts warning. Nothing else: no reading guide, no tagline copy, no note on how to use the book.
2. **The pieces**: each kind of piece drawn from the cut files with its name under it, and the sentences that say what it is for. The counts in one sentence.
3. **Setting up**: the real table drawn from the cut files, every part turned so its lettering reads (a part is drawn in its cut frame, which may be sideways: TUMBLER's board and lid needed a quarter turn), lettered A to G with a one-sentence key, the tray at a size where its wells and tiles read, and the numbered steps beside it. Every player count in the same steps; the two-player pairing is named there.
4. **The turn**: its steps numbered, each a paragraph of rules, with a figure only where the figure carries a rule (an open passage and a shut one; one click before and after).
5. **The special piece and the end**: how it is taken, how it is stolen, when the game ends, how it is scored, the ties, the player-count differences, the warning again and the maker's line.

Not in the book unless the owner asks for it: examples that restate a rule, a worked turn, a glossary, an almanac, a questions page, an index, a keep-open summary, strategy tips, designer notes, thanks, marketing, and anything about production (cutting, kerf, glue, jigs, assembly: those live on the page's files modal and in this skill; `manual/check-references.js` fails on an "Assembly" or "For the maker" page).

## How it reads

- **Every heading, caption, label and sentence is a plain sentence, or a plain noun phrase that names its subject**: "The pieces", "Setting up", "Your turn", "1. Sneak", "The Golden Fish", "Scoring".
- **What the owner calls AI slop and deletes on sight**: slogan headings ("Every turn, in this order"), figurative lines ("The wheel you turn is the maze the next cat faces"), reading guides ("Pages 2 to 11 teach the game in the order you play it"), comma-and headings ("Paws, then Stash", "The Golden Fish, and how to pounce"), colon shorthand ("Shiny: take it"), rhetorical questions ("Locked in?"), "Example." asides that state no rule, triplets for rhythm, hype words, closing lines ("Enjoy the heist"), kicker lines that repeat the running head, and credits that describe the production.
- **Everyday words.** "Cut-out", not "notch", for a gate; "a six-sided plate", not "hex"; nothing a family would not know unless the sentence that first uses it says what it is. A step's name is not a verb ("take Paws"): say "turn over the loot where you stop".
- **Numbers as figures** where a player needs them; every number synced from the engine (`sync-rules.js` writes `rules-data.js`; the build fails if the prose and the engine disagree).
- **One idea per sentence; one rule per paragraph;** the exception right after the rule it modifies.
- **The lid inside** carries the same rules in short. Where the two could differ, the book is right and the lid is rewritten.

## How it looks

- **Trim**: what fits the box (US Letter for TUMBLER, 180 × 180 mm for BUMBLE), a multiple of four pages, imposed for a home printer (`manual/build.js` with `pdf-lib`).
- **Type**: the game's own family (the same `fonts/` as the page and the engraving), body around 10 to 12 pt, two columns on prose pages, bold for a term on first use only. The values live in the game's `manual/manual.css`.
- **Figures**: from the cut files (`manual/figures.js`), never hand-drawn, never stale, at a size where the lettering on the part reads. A move is drawn as numbered steps through marked crossings, with the result shown in a second row; "take a good look at figure 7" was a flying arrow over the wheels and a line of tiny text, and it was redrawn. A label inside a figure is one or two words; anything longer is a sentence in the caption.
- **The layout audit** (`engine/manual/check.js`): no overflow, no orphan word, the page count matching `game.json.manual.pages`. When a page overflows, cut words or shrink a figure (an inline `style="height:3in"` on the figure's svg), never the type.
- **The safety warning** on the cover and on the last page.
- **The page embeds it**: `page/manual-embed.js` inlines the built pages, and `bg check` compares the two. Rebuild the page (`bg page`) after every change to the book: "I can't see the rulebook until you rebuild."

## The judges

- **The rules judge** (`templates/judge-rules.md`) answers about twenty edge-case questions from the book alone; every GUESS is a missing sentence and every wrong answer a contradiction with the engine.
- **The plain-English audit**: a fresh agent quotes every fragment, slogan, colon shorthand, question, triplet, dash aside, hype word and undefined word with a one-sentence rewrite, page by page; the book is done when it finds none.
- **The owner reads the built page**, not the source, and judges the figures by eye.

## The pipeline (keep as machinery)

```
node engine/bin/bg.js manual      # sync-rules.js, assets (manual/figures.js or the game's assets.js), engine/manual/build.js, engine/manual/check.js, then the game's verify.js and check-references.js
```

`sync-rules.js` (the text from `rules.js`, the numbers from the engine) → `rules-data.js`; `figures.js` names the figures the engine's `assets.js` captures → `assets/`; the engine's `manual/build.js` (Playwright → PDF, `pdf-lib` imposition with bleed) → `output/<slug>-print.pdf` and `<slug>-letter-booklet.pdf`; `verify.js` (every printed number and figure against the engine); `check-references.js` (no maker content, every cross-reference resolves); `review-layout.js` (overflow and orphans). Needs node, Chromium (Playwright) and Poppler.
