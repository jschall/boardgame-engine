# Bought components: dice, marbles, cubes, meeples, cards

The laser makes the parts and the box; it does not have to make everything. "it will be 100% laser cut/laser engraved on a 40W diode laser except for accessories like dice" and later "it should not be afraid to use dice or marbles or other mass produced gaming items." A die, a marble or a handful of cubes is often the best component for a job (input randomness, a rolling or dropping mechanism, a counter that is pleasant to handle). Use them when the design wants them; design the wood around them; pack them.

## Standard sizes (design to these; confirm the owner's supplier)

| item | size | notes |
|---|---|---|
| d6, standard | 16 mm, rounded corners | pips or engraved faces; a blank 16 mm d6 can be laser-engraved on a jig |
| d6, small | 12 mm | fits a 13.5 mm well; easy to lose, count them in the box |
| d6, mini | 8 mm | for tracks and counters |
| polyhedral set | d4 18–20 mm, d8 16 mm, d10 16 mm, d12 18 mm, d20 20 mm | sizes vary by maker; leave 1 mm |
| glass marble | 16 mm (5/8 in) | ±0.3 mm; the common toy marble; also 14 mm and 25 mm (1 in) shooters |
| glass gem / flat marble | 14–16 mm across, 6–8 mm thick | irregular; a 20 mm well |
| wooden cube | 8 mm (resource cubes), 10 mm | sharp or rounded edges; a 8.5 mm pocket |
| wooden disc | 15 × 4 mm, 20 × 5 mm | |
| meeple | 16 mm tall, 4 mm ply-thick body | a 4.4 mm slot holds it upright |
| pawn | 25 mm tall, 10 mm base | |
| poker card | 63 × 88 mm, 0.3 mm | a 65 × 90 mm well 3 mm deep holds a stack of 20; bridge size 57 × 88 |
| mini card | 44 × 63 mm | |
| sand timer | 30 s / 1 min, 25 mm Ø, 55–65 mm tall | |

## Holders and pockets in wood

- **A marble in a hole**: a marble of diameter D sits in a through hole of diameter 0.6 D in 3 mm ply (it rests on the hole's edge, centre height D/2 − sqrt((D/2)² − (0.3 D)²) above the plate); a track for rolling marbles is two parallel rails 0.7 D apart. Marbles roll: a resting spot needs a hole or a dimple, never a flat.
- **A die in a well**: a well 1 mm larger than the die across, 40 % of the die deep so it can be picked up; a dice tray is a lidless tray with 12 mm walls and a felt or engraved floor (engraving deadens the bounce).
- **Cubes in a pocket**: 0.5 mm clearance a side, depth half the cube; a supply well holds a stack; count spaces so every cube in the game has a home on the table (standard I1: every piece visible).
- **Cards in a well**: 1 mm clearance a side, a thumb notch on one long side so the stack can be lifted, depth so the top card stands proud of the well.
- **Meeples and pawns** stand in slots or on discs; a standee base fits them too if the tab is replaced by the meeple's own foot (a 4.4 mm slot for a 4 mm body).

## In the box, on the sheet, in the checks

- Bought items are listed in `design.md`'s component list with size, count and supplier line, and in the rulebook's "what's in the box" with a figure (a rendered primitive at true size: `render3d.js` boxes and cylinders, textured plain).
- The box packs them: the engine's packer (`bg pack`, `src/pack.js`) takes prisms of any size; a bag of marbles is one prism; dice lie loose in a well cut in a tray layer or in a bag.
- The animation shows them as instances (`mk({part: <primitive>})`): dice roll as a tumble and land on the rolled face, marbles roll along their track, cubes fly like tokens. `qa_intersections.js`'s inventory counts them from the components list, not the sheets.
- The page's files modal lists what to buy beside the sheets to cut.
- Never engrave what a bought item already shows (pips on a die).
