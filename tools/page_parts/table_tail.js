
  /* the log's first line, the opening (the engine animates the events it adds), the round line and the queen's move */
  const gameLine = g => `<b>Game ${g.seed}.</b> ${[0, 1, 2, 3].map(c => `${dot(c)}${NAMES[c]} (${S.COLONIES[c].name})`).join(', ')}. Each has kept ${g.rules.keepWishes === 1 ? 'one secret Queen\'s Wish' : `${g.rules.keepWishes} secret Queen's Wishes`}.`;
  const openingLine = g => { if (!g.rules.opening) return null; const ord = g.rules.openingOrder; if (!ord || !ord.length) throw new Error(`the engine's ${NP}-player rules have an opening but no openingOrder`); return `Opening plants: the ${ord.map(i => ['first', 'second', 'third', 'fourth'][i]).join(', ').replace(/, ([^,]*)$/, ' and $1')} seats each plant a flower beside their own hive, in that order.`; };
  const opening = (g, rng) => { if (g.rules.opening) S.openingPlants(g, rng); };
  const roundLine = g => `Round ${g.round + 1}${g.rules.rotate ? ` · ${NAMES[g.current]} holds the queen` : ''}`;
  async function onRound(g, my) { if (g.rules.rotate) { const [qx, qy] = boardW(g.current, -30, META.BOARD_H + 28); const a = [queen.x, queen.y, queen.z]; await tween(700, u => { const p = arc(a, [qx, qy, 0], u, 50); queen.x = p[0]; queen.y = p[1]; queen.z = p[2]; }, my); } }
  const shownScore = (g, c) => { const sc = g.score(c); return sc.wells + sc.blends + sc.jelly; };
  const chipTitle = (g, c) => { const k = g.col[c]; return `${S.COLONIES[c].name}: comb ${k.comb.length} of 12, ${k.wishes.length} wish${k.wishes.length > 1 ? 'es' : ''}`; };
  const overlay = (ctx, cell) => { if (cell === null) return; const [x, y] = cellXY(cell); scene.ring(ctx, x, y, 3.4, AF * 0.52, 'rgba(240,190,70,.95)', 3); };
  const qa = () => ({ tokensOnBoard: tokens.filter(t => t.where !== 'supply').length });

  return { NP, players, T, BOXO, LIDO, BOXA, LIDA, initTable, setBoardFromState, animateEvents, assertLegal, noteShown, resetShown, syncShown, syncBoard, finale, clearTable,
    gameLine, openingLine, opening, roundLine, onRound, shownScore, chipTitle, overlay, qa, partName, groups, defaultPart: 'asm-bee-bumble', jigAssemblies };
}
