# Lessons from TUMBLER, SNOOZY HOLLOW and BUMBLE & BLOOM (2026-09-14)

The complete list of the owner's corrections, mined from every session transcript with dates and quotes, is `reference/corrections.md`; the checkable rules distilled from them are `reference/standards.md`.

Everything the owner corrected, in their words, and the rule that came out of it. Read this before starting; each line was paid for.

## Process

- "pretty lame gameplay honestly." (after a complete build with balanced self-play) → **Gameplay gate before production.** Check the design against `principles.md`, run the gameplay judge, and get the owner's approval ("great. build it.") before any cut file or 3D work. Balance stats are never evidence of fun.
- "research these games, come up with a theory for what makes a hit game. then design a new game." → Research → theory → design doc with a "checked against the theory" section → approval → build.
- "i don't like the idea of seat compensation." → Never bonus points or resources for later seats. Rotate the start player, change the opening or the end trigger.
- "i don't want it *overoptimized* for minimum assembly and glue joints. there should be some dimensionality to it - even if it is just a few pieces having press-fit stands." → Press-fit standees, cross-lapped structures, stands. Still four sheets.
- "every assembly with art on it needs to go through a loop where an independent agent judges the art and it is iterated on until the judge can't find any flaws." → The art gauntlet (`gauntlet.md`), fresh judge every round, `NO FLAWS` terminator.
- "don't run the judge, just work on addressing my requests." → The owner's queued requests always come before an autonomous loop. Stop the loop when told; interleave otherwise.
- "ok. all proposals should definitely be recorded and kept." → Every concept to disk; the winner gets cut SVGs, a renderer of the exact parts, an animation from those parts, and a scrolling chatbox.
- "stop work for now" → Stop cleanly, persist everything finished, report.
- Ask up front, not mid-build: handicaps (no), 3D presence (yes), glue policy (minimal, not zero), lid style (two identical trays + neck), which axis the sheet flips about for backs, ergonomics of every token a hand must pick up.

## Gameplay and hidden information

- "is there any randomness in the game? i guess there's no dice" → randomness at the input (shuffled setup, face-up rows), no output dice.
- "the blueprint idea seems kind of stupid... how do i keep it secret ... how exactly do i stop others from seeing?" and "players would easily learn to recognize the unique grain pattern on the back of each token" → **Wood carries no secrets.** Make it public, engrave backs solid, or use dealt cards.
- "the cats have to enter the board through their cat flaps, right?" (three times) → Each piece enters and exits only through its own door; a "secret back door" rule confused the owner twice and was cut. Anything in the rules must appear in the animation or be cut from the rules.
- "there should *never* be overlapping cats. not in simulation, not in animation." → One piece per space in the engine, the animation and the physical parts.
- "the turn numbers are all misaligned because of the center justification." → Left-align rules lists with hanging indents.

## Animation

- "the animation should be included in the proposal html, not a separate python game" → JS rules engine (UMD) shared by stats, verifier and page.
- "i'd like it to move a lot slower (maybe a quarter of the speed or slower) ... a scrolling 'chat log' of events. it should really convey how the game is played." → Slow default; round headers; captions say why; players talk.
- "there should be one place where action text is displayed (the scrolling chatbox only). the scrolling chat box should not resize dynamically." → One fixed-height log.
- "i just saw marmelade teleport" / "a cat still teleported" → Every move travels visibly along a legal route, also off-board moves, bumps and swaps; `__maxSnap` measures it.
- "a cat ate a treat and the animation didn't make it clear where that treat went." → Consumed things fly to a visible stack; nothing fades.
- "maybe the animation should show the lid as well?" / "the box should start closed in the animation." → The lid is in the scene; the demo starts closed and swings open like a book.
- "fix the animation so that the disk gets lifted up above the cat's head before the cat is moved into position" → Lift, then move, then drop; nothing clips through anything.
- "just watched a cat go right through a ward. how am i to expect this game to be fun when you can't even get the animation to follow the rules right?" (twice; both were legal special moves the log only mentioned beforehand) → Replay verifier in the build; the page asserts every hop and stops on `ILLEGAL`; every exception is marked on the board and named in the move's own caption at the moment it happens. A legal-but-unexplained move reads as a bug.
- "the animation controls should be refined and reduced." → Play/Pause, New game, speed, Reset view.
- "orbit controls on the main animation as well." → Same orbit/pan/zoom everywhere.

