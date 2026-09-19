/* SPDX-License-Identifier: MPL-2.0; Copyright (C) 2026 Jonathan Challinger; source: https://github.com/jschall/boardgame-engine
   This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at https://mozilla.org/MPL/2.0/. */
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
