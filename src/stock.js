/* boardgame-create engine: the stock model and every finished dimension that follows from it.
   A game names its stocks in game.json ({ key: { name, mat, lo, hi, kerf } }): two caliper readings per stock (the thinnest and the thickest the
   owner measured) and the kerf measured on that stock's coupon. Everything a joint needs is derived here, once, from those readings: slots and bars
   are drawn for the thickest reading, tab depths for the thinnest, so every fit holds anywhere on the sheet. Fits are design values validated on cut
   wood (BUMBLE & BLOOM, 2026-09): never tuned inputs.
   Node (module.exports) or browser (BGEngine.stock). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.BGEngine = root.BGEngine || {}).stock = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /** design sizes that are not material: they stay fixed whatever the stock measures */
  const DESIGN = Object.freeze({
    WALL_H: 24.0,        // tray wall height
    FLOOR_UP: 3.0,       // the floor's underside sits this far above the wall's bottom edge
    GAP: 4.0,            // the shadow line between the closed trays
    TAB_W: 18.0,         // floor tab length along the wall
    STANDEE_TAB: 10.0,   // a standee's tab width (the leaf-spring base slot is 9.50 finished: 0.25 mm interference a side)
    STAND_TAB: 10.0,     // a cross-lapped pair's tab width (+ hole)
    SPRING_SLIT: 0.8,    // slit up a tab
    SPRING_RAMP: 0.8,    // 30-degree lead-in on each bottom corner of a tab
    LEAF_SPAN: 8.0,      // the leaf spring's free span either side of the slot (owner's cut sweep: 8 / 9.50)
    LEAF_SLOT_LENGTH: 9.50,
    LEAF_GAP: 1.50,      // leaf thickness + kerf
    LEAF_MIN_CORNER_WEB: 0.60,
    BASE_END_WOOD: 3.0, LEAF_ANCHOR: 1.50,
    KEY_BRIDGE: 1.50, KEY_GAP: 1.80, KEY_HEADROOM: 1.0,   // a keyed tab: a gap in the tab and a bridge across the slot that only the right key clears
    JIG_CL: 0.07,
    POCKET_CLEARANCE: 0.30,   // a piece in a pocket or well: this much bare wood round it (owner, 2026-09-18: "the token-pocket clearance shall be 0.3mm")
    POCKET_PROUD: 1.0,        // a piece must stand at least this far above its pocket's rim to be picked up easily, else the pocket gets a finger notch
    NOTCH_R: 6.0,             // the finger notch: a half-round this big cut into the pocket's rim
  });
  /** the clearance table (mm): each value is a design decision recorded with its source; do not tune */
  const FIT = Object.freeze({
    ply_clearance: 0.15,   // across-ply slot width = t_max + this (standee bases, + holes): confirmed on the owner's coupon
    tab_depth: 0.22,       // tab depth = t_min - this (a tab never stands proud of the base it goes through)
    slot: 0.15,            // cross-laps and floor tabs in wall slots: t_mate + this
    xlap_over: 0.15,       // a cross-lap slot runs this far past the halving line
    crosslap_below: 1.0,   // a bottom cross-lap slot runs to t_tile + this below the base line
    centre_band: 0.8,      // engraving keeps t / 2 + this from a standee's centre line (the crossing half hides it)
    tab_proud: 0.08,       // floor tab length = t + this: the tab reaches the wall's outer face
    finger: 0.08,          // wall finger length = t + this; the tray's outside is INNER + 2 (t + finger)
    band_notch: 0.10,      // a finger band stops this short of each internal band edge (walls and neck boards)
    core_relief: 0.15,     // the walls with thumb notches have their core ends cut back this much in the bands the other walls' fingers fill
    neck_cl: 0.30,         // neck ring body outside = INNER + 2 finger - 2 neck_cl
    base_ease: 0.10,       // the base tray is drawn INNER + 2 base_ease inside (owner 2026-09-17: the neck goes in a little easier)
    lid_ease: 0.50,        // the lid tray is drawn INNER + 2 lid_ease inside (owner 2026-09-17: the lid slides over the neck with room)
    neck_finger_under: 0.07,   // neck finger length = t_min - this: no finger stands past the board it meets
    well: 0.60,            // a drop-in well = the token + this across flats (0.30 a side, the pocket clearance)
    min_width: 2.0, min_projection: 1.0,   // no load-bearing feature narrower or shorter than this: the beam cannot reproduce ribs
  });

  /** the hash keys a game's stocks take: <key>lo, <key>hi, kerf_<key> */
  const stock_keys = stocks => Object.keys(stocks).flatMap(k => [`${k}lo`, `${k}hi`, `kerf_${k}`]);
  /** the page's defaults from game.json's stocks */
  function defaults(stocks) {
    const D = {};
    for (const [k, s] of Object.entries(stocks)) {
      for (const f of ['lo', 'hi', 'kerf']) if (!(s[f] > 0)) throw new Error(`stock ${k}: ${f} must be a positive number (game.json stocks)`);
      if (s.lo > s.hi) throw new Error(`stock ${k}: lo ${s.lo} is thicker than hi ${s.hi}`);
      if (!['birch', 'walnut'].includes(s.mat)) throw new Error(`stock ${k}: mat must be birch or walnut (the renderer's woods), got ${s.mat}`);
      D[`${k}lo`] = s.lo; D[`${k}hi`] = s.hi; D[`kerf_${k}`] = s.kerf;
    }
    return D;
  }
  /** every finished dimension for one parameter set P over the game's stocks. box: { stock, neck (stock key), inner } */
  function derive(stocks, P, box) {
    const S = {};
    for (const k of Object.keys(stocks)) {
      const lo = P[`${k}lo`], hi = P[`${k}hi`], kerf = P[`kerf_${k}`];
      if (!(lo > 0 && hi > 0)) throw new Error(`stock ${k}: readings must be positive, got ${lo} and ${hi}`);
      if (lo > hi) throw new Error(`stock ${k}: ${k}lo ${lo} is thicker than ${k}hi ${hi}: enter the thinnest reading as ${k}lo`);
      if (!(kerf > 0)) throw new Error(`stock ${k}: kerf_${k} is missing or not positive`);
      S[k] = Object.freeze({ key: k, name: stocks[k].name, mat: stocks[k].mat, t: hi, tlo: lo, kerf, nominal: stocks[k].nominal || +((lo + hi) / 2).toFixed(2) });
    }
    if (!box || !S[box.stock]) throw new Error(`box.stock names no stock: ${box && box.stock}`);
    const neckKey = box.neck || box.stock; if (!S[neckKey]) throw new Error(`box.neck names no stock: ${neckKey}`);
    const B = S[box.stock], N = S[neckKey], D = DESIGN, INNER = box.inner;
    if (!(INNER >= 80 && INNER <= 400)) throw new Error(`box.inner must be 80 to 400 mm, got ${INNER}`);
    const WALL_H = box.wall_h || D.WALL_H;
    if (!(WALL_H >= 24 && WALL_H <= 40)) throw new Error(`box.wall_h must be 24 to 40 mm, got ${WALL_H}: the glue jig's springs bear 20 to 22 mm up the wall and were validated at 24 (a shorter wall overstresses them)`);
    const WALL_T = B.t + FIT.finger, OUT = INNER + 2 * WALL_T;
    const NECK_H = 2 * WALL_H + D.GAP - 2 * (D.FLOOR_UP + B.t);
    const WALL_SLOT_H = B.t + FIT.slot;
    for (const [name, width, projection] of [
      ['floor tab', D.TAB_W, B.t + FIT.tab_proud], ['corner finger', WALL_H / 3 - 2 * FIT.band_notch, B.t + FIT.finger],
      ['neck finger', NECK_H / 5 - 2 * FIT.band_notch, N.tlo - FIT.neck_finger_under]])
      if (width < FIT.min_width || projection < FIT.min_projection) throw new Error(`${name}: ${width} x ${projection} mm is below the load-bearing minimum`);
    /** the number and centres of the floor tabs along a side of the box: 60 mm apart, centred */
    const n_tabs = Math.max(2, Math.min(4, Math.floor(INNER / 60)));
    const TABS = Array.from({ length: n_tabs }, (_, i) => INNER / 2 + (i - (n_tabs - 1) / 2) * 60);
    const F = {
      stocks: S, box_stock: box.stock, neck_stock: neckKey,
      INNER, INNER0: INNER, OUT, WALL_H, WALL_T, FLOOR_UP: D.FLOOR_UP, GAP: D.GAP, TAB_W: D.TAB_W, TABS, BAND: WALL_H / 3,
      T: B.t, T_LO: B.tlo, KERF: B.kerf,
      FLOOR_TAB: B.t + FIT.tab_proud, FLOOR_EDGE: FIT.finger, FLOOR_SPAN: INNER + 2 * FIT.finger,
      EASE: 0, TRAY: null, BASE_EASE: FIT.base_ease, LID_EASE: FIT.lid_ease, BAND_NOTCH: FIT.band_notch, CORE_RELIEF: FIT.core_relief,
      SLOT_W: D.TAB_W, WALL_SLOT_H, SLOT_Y0: WALL_H - D.FLOOR_UP - WALL_SLOT_H,
      NECK_H, NECK_BAND: NECK_H / 5, NECK_T: N.t, NECK_FINGER: N.tlo - FIT.neck_finger_under, NECK_CL: FIT.neck_cl, NECK_OUT: INNER + 2 * FIT.finger - 2 * FIT.neck_cl,
      JIG_CL: D.JIG_CL,
      /** a standee cut from stock `s` standing in a base or tile of stock `b`: its tab depth, and the slot it needs */
      standee: (s, b) => { const st = S[s], bs = S[b]; if (!st || !bs) throw new Error(`standee: unknown stock ${s} or ${b}`);
        return { tab_depth: bs.tlo - FIT.tab_depth, slot_w: st.t + FIT.ply_clearance, slot_len: D.LEAF_SLOT_LENGTH, tab: D.STANDEE_TAB }; },
      /** a cross-lapped pair cut from stock `s`: the slot width for one half's thickness, standing in a + hole in stock `b` */
      pair: (s, b) => { const st = S[s], bs = S[b]; if (!st || !bs) throw new Error(`pair: unknown stock ${s} or ${b}`);
        return { xlap_w: st.t + FIT.slot, xlap_over: FIT.xlap_over, below: bs.t + FIT.crosslap_below, tab_depth: bs.tlo - FIT.tab_depth, plus_w: st.t + FIT.ply_clearance, plus_bar: D.STAND_TAB - (D.STANDEE_TAB - D.LEAF_SLOT_LENGTH), centre_half: st.t / 2 + FIT.centre_band }; },
      well: af => af + FIT.well,
    };
    return Object.freeze(F);
  }
  /** the fits F seen from one tray: the base tray is base_ease roomier than the drawn frame on every side, the lid tray lid_ease */
  function tray(F, which) {
    if (which !== 'base' && which !== 'lid') throw new Error(`tray: 'base' or 'lid', not ${which}`);
    const e = which === 'base' ? F.BASE_EASE : F.LID_EASE;
    return Object.freeze(Object.assign({}, F, { TRAY: which, EASE: e, INNER: F.INNER + 2 * e, OUT: F.OUT + 2 * e, FLOOR_SPAN: F.FLOOR_SPAN + 2 * e }));   /* INNER0 stays the drawn frame */
  }
  /** the nominal frame the art is drawn in: each stock at its nominal thickness, kerf 0.15 (art never depends on the measured stock) */
  function nominal_params(stocks) {
    const P = {};
    for (const [k, s] of Object.entries(stocks)) { const n = s.nominal || +((s.lo + s.hi) / 2).toFixed(2); P[`${k}lo`] = n; P[`${k}hi`] = n; P[`kerf_${k}`] = 0.15; }
    return P;
  }
  return { DESIGN, FIT, stock_keys, defaults, derive, tray, nominal_params };
});