- "let's make a rule: the table view should always show *every* piece at all times. if there are cards not in play, they should be in a stack somewhere on the table or in the box." (2026-09-15, after a page gave every player the same card) → One instance per real part, complete inventory from the first frame, unused cards in a visible pile, nothing `hidden`; checked by the inventory count in `qa_intersections.js`.

## Rendering

- "the texture is not an actual texture?" / "the textures don't change orientation when the parts move" / "the texture scale should be the same on all parts" / "lighter and more subtle ... finer - scale them down by maybe half" / "a normal map, and a better texture with less repetition" → Textures in part-local mm through the projection, one scale for every wood, procedural seamless tiles with normal maps, never a visible repeat (the owner complained about repetition twice, including CSS gradients).
- "fix z-fighting/occlusion issues" / "the new renderer doesn't display top and bottom surface textures at all" → WebGL with a depth buffer and stencil faces from the start; the canvas painter could never be made occlusion-correct.
- "there should be a model viewer with orbit controls for each part ... right click to pan. no angle limits. ... make sure no parts are duplicated between assemblies." → As stated; explode toggle only for glued assemblies.
- "when i orbit the camera and look up at the game from the bottom, the tabletop should disappear" / "i see a mirror image of the inside-lid engraving. i want the box to have a beautiful external engraving." → Table only when the camera is above; `back:` decals for undersides; never mirror the inside onto the outside.
- "the 3d views need to be *brighter* ... less flat. more photorealistic." / "your light source is on the wrong side of the table" → Light on the camera's side; the real bug was left-handed winding.
- "get rid of these yellow dots where the tumblers line up." → No helper markers in a realistic render.
- "enable good aa/af" / "a lighter texture briefly appears ... then is replaced" / "allow the animation section to stretch into the left and right margins" / "#table should be allowed to be as wide as the browser window" → Supersampling, mipmaps, anisotropy; gate the first frame on textures; full-bleed stage; the ground quad must be large enough for wide viewports (a dark wedge showed at 1900 px with a ±1000 mm quad).
- "i still see items intersecting, even in the initial unstarted table view..." (after screenshots had been "checked") → Never eyeball; run `qa_intersections.js` and `fitcheck.js`.

## Manufacturing

- The owner's "3 mm" ply measured 2.67–2.92 mm with calipers (2026-09-15). Ask for caliper readings per stock at the brief and derive every slot, tab, notch and box dimension from the measured thickness with a small clearance ("don't go ham on the clearance"). The owner may glue box joints.

