# ORCHARD · design record

The engine's starter: a complete small game that runs every part of the chain, so a new game begins with everything working and replaces it
one file at a time. It is a demonstration of the machinery, not a finished design: its balance, art and rulebook are the floor a real game
starts from.

## Brief
- 2 to 4 players, 20 to 30 minutes, adults and children from 8.
- Theme: a shared orchard, four fruits, orders from the village, a crow that guards one tree.
- Stock: basswood 3 mm (tiles, tokens, standees, bases, baskets, the box), basswood 1.5 mm (order cards). Box 160 mm inside.

## The decisions that matter (the action budget)
One verb: walk then pick. The decision each turn is which fruit to go for, given the two secret orders, the three public ones, the crow's
path and where the other farmers stand. The end is triggered by the third delivery and the round is finished, so every seat has the same
number of turns; ties go to the fuller basket, then the later seat.

## Balance (node engine/bin/bg.js balance)
Four players: seat wins 22 / 28 / 25 / 25 %, 6.2 rounds, goals met 71 %. Two and three players sit outside the ±6 window: a real game tunes
RULES (basket, moves, ordersToEnd) here with `--tune`.

## Components
| piece | count | size | stock |
|---|---|---|---|
| tree tile | 16 (4 per fruit) | 40 mm square | 3 mm |
| barn tile with the scarecrow pair | 1 + 2 halves | 44 mm square, scarecrow 46 mm tall | 3 mm |
| farmer standee on a keyed base | 4 | 36 mm tall, base 18 mm | 3 mm |
| crow on its base | 1 | 26 mm tall, base 20 mm | 3 mm |
| basket board | 4 | 80 x 28 mm | 3 mm |
| fruit token | 40 (10 per fruit) | 16 mm | 3 mm |
| order card | 12 | 48 x 68 mm | 1.5 mm |
| box | 2 trays, 4 neck boards | 160 mm inside, 24 mm walls | 3 mm |
