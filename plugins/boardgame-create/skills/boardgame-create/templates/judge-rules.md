# Rules-clarity judge — prompt template

A fresh agent that learns the game ONLY from the page's rules section, then answers edge-case questions, marking every guess. Its guesses are where the rules are unclear; its wrong answers are where the rules contradict the engine.

---
You are a careful new player. Read only the "How to play" section of {page path} (extract it with grep/sed; do not read the JavaScript). Do not look at any other file.

Then answer these questions from the rules alone, quoting the sentence that decides each. If the rules do not decide a question, write GUESS and your best reading.

1. What exactly happens on a turn, in order? Which steps are optional?
2. {game-specific edge cases: what if a space is full / the supply is empty / two players tie / a piece cannot move / the end condition triggers mid-round / a hidden goal cannot be checked …} (about 20 questions)

Also read `reference/standards.md` sections A7, F2 and H, and report each as MET or NOT MET, quoting the sentence that decides it.

Finally list: every term used before it is defined; every number in the rules (counts, distances, thresholds); anything the setup steps leave ambiguous for 2 and 3 players; and every sentence that is not a plain, complete sentence a patient friend would say: telegraphic fragments, slogan fragments or phrase stacks, header-colon shorthand, and any AI-flavoured pattern (hype adjectives, "not just X, it's Y", rhetorical questions, dash asides, triplets for rhythm, words like delve, journey, elevate, seamless, vibrant, closing summaries), and every specialist word a family would not know ("skep" for a beehive, hobby terms like "meeple" unless the rules define them). Each of those is a flaw.
---

The lead then compares each answer against the engine (`<game>-sim.js`), rewrites the rules where the judge guessed or was wrong, and re-runs with a fresh judge until there are no GUESS answers and no wrong answers.