- "assume the engraver can only do 2 tones: engraved and not engraved. so, e.g. soot's name won't show up. unless soot is made of walnut?" → Strictly two-tone; a second tone is a second wood.
- "clearances should assume kerf is compensated and tolerances are within ~0.07mm." → Finished-size files, explicit clearances.
- "i never said nothing should rely on friction alone. press-fit is ok with me as long as it doesn't loosen over time." (2026-09-15, correcting a paraphrase in this skill) → Plain press fits for joints assembled once; a compliant feature (bump on a flexure beam with a relief slot) or positive capture for joints taken apart every game.
- "the tab on the bottom of the cat is too wide. the base is not a feasible part to make. the detent flexure should probably just be a slot behind the detent bump, not a 'finger.'" → Feasible tabs (8 × 3), bump-and-slot detents.
- "i don't understand how the players are meant to get the loot plugs out ... they're going to be flush" / "impossible to pick up with human hands" → Every pocketed token needs a way out (pop-up ledge, finger gap).
- "reduce assembly and gluing as much as possible" / "i don't like that the loot plugs each require a glue joint" / "still 2-part assemblies" → No per-piece glue, no multi-part tokens.
- "is there any mechanism to secure the lid ... do the pieces fit inside the box? is there an engraving on the top and bottom of the box?" / "this friction-fit lid mechanism is not going to work at all." / "the lid and the base are 2 identical open-top boxes ... a 'neck' separator ... a nice shadow line" / "allow easy opening (push them apart at the shadow line)" / "the shadow line on the box should be maybe 2-3mm." / "the neck shouldn't need any finger joints at all. its pieces will just get glued in." → The shoulder box in `mechanical.md`; packed-box fit scene mandatory; engraving on both outer faces.
- "are you sure the cats and their bases will fit in the box?" → They did not; bar feet so pieces lie flat.
- "the long edges of the base box and the lid will need finger joints." / "wherever there's a cutout for a finger joint, it shouldn't be defined as a rectangle - that wastes cutting time." → Tabs on every floor edge, notches in the outline.
- "validate your design by making sure there are no interfering parts in the render." → `fitcheck.js`.
- "the SVG files for the top and bottom engravings need to be added to the svg section." → Backs files are sheets too, with downloads.
- "the cats are engraved on both sides now, but the engraving isn't mirrored properly." / "if we are engraving the back of the sheet first, we should also cut the edges of the sheet" / "clamp one side of the sheet, and then the laser cuts off that side with a couple of notches (kinematic coupling)" / "each back engrave should have 4 corner marks" / "the registration features should be half circles instead of triangular" / "6mm beyond the nominal left edge to 4mm beyond the nominal right edge" / "i need at least 15mm" → The registration procedure in `manufacturing.md`.
- "the loot disks are going to need their own slot so that they don't fall off" / "a slot engraved on one side ... the problem with that is laser time and process control" → Cross-halving; no engraved pockets.
- "the laser engraves along the long axis of the wood, so lining up as many engravings as possible along the long axis will minimize engraving time" / "can we make the sleeping cat tool backs align on the long edge somehow?" / "reduce the number of columns of solid paw-prints" → Raster-direction layout and grouped bands.
- "design a sheet just for testing the mechanical elements of the design? it should use minimal material." → Sheet 0.
- "these kinds of parallel cuts should be shared. can you design a nesting algorithm that stacks the parallel cuts and deletes redundant ones?" → `share_paths`.
- "can we redesign the inside of the lid? the instructions should be rewritten and the cats should probably be next to their respective dens." → Player stations engraved in the tray beside their dens; rules as columns in play order.
- "design a glue jig to align the top and bottom plates" → A flat plate with eight vertical stops at the corners; generate it from the same geometry (import the outline, never hard-code).

- "we need to implement our own kerf comp because we're mashing the parts together and merging cuts" / "please also compensate all engravings for kerf - shrink the engraved region by the kerf compensation - might need to union them first if they're overlapping" / "make sure that any engraving on the back side that is intended to go to the edge of the cut should extend beyond the cut by maybe .25mm, since registration might not be perfect" (2026-09-15) → Kerf compensation in the files with the machine's off; a measured kerf parameter; shared cuts one kerf apart on a midline; engraving unioned and shrunk by kerf/2; edge bleed kerf/2 on fronts and 0.25 mm + kerf/2 on backs (`manufacturing.md`).

## Instruction text

- The owner's standard for every rule text (2026-09-15): "plain sentences instead of slogan fragments", and a review of the manual and all instruction text "for ai-slop language patterns" to remove them → complete sentences a patient friend would say; no fragments, phrase stacks or header-colon shorthand; none of the AI patterns; cut rules from a small panel rather than compress them (`page.md`, "How the instructions read").
- "definitely don't use the word skep in the instructions. no one will know what it means." (2026-09-15) → Everyday words only in anything a player reads (manual, page rules, box text, piece names); technical names stay in code ids.

