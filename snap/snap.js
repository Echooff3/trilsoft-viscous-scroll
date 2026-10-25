/* Trilsoft 'Snap' demo: full-screen sections moved by a hand-rolled spring (same Hooke's-law step as
 * Echooff3/wobbly-windows: a = -k*(x - target) - damping*v). Fast through the middle, extra friction near the
 * end, a controlled overshoot, a wobble or two, then an exact snap. Plain DOM: no WebGL, no snapshots. */
(() => {
  'use strict';
  const DEFAULTS = { k: 0.035, damp: 0.37, friction: 0.30, fstart: 0.32, overshoot: 2.35, stagger: 9 };   // John's iPhone tuning
  const P = Object.assign({}, DEFAULTS);
  const $ = (s, el = document) => el.querySelector(s), $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const deck = $('#deck'), sections = $$('.scene', deck), N = sections.length, dots = $$('#dots button');
  const qs = new URLSearchParams(location.search);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches && qs.get('force') !== '1';
  const dpr = () => window.devicePixelRatio || 1;

  // ---------- state ----------
  let p = 0, v = 0, target = 0, start = 0, crossed = true, settled = true, dragging = false, landed = true, jiggled = true;
  let H = deck.clientHeight;
  const trace = [];
  let pauseWhen = null, paused = false;

  // per-element springs: stagger-in (y offset + scale) and land jiggle (rotation + y)
  const kids = sections.map((s) => $$('[data-stagger]', s).map((el, i) => ({ el, i, y: 0, vy: 0, delay: 0, active: false })));
  const jigs = sections.map((s) => $$('[data-jiggle]', s).map((el) => ({ el, r: 0, vr: 0, y: 0, vy: 0, active: false, rotOnly: el.hasAttribute('data-stagger') })));
  const layers = sections.map((s) => $$('[data-depth]', s).map((el) => ({ el, d: parseFloat(el.dataset.depth) })));
  const stages = sections.map((s) => $('.stage', s));

  function indexFromHash() { const id = location.hash.slice(1); const i = sections.findIndex((s) => s.id === id); return i < 0 ? 0 : i; }

  // arrival speed of a plain one-screen move with the current settings; longer jumps are capped to it (+15%)
  // so the bounce looks the same whether you travel 1 screen or 5
  const CAP_FALLBACK = 0.03;
  let capKey = '', capVal = CAP_FALLBACK;
  function crossCap() {
    const key = P.k + '|' + P.damp + '|' + P.friction + '|' + P.fstart; if (key === capKey) return capVal;
    let x = -1, vv = 0, val = CAP_FALLBACK;
    for (let n = 0; n < 900; n++) { const prog = 1 - Math.abs(x); let e = 0; if (prog > P.fstart) { const s = Math.min(1, (prog - P.fstart) / Math.max(1e-6, 1 - P.fstart)); e = P.friction * s * s * (3 - 2 * s); }
      const vn = vv + (-P.k * x - (P.damp + e) * vv), xn = x + vn; if (xn >= 0) { val = Math.max(0.004, vn * 1.15); break; } x = xn; vv = vn; }
    // overdamped settings never cross on their own; then only a carried swipe can cross, and it gets the fallback cap
    capKey = key; capVal = val; return capVal;
  }

  function go(i, opts = {}) {
    i = Math.max(0, Math.min(N - 1, i));
    if (i === target && !opts.force && !dragging) return;
    const dir = Math.sign(i - p) || 1;
    target = i; start = p; crossed = false; settled = false; landed = false; jiggled = false;
    if (reduced) { p = target; v = 0; finish(); return; }
    // stagger-in springs for the arriving section
    kids[i].forEach((c) => { c.y = 70 * dir; c.vy = 0; c.delay = c.i * P.stagger; c.active = true; c.el.style.opacity = '0'; });
    updateDots();
  }
  const next = () => go(target + 1), prev = () => go(target - 1);

  function kickJiggle(i, strength) {
    if (reduced) return;
    jigs[i].forEach((j, n) => { const s = (n % 2 ? 1 : -1) * (0.6 + 0.8 * ((n * 37) % 10) / 10); j.vr += s * strength * 2.2; j.vy += -strength * 3; j.active = true; });
  }

  function finish() {
    p = target; v = 0; settled = true; crossed = true;
    kids.forEach((arr) => arr.forEach((c) => { c.y = 0; c.vy = 0; c.active = false; c.el.style.translate = ''; c.el.style.scale = ''; c.el.style.opacity = ''; }));
    jigs.forEach((arr) => arr.forEach((j) => { j.r = j.vr = j.y = j.vy = 0; j.active = false; j.el.style.rotate = ''; j.el.style.translate = ''; }));
    render();
    const id = sections[target].id;
    if (location.hash.slice(1) !== id) history.replaceState(null, '', '#' + id);
    updateDots();
  }

  // ---------- physics (fixed 60 Hz steps) ----------
  function step() {
    if (!dragging && !settled) {
      const x = p - target, dist = Math.max(0.05, Math.abs(target - start));
      const prog = 1 - Math.abs(x) / dist;
      let extra = 0;
      if (!crossed && prog > P.fstart) { const s = Math.min(1, (prog - P.fstart) / Math.max(1e-6, 1 - P.fstart)); extra = P.friction * s * s * (3 - 2 * s); }
      const vn = v + (-P.k * x - (P.damp + extra) * v);
      const pn = p + vn;
      let vv = vn;
      if (!crossed && (pn - target) * (p - target) <= 0) {          // arrival: controlled overshoot + jiggle the cut-outs
        crossed = true; jiggled = true; vv = Math.sign(vn) * Math.min(Math.abs(vn), crossCap()) * P.overshoot; /* same bounce whether we came 1 screen or 5 */ kickJiggle(target, Math.max(0.6, Math.min(1, Math.abs(vn) * 8)));
      }
      p = pn; v = vv;
      if (!landed && Math.abs(p - target) < 0.03) { landed = true; if (!jiggled) kickJiggle(target, 0.6); }
      // rest: within a quarter pixel and nearly still, crossed or not (overdamped settings glide in without crossing)
      if (Math.abs(p - target) * H < 0.25 && Math.abs(v) * H < 0.25) {
        const busy = kids[target].some((c) => c.active) || jigs[target].some((j) => j.active);
        if (!busy) { finish(); return; }
        p = target; v = 0;
      }
    }
    // child springs
    kids.forEach((arr) => arr.forEach((c) => {
      if (!c.active) return;
      if (c.delay > 0) { c.delay--; return; }
      c.vy += -0.14 * c.y - 0.2 * c.vy; c.y += c.vy;
      if (Math.abs(c.y) < 0.15 && Math.abs(c.vy) < 0.15) { c.y = 0; c.vy = 0; c.active = false; c.el.style.translate = ''; c.el.style.scale = ''; c.el.style.opacity = ''; }
    }));
    jigs.forEach((arr) => arr.forEach((j) => {
      if (!j.active) return;
      j.vr += -0.16 * j.r - 0.12 * j.vr; j.r += j.vr; j.vy += -0.16 * j.y - 0.14 * j.vy; j.y += j.vy;
      if (Math.abs(j.r) < 0.03 && Math.abs(j.vr) < 0.03 && Math.abs(j.y) < 0.1 && Math.abs(j.vy) < 0.1) { j.r = j.vr = j.y = j.vy = 0; j.active = false; j.el.style.rotate = ''; j.el.style.translate = ''; }
    }));
    if (settled && !dragging) return;
    // if everything inside the target finished while the deck was already parked, finish cleanly
    if (!dragging && p === target && v === 0 && !kids[target].some((c) => c.active) && !jigs[target].some((j) => j.active)) finish();
  }

  // ---------- render ----------
  function render() {
    const y = Math.round(p * H * dpr()) / dpr();
    deck.style.transform = `translate3d(0, ${-y}px, 0)`;
    const moving = !settled || dragging;
    sections.forEach((s, i) => {
      const rel = p - i;                    // 0 when this scene is parked
      layers[i].forEach((l) => { l.el.style.translate = moving && Math.abs(rel) < 1.5 ? `0 ${Math.round(rel * H * l.d * 0.35 * dpr()) / dpr()}px` : ''; });
      // squash & stretch on the arriving scene while it wobbles
      const st = stages[i];
      if (st) {
        if (moving && i === target && !reduced) {
          const sv = Math.max(-0.05, Math.min(0.05, v * 0.9));
          st.style.transformOrigin = v > 0 ? '50% 0%' : '50% 100%';
          st.style.scale = `${1 - Math.abs(sv) * 0.35} ${1 + Math.abs(sv)}`;
        } else st.style.scale = '';
      }
    });
    kids.forEach((arr) => arr.forEach((c) => {
      if (!c.active) return;
      if (c.delay > 0) { c.el.style.opacity = '0'; return; }
      c.el.style.opacity = String(Math.max(0, Math.min(1, 1 - Math.abs(c.y) / 70 + 0.15)));
      c.el.style.translate = `0 ${c.y.toFixed(2)}px`; c.el.style.scale = String(1 - Math.min(0.08, Math.abs(c.y) / 900));
    }));
    jigs.forEach((arr) => arr.forEach((j) => { if (!j.active) return; j.el.style.rotate = `${j.r.toFixed(2)}deg`; if (!j.rotOnly) j.el.style.translate = `0 ${j.y.toFixed(2)}px`; }));
  }

  // ---------- loop ----------
  let acc = 0, last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    acc += Math.min(now - last, 100); last = now;
    if (paused) { acc = 0; return; }
    let n = 0; while (acc >= 1000 / 60 && n < 6) { step(); acc -= 1000 / 60; n++; }
    if (!settled || dragging || kids.some((a) => a.some((c) => c.active)) || jigs.some((a) => a.some((j) => j.active))) {
      render();
      trace.push({ t: Math.round(now), p: +p.toFixed(5), target }); if (trace.length > 900) trace.shift();
      if (pauseWhen && pauseWhen(api.state)) { paused = true; pauseWhen = null; }
    }
  }

  // ---------- input: wheel / trackpad (one flick = one section, inertia-aware) ----------
  let wAcc = 0, wLock = false, wLast = 0, wPeak = 0, wDip = Infinity, wPrev = 0;
  window.addEventListener('wheel', (e) => {
    if (e.target.closest('#tune')) return;
    e.preventDefault();
    const d = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? H : 1), now = performance.now(), a = Math.abs(d);
    const gap = now - wLast; wLast = now;
    // a real pause ends any inertia tail, unless the deltas are still decaying (a tail on a busy main thread)
    if (gap > 800 || (gap > 220 && !(wLock && a < wPrev))) { wLock = false; wAcc = 0; wPeak = 0; wDip = Infinity; }
    wPrev = a;
    if (wLock) {
      // inertia tails decay monotonically; a fresh flick makes |delta| jump back up after a dip
      wDip = Math.min(wDip, a);
      if (a > 30 && a > wDip * 2.2 && a > wPeak * 0.6) { wLock = false; wAcc = 0; wPeak = 0; wDip = Infinity; }
      else { wPeak = Math.max(wPeak, a); return; }
    }
    wAcc += d; wPeak = Math.max(wPeak, a);
    if (Math.abs(wAcc) >= 35) { wAcc > 0 ? next() : prev(); wLock = true; wAcc = 0; wDip = Infinity; }
  }, { passive: false });

  // ---------- input: touch (drag-follow + rubber band) ----------
  let tY0 = 0, tP0 = 0, samples = [];
  const band = (x) => { const lo = 0, hi = N - 1; if (x < lo) { const o = lo - x; return lo - o * 0.45 / (1 + o * 1.6); } if (x > hi) { const o = x - hi; return hi + o * 0.45 / (1 + o * 1.6); } return x; };
  window.addEventListener('touchstart', (e) => {
    if (e.target.closest('#tune, #dots, .looks') || e.touches.length > 1) return;
    dragging = true; tY0 = e.touches[0].clientY; tP0 = p; v = 0; samples = [[performance.now(), tY0]];
  }, { passive: true });
  window.addEventListener('touchmove', (e) => {
    if (!dragging) return;
    e.preventDefault();
    const y = e.touches[0].clientY; samples.push([performance.now(), y]); if (samples.length > 6) samples.shift();
    let np = tP0 - (y - tY0) / H;
    np = Math.max(tP0 - 1, Math.min(tP0 + 1, np));             // one screen at a time
    p = band(np); render();
  }, { passive: false });
  window.addEventListener('touchend', () => {
    if (!dragging) return; dragging = false;
    const [t0, y0] = samples[0], [t1, y1] = samples[samples.length - 1];
    const vel = (y1 - y0) / Math.max(1, t1 - t0);               // px/ms, positive = finger moving down
    const moved = p - tP0;
    let t = Math.round(tP0);
    if (vel < -0.35 || moved > 0.18) t = Math.round(tP0) + 1; else if (vel > 0.35 || moved < -0.18) t = Math.round(tP0) - 1;
    v = Math.max(-0.12, Math.min(0.12, -vel * (1000 / 60) / H));  // carry the finger's speed into the spring
    go(t, { force: true });
  });
  window.addEventListener('touchcancel', () => { if (dragging) { dragging = false; go(Math.round(p), { force: true }); } });

  // ---------- input: keyboard, dots, hash, focus ----------
  window.addEventListener('keydown', (e) => {
    if (e.target.closest('#tune input')) return;
    const k = e.key;
    if (k === 'ArrowDown' || k === 'PageDown' || (k === ' ' && !e.shiftKey)) { e.preventDefault(); next(); }
    else if (k === 'ArrowUp' || k === 'PageUp' || (k === ' ' && e.shiftKey)) { e.preventDefault(); prev(); }
    else if (k === 'Home') { e.preventDefault(); go(0); }
    else if (k === 'End') { e.preventDefault(); go(N - 1); }
  });
  dots.forEach((b, i) => b.addEventListener('click', () => go(i)));
  function updateDots() { dots.forEach((b, i) => { if (i === target) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current'); }); }
  window.addEventListener('hashchange', () => go(indexFromHash()));
  deck.addEventListener('focusin', (e) => { const s = e.target.closest('.scene'); if (s) go(sections.indexOf(s)); });
  document.getElementById('viewport').addEventListener('scroll', (e) => { e.target.scrollTop = 0; e.target.scrollLeft = 0; });
  // lay content out against the *visible* height (Safari's toolbars cover part of 100lvh); sections stay 100lvh
  function setVis() {
    const vv = window.visualViewport; let h = window.innerHeight;
    if (vv && vv.scale < 1.01) h = Math.min(h, vv.height);
    document.documentElement.style.setProperty('--vis', Math.round(h) + 'px');
  }
  setVis();
  window.addEventListener('resize', () => { setVis(); H = deck.clientHeight; render(); });
  if (window.visualViewport) window.visualViewport.addEventListener('resize', setVis);

  // ---------- tuning panel ----------
  const fmt = (id, x) => id === 'fstart' ? Math.round(x * 100) + '%' : id === 'stagger' ? String(Math.round(x)) : (+x).toFixed(id === 'k' ? 3 : 2);
  function bindPanel() {
    Object.keys(DEFAULTS).forEach((id) => {
      const el = document.getElementById('t-' + id), out = el.nextElementSibling;
      el.value = P[id]; out.textContent = fmt(id, P[id]);
      el.addEventListener('input', () => { P[id] = parseFloat(el.value); out.textContent = fmt(id, P[id]); });
    });
    $('#t-defaults').onclick = () => { Object.assign(P, DEFAULTS); Object.keys(DEFAULTS).forEach((id) => { const el = document.getElementById('t-' + id); el.value = P[id]; el.nextElementSibling.textContent = fmt(id, P[id]); }); };
    $('#t-copy').onclick = async () => {
      const txt = `Snap settings: stiffness ${P.k.toFixed(3)}, damping ${P.damp.toFixed(2)}, end friction ${P.friction.toFixed(2)}, friction starts at ${Math.round(P.fstart * 100)}%, overshoot ${P.overshoot.toFixed(2)}, stagger ${Math.round(P.stagger)}`;
      try { await navigator.clipboard.writeText(txt); $('#t-msg').textContent = 'copied ✓'; }
      catch { const ta = $('#t-text'); ta.value = txt; ta.hidden = false; ta.select(); $('#t-msg').textContent = 'select & copy'; }
      setTimeout(() => { $('#t-msg').textContent = ''; }, 2500);
    };
    $('#t-replay').onclick = () => go(target === N - 1 ? 0 : target + 1);
    $('#t-toggle').onclick = () => { const t = $('#tune'); t.classList.toggle('collapsed'); $('#t-toggle').setAttribute('aria-expanded', String(!t.classList.contains('collapsed'))); };
  }
  bindPanel();

  // ---------- start ----------
  const api = {
    get state() { return { p, v, target, settled, crossed, dragging, H, overshootPx: crossed ? (p - target) * H : 0 }; },
    go, trace, defaults: DEFAULTS, params: P,
    pauseWhen(fn) { pauseWhen = fn; }, resume() { paused = false; },
  };
  window.__snap = api;
  target = indexFromHash(); p = target; finish();
  setTimeout(() => kickJiggle(target, 0.7), 350);
  if (reduced) document.documentElement.classList.add('reduced');
  requestAnimationFrame(frame);
})();
