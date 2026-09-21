/* SPDX-License-Identifier: MPL-2.0; Copyright (C) 2026 Jonathan Challinger; source: https://github.com/jschall/boardgame-engine
   This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at https://mozilla.org/MPL/2.0/. */
/* A paper leaf has a front and a back. Turning it reveals the next spread. A click or a swipe turns the page; nothing else is on the
   reader (owner, 2026-09-18: "get rid of the controls and text on the rulebook modal. it should just be click or swipe to turn the page").
   A turning leaf bends: it is drawn as STRIPS hinged one on the next, the outer strips leading, so the page curls as a hand would lift it,
   each strip shaded by the way it faces, and it throws a soft shadow on the table under it instead of the flat leaf's own drop shadow. */
(function () {
  'use strict';
  const byId = id => document.getElementById(id);
  const book = byId('book'), reader = byId('manual-reader'), stage = byId('manual-stage');
  const pages = [...book.children], count = window.__manualPageCount, expected = window.__manualPagesExpected;
  if (expected === 0) { window.__manual = { page: 0, turning: false, progress: 0, single: false, bootstrap: true }; return; }   /* a bootstrap build: no book yet */
  if (!Number.isInteger(expected) || expected < 4 || expected % 4) throw Error('game.json manual.pages must be a multiple of four, at least four');
  if (count !== expected || pages.length !== count) throw Error(`The complete ${expected}-page manual is required (the book has ${count})`);
  pages.forEach((p, i) => p.setAttribute('aria-label', `Page ${i + 1}`));
  let leaves = [], single = false, cursor = 0, motion = null, pointer = null, frame = 0;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const STRIPS = 7, BEND = 42;   /* the bend across the leaf at the middle of a turn, degrees */
  function leafWidthMm() {
    const raw = getComputedStyle(book).getPropertyValue('--leaf-w').trim();
    const v = parseFloat(raw);
    if (!(v > 0)) throw Error('#book --leaf-w is not a length');
    if (raw.endsWith('mm')) return v;
    if (raw.endsWith('cm')) return v * 10;
    if (raw.endsWith('in')) return v * 25.4;
    if (raw.endsWith('px')) return v * 25.4 / 96;
    throw Error('#book --leaf-w must be mm, cm, in or px');
  }
  const LEAF_MM = leafWidthMm();   /* the trimmed leaf, from the manual's format */
  const last = () => single ? count - 1 : count / 2;
  const pageNumber = () => single ? cursor + 1 : Math.max(1, cursor * 2);
  function paint() {
    leaves.forEach((leaf, i) => {
      leaf.style.transform = `rotateY(${i < cursor ? -180 : 0}deg)`;
      leaf.style.zIndex = String(i < cursor ? i + 1 : leaves.length - i);
      leaf.style.visibility = (i === cursor || (!single && i === cursor - 1)) ? 'visible' : 'hidden';
    });
    pages.forEach((p, i) => {
      const visible = single ? i === cursor : i === cursor * 2 - 1 || i === cursor * 2;
      if (!visible && p.contains(document.activeElement)) reader.focus({ preventScroll:true });
      p.inert = !visible;
      p.setAttribute('aria-hidden', String(!visible));
    });
    reader.classList.remove('dragging');
    book.style.setProperty('--book-shift', single ? '0px' : `${(cursor === 0 ? -1 : cursor === last() ? 1 : 0) * stage.clientWidth / 4}px`);
    book.classList.toggle('manual-cover', !single && cursor === 0);
    book.classList.toggle('manual-last', !single && cursor === last());
    if (typeof window.__onManualPage === 'function') window.__onManualPage(pageNumber());
  }
  function fit() {
    const scale = Math.min(1, (stage.clientWidth - 16) / book.offsetWidth);
    book.style.setProperty('--book-scale', scale);
    stage.style.height = `${book.offsetHeight * scale + 64}px`;
  }
  const pageAt = c => single ? c + 1 : Math.max(1, c * 2);
  function layout(target = motion ? pageAt(motion.to) : pageNumber()) {   /* a relayout during a turn keeps the turn's destination */
    cancelAnimationFrame(frame);
    if (motion) motion.curl.remove();
    motion = pointer = null;
    single = stage.clientWidth < LEAF_MM * 4.55;   /* two leaves would not fit at a readable scale (820 px for the 180 mm square) */
    book.classList.toggle('single', single);
    pages.forEach(p => { p.classList.remove('manual-back'); book.append(p); });
    leaves.forEach(l => l.remove());
    leaves = [];
    for (let i = 0; i < count; i += single ? 1 : 2) {
      const leaf = document.createElement('div'); leaf.className = 'manual-leaf';
      leaf.append(pages[i]);
      const back = single ? document.createElement('div') : pages[i + 1];
      back.classList.add('manual-back');
      if (single) { back.classList.add('manual-verso'); back.setAttribute('aria-hidden', 'true'); }
      leaf.append(back); book.append(leaf); leaves.push(leaf);
    }
    cursor = single ? target - 1 : Math.floor(target / 2);
    fit(); paint();
  }
  /* the bent leaf: STRIPS strips, each hinged on the left edge of the one before, each carrying its slice of the front page and, turned over,
     its slice of the back page, plus the shadow the whole leaf throws on the table */
  function buildCurl(leaf) {
    const w = LEAF_MM / STRIPS, front = leaf.children[0], back = leaf.children[1];
    const clone = (el, dx) => { const c = el.cloneNode(true); c.classList.add('manual-clone'); c.setAttribute('aria-hidden', 'true'); c.inert = true; c.style.left = `${dx}mm`; c.style.visibility = 'visible'; return c; };
    const curl = document.createElement('div'); curl.className = 'manual-curl';
    const ground = document.createElement('div'); ground.className = 'manual-ground'; curl.append(ground);
    const strips = []; let parent = curl;
    for (let k = 0; k < STRIPS; k++) {
      const strip = document.createElement('div'); strip.className = 'manual-strip'; strip.style.width = `${w}mm`; strip.style.left = k ? `${w}mm` : '0';
      const ff = document.createElement('div'); ff.className = 'manual-face'; ff.append(clone(front, -k * w));
      const fb = document.createElement('div'); fb.className = 'manual-face manual-face-back'; fb.append(clone(back, -(STRIPS - 1 - k) * w));
      strip.append(ff, fb); parent.append(strip); strips.push({ strip, ff, fb }); parent = strip;
    }
    return { curl, ground, strips, w };
  }
  function pose(value) {
    const m = motion, v = m.direction > 0 ? value : 1 - value, theta = -180 * v;   /* the whole leaf's turn, 0 flat on the right, -180 flat on the left */
    const n = STRIPS - 1, room = Math.min(-theta, 180 + theta) * 2 / n;             /* neither the spine strip nor the tip may dip below the table */
    const c = Math.min(BEND / n * Math.sin(Math.PI * v), room), base = theta + n * c / 2;
    let x = 0;
    m.strips.forEach((s, k) => {
      const a = k ? -c : base, abs = base - k * c, rad = abs * Math.PI / 180;
      s.strip.style.transform = `rotateY(${a.toFixed(3)}deg)`;
      s.ff.style.setProperty('--shade', (0.55 * (1 - Math.cos(rad)) / 2).toFixed(3));
      s.fb.style.setProperty('--shade', (0.55 * (1 + Math.cos(rad)) / 2).toFixed(3));
      x += m.w * Math.cos(rad);
    });
    const g = m.ground, lift = Math.sin(-theta * Math.PI / 180);
    const span = Math.max(6, Math.abs(x));   /* keep the dark edge on the spine when the projection is thinner than the blur */
    g.style.left = `${(x < 0 ? -span : 0).toFixed(2)}mm`;
    g.style.width = `${span.toFixed(2)}mm`;
    g.style.opacity = (0.42 * Math.pow(lift, 0.7)).toFixed(3);
    g.classList.toggle('left', x < 0);
  }
  function progress(value) {
    if (!motion) return;
    motion.progress = value; pose(value);
  }
  function begin(direction) {
    if (motion || cursor + direction < 0 || cursor + direction > last()) return false;
    const i = direction > 0 ? cursor : cursor - 1, leaf = leaves[i];
    motion = Object.assign({ leaf, direction, progress:0, to: cursor + direction }, buildCurl(leaf));
    book.style.setProperty('--book-shift', '0px');
    book.classList.remove('manual-cover', 'manual-last');   /* the crease shades both sides of the binding while a leaf is in the air */
    for (const j of [cursor - 2, cursor - 1, cursor, cursor + 1]) if (leaves[j]) leaves[j].style.visibility = 'visible';
    leaf.style.visibility = 'hidden';
    motion.curl.style.zIndex = String(count + 2); book.append(motion.curl);
    progress(0);
    return true;
  }
  function settle(commit = true, destination = null) {
    if (!motion) return;
    const start = performance.now(), from = motion.progress, to = commit ? 1 : 0;
    motion.to = commit ? (destination === null ? cursor + motion.direction : destination) : cursor;
    const duration = reduced.matches ? 0 : Math.max(220, 900 * Math.abs(to - from));
    const tick = now => {
      const t = duration ? Math.min(1, (now - start) / duration) : 1;
      progress(from + (to - from) * (1 - Math.pow(1 - t, 3)));
      if (t < 1) frame = requestAnimationFrame(tick);
      else {
        if (commit) cursor = destination === null ? cursor + motion.direction : destination;
        motion.curl.remove(); motion.leaf.style.visibility = ''; motion = null; paint();
      }
    };
    frame = requestAnimationFrame(tick);
  }
  const turn = direction => { if (begin(direction)) settle(); };
  function go(n) {
    const target = single ? n - 1 : Math.floor(n / 2);
    if (target !== cursor && begin(target > cursor ? 1 : -1)) settle(true, target);
  }
  reader.addEventListener('keydown', e => {
    if (e.target.matches('select,input,textarea') || e.altKey || e.ctrlKey || e.metaKey) return;
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
      e.preventDefault();
      if (e.key === 'Home' || e.key === 'End') go(e.key === 'Home' ? 1 : count);
      else turn(e.key === 'ArrowRight' ? 1 : -1);
    }
  });
  book.addEventListener('click', e => {
    const a = e.target.closest('a[href^="#p"]');
    if (a) { e.preventDefault(); go(+a.getAttribute('href').slice(2)); }
  });
  /* a press on a page: a swipe drags the leaf, a click (no movement) turns it, the right page forward and the left page back;
     in the single-page view the right half of the page turns forward and the left half back */
  stage.addEventListener('pointerdown', e => {
    if (motion || !e.isPrimary || e.button !== 0 || e.target.closest('a')) return;
    const sheet = e.target.closest('.sheet, .manual-verso');
    if (!sheet || sheet.inert) return;
    const r = sheet.getBoundingClientRect();
    pointer = { id:e.pointerId, x:e.clientX, y:e.clientY, width:r.width, fraction:(e.clientX - r.left) / r.width, page:sheet.id ? +sheet.id.slice(1) : 0 };
    reader.focus({ preventScroll:true });
  });
  stage.addEventListener('pointermove', e => {
    if (!pointer || pointer.id !== e.pointerId) return;
    const dx = e.clientX - pointer.x, dy = e.clientY - pointer.y;
    if (!motion) {
      if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 7) { pointer = null; return; }
      if (Math.abs(dx) < 7) return;
      const direction = single ? (dx < 0 ? 1 : -1) : (pointer.page % 2 ? 1 : -1);
      if (dx * direction >= 0 || !begin(direction)) { pointer = null; return; }
      stage.setPointerCapture(e.pointerId); reader.classList.add('dragging');
    }
    e.preventDefault();
    progress(Math.max(0, Math.min(1, -dx * motion.direction / pointer.width)));
  });
  function release(e, cancel = false) {
    if (!pointer || pointer.id !== e.pointerId) return;
    const p = pointer; pointer = null;
    if (motion) settle(!cancel && motion.progress > .15);
    else if (!cancel && Math.abs(e.clientX - p.x) < 7 && Math.abs(e.clientY - p.y) < 7) turn(single ? (p.fraction < .5 ? -1 : 1) : (p.page % 2 ? 1 : -1));
    if (stage.hasPointerCapture(e.pointerId)) stage.releasePointerCapture(e.pointerId);
  }
  stage.addEventListener('pointerup', e => release(e));
  stage.addEventListener('pointercancel', e => release(e, true));
  let width = 0;
  new ResizeObserver(() => {
    if (width !== stage.clientWidth) { width = stage.clientWidth; layout(); }
  }).observe(stage);
  layout(1);
  /* ### SCAFFOLD: observable state for the page gate and animation inspection. */
  window.__manual = { get page() { return pageNumber(); }, get single() { return single; }, get turning() { return !!motion; }, get progress() { return motion ? motion.progress : 0; }, get count() { return count; }, get strips() { return motion ? motion.strips.length : 0; }, go, turn, set: n => layout(n) };
})();
