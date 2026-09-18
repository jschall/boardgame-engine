/* scroll_sheet.js (boardgame-engine): real-scroll contact sheet of the opening. Loads the page with no hash, scrolls the window to N positions inside the track, waits for the smoothed progress to settle, shoots the viewport on the machine's GPU and montages the frames.
   usage: node engine/checks/scroll_sheet.js <slug>.html out.png [W,H] [N]   (frames in out-frames/; FAST_CAPTURE=1 drops the title shadow and vignette for software rasterizers)
   was: load the page with no hash, scroll the window to N positions inside the track, wait for the smoothed progress
   to settle, and shoot the viewport; then montage. usage: node scrollsheet.js page.html out.png [W,H] [N] */
const { chromium } = require('./browser.js');
const path = require('path'); const { pathToFileURL } = require('url'); const fs = require('fs'); const { execSync } = require('child_process');
const file = path.resolve(process.argv[2]), out = process.argv[3] || '/tmp/sheet.png'; const [W, H] = (process.argv[4] || '1600,900').split(',').map(Number); const N = +(process.argv[5] || 20);
const dir = out.replace(/\.png$/, '') + '-frames'; fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
(async () => {
  const b = await require('./browser.js').launchGPU();
  const pg = await b.newPage({ viewport: { width: W, height: H } }); const errs = [];
  pg.on('pageerror', e => errs.push(String(e))); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await pg.addInitScript('window.__signalReady = function () { window.__readyCalled = true; };');
  await pg.goto(pathToFileURL(file).href, { timeout: 300000 });
  await pg.waitForFunction('window.__readyCalled === true', null, { timeout: 300000 });
  await pg.waitForFunction(() => window.__intro && window.__intro.live); await pg.waitForTimeout(300); if (process.env.FAST_CAPTURE) await pg.addStyleTag({ content: '.vignette { display:none } .title h1, .title p { text-shadow:none }' });
  const geo = await pg.evaluate(() => { const t = document.getElementById('track'), s = document.getElementById('stage'); return { top: t.getBoundingClientRect().top + scrollY, range: t.offsetHeight - s.offsetHeight, sw: document.documentElement.scrollWidth, iw: innerWidth, sh: s.getBoundingClientRect().height, ih: innerHeight }; });
  console.log('geometry', JSON.stringify(geo));
  const frames = [];
  for (let i = 0; i < N; i++) {
    const p = i / (N - 1); await pg.evaluate(y => window.scrollTo(0, y), geo.top + geo.range * p);
    await pg.waitForFunction(p => Math.abs(window.__intro.p - p) < 2e-3, p, { timeout: 20000 }).catch(() => console.log('did not settle at', p, 'p =', 0));
    await pg.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    const f = path.join(dir, `f${String(i).padStart(2, '0')}.png`); await pg.screenshot({ path: f, animations: 'disabled', timeout: 60000 }); frames.push(f);
  }
  const st = await pg.evaluate(() => ({ p: window.__intro.p, live: window.__intro.live, hud: getComputedStyle(document.getElementById('hud')).visibility, title: getComputedStyle(document.getElementById('intro-title')).visibility }));
  console.log('end state', JSON.stringify(st)); console.log('errors', JSON.stringify(errs.slice(0, 4)));
  await b.close();
  const cols = 4; execSync(`montage ${frames.join(' ')} -tile ${cols}x -geometry 480x270+4+4 -background '#222' ${out}`);
  console.log('wrote', out);
})();