- "the laser doesn't really have a minimum that we have to enforce per se." (2026-09-15, correcting the skill's hard rule) → 0.45 mm strokes and 0.6 mm gaps are legibility guidance; the lint warns, nothing fails on the number.
- "i want to generate a score line on the (kerf compensated) edge of every engraving, except where there's a cut anyway. scoring the edge of the engravings makes them much sharper and they really pop." (2026-09-15) → Edge scores on every face, order engrave → score → inner cuts → outlines, a with/without coupon on sheet 0 (`manufacturing.md`).

- "i never really asked for the tuned fits... if the kerf and thickness is right, everything should fit." (2026-09-15, on a page that had grown fit-override inputs) → Fits are design values sized for the whole thickness and kerf window; no override inputs, no rung ladders; sheet 0 carries the kerf coupons and one sample of each joint.

- "i want to swap the back of the box to the top of sheet 1. this is because i don't want any smoke stains on the outside of the box." then, when the first fix put them on the back: "this is wrong. the outer engravings need to go on the top of the sheet. you put them on the back of the sheet. they will get ugly." (2026-09-15) → The face down on the honeycomb gets stained. Outside faces of the box (and any display face) go in the FRONT file, face up during cutting; inside faces in the backs file; check mirroring and joint handedness after the swap (`manufacturing.md`).
- "make the corner marks a unique color" (2026-09-15) → The backs registration marks are magenta `#ff00ff`, their own layer.
- "a 15x15mm triangular keep-clear at the corners of the sheet after the registration strip is cut off (at the locations of the corner markings) ... useful for clamping" (2026-09-15) → 15 mm right-triangle keep-outs at the four remaining corners of two-sided sheets, for clamping warped stock (`manufacturing.md`).

- "the box lid needs a hair more clearance around the neck. the bottom of the box is a pretty good fit but i might actually like it to be a bit easier to put the neck in. let's make both halves slightly larger, but be more generous with the lid. leave the neck alone." then "you can just make the neck symmetrical and remove the marking." (2026-09-17) → The two trays are not identical: both are drawn from one frame with a per-tray ease (`base_ease` 0.10, `lid_ease` 0.50 mm a side in `geom/fits.js`, `fits.tray(F, which)`), the neck is symmetric with no mark, and the sheet-1 block that stood at exactly the 3 mm long-edge margin now uses 2.5 mm (`mechanical.md`, "The shoulder box").

## Code

- "never code a fallback. if a library is missing, fail loudly." (2026-09-15) → No silent substitutes: no alternative engines, font candidate lists, retry-on-failure, catch-and-continue or `x || default` hiding a missing dependency or input; throw naming what is missing. The Python laser library's font candidate list was exactly this pattern. Documented defaults for optional settings are fine.

## Text on the parts

- "just had to tell tumbler not to put useless text all over the place." (2026-09-15, on "this tray is the lid: turn it over onto the box" engraved on a tray and a rules digest with a CLICK · SNEAK · PAWS · STASH phase strip engraved on the board) → A word goes on the wood only if a player reads it during play at that spot and could not infer it; no handling instructions, no rules digests on playing surfaces, the rules in one place (inside the lid), icons before words. See the "Text on wood" section of `art.md`.

- The owner asked for "appropriate choking hazard warnings" (2026-09-15) → the regulatory small-parts warning on the lid top and in the page, with the sizes from 16 CFR 1500.121 (`art.md`).

## Page

- "this is ridiculously huge." / "the 2D art you added to the page is too large." / "was this supposed to have a figure?" / "clean up a bunch of the stale 2d drawings ... put in 2D designs for all the symbols and cats" → Figures from the cut files, fixed modest pixel widths, nothing stale.
- "the spotted cat has a spot over its face." → Faces on plain wood.

- "probably the page should be redesigned to be a scrolling animation where we start with 2 boxes (one facing forward one facing back), as the user scrolls the back-facing box disappears, a table appears, the box opens, the pieces come out onto the table." (2026-09-17) → The opening in `page.md`: one sticky full-viewport stage, every frame a function of scroll progress, reversible, skippable, reduced-motion safe, and the table's own instances restored before anything else uses them.
- "make sure that all the major sections of the existing page are accessible on the redesign, but don't be redundant ('the box' tab is not necessary now, and there should only be one place where the rulebook files get linked) and don't include any AI slop copy that no one will read." and, of a three-sentence lede, "no one will read this, not even me." (2026-09-17) → No lede; the rulebook PDFs linked once; no box tab; no captions under the stage; a word on the page only if someone will read it.
- "need to be able to watch an AI game (but maybe with simpler and more beautiful controls - perhaps overlaid on a full-page 3d view?)" (2026-09-17) → The chips, log and Play / New game / speed in a translucent panel over the canvas; tabs and Reset view over its top; the parts list in the same panel.
- "get rid of the read larger/fit to screen buttons on the rulebook - page turning is broken in 'read larger' mode." (2026-09-17) → The rulebook viewer has one mode.
- "nope, does not work. it should be an extremely cool, world-class scrolling-animation website. right now it is a broken pile of shit. keep trying. for starters, the header needs to go away." (2026-09-17, on the first scroll page, whose stage did not stick) → No header at all: the page opens on the stage with the title over the 3D view. Verify a scroll page by scrolling it (`analysis/scroll_sheet.js`: real `window.scrollTo`, GPU capture, a contact sheet of 20 frames), and judge the contact sheet before showing the owner anything.
- "can the pieces at the top of the box come out first so that pieces don't clip through each other?" / "i don't like the way that parts hover in the air. they should just go straight to their table position." (2026-09-17) → The box empties pile by pile, top down, each piece in one arc (a fixed-time lift, a carry, a fixed-time drop), no holds; landing order comes from assigning pieces to slots after the launch order, and a sampled pairwise pass fixes the rest. `analysis/opening_check.js` is the gate (it went from 797 intersecting pairs to a handful).
- "i think the gameplay view should be the bottom of the page. the instruction booklet, the cut files, and the parts should be modals or something. the gameplay should start as soon as the scroll hits the bottom. the sidebar should mostly go away. the chat should probably just be transparent. there should probably be no controls at all for the gameplay." / "refreshing the page should start at the top probably. the scrollbar should be hidden on the page." (2026-09-17) → `page.md`. Scrolling up from the game packs the live game and scrolling down resumes it; the log takes no pointer (the wheel over it used to scroll the log, not the page).
- "the instruction manual should not have anything in it about cutting/production or assembly. it is purely an end user document." (2026-09-17) → The print rulebook carries rules, setup, examples, questions, glossary and index only; making, registration and glue-jig steps belong on the page's files section and in manufacturing.md. Storage (take the tree and beehives apart) is end-user content and stays.
- "btw the facing-away box is upside-down." (2026-09-17) → A box shown standing on edge must stand on the edge that makes its face art read upright; check the underside art against the file, not by eye.

## Bugs not to repeat (one line each)

Opening: a scheduler that fixes conflicts by nudging heights ratchets (a lift propagates up the box's staircase to pieces that then meet others); pushing a stretched flight's landing later makes it linger beside its stack; launch delays alone overrun the scroll when one spot takes 28 landings. Keep the converging rules (BUMBLE's `schedule`) and change structure, not strength, for the last pairs.
Renderer: the overlay canvas forcing position:relative on the canvas parent, which silently defeated a sticky stage (test the real scroll, never only frozen frames: the page "worked" at every #intro= value while the stage scrolled off the screen); a group rotation with the sign of the textbook formula (the renderer turns the other way: negate the axis); passing a point to `scene.world(B, u, v, h)` as one array (NaN everywhere downstream); screen-space textures; painter ordering and shadow spill; stencil `INVERT` with a full mask (use `stencilMask(1)`); missing mipmaps; left-handed winding lit faces dark (`frontFace(CW)`); decal creation rebinding `TEXTURE0` (create decals before binding wood; cache back decals); viewer dropping `back/flipV/flipped/group`; table visible from below; noise lattice beating the pixel grid; a worker that stalls headless (watchdog + `&sync=1`); a ground quad too small for wide viewports; meshes not keyed by thickness.
Page/build: `%` in CSS breaking format strings (use `@@NAME@@` + replace); `<svg height="auto">`; escaped apostrophes in JS strings written from Python; a `//` comment inside page JS that a builder had flattened to one line (the JS build keeps `page.js` a real file, which removes the hazard); patch anchors drifting after context compaction (grep first, patch small, keep backups); a raw `&` in an SVG `<title>` (escape; XML-validate every sheet); `KeyError` after renaming sheets (derive links from the layout).
Generator: `fix_bbox` matching the wrong entry; double-registered outlines on the shared layer; markings over eyes; backs mirrored the wrong way; an arc sweep flag making a slot into a bump (the fit checker caught it); a foot bar on the wrong axis; a plug circle inside a face making a false island; slivers at notched corners; detent notches 30° out of phase; count mismatches from implicit slot lists; parts nearer than 1.5 mm; text overflowing a card.
Sim/animation: supply exhaustion crash (enforce counts in the engine); unlock logged before the payout that caused it; hot-potato pounce; zero-slack endgame; stuck turns; a special move animated as a jump; tweens frozen under headless virtual time (test in real time); `scrollIntoView` unreliable for screenshots (pin the canvas or use `shot.js`).

## Ordering mistakes that cost the most time

1. Production before gameplay approval (a whole game thrown away).
2. Constraints asked mid-build (seat compensation tuned then rejected; flat design then dimensionality; art drawn before the judge-loop rule; lid redesigned four times; token pickup redesigned four times).
3. Trusting the wrong QA (virtual-time screenshots, eyeballed intersections, judges spending a round on a renderer bug).
4. Hidden-information mechanics on wood.
5. Backs convention and registration settled after cover art existed.
6. Hand-drawn page figures that went stale.
7. A judge loop running while the owner's requests queued.
