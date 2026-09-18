/* cut_view.js (boardgame-engine): finished solids derived from the production centrelines of a leaf-spring base. Laser files retain each single-pass
   slit; polygon consumers (the 3D viewer, the packer, the fit checker) use the material left after the beam passes. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CutView = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  return function cut_view(inner, model) {
    if (!inner.includes('class="leaf-cuts"')) return inner;
    if (!model || typeof model.model_svg !== 'string') throw new Error('A leaf-cut part is missing its finished solid model. Rebuild geometry.');
    return inner.replace(/<g class="leaf-cuts">[\s\S]*?<\/g>/, '').replace(/<path d="[^"]*" stroke="#ff0000"[^>]*\/>/g, '') + model.model_svg;
  };
});
