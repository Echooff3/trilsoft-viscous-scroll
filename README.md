# Trilsoft viscous scroll (prototype)

The real HTML page scrolls normally underneath. A WebGL2 canvas sits on top (`pointer-events: none`) and shows a
snapshot of the page (taken with html2canvas) split into vertical strips. Each strip is a damped spring, the same
Hooke's-law step used in [wobbly-windows](https://github.com/Echooff3/wobbly-windows):
`a = -k·(pos − scrollY) − damping·vel + coupling·(neighbors)`. The strips chase the real scroll position, so
content lags, overshoots and oozes into place. Falls back to plain DOM without WebGL2 or with
`prefers-reduced-motion` (add `?force=1` to override).

No build step: `index.html`, `style.css`, `viscous.js`, vendored `html2canvas.min.js` (MIT), `art/*.svg`.
