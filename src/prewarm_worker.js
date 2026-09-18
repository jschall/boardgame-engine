// One worker of `bg parts --jobs N`: makes the engraving of its share of the parts (GAME.part_filter) at the requested stock and writes it to the
// shared file store, then stops before the sheets. The main thread's build afterwards finds every engraving in the store.
'use strict';
const { workerData, parentPort } = require('worker_threads');
const { GAME, lg } = require('./game_geom.js')(workerData.gameDir);
const store = require('./cache_node.js')(workerData.gameDir);
GAME.set_store(store);
Object.assign(GAME, workerData.game, { eng_store: store, parts_only: true, onprogress: null });
const mine = new Set(workerData.groups);
GAME.part_filter = (pid, group) => mine.has(group);
const P = lg.parse_hash(workerData.hash, GAME.defaults);
const lo = typeof GAME.layout === 'function' ? GAME.layout(P) : GAME.layout;
const t0 = Date.now();
GAME.generate(P, new lg.Layout(lo), lg);
parentPort.postMessage({ index: workerData.index, ms: Date.now() - t0, groups: mine.size, store: store.stats });
