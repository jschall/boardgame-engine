
  /* ------------------------------------------------------------ the QA contract (window.__maxSnap, __placements) and the game loop */
  function measureSnap(roundShown) {
    let snap = 0;
    for (const [inst, x, y, z, rot, period] of syncBoard(roundShown)) {   /* period: a hexagonal token looks the same every 60 degrees */
      const P = period || 360, d = rot === undefined ? 0 : Math.abs(((((rot - (inst.rot || 0)) % P) + P * 1.5) % P) - P / 2);
      snap = Math.max(snap, Math.hypot(x - inst.x, y - inst.y), Math.abs(z - inst.z), d * 0.1);
    }
    window.__maxSnap = Math.max(window.__maxSnap || 0, snap);
    return snap;
  }
  window.__placements = {
    table: () => { introFinish(); return T.static.concat(T.dynamic); },
    midgame: turns => { introFinish(); const g = new S.Game({ players: NP, seed: SHOWCASE.seed }), rng = S.mulberry(SHOWCASE.seed * 13 + 5); if (GT.opening) GT.opening(g, rng); for (let i = 0; i < turns && !g.over; i++) S.playTurn(g, rng); setBoardFromState(g); return T.static.concat(T.dynamic); },
    box: () => B.static.concat(B.lid),
    assemblies: () => Object.keys(ASMS),
    assembly: id => need(ASMS, id, 'ASMS').build(),
  };

  async function run(seed, my, resume) {
    try {
      if (resume) { chips(-1); log('The game goes on.', 'sys'); } else {
      G = new S.Game({ players: NP, seed }); ai = S.mulberry(seed * 13 + 5); qr = S.mulberry(seed + 77);
      initTable(G); chips(-1); illegal = 0; GT.resetShown(G); seen = 0; lastRound = -1;
      log(GT.gameLine ? GT.gameLine(G) : `<b>Game ${seed}.</b> ${[...Array(NP).keys()].map(c => `${dot(c)}${NAMES[c]}`).join(', ')}.`, 'sys');
      if (GT.opening) { const line = GT.openingLine ? GT.openingLine(G) : null; if (line) log(line, 'round'); GT.opening(G, ai); await animateEvents(G.log.slice(seen), my); seen = G.log.length; measureSnap(0); }
      }
      while (!G.over) {
        if (G.round !== lastRound) { lastRound = G.round; log(GT.roundLine ? GT.roundLine(G) : `Round ${G.round + 1}`, 'round'); if (GT.onRound) await GT.onRound(G, my); }
        chips(G.current);
        S.playTurn(G, ai);
        await animateEvents(G.log.slice(seen), my); seen = G.log.length;
        measureSnap(lastRound);
        chips(-1); await wait(700, my);
        if (window.__stopAfter && G.turn >= window.__stopAfter) { paused = true; window.__stopAfter = 0; }
      }
      await GT.finale(my);
    } catch (e) { if (e !== CANCEL) throw e; }
  }
  /* the demo: at the bottom of the page the table plays game after game by itself, and there are no controls. Scrolling back up hands the
     pieces to the opening again (returnToTable). The QA hook #shot=table&anim=N runs the same loop and pauses after N turns. */
  const demo = { on: false, resume: false };
  let currentSeed = SHOWCASE.seed;
  async function demoLoop(my) {
    try {
      for (let seed = currentSeed; ; seed = 1 + Math.floor(Math.random() * 99999)) {
        currentSeed = seed; if (!demo.resume) logEl.innerHTML = '';
        await run(seed, my, demo.resume); if (my !== runId) return; demo.resume = false;   /* a cancelled loop leaves the flag to the next one */
        await wait(7000, my); log('Clearing the table for the next game.', 'sys'); await GT.clearTable(my);
      }
    } catch (e) { if (e !== CANCEL) throw e; }
  }
  function startDemo() { if (demo.on) { paused = false; return; } demo.on = true; paused = false; demoLoop(++runId); }   /* demo.resume set by returnToTable: the loop picks the game up where it stopped */
  function stopDemo() { demo.on = false; paused = true; ++runId; focusCell = null; }
  function syncToEngine() { setBoardFromState(G); seen = G.log.length; chips(-1); GT.resetShown(G); GT.syncShown(G); }
