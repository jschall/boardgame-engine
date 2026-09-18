/* page.js: what ORCHARD's page shows beyond the engine's machinery: the sheet catalogue (names, grouping, front/back pairing and the description
   under each) and the words no player may read. module.exports = (game.json, parts.json) => { SHEET_GROUPS, banned } */
'use strict';
module.exports = function (CFG, PJ) {
  const M = PJ.meta, stockName = s => M.stocks[M.sheet_stock[s]].name;
  const production = Object.keys(PJ.layout).filter(s => /^sheet[1-9]\d*$/.test(s)).map(s => ({ id: s, name: `Sheet ${s.slice(5)}`, back: PJ.layout['backs-' + s] ? 'backs-' + s : undefined, description: `${PJ.layout[s].title}. ${stockName(s)}.${PJ.layout['backs-' + s] ? ' The back engraves the other faces.' : ''}` }));
  const tests = [{ id: 'sheet0', name: 'Joint samples', description: `${stockName('sheet0')} scrap. The sample joints: a base and the tab that presses into it, a box corner with its floor tab, and four squares on shared cut lines. Cut after entering the measured kerf, before any production sheet.` }]
    .concat(Object.keys(PJ.layout).filter(s => s.startsWith('kerf-')).map(s => ({ id: s, name: `Kerf coupon · ${stockName(s)}`, description: `${stockName(s)}. A 20 mm square and a plate with a 20 mm hole to measure the kerf: cut them first, measure both, enter the kerf in the stock panel.` })))
    .concat([{ id: 'jig-sheet', name: 'Assembly jig', file: 'parts/jig-sheet.svg', description: 'The box glue jig: the base plate with sixteen spring stations and sixteen ramped inserts. Glue the inserts into their mortises; keep at least 1 mm clear below every spring on a central bench support, then lower a tray onto it open side up while its glue sets.' }]);
  return { SHEET_GROUPS: [{ id: 'production-sheets', name: 'Production sheets', sheets: production }, { id: 'test-sheets', name: 'Test sheets', sheets: tests }], banned: [] };
};
