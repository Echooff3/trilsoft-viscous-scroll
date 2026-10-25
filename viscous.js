/* Trilsoft viscous scroll prototype
 * The real DOM page scrolls normally underneath. A WebGL2 canvas on top shows a
 * snapshot of that page, split into vertical strips. Each strip is a damped spring
 * (same Hooke's-law step as Echooff3/wobbly-windows: a = -k*(x-target) - d*v) that
 * chases the real scroll position, so content lags, overshoots and oozes into place.
 */
(() => {
  'use strict';
  const MAXC = 96;
  const DEFAULTS = { damp: 0.16, k: 0.045, cols: 24, couple: 0.18, desync: 0.55, blend: 0.6,
                     grad: 0.6, maxlag: 420, shear: 0.3, misprint: 0.45, grain: 0.6 };
  const P = Object.assign({}, DEFAULTS);
  const $ = (id) => document.getElementById(id);
  const body = document.body, page = $('page'), cv = $('fx'), statusEl = $('status');
  const setStatus = (s) => { statusEl.textContent = s; };

  // ---------- debug panel ----------
  const fmt = (id, v) => (id === 'cols' || id === 'maxlag') ? String(Math.round(v)) : (+v).toFixed(id === 'k' ? 3 : 2);
  function bindPanel() {
    Object.keys(DEFAULTS).forEach((id) => {
      const el = $(id), out = el.nextElementSibling;
      el.value = P[id]; out.textContent = fmt(id, P[id]);
      el.addEventListener('input', () => {
        P[id] = parseFloat(el.value); out.textContent = fmt(id, P[id]);
        if (id === 'cols') resetSprings();
      });
    });
    $('reset').onclick = () => { Object.assign(P, DEFAULTS); Object.keys(DEFAULTS).forEach((id) => { $(id).value = P[id]; $(id).nextElementSibling.textContent = fmt(id, P[id]); }); resetSprings(); };
    $('resnap').onclick = () => snapshot();
    $('collapse').onclick = () => { $('panel').classList.toggle('collapsed'); $('collapse').textContent = $('panel').classList.contains('collapsed') ? '+' : '–'; };
    $('on').onchange = () => { enabled = $('on').checked; updateLive(); };
    $('peek').onchange = () => body.classList.toggle('peek', $('peek').checked);
    $('poke').onchange = () => { poke = $('poke').checked; };
  }
  let enabled = true, poke = true, ready = false;
  bindPanel();
  if (window.innerWidth < 700) $('collapse').click();

  // ---------- capability / fallback ----------
  const force = /[?&]force=1/.test(location.search);
  const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const gl = cv.getContext('webgl2', { antialias: false, alpha: false, premultipliedAlpha: false, preserveDrawingBuffer: false });
  if (!gl) { setStatus('WebGL2 unavailable → plain DOM fallback'); return; }
  if (reduced && !force) { enabled = false; $('on').checked = false; setStatus('prefers-reduced-motion → effect off (toggle to force)'); }
  function updateLive() { body.classList.toggle('fx-live', enabled && ready); }

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
  uniform vec2 uRes; uniform float uScroll, uPageH, uChunk, uLayers, uCols, uBlend, uGrad, uShear, uMis, uGrain, uTime;
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
    if (y < 0.0 || y > uPageH || x < 0.0 || x > uRes.x) return PAPER;
    float layer = min(floor(y / uChunk), uLayers - 1.0);
    return texture(uTex, vec3(x / uRes.x, (y - layer*uChunk) / uChunk, layer)).rgb;
  }
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  void main(){
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
    // ink misprint: an offset second plate. Light ink ghosts in rust on dark ground, dark ink ghosts in sepia on paper.
    vec3 ghost = samplePage(sx + uMis*2.0, pageY - L*0.10*uMis - uMis*2.0);
    float mw = 0.6 * uMis * clamp(abs(L)/40.0 + 0.15, 0.0, 1.0);
    vec3 rustG = ghost * vec3(0.78, 0.40, 0.27);
    vec3 sepG = ghost * vec3(0.92, 0.82, 0.70);
    col = mix(col, max(col, rustG), mw);
    col = mix(col, min(col, sepG), mw * 0.8);
    col *= 1.0 - seam;                                  // torn-strip edge shadow
    // weathered print: grain, dust, scratches, flicker, heavy vignette
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    float g = hash(floor(px) + fract(uTime*7.0)*91.0) - 0.5;
    col += g * (0.05 + 0.06 * (1.0 - lum)) * uGrain;
    float dust = step(0.9993, hash(floor(px / 2.0) + floor(uTime*10.0)*13.7));
    col = mix(col, vec3(0.84, 0.8, 0.72), dust * 0.5 * uGrain);
    float fr = floor(uTime*8.0);
    if (hash(vec2(fr, 3.0)) > 0.55) { float lx = hash(vec2(fr, 9.0)) * uRes.x;
      float sl = exp(-abs(px.x - lx) * 1.2) * smoothstep(0.0, 0.3, hash(vec2(floor(px.y/40.0), fr)));
      col = mix(col, vec3(0.8, 0.76, 0.68), sl * 0.22 * uGrain); }
    if (hash(vec2(fr, 5.0)) > 0.75) { float lx2 = hash(vec2(fr, 11.0)) * uRes.x; col *= 1.0 - 0.25 * uGrain * exp(-abs(px.x - lx2)); }
    col *= 1.0 + (hash(vec2(fr, 1.0)) - 0.5) * 0.035 * uGrain;
    vec2 q = vUv - 0.5; col *= 1.0 - uGrain * 0.75 * dot(q, q) * 1.6;
    col = mix(col, col * vec3(1.02, 0.98, 0.92), 0.5 * uGrain);   // sepia cast
    outColor = vec4(col, 1.0);
  }`;
  function sh(type, src) { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; }
  const prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  gl.useProgram(prog);
  const U = {}; ['uTex','uRes','uScroll','uPageH','uChunk','uLayers','uCols','uBlend','uGrad','uShear','uMis','uGrain','uTime','uOff'].forEach((n) => U[n] = gl.getUniformLocation(prog, n));
  gl.bindVertexArray(gl.createVertexArray());
  const MAXTEX = gl.getParameter(gl.MAX_TEXTURE_SIZE);
  let tex = null, snap = null; // snap: {w, h, chunkCss, layers, scale}

  // ---------- page → texture (smoke & mirrors) ----------
  let snapping = false, snapQueued = false;
  async function snapshot() {
    if (snapping) { snapQueued = true; return; }
    snapping = true; setStatus('snapshotting page…');
    try {
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      const w = document.documentElement.clientWidth, h = page.scrollHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      // keep canvas area under ~16M px (iOS limit) and height under browser canvas limit
      const scale = Math.max(0.5, Math.min(dpr, Math.sqrt(16e6 / (w * h)), 30000 / h, MAXTEX / w));
      const c = await html2canvas(page, { scale, backgroundColor: '#15110e', logging: false, useCORS: true,
        windowWidth: w, windowHeight: window.innerHeight, scrollX: 0, scrollY: -window.scrollY,
        ignoreElements: (el) => el.id === 'panel' || el.id === 'fx' });
      const chunkPx = Math.min(MAXTEX, 4096), layers = Math.ceil(c.height / chunkPx);
      if (tex) gl.deleteTexture(tex);
      tex = gl.createTexture(); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex);
      gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.RGBA8, c.width, chunkPx, layers);
      const tmp = document.createElement('canvas'); tmp.width = c.width; tmp.height = chunkPx;
      const tctx = tmp.getContext('2d');
      for (let L = 0; L < layers; L++) {
        tctx.fillStyle = '#15110e'; tctx.fillRect(0, 0, tmp.width, chunkPx);
        tctx.drawImage(c, 0, L * chunkPx, c.width, chunkPx, 0, 0, c.width, chunkPx);
        gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, L, c.width, chunkPx, 1, gl.RGBA, gl.UNSIGNED_BYTE, tmp);
      }
      for (const [p, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D_ARRAY, p, v);
      snap = { w, h, chunkCss: chunkPx / scale, layers, scale };
      ready = true; updateLive();
      setStatus(`snapshot ${c.width}×${c.height}px @${scale.toFixed(2)}x, ${layers} layer(s)`);
    } catch (e) { console.warn('snapshot failed', e); setStatus('snapshot failed → DOM fallback'); ready = false; updateLive(); }
    snapping = false;
    if (snapQueued) { snapQueued = false; snapshot(); }
  }

  // ---------- spring strips ----------
  const pos = new Float32Array(MAXC), vel = new Float32Array(MAXC), kv = new Float32Array(MAXC), off = new Float32Array(MAXC);
  const h1 = (i) => { const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };
  for (let i = 0; i < MAXC; i++) kv[i] = h1(i);
  function resetSprings() { const S = window.scrollY; pos.fill(S); vel.fill(0); }
  resetSprings();

  function step() {
    const S = window.scrollY, n = P.cols | 0, ml = P.maxlag;
    for (let i = 0; i < n; i++) {
      const l = pos[i > 0 ? i - 1 : i + 1 < n ? i + 1 : i], r = pos[i < n - 1 ? i + 1 : i > 0 ? i - 1 : i];
      const k = P.k * (1 + P.desync * (kv[i] - 0.5) * 1.4);
      const a = -k * (pos[i] - S) - P.damp * vel[i] + P.couple * (l + r - 2 * pos[i]);
      vel[i] += a;
    }
    for (let i = 0; i < n; i++) {
      pos[i] += vel[i];
      const d = pos[i] - S;
      if (d > ml) { pos[i] = S + ml; vel[i] = Math.min(vel[i], 0); }
      else if (d < -ml) { pos[i] = S - ml; vel[i] = Math.max(vel[i], 0); }
    }
  }
  // mouse poke: dragging the cursor across the page tugs the strips under it
  let lastMY = null;
  window.addEventListener('pointermove', (e) => {
    if (!poke || e.pointerType === 'touch') { lastMY = null; return; }
    if (lastMY !== null) {
      const dy = e.clientY - lastMY, n = P.cols | 0, W = document.documentElement.clientWidth;
      for (let i = 0; i < n; i++) {
        const cx = (i + 0.5) / n * W, g = Math.exp(-Math.pow((cx - e.clientX) / 140, 2));
        vel[i] -= dy * 0.35 * g;
      }
    }
    lastMY = e.clientY;
  }, { passive: true });

  // ---------- resize ----------
  let rT = 0;
  window.addEventListener('resize', () => { ready = false; updateLive(); clearTimeout(rT); rT = setTimeout(snapshot, 250); });

  // ---------- loop ----------
  let acc = 0, last = performance.now(), frames = 0, fpsT = last, fps = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    acc += Math.min(now - last, 100); last = now;
    let steps = 0; while (acc >= 1000 / 60 && steps < 6) { step(); acc -= 1000 / 60; steps++; }
    if (!(enabled && ready && snap)) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2), W = document.documentElement.clientWidth, H = window.innerHeight;
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
    const bw = Math.round(W * dpr), bh = Math.round(H * dpr);
    if (cv.width !== bw || cv.height !== bh) { cv.width = bw; cv.height = bh; }
    gl.viewport(0, 0, bw, bh);
    const S = window.scrollY, n = P.cols | 0;
    let maxAbs = 0;
    for (let i = 0; i < n; i++) { off[i] = pos[i] - S; maxAbs = Math.max(maxAbs, Math.abs(off[i])); }
    gl.uniform1fv(U.uOff, off);
    gl.uniform2f(U.uRes, W, H); gl.uniform1f(U.uScroll, S); gl.uniform1f(U.uPageH, snap.h);
    gl.uniform1f(U.uChunk, snap.chunkCss); gl.uniform1f(U.uLayers, snap.layers); gl.uniform1f(U.uCols, n);
    gl.uniform1f(U.uBlend, P.blend); gl.uniform1f(U.uGrad, P.grad); gl.uniform1f(U.uShear, P.shear);
    gl.uniform1f(U.uMis, P.misprint); gl.uniform1f(U.uGrain, P.grain); gl.uniform1f(U.uTime, now / 1000);
    gl.uniform1i(U.uTex, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    window.__viscous = { maxLag: maxAbs, ready, snap };
    frames++; if (now - fpsT > 1000) { fps = frames; frames = 0; fpsT = now;
      if (snap) setStatus(`${fps} fps · max lag ${maxAbs.toFixed(0)}px · tex ${Math.round(snap.w*snap.scale)}×${Math.round(snap.h*snap.scale)} @${snap.scale.toFixed(2)}x`); }
  }
  requestAnimationFrame(frame);
  if (document.readyState === 'complete') snapshot(); else window.addEventListener('load', snapshot);
})();
