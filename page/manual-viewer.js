/* A paper leaf has a front and a back. Turning it reveals the next spread. */
(function () {
  'use strict';
  const byId = id => document.getElementById(id);
  const book = byId('book'), reader = byId('manual-reader'), stage = byId('manual-stage');
  const prev = byId('manual-prev'), next = byId('manual-next'), jump = byId('manual-page');
  const pages = [...book.children], count = window.__manualPageCount, expected = window.__manualPagesExpected;
  if (expected === 0) { window.__manual = { page: 0, turning: false, progress: 0, single: false, bootstrap: true }; return; }   /* a bootstrap build: no book yet */
  if (!Number.isInteger(expected) || expected < 4 || expected % 4) throw Error('game.json manual.pages must be a multiple of four, at least four');
  if (count !== expected || pages.length !== count) throw Error(`The complete ${expected}-page manual is required (the book has ${count})`);
  pages.forEach((p, i) => {
    p.setAttribute('aria-label', `Page ${i + 1}`);
    jump.add(new Option(String(i + 1), String(i + 1)));
  });
  let leaves = [], single = false, cursor = 0, motion = null, pointer = null, frame = 0;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const last = () => single ? count - 1 : count / 2;
  const pageNumber = () => single ? cursor + 1 : Math.max(1, cursor * 2);
  function paint() {
    leaves.forEach((leaf, i) => {
      leaf.style.transform = `rotateY(${i < cursor ? -180 : 0}deg)`;
      leaf.style.zIndex = String(i < cursor ? i + 1 : leaves.length - i);
      leaf.style.visibility = (i === cursor || (!single && i === cursor - 1)) ? 'visible' : 'hidden';
      leaf.classList.remove('turning');
    });
    pages.forEach((p, i) => {
      const visible = single ? i === cursor : i === cursor * 2 - 1 || i === cursor * 2;
      if (!visible && p.contains(document.activeElement)) reader.focus({ preventScroll:true });
      p.inert = !visible;
      p.setAttribute('aria-hidden', String(!visible));
    });
    const n = pageNumber(), end = single ? n : Math.min(count, cursor * 2 + 1);
    byId('manual-indicator').textContent = `${n === end ? n : n + '–' + end} / ${count}`;
    jump.value = String(n);
    prev.disabled = cursor === 0;
    next.disabled = cursor === last();
    reader.classList.remove('dragging');
    book.style.setProperty('--book-shift', single ? '0px' : `${(cursor === 0 ? -1 : cursor === last() ? 1 : 0) * stage.clientWidth / 4}px`);
  }
  function fit() {
    const scale = Math.min(1, (stage.clientWidth - 16) / book.offsetWidth);
    book.style.setProperty('--book-scale', scale);
    stage.style.height = `${book.offsetHeight * scale + 104}px`;
  }
  function layout(target = pageNumber()) {
    cancelAnimationFrame(frame);
    motion = pointer = null;
    single = stage.clientWidth < 820;
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
  function progress(value) {
    if (!motion) return;
    motion.progress = value;
    motion.leaf.style.transform = `rotateY(${-180 * (motion.direction > 0 ? value : 1 - value)}deg)`;
    motion.leaf.style.setProperty('--turn-shade', Math.sin(value * Math.PI).toFixed(3));
  }
  function begin(direction) {
    if (motion || cursor + direction < 0 || cursor + direction > last()) return false;
    const i = direction > 0 ? cursor : cursor - 1, leaf = leaves[i];
    motion = { leaf, direction, progress:0 };
    book.style.setProperty('--book-shift', '0px');
    for (const j of [cursor - 2, cursor - 1, cursor, cursor + 1]) if (leaves[j]) leaves[j].style.visibility = 'visible';
    leaf.style.visibility = 'visible'; leaf.style.zIndex = String(count + 1); leaf.classList.add('turning');
    progress(0);
    return true;
  }
  function settle(commit = true, destination = null) {
    if (!motion) return;
    const start = performance.now(), from = motion.progress, to = commit ? 1 : 0;
    const duration = reduced.matches ? 0 : Math.max(180, 780 * Math.abs(to - from));
    const tick = now => {
      const t = duration ? Math.min(1, (now - start) / duration) : 1;
      progress(from + (to - from) * (1 - Math.pow(1 - t, 3)));
      if (t < 1) frame = requestAnimationFrame(tick);
      else {
        if (commit) cursor = destination === null ? cursor + motion.direction : destination;
        motion = null; paint();
      }
    };
    frame = requestAnimationFrame(tick);
  }
  const turn = direction => { if (begin(direction)) settle(); };
  function go(n) {
    const target = single ? n - 1 : Math.floor(n / 2);
    if (target !== cursor && begin(target > cursor ? 1 : -1)) settle(true, target);
  }
  prev.addEventListener('click', () => turn(-1));
  next.addEventListener('click', () => turn(1));
  jump.addEventListener('change', () => go(+jump.value));
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
  stage.addEventListener('pointerdown', e => {
    if (motion || !e.isPrimary || e.button !== 0 || e.target.closest('a')) return;
    const sheet = e.target.closest('.sheet');
    if (!sheet || sheet.inert) return;
    const r = sheet.getBoundingClientRect();
    pointer = { id:e.pointerId, x:e.clientX, y:e.clientY, width:r.width, fraction:(e.clientX - r.left) / r.width, page:+sheet.id.slice(1) };
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
    else if (!cancel && Math.abs(e.clientX - p.x) < 7 && Math.abs(e.clientY - p.y) < 7 && (p.fraction < .18 || p.fraction > .82)) {
      turn(single ? (p.fraction < .18 ? -1 : 1) : (p.page % 2 ? 1 : -1));
    }
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
  window.__manual = { get page() { return pageNumber(); }, get single() { return single; }, get turning() { return !!motion; }, get progress() { return motion ? motion.progress : 0; }, get count() { return count; } };
})();
