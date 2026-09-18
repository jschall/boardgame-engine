# ORCHARD · design record

The engine's starter: a complete small game that runs every part of the chain, so a new game begins with everything working and replaces it
one file at a time. It is a demonstration of the machinery, not a finished design: its balance, art and rulebook are the floor a real game
starts from.

## The shop
- Machine: xTool S1, 40 W diode, bed 498 x 319 mm, engraves; sheets 305 x 457 mm (12 x 18 in).
- Stock: basswood 3 mm (caliper 2.67 to 2.92 mm), basswood 1.5 mm (1.35 to 1.65 mm); kerf 0.18 mm on both as drawn; the page's stock panel takes the coupon measurements and regenerates the sheets.
- Bought: nothing.

## Brief
- 2 to 4 players, 20 to 30 minutes, adults and children from 8.
- Theme: a shared orchard, four fruits, orders from the village, a crow that guards one tree.
- Stock: basswood 3 mm (tiles, tokens, standees, bases, baskets, the box), basswood 1.5 mm (order cards). Box 160 mm inside.

## The decisions that matter (the action budget)
One verb: walk, pick, then fly the crow. The decision each turn is which fruit to go for, given the two secret orders, the three public ones,
where the crow can land and where the other farmers stand; and then where to send the crow (1 to 3 trees on: onto a rival's tree, where it
takes a fruit for you). The end is triggered by the third delivery and the round is finished, so every seat has the same number of turns;
ties go to the fuller basket, then the later seat.

- Scarcity and timing: one pick a turn, a basket of four, ten tokens a fruit, three market orders anyone may take first.
- The private hope with a price: a secret order still in the hand at the end costs its points (Ticket to Ride's ticket), so the two
  secret orders are promises, not options.
- The crow is the players' way at each other and the game's signature moment: it is flown, never rolled, and it brings the fruit it scares
  out of a rival's basket to the flyer. Randomness stays at the input (the orchard's layout, the deal, the market).
- The brake on the builder's loop: the longer a basket is carried full, the more the crow can take from it.
- Three paths: the racer (cheap orders, the third delivery ends it), the builder (the 7 and 11 point orders) and the blocker (the crow and
  the scarce fruit a rival is one short of).

## The gates (node engine/bin/bg.js balance --gates, 400 games), 2026-09-18
- Dumb strategies, share of fair: nearest 7 / 1 %, random walk 18 / 20 %, random crow 65 / 35 %, ignoring the secret orders 43 / 37 %,
  hand only (never the market) 28 / 41 % at two / four players. Every rule costs something to ignore; the crow's choice is worth the least
  at two players (65 %, the target is 60).
- Obvious play: 56 % of fair at two players, 80 % at four. At four the first-timer's crow (onto whoever is in reach) is nearly as good as
  the planner's: a light game, and the known limit of this starter.
- Opponent blindness: the blind AI wins 47 / 39 % of fair (a drop of 53 / 61 points): the interaction is real.
- Paths: racer 68 / 56 %, builder 37 / 46 %, blocker 91 / 100 %; the blocker beats the racer 63 % and the builder 81 %, the racer beats
  the builder 78 %. The builder is under half its fair share at two players and the blocker has no answer: a real game would give the
  builder more (bigger orders, a safer basket) and the racer a way past the crow. Left as the floor.
- Feedback loops: the midpoint leader wins 53 to 63 %, the last round changes the winner in 29 to 41 % of games; no seed reaches the guard.

## Balance (node engine/bin/bg.js balance)
Seat wins 52 / 48 at two, 34 / 37 / 30 at three, 21 / 22 / 26 / 32 at four; 5.9 to 6.5 rounds; secret orders met 70 to 84 %.
game.json sets the targets: rounds 5 to 9 (a twenty-minute game), seats within 7 points (the last seat's edge at four players is turn
order: the last word in the final round; the crow's start tree, PATH index 8, is the fairest of the sixteen, and ending the game at once
or giving each rival one more turn flips the edge to the first seat by more), secret orders met 30 to 90 % (they carry a penalty, so
they are finished more often than optional goals; the tension is in the risk, not the miss rate).

## Components
| piece | count | size | stock |
|---|---|---|---|
| tree tile | 16 (4 per fruit) | 40 mm square | 3 mm |
| barn tile with the scarecrow pair | 1 + 2 halves | 44 mm square, scarecrow 46 mm tall | 3 mm |
| farmer standee on a keyed base | 4 | 36 mm tall, base 18 mm | 3 mm |
| crow on its base | 1 | 26 mm tall, base 20 mm | 3 mm |
| basket tray (a 1.5 mm pocket layer on a 3 mm back) | 4 | 80 x 32 mm | 3 + 1.5 mm |
| fruit token | 40 (10 per fruit) | 16 mm | 3 mm |
| order card | 12 | 48 x 68 mm | 1.5 mm |
| box | 2 trays, 4 neck boards | 160 mm inside, 24 mm walls | 3 mm |
