# Principles of a hit board game (and the design gate)

Derived from studying Catan, Ticket to Ride, Carcassonne, 7 Wonders, Gloomhaven, Brass: Birmingham and Twilight Imperium, and from two prototypes: one the owner called "pretty lame" despite balanced self-play, one that passed. Use this as a **gate before any geometry, cut file or 3D work**. The owner rejected a whole built game on gameplay; production effort spent before the gameplay is approved is wasted.

## The core claim

**A hit makes everyone care about every turn, while the table builds a story nobody planned.**

## The five load-bearing parts (they multiply: one near zero and the game goes flat)

1. **One legible verb.** Teachable in a sentence, physical, and the verb *is* the fantasy: build a road, claim a route, lay a tile, pick a card and pass it. Complexity lives in the consequences, not in the rules.
2. **A shared, contested space that accumulates into a picture.** The island network, the rail map, the landscape. At the end you can point at the table and retell the game.
3. **A stake in other players' turns.** You gain, decide, or are threatened while it isn't your turn: production on others' rolls and trading (Catan), simultaneous play (7 Wonders), using rivals' coal, beer and links (Brass), deals and votes (Twilight Imperium). Where this is weak, critics say "multiplayer solitaire", and those games survive on one sharp threat (the stolen route, the denied card). The best interaction is **positive-sum with a sting**: helping a rival while helping yourself makes a table bargain; pure take-that makes it sulk.
4. **A private hope.** Hidden objectives or delayed scoring (destination tickets, hidden victory points, secret objectives, fields scored at the end) keep trailing players invested and turn the ending into a reveal.
5. **A visible, shrinking clock.** Trains, tiles, ages, eras. Pressure escalates and last-chance plays appear.

## Two amplifiers

- **Growth.** You feel yourself getting stronger: settlements become cities, cards chain, characters level, technology unlocks.
- **Talk.** A reason to address each other by name: "wood for sheep?", "don't take that route", bribes, pleas, threats.

## Conditions

- **Randomness at the input, not the output.** Show the tiles, cards or draft *before* the choice. Output dice are Catan's most common complaint.
- **The time box must fit the audience.** Every studied hit has the five parts; the depth dial decides whether it becomes a sales hit (light, under an hour) or a ratings hit (heavy). The heavy games' complaints are all about the time box: setup, upkeep, missed rules.
- **Manufacture a signature moment**: something people retell afterwards (the robber on your 8, the blocked route, the stolen city, the big reveal). Design the story, not just the system.
- **Judges reward the whole feel.** Spiel des Jahres criteria end in "overall impression", which cannot be broken into measurable parts.

## The decision space (what "fun" is, turn by turn)

A hit is less "more stuff" than a decision space that stays interesting until the last turn. The five parts above say what the table feels; these say what a single turn must be.

