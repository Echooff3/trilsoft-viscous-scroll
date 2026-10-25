/* Trilsoft viscous scroll prototype
 * The real DOM page scrolls normally underneath. A WebGL2 canvas on top shows a
 * snapshot of that page, split into vertical strips. Each strip is a damped spring
 * (same Hooke's-law step as Echooff3/wobbly-windows: a = -k*(x-target) - d*v) that
 * chases the real scroll position, so content lags, overshoots and oozes into place.
 * At rest every strip snaps exactly onto the scroll position and the overlay is a
 * 1:1, device-pixel-aligned copy of the DOM (which is hidden underneath while live).
 */
(() => {
  'use strict';
  const MAXC = 96;
  const DEFAULTS = { damp: 0.42, k: 0.045, cols: 32, couple: 0.18, desync: 1.0, blend: 0.84,
                     grad: 0.6, maxlag: 420, shear: 0.84, misprint: 1.0 };
  const P = Object.assign({}, DEFAULTS);
  const $ = (id) => document.getElementById(id);
  const body = document.body, page = $('page'), cv = $('fx'), statusEl = $('status');
  const setStatus = (s) => { statusEl.textContent = s; };
  const qs = new URLSearchParams(location.search);
  const calib = qs.get('calib') === '1';            // test hook: disables vignette/sepia grade for pixel diffs

  // ---------- debug panel ----------
  const fmt = (id, v) => (id === 'cols' || id === 'maxlag') ? String(Math.round(v)) : (+v).toFixed(id === 'k' ? 3 : 2);
  let enabled = true, poke = true, ready = false, peek = false;
  function setCollapsed(c) { $('panel').classList.toggle('collapsed', c); $('collapse').textContent = c ? '+' : '–'; $('collapse').setAttribute('aria-expanded', String(!c)); }
  function bindPanel() {
    // Safari restores form state on reload/back; force every control back to the real state.
    Object.keys(DEFAULTS).forEach((id) => {
      const el = $(id), out = el.nextElementSibling;
      el.value = P[id]; out.textContent = fmt(id, P[id]);
      el.addEventListener('input', () => {
        P[id] = parseFloat(el.value); out.textContent = fmt(id, P[id]);
        if (id === 'cols') resetSprings();
      });
    });
    $('on').checked = true; $('poke').checked = true; $('peek').checked = false;
    $('reset').onclick = () => { Object.assign(P, DEFAULTS); Object.keys(DEFAULTS).forEach((id) => { $(id).value = P[id]; $(id).nextElementSibling.textContent = fmt(id, P[id]); }); resetSprings(); };
    $('resnap').onclick = () => snapshot();
    $('collapse').onclick = () => setCollapsed(!$('panel').classList.contains('collapsed'));
    $('on').onchange = () => { enabled = $('on').checked; updateLive(); };
    $('peek').onchange = () => { peek = $('peek').checked; updateLive(); };
    $('poke').onchange = () => { poke = $('poke').checked; };
  }
  bindPanel();
  setCollapsed(window.matchMedia('(max-width: 700px), (pointer: coarse)').matches);

  // ---------- capability / fallback ----------
  const force = qs.get('force') === '1';
  const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const gl = cv.getContext('webgl2', { antialias: false, alpha: false, premultipliedAlpha: false, preserveDrawingBuffer: false });
  if (!gl) { setStatus('WebGL2 unavailable → plain DOM fallback'); return; }
  if (reduced && !force) { enabled = false; $('on').checked = false; setStatus('prefers-reduced-motion → effect off (toggle to force)'); }
  let zoomed = false, lost = false;
  // fx-live: overlay shown AND the DOM made invisible underneath (it still scrolls, links and screen readers still work).
  // peek: overlay at 35% over the visible DOM, for comparing the two.
  function updateLive() {
    const live = enabled && ready && !zoomed && !lost;
    body.classList.toggle('fx-live', live);
    body.classList.toggle('peek', live && peek);
  }
  cv.addEventListener('webglcontextlost', (e) => { e.preventDefault(); lost = true; updateLive(); setStatus('WebGL context lost → DOM'); });
  cv.addEventListener('webglcontextrestored', () => location.reload());

  // ---------- GL setup ----------
  const VS = `#version 300 es
  out vec2 vUv;
  void main(){ vec2 p = vec2(float((gl_VertexID<<1)&2), float(gl_VertexID&2));
    vUv = vec2(p.x, 1.0 - p.y);
    gl_Position = vec4(p*2.0-1.0, 0.0, 1.0); }`;
  const FS = `#version 300 es
  precision highp float; precision highp sampler2DArray;
  in vec2 vUv; out vec4 outColor;
  uniform sampler2DArray uTex;
  uniform vec2 uRes; uniform float uScroll, uPageH, uChunk, uLayers, uCols, uBlend, uGrad, uShear, uMis, uGrade;
  uniform float uOff[${MAXC}];
  const vec3 PAPER = vec3(0.082,0.067,0.055);
  float lagAt(float x, out float seam){
    float c = x / uRes.x * uCols - 0.5; float i0 = floor(c); float f = c - i0;
    int a = int(clamp(i0, 0.0, uCols-1.0)); int b = int(clamp(i0+1.0, 0.0, uCols-1.0));
    float t = mix(step(0.5, f), f*f*(3.0-2.0*f), uBlend);
    float xb = (i0 + 1.0) / uCols * uRes.x;
    seam = (1.0-uBlend) * clamp(abs(uOff[a]-uOff[b]) / 140.0, 0.0, 0.4) * exp(-abs(x - xb) / 3.0);
    return mix(uOff[a], uOff[b], t);
  }
  vec3 samplePage(float x, float y){
    if (y < 0.0 || y >= uPageH || x < 0.0 || x >= uRes.x) return PAPER;
    float layer = min(floor(y / uChunk), uLayers - 1.0);
    return texture(uTex, vec3(x / uRes.x, (y - layer*uChunk) / uChunk, layer)).rgb;
  }
  void main(){
    // gl_FragCoord is at device-pixel centres; convert to CSS px from the top-left.
    vec2 px = vUv * uRes;
    float seam, s2, s3;
    float lag = lagAt(px.x, seam);
    float yN = vUv.y;
    float factor = mix(1.0, 0.25 + 1.5*yN*yN, uGrad);   // top of screen settles first, bottom oozes most
    float L = lag * factor;
    float dl = lagAt(px.x + 30.0, s2) - lagAt(px.x - 30.0, s3);
    float sx = px.x + dl * uShear * 0.35 * sin(yN * 3.14159);
    float pageY = uScroll + px.y + L;
    vec3 col = samplePage(sx, pageY);
    // ink misprint: an offset second plate that exists ONLY while strips are moving (0 at rest).
    float mot = clamp(abs(L) / 40.0, 0.0, 1.0);
    if (mot > 0.001) {
      vec3 ghost = samplePage(sx + uMis*2.0*mot, pageY - L*0.10*uMis - uMis*2.0*mot);
      float mw = 0.6 * uMis * mot;
      col = mix(col, max(col, ghost * vec3(0.78, 0.40, 0.27)), mw);   // light ink ghosts in rust on dark ground
      col = mix(col, min(col, ghost * vec3(0.92, 0.82, 0.70)), mw * 0.8); // dark ink ghosts in sepia on paper
    }
    col *= 1.0 - seam;                                  // torn-strip edge shadow
    // print grade: vignette + slight sepia cast (static; no grain, dust, flicker or scratches)
    vec2 q = vUv - 0.5; col *= 1.0 - uGrade * 0.66 * dot(q, q);
    col = mix(col, col * vec3(1.02, 0.98, 0.92), 0.275 * uGrade);
    outColor = vec4(col, 1.0);
  }`;
  function sh(type, src) { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; }
  const prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  gl.useProgram(prog);
  const U = {}; ['uTex','uRes','uScroll','uPageH','uChunk','uLayers','uCols','uBlend','uGrad','uShear','uMis','uGrade','uOff'].forEach((n) => U[n] = gl.getUniformLocation(prog, n));
  gl.bindVertexArray(gl.createVertexArray());
  const MAXTEX = gl.getParameter(gl.MAX_TEXTURE_SIZE);
  let tex = null, snap = null; // snap: {w, h, chunkCss, layers, scale, texW, chunkPx}

  // ---------- page → texture (smoke & mirrors) ----------
  // Rendered in horizontal chunks at the full device pixel ratio (up to 3x) so the overlay is 1:1 with
  // the screen, and no single canvas goes near iOS Safari's ~16.7M-pixel canvas limit.
  const dprNow = () => Math.min(window.devicePixelRatio || 1, 3);
  let snapping = false, snapQueued = false, snapGen = 0;
  async function snapshot() {
    if (snapping) { snapQueued = true; return; }
    snapping = true; const gen = ++snapGen; setStatus('snapshotting page…');
    try {
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      await Promise.all(Array.from(page.querySelectorAll('img')).map((im) => im.complete ? 0 : new Promise((r) => { im.onload = im.onerror = r; })));
      const w = document.documentElement.clientWidth;
      const h = Math.round(page.getBoundingClientRect().height);
      const scale = Math.min(dprNow(), MAXTEX / w);
      const texW = Math.round(w * scale);
      const chunkCss = Math.max(256, Math.floor(Math.min(MAXTEX, 4096) / scale));
      const chunkPx = Math.round(chunkCss * scale);
      const layers = Math.ceil(h / chunkCss);
      // Pin every vh/svh/dvh-sized block to its measured DOM height inside the clone. html2canvas lays the page out
      // again in an iframe, and on iOS Safari viewport units inside that iframe do not match the real viewport
      // (that is what made the hero come out ~40% tall and shifted everything below it).
      const pinned = Array.from(page.querySelectorAll('[data-pin-height]'));
      const heights = pinned.map((el) => el.getBoundingClientRect().height);
      // Same for positions that depend on viewport units (e.g. the scroll hint sits above the iOS toolbar).
      const styled = Array.from(page.querySelectorAll('[data-pin-style]'));
      const styles = styled.map((el) => { const cs = getComputedStyle(el); return el.dataset.pinStyle.split(' ').map((p) => [p, cs.getPropertyValue(p)]); });
      const onclone = (doc) => {
        doc.body.classList.remove('fx-live', 'peek');
        const cp = Array.from(doc.querySelectorAll('[data-pin-height]'));
        cp.forEach((el, i) => { el.style.minHeight = '0'; el.style.height = heights[i] + 'px'; });
        Array.from(doc.querySelectorAll('[data-pin-style]')).forEach((el, i) => styles[i].forEach(([p, v]) => el.style.setProperty(p, v)));
      };
      const base = { scale, backgroundColor: '#15110e', logging: false, useCORS: true, onclone,
        windowWidth: w, windowHeight: window.innerHeight, scrollX: 0, scrollY: -window.scrollY, x: 0, width: w,
        ignoreElements: (el) => el.id === 'panel' || el.id === 'fx' };
      const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D_ARRAY, t);
      gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.RGBA8, texW, chunkPx, layers);
      const tmp = document.createElement('canvas'); tmp.width = texW; tmp.height = chunkPx;
      const tctx = tmp.getContext('2d');
      for (let L = 0; L < layers; L++) {
        const y0 = L * chunkCss, hh = Math.min(chunkCss, h - y0);
        const c = await html2canvas(page, Object.assign({}, base, { y: y0, height: hh }));
        if (gen !== snapGen) { c.width = c.height = 0; gl.deleteTexture(t); snapping = false; return; }
        tctx.fillStyle = '#15110e'; tctx.fillRect(0, 0, texW, chunkPx);
        tctx.drawImage(c, 0, 0);
        c.width = c.height = 0; // free canvas memory immediately (iOS has a tight total-canvas budget)
        gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, L, texW, chunkPx, 1, gl.RGBA, gl.UNSIGNED_BYTE, tmp);
      }
      tmp.width = tmp.height = 0;
      for (const [p, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D_ARRAY, p, v);
      if (tex) gl.deleteTexture(tex);
      tex = t;
      snap = { w, h, chunkCss, layers, scale, texW, chunkPx, dpr: dprNow() };
      ready = true; updateLive();
      setStatus(`snapshot ${texW}×${Math.round(h * scale)}px @${scale.toFixed(2)}x, ${layers} layer(s)`);
    } catch (e) { console.warn('snapshot failed', e); setStatus('snapshot failed → DOM fallback'); ready = false; updateLive(); }
    snapping = false;
    if (snapQueued) { snapQueued = false; snapshot(); }
  }

  // ---------- spring strips ----------
  const pos = new Float64Array(MAXC), vel = new Float64Array(MAXC), kv = new Float32Array(MAXC), off = new Float32Array(MAXC);
  const h1 = (i) => { const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };
  for (let i = 0; i < MAXC; i++) kv[i] = h1(i);
  function resetSprings() { const S = window.scrollY; pos.fill(S); vel.fill(0); }
  resetSprings();
  let settled = true;

  function step() {
    const S = window.scrollY, n = P.cols | 0, ml = P.maxlag;
    for (let i = 0; i < n; i++) {
      const l = pos[i > 0 ? i - 1 : i + 1 < n ? i + 1 : i], r = pos[i < n - 1 ? i + 1 : i > 0 ? i - 1 : i];
      const k = P.k * (1 + P.desync * (kv[i] - 0.5) * 1.4);
      const a = -k * (pos[i] - S) - P.damp * vel[i] + P.couple * (l + r - 2 * pos[i]);
      vel[i] += a;
    }
    let maxE = 0;
    for (let i = 0; i < n; i++) {
      pos[i] += vel[i];
      const d = pos[i] - S;
      if (d > ml) { pos[i] = S + ml; vel[i] = Math.min(vel[i], 0); }
      else if (d < -ml) { pos[i] = S - ml; vel[i] = Math.max(vel[i], 0); }
      maxE = Math.max(maxE, Math.abs(pos[i] - S), Math.abs(vel[i]) * 4);
    }
    // Snap to rest so the overlay lands exactly on the DOM (no lingering sub-pixel offsets or misprint).
    settled = maxE < 0.15;
    if (settled) { for (let i = 0; i < n; i++) { pos[i] = S; vel[i] = 0; } }
  }
  // mouse poke: dragging the cursor across the page tugs the strips under it
  let lastMY = null;
  window.addEventListener('pointermove', (e) => {
    if (!poke || e.pointerType !== 'mouse') { lastMY = null; return; }
    if (lastMY !== null) {
      const dy = e.clientY - lastMY, n = P.cols | 0, W = document.documentElement.clientWidth;
      for (let i = 0; i < n; i++) {
        const cx = (i + 0.5) / n * W, g = Math.exp(-Math.pow((cx - e.clientX) / 140, 2));
        vel[i] -= dy * 0.35 * g;
      }
    }
    lastMY = e.clientY;
  }, { passive: true });

  // ---------- resize / iOS toolbar / orientation / zoom ----------
  // iOS fires resize whenever the address bar shows or hides; that only changes the viewport HEIGHT and the
  // overlay canvas is sized to the large viewport (100lvh), so no re-snapshot is needed. Re-snapshot only when
  // the layout really changes: width (rotation), page height, or device pixel ratio.
  let lastW = document.documentElement.clientWidth, lastH = 0, lastDpr = dprNow(), rT = 0;
  function layoutChanged() {
    const w = document.documentElement.clientWidth, h = Math.round(page.getBoundingClientRect().height), d = dprNow();
    if (w === lastW && (!snap || Math.abs(h - snap.h) <= 1) && d === lastDpr) return;
    lastW = w; lastDpr = d;
    if (!snap || w !== snap.w || d !== snap.dpr) { ready = false; updateLive(); }
    clearTimeout(rT); rT = setTimeout(snapshot, 250);
  }
  window.addEventListener('resize', layoutChanged);
  window.addEventListener('orientationchange', () => setTimeout(layoutChanged, 300));
  if (window.ResizeObserver) new ResizeObserver(layoutChanged).observe(page);
  if (window.visualViewport) visualViewport.addEventListener('resize', () => {
    const z = visualViewport.scale > 1.01;            // pinch-zoomed: hand over to the real DOM
    if (z !== zoomed) { zoomed = z; updateLive(); }
  });

  // ---------- loop ----------
  let acc = 0, last = performance.now(), frames = 0, fpsT = last, fps = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    acc += Math.min(now - last, 100); last = now;
    let steps = 0; while (acc >= 1000 / 60 && steps < 6) { step(); acc -= 1000 / 60; steps++; }
    if (!(enabled && ready && snap && !zoomed && !lost)) return;
    const dpr = dprNow(), W = document.documentElement.clientWidth;
    cv.style.width = W + 'px';
    const H = cv.clientHeight || window.innerHeight;  // CSS: 100lvh, i.e. the viewport with the iOS toolbar collapsed
    const bw = Math.round(W * dpr), bh = Math.round(H * dpr);
    if (cv.width !== bw || cv.height !== bh) { cv.width = bw; cv.height = bh; }
    gl.viewport(0, 0, bw, bh);
    // Snap the scroll offset to whole device pixels so texels land exactly on screen pixels at rest.
    const S = Math.round(window.scrollY * dpr) / dpr, n = P.cols | 0;
    let maxAbs = 0;
    for (let i = 0; i < n; i++) { off[i] = settled ? 0 : pos[i] - window.scrollY; maxAbs = Math.max(maxAbs, Math.abs(off[i])); }
    gl.uniform1fv(U.uOff, off);
    gl.uniform2f(U.uRes, bw / dpr, bh / dpr); gl.uniform1f(U.uScroll, S); gl.uniform1f(U.uPageH, snap.h);
    gl.uniform1f(U.uChunk, snap.chunkCss); gl.uniform1f(U.uLayers, snap.layers); gl.uniform1f(U.uCols, n);
    gl.uniform1f(U.uBlend, P.blend); gl.uniform1f(U.uGrad, P.grad); gl.uniform1f(U.uShear, P.shear);
    gl.uniform1f(U.uMis, P.misprint); gl.uniform1f(U.uGrade, calib ? 0 : 1);
    gl.uniform1i(U.uTex, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    window.__viscous = { maxLag: maxAbs, settled, ready, snap, H, dpr };
    frames++; if (now - fpsT > 1000) { fps = frames; frames = 0; fpsT = now;
      setStatus(`${fps} fps · max lag ${maxAbs.toFixed(0)}px · tex ${snap.texW}×${Math.round(snap.h*snap.scale)} @${snap.scale.toFixed(2)}x · ${snap.layers} layers`); }
  }
  requestAnimationFrame(frame);
  if (document.readyState === 'complete') snapshot(); else window.addEventListener('load', snapshot);
})();
