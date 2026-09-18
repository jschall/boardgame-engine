// browser.js (boardgame-engine): the one place the checks launch Chromium. launch(): software rendering (SwiftShader) by default, so a check gives
// the same answer on every machine, or the machine's GPU with BG_GPU=1 (headless Chromium reaches it with these flags; ten times faster on a big
// page). launchGPU(): the GPU unless BG_GPU=0, for the checks that look at what the reader sees (the scroll contact sheet, the opening sweep).
'use strict';
const { chromium } = require('playwright');
const GPU = ['--use-angle=default', '--enable-gpu', '--ignore-gpu-blocklist'], SOFT = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const gpu = v => v === '1' || v === 'true';
module.exports = {
  launch: (extra = {}) => chromium.launch(Object.assign({ args: gpu(process.env.BG_GPU) ? GPU : SOFT }, extra)),
  launchGPU: (extra = {}) => chromium.launch(Object.assign({ args: process.env.BG_GPU === '0' ? SOFT : GPU }, extra)),
  GPU, SOFT, chromium,
};
