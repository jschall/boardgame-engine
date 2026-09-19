/* SPDX-License-Identifier: MPL-2.0; Copyright (C) 2026 Jonathan Challinger; source: https://github.com/jschall/boardgame-engine
   This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at https://mozilla.org/MPL/2.0/. */
/* jig_view.js (boardgame-engine): one construction of the jig data the 3D viewer needs, shared by page/build.js (which writes it into the page) and
   checks/scenes.js (which replays the page's assemblies in node for fitcheck). Add a key here and both callers get it. */
'use strict';
const JIG_PREFIX = 'jig-';

/** jig.json's shapes under the prefixed ids the page's PARTS uses */
function jig_parts(jig) {
  return Object.fromEntries(Object.entries(jig.parts).map(([id, body]) => [JIG_PREFIX + id, body]));
}
/** the stock key the jig sheet is cut from: jig.json names it (meta.stock), and it must be one of the game's stocks */
function jig_stock(jig, meta) {
  const s = jig.meta && jig.meta.stock;
  if (!s || !meta.stocks || !meta.stocks[s]) throw new Error(`jig.json meta.stock (${s}) is not one of the game's stocks: rerun node engine/bin/bg.js jig`);
  return s;
}
/** the placements that stand the jigs up. Every field is required: a missing one means jig.json predates the field, and the viewer would fault on first frame */
function jig_view(jig) {
  const view = { stations: jig.meta.stations, thick: jig.layout['jig-sheet'].thick, padHeight: jig.meta.padHeight, extra: jig.meta.extra || null };
  for (const [k, v] of Object.entries(view)) if (v === undefined) throw new Error(`jig.json has no ${k}: rerun node engine/bin/bg.js jig`);
  return view;
}
module.exports = { JIG_PREFIX, jig_parts, jig_view, jig_stock };
