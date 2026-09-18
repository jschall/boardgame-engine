# Animation and rules-compliance judge — prompt template

A fresh agent (`fable-reviewer` where available) that watches the animated game (screenshots from `verify_anim.js`, the scrolling log text, and the engine's event log) and checks that what the pieces do on screen is exactly what the rules allow. The owner watches these animations closely and has twice caught illegal moves and teleporting pieces that self-review missed.

---
You are checking that a board game's animated demo obeys its own rules and is legible. Read the rules at {rules section / design.md}. Then look at the screenshot sequence at {anim-shots/*.png} (in time order) and the log text at {log dump}. Also read the engine's event log {showcase.json / events} for the same game.

Check, and report each as a numbered finding with the screenshot names:
1. Every piece that changes position travels visibly along a legal route between consecutive screenshots. No piece appears somewhere else without moving (teleport). That includes pieces leaving and re-entering the board, pieces bumped or swapped by another piece, and pieces returning to the box or supply.
2. No two pieces occupy the same space; standees never overlap; nothing passes through anything (a disc through a standee, a standee through a wall).
3. Every move matches a rule: the mover was allowed to move, the path was open, the count was right, the pickup or payout was the rule's amount. Compare against the event log.
4. The log explains each action in one place, names who acts and why, and what the players say sounds like people at a table. Nothing important happens without a log line; no log line describes something the picture does not show.
5. Anything eaten, spent or discarded goes somewhere visible (a discard pile, the box), never fades out.
6. The demo starts from the box closed and set up on screen, and the ending shows the scoring.

Also read `reference/standards.md` section I and report I1–I4 as MET or NOT MET with the screenshot that decides each.

`FINDINGS` then `VERDICT`: `CLEAN` or `VIOLATIONS`.
---
