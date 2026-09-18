# render3d.js: the SVG-to-3D renderer

`engine/lib/render3d.js` (no dependencies; UMD: `Render3D` in the browser, `require()` in node). It turns the same part SVGs the laser cuts into extruded, wood-textured WebGL parts, so the 3D demo, the parts viewer and the fit checker all use one geometry source. Copy it into the game folder (or let `build.js` read the skill copy).

## Parsing

`Render3D.parsePart(svgText)` → `{ cuts: [{pts, hole}], engr: [{pts | polys, light, alpha}], lines: [{pts, w, closed}], texts: [...], bbox }`.
- Flattens paths (M L H V Z A Q C, absolute and relative), circles, ellipses, rects (rx), polygons, nested `<g transform>` (translate, scale, rotate, matrix).
- Classifies by colour: `#ff0000` / `#cc0000` / red → cut; `#0000ff` → score; black fill → engrave; black stroke without fill → engraved line; `#ffffff` fill → "light" (avoid in files: two-tone).
- Holes are inferred by nesting parity; a ring is two concentric red circles. Compound engrave paths with several subpaths are evenodd (bare holes in a fill).
- Wrap a part's inner SVG in `<svg xmlns="http://www.w3.org/2000/svg">…</svg>` before parsing (parts.json stores the inner markup).

## Scenes

`new Render3D.Scene(canvas, opts)` gives a `GLScene` when WebGL is available (stencil even-odd faces filled from one triangle list per part, depth buffer, MSAA at native resolution, 8× anisotropy, vertex-array objects and cached GL state so hundreds of instances render at interactive rates), else the canvas painter fallback.
Options: `pitch` (degrees from vertical; 0 = straight down, 90 = table level, 125 = looking up from below), `yaw`, `dist`, `cx cy cz` (look-at, mm), `view` (visible height in mm), `light` (default `[-0.35, 0.55, 0.75]`, on the camera's side), `table` colour, `plain` (no table texture, for the parts viewer), `tableAlpha` (0 to 1, default 1: fades the table quad in; 0 draws none, for an opening on an empty stage), `dpr`.

Instances live in `scene.static` and `scene.dynamic` (arrays of plain objects):

| field | meaning |
|---|---|
| `part` | parsed part |
| `x y z` | position, mm; z is the underside of a flat part |
| `rot` | degrees about z |
| `vertical` | standee/wall: the drawing's y runs **down** from z (top edge at z); `flipV: true` runs up |
| `flipped` | turned over about its own x axis (inside face down); same footprint |
| `back` | a parsed `<pid>-back` part drawn as a decal on the underside (or the far face of a vertical) |
| | a tray turned over on top of another (the closed box's lid) is `flipped: true, rot: 180, back: part('lid-outer')`; without the 180° the cover art reads mirrored |
| `thick` | 1.5 for thin stock (default 3) |
| `mat` | `'birch'`, `'walnut'`, `'brass'` |
| `grain` | grain angle in degrees (default: a per-id pseudo-random ±3°) |
| `group` | `{angle, pivot:[x,y,z], axis:[ax,ay,az]}` or an array: rotation about the line through the pivot along the axis (any direction), applied in order (a lid swinging open, a plug tipping then flipping). **It turns the opposite way from the textbook Rodrigues formula** (the code takes v × axis): +90° about +x through a box's front (+y) edge stands the box up with its lid toward a yaw-0 camera. When a rotation comes out mirrored, negate the axis before looking anywhere else; BUMBLE's `relRot` (page.js) already does |
| `alpha`, `hidden`, `shadow`, `noBottom`, `pickable`, `id`, `scale` | as named |

Coordinates: **the world basis is left-handed** (x right, y toward the viewer, z up), so front faces wind clockwise (`gl.frontFace(gl.CW)`). Getting this wrong lit every top face as if facing away from the light ("the board looks dark").

`scene.basis(inst)` and `scene.world(B, u, v, h)` map part-local mm to world; the QA scripts use them, so keep them exposed as `window.__scene`.

`scene.render()`; `scene.setView({...})`; `scene.resize()`; `scene.project(x, y, z)` → screen px; `scene.pick(px, py, r)`; overlays: `scene.overlay = ctx => …` with `scene.ring / disc / label`.

## Materials

Procedural veneer tiles (2048 px = 300 mm for birch and walnut; a normal map from the same height field) are generated once in a web worker (~1.2 s) and swapped in over a flat swatch: `Render3D.prepareTextures()` returns the promise; wait for it before the first screenshot. `#…&sync=1` in the hash generates on the main thread (headless virtual-time runs cannot wait for a worker). The table blends two rotated copies under a slow mask so the big quad never shows a repeat. `scene.setTexture(kind, img)` overrides with a photo (no normal map).

Owner's texture rules: one scale for every wood part; never visibly repetitive; lighter and finer than you think; the tabletop disappears when the camera goes below z = 0 so the underside engraving is visible.

## Decals

Engraving, scores and text are baked per part into a decal texture (max 2000 px on the long side) plus a gradient texture of its alpha (`gradTex`), and recessed 0.3 mm in the shader with one tap. **Create decal textures before binding the wood texture** (creating one binds it on the active unit; a past bug drew every flipped part black). Back decals are cached per (mesh, back part).

## Keeping the copy current

The canonical renderer is `~/junk/boardgame/common/render3d.js` on the author's machine, copied into the engine's `lib/`; every game's build.py inlines; if that file exists, sync `scripts/render3d.js` from it. Otherwise the TUMBLER session's `~/junk/boardgame/render3d.js` is the source. When the source changes, copy it over `scripts/render3d.js` and make sure the two skill patches are present: `mesh(part, mat, tk)` keyed by thickness (`mm[t]`, with the two callers passing `inst.thick || T`) and the ±6000 mm table quad. Load-test with node (`DOMParser` shim) and re-render the demo before trusting it.

## Known limits

- Live `<text>` renders in Georgia; the files should carry outlined text anyway.
- Per-part thickness is per instance (`thick`); meshes are cached per (part, thickness).
- No global illumination; key light + hemispheric ambient + camera fill + specular. Headless rendering needs `--use-angle=swiftshader --enable-unsafe-swiftshader`.
