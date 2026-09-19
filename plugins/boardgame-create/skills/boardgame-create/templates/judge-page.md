# Page judge — prompt template (final deliverable QA)

A fresh agent (`fable-reviewer` where available) that opens the single HTML deliverable and audits it. Give it screenshots from `shot.js` (closed boxes, opening mid-flight, the table in play, parts, files) and the file path.

---
You are reviewing a single-page HTML laser-cut board game. Open {page path} in a browser if you can (playwright), otherwise use the screenshots at {paths}. Report concrete defects only.

The page that ships (owner, 2026-09-18): **nothing scrolls**. One full-viewport 3D stage; title, one line and player-count over two closed boxes; one button, "Open the box". Pressing it runs the opening in time (the far box dissolves, the table fades in, the first box lies down, the lid flies to its place, every packed piece flies to the table). The same button reads "Close the box" and runs the opening backwards (from the live table if a game is on). The AI game starts by itself when the box is open; **there are no Play / Pause / New game / speed controls**. Score chips and one fixed-height transparent log overlay the view (the log takes no pointer; the wheel zooms). Three nav buttons open modals: Rulebook (the trimmed book as a two-page spread — click or swipe to turn, no toolbar; the two PDF links sit under the book, only there), Parts (list, Explode, assemblies), Laser files (sheets, stock inputs). A `#loading` screen covers the stage until the first frame. Drag to orbit (and the wheel to zoom) on the closed boxes and through the opening, not only after the game starts.

This is **not** a scrolling website. Fail a page that still has a scroll track, a Skip/Scroll hint, Table/Parts tabs, Reset view, or gameplay transport controls. Those were removed.

Check and list every failure: instruction text that is not plain complete sentences (fragments, slogan stacks, header-colon shorthand, hype, "not just X, it's Y", rhetorical questions, dash asides, triplets, delve/journey/elevate/seamless/vibrant, restating closers); a specialist word a family would not know; text that contradicts the rules or the parts; figures not from the cut files, or too large/too small; the stage not filling the viewport; the opening not reversible, pieces passing through one another or the box, or a piece landing anywhere but its table place; the parts panel hiding the subject (home views sit in the clear canvas); console errors; the log resizing or action text anywhere else; a part missing from the parts list; a duplicated part in two assemblies; the closed box not showing outside engraving, the lid lifting, and the underside from below (the table disappears from below); the rulebook PDF linked in two places; copy nobody would read; repeating textures; dark top faces; a texture that flashes on load.

Also read `reference/standards.md` sections G and E4, and report G1–G9 as MET or NOT MET with the screenshot or element that decides each. G8: press the box button on the real page. G9: the loading screen, the title and the chrome must look like this game, not like the ORCHARD starter left unchanged.

`FINDINGS` then `VERDICT`: `SHIP` or `FIX`.
---