- **An interesting choice has three properties** (Sid Meier's definition): no option is obviously best, the options are not equally attractive, and the player can make an informed trade-off from what is on the table. One line always correct: the game is solved and the rest is bookkeeping. Options equally attractive: a coin toss dressed as a choice. A trade-off the player cannot read: noise. The obvious-strategy gap and the one-sentence test in `reference/design-procedure.md` measure the first and the third.
- **Tension comes from scarcity and timing.** Wanting two things and being able to have one: action limits, resource limits, contested spaces, and "take it now or someone else will". Without a trade-off an action is a chore. Every rule that hands out something should also make something scarce.
- **Feedback you can feel.** A turn must change the board, the score or what an opponent does next, visibly, when it happens. Progress and consequence are what make a turn feel like a turn; a rule whose effect is only bookkeeping has no feedback.
- **The core loop is fun before anything is added to it.** Decide the feeling first, then the verbs, then the mechanics. "Do a thing → get a thing → want to do it again" must already be pleasant with the fewest components; extra systems never rescue a dull loop, they hide it. Turns matter; dead time between turns and analysis paralysis inside them kill the table, so the turn is short and the choice is readable.
- **Several kinds of fun, not only challenge** (the MDA aesthetics): challenge, fellowship (the talk and the deals), discovery, expression (a strategy that is *yours*), sensation (beautiful pieces in the hand), narrative pacing, fantasy, and the comfort of clear, fair rules. A game that delivers only one of them is brittle; the design says which three it leans on.
- **The skill/luck mix and the other people.** Pure calculation feels cold, pure luck feels empty; the other players are the interesting part of the puzzle, so blocking, racing, trading and attacking the leader are where the interaction lives. Easy to teach, with depth that appears on replay, is the target.
- **Playtest the experience, not the idea** (Knizia's rule): test constantly, do not fall in love with a concept, and keep the rules simple enough that the pain is in the choice, not the bookkeeping.

## A mechanic worth using

A mechanic is worth using when players *choose* it although something else is also good: an opportunity-cost question, not a power-level one. Tests, and a mechanic must pass three of the five: it ties into the core loop; it adds a real decision (a trade-off in actions, resources, position or future options: free and always good is mandatory or invisible); its payoff matches its cost and its timing window is sharp (missing it feels like a mistake, landing it feels like a play); it synergizes with the loop, another system or the opponents' state instead of sitting alone; it scales with mastery (a simple use for a first-timer, extra lines for a better player: combos, timing, denial). If playtesters (or the dumb-strategy gate) skip it, raise its relevance (timing, combo, a clearer payoff) or cut it. If they *always* use it and ignore everything else, it is too strong *or* the alternatives are too weak: different fixes, and the throughput ledger says which. Never buff a mechanic into an auto-win; buff the *choice to use it* into an interesting one.

## Degenerate strategies

A degenerate strategy is legal play that collapses the game into something simpler and worse: one obvious line, a loop, a soft lock, a solved script, or a grind that still wins. Players hunt for them and resent the designer who left one in. The main tool is adversarial play (people whose hobby is breaking games; in this skill, the dumb strategies, the breaker agent and the archetype gate in `reference/design-procedure.md`); theory alone misses emergent exploits. Habits that shrink the surface:

- **More than one viable path, and the paths answer each other.** If racing, building and blocking can all win and each has a counter, no script takes over: rock-paper-scissors at the level of strategy, never one optimized engine.
- **A real cost on stacking one thing.** Diminishing returns, rising prices, congestion, shared limited spaces, or "the more you lean on X, the more exposed you are to Y". Degeneracy is usually a positive feedback loop with no brake; name the brake for every loop.
- **Opponents can punish the line.** Blocking, contesting the key resource, attacking the leader, and public information that says "they are going for that" keep a dominant plan from being private and unanswerable. Catch-up that still requires a decision (a robber, a tax on the leader, turn order that hurts whoever is ahead, as in Power Grid) beats automatic rubber-banding, which makes earlier choices feel pointless; seat bonuses are refused (A3).
- **Just enough uncertainty that the game cannot be scripted.** Hidden information, a modest random element at the input, or imperfect knowledge of what the others will do keeps mixed strategies alive; a fully solved perfect-information game decays into memorization.
- **Watch both feedback loops.** Unchecked positive feedback makes a runaway leader; unchecked negative feedback makes stalemate and turtling. The end condition ends the game before either collapse is the whole experience, and the last round must still be able to change the winner.
- **Remove rules before adding patches.** Exceptions breed exploits; symmetry, a simpler board, or "your nasty play also happens to you" kills a soft lock more cleanly than a paragraph of special cases.
- **Kill the darling.** A favourite mechanic that produces the only winning line is cut or reworked; a new tool can *reduce* the interesting decisions when it is simply the best thing in the box.
- **The test:** if a competent player can ignore half the game and still win consistently, the ignored half is decoration and the used half is degenerate. The goal is not numerical balance; it is that several ways of playing stay live, counterable and fun until the scoring.

## Lessons from the two prototypes

- **Balance numbers are not fun.** SNOOZY HOLLOW had balanced self-play, 60% of turns shoving someone and close scores, and was still lame: nothing happened on other players' turns, no private hope worth having, no growth, no reason to talk. Check a design against the five parts *before* simulating it. Present self-play stats as balance checks only, never as evidence of fun.
- **Use simulation for what it can measure:** pacing, runaway economies, dominant strategies, trivial or impossible goals, turn-order bias. BUMBLE & BLOOM's first rules ended in 4 rounds because one generous rule (the dancer paid per follower) compounded; self-play found that in seconds.
- **Fix turn-order advantage in the structure, not with handicaps.** Rotate the start player, change the opening, or change the end trigger. The owner rejected bonus points for later seats.
- **Secret goals must be checkable from the table at the end.** No objective should need anyone to remember what happened earlier.
- **Goals that come true almost every game are not goals.** Tune hidden objectives to be met roughly a third to two thirds of the time, at every player count.
- **Hidden information cannot live on bare wood.** Identical wooden backs are betrayed by grain; players learn them. Either make the information public, engrave the backs solid, or carry the secret on cards that are shuffled and dealt.
- **Physical presence matters.** A beautiful object is part of the appeal: give the table some dimensionality (press-fit standees, stands, small structures), not only flat tiles, even when fewer parts would be cheaper to make.
- **Every rule the animation breaks costs trust.** "How am I to expect this game to be fun when you can't even get the animation to follow the rules right?" The rules engine, the replay verifier and the animation must agree exactly.

## The design gate (fill in for every candidate before building)

| Part | Evidence in this design (quote the rule) | Score 0–3 |
|---|---|---|
| Legible verb | | |
| Shared space that becomes a picture | | |
| Stake in others' turns (positive-sum with a sting?) | | |
| Private hope (checkable at the end?) | | |
| Visible, shrinking clock | | |
| Growth | | |
| Talk | | |
| Randomness at the input | | |
| Time box (setup minutes, teach minutes, play minutes) | | |
| Signature moment (name it) | | |
| The core loop alone (fun with the fewest pieces?) | | |
| Scarcity and timing (what do you want two of and get one?) | | |
| Live paths that answer each other (name two or three) | | |
| The brake on each positive feedback loop | | |
| Which three MDA aesthetics it leans on | | |

Any load-bearing part at 0 or 1: redesign before production. Then run `templates/judge-gameplay.md` with a fresh agent and get the owner's approval of the gameplay before cutting geometry.
