/* What the rulebook's figures are made from: real part drawings (assets/<id>.svg from parts.json) and renders of the built page (assets/render-<name>.png).
   engine/manual/assets.js captures them. Every id named here must be a part; every hash must be a page view the stage can show. */
module.exports = ({ META, PARTS, S }) => ({
  parts: ['tile-apple', 'tile-pear', 'tile-plum', 'tile-cherry', 'barn', 'farmer-red', 'crow', 'scarecrow-a', 'token-apple', 'token-pear', 'token-plum', 'token-cherry', 'basket-red', 'base-red', 'order-4', 'order-10', 'floor-base'],
  renders: { cover: { hash: '#shot=table&p=52&y=-18', width: 2000, height: 700 } },
});
