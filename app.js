/* Bamboo Counter - count poles from a photo of the load's cut ends.
   Everything runs in the browser: no upload, no network, works offline. */

'use strict';

// ---------------------------------------------------------------- elements
const $ = id => document.getElementById(id);
const cv = $('cv'), ctx = cv.getContext('2d');
const els = {
  empty: $('empty'), hud: $('hud'), bar: $('bar'), n: $('n'), target: $('target'),
  hint: $('hint'), busy: $('busy'), busytext: $('busytext'), toast: $('toast'),
  sheet: $('sheet'), expectval: $('expectval'),
};

// ---------------------------------------------------------------- state
let img = null;                 // ImageBitmap
let pts = [];                   // {x,y,r} in image pixels
let unsure = [];                // offered by detect, not counted until tapped
let detected = null;            // what detect found, before any correction
let undoStack = [];
let view = { s: 1, tx: 0, ty: 0 };
let expected = null;
let dpr = Math.min(devicePixelRatio || 1, 2.5);

const clone = a => a.map(p => ({ x: p.x, y: p.y, r: p.r }));
const push = () => {
  undoStack.push({ pts: clone(pts), unsure: clone(unsure) });
  if (undoStack.length > 60) undoStack.shift();
};
const median = (a, f) => { const v = a.map(f).sort((x, y) => x - y); return v[v.length >> 1]; };
const medianR = a => median(a, p => p.r);
const buzz = ms => { if (navigator.vibrate) navigator.vibrate(ms); };

// ---------------------------------------------------------------- ordering
/* Only a freshly detected batch is ordered here: top-to-bottom in bands,
   left-to-right inside a band, so the numbers travel across the photo the way
   somebody's eye does. Band height follows the typical end so it adapts to how
   far away the load was shot from. Ends the user taps are never re-sorted; they
   keep the order they were tapped in. */
function renumber() {
  if (!pts.length) return;
  const band = Math.max(medianR(pts) * 1.55, 8);
  pts.sort((a, b) => (Math.floor(a.y / band) - Math.floor(b.y / band)) || (a.x - b.x));
}
const typicalR = () => pts.length ? medianR(pts)
  : (img ? Math.max(8, Math.min(img.width, img.height) * 0.028) : 20);

// ---------------------------------------------------------------- view
function fit() {
  if (!img) return;
  const w = cv.clientWidth, h = cv.clientHeight;
  view.s = Math.min(w / img.width, h / img.height) * 0.96;
  view.tx = (w - img.width * view.s) / 2;
  view.ty = (h - img.height * view.s) / 2;
  draw();
}
const toImg = (px, py) => ({ x: (px - view.tx) / view.s, y: (py - view.ty) / view.s });

function resize() {
  const w = cv.clientWidth, h = cv.clientHeight;
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  draw();
}
addEventListener('resize', () => { resize(); });

// ---------------------------------------------------------------- drawing
function draw() {
  const w = cv.clientWidth, h = cv.clientHeight;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  if (!img) return;

  ctx.save();
  ctx.translate(view.tx, view.ty);
  ctx.scale(view.s, view.s);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0);
  ctx.restore();

  const lw = Math.max(1.4, 2.2 * Math.min(view.s * 2, 1.6));
  ctx.lineWidth = lw;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const all = pts.concat(unsure);
  for (let i = 0; i < all.length; i++) {
    const p = all[i], sure = i < pts.length, label = sure ? i + 1 : '?';
    const x = p.x * view.s + view.tx, y = p.y * view.s + view.ty, r = p.r * view.s;
    if (x < -r - 40 || y < -r - 40 || x > w + r + 40 || y > h + r + 40) continue;

    ctx.beginPath();
    ctx.arc(x, y, Math.max(r * 0.92, 5), 0, 6.2832);
    ctx.strokeStyle = sure ? 'rgba(255,60,60,.95)' : 'rgba(70,160,255,.95)';
    ctx.stroke();

    const fs = Math.max(9, Math.min(r * 0.85, 30));
    ctx.font = `700 ${fs}px -apple-system,system-ui,sans-serif`;
    ctx.lineWidth = Math.max(2, fs * 0.28);
    ctx.strokeStyle = 'rgba(0,0,0,.85)';
    ctx.strokeText(label, x, y);
    ctx.fillStyle = sure ? '#ffd21e' : '#8fd0ff';
    ctx.fillText(label, x, y);
    ctx.lineWidth = lw;
  }
  updateCount();
}

function updateCount() {
  els.n.textContent = pts.length;
  if (expected == null) { els.target.textContent = ''; els.target.className = ''; return; }
  const d = pts.length - expected;
  els.target.textContent = d === 0 ? `of ${expected} ✓`
    : `of ${expected} (${d > 0 ? '+' : ''}${d})`;
  els.target.className = d === 0 ? 'exact' : (d > 0 ? 'over' : 'under');
}

/* Anything that fails on a phone is invisible to whoever wrote it, so failures
   have to put themselves on screen in a form that can be read out or
   screenshotted. Silent catch blocks are how the last two attempts at this bug
   got diagnosed wrong. */
function showError(where, e) {
  const bits = [where];
  if (e) {
    bits.push(String((e && e.message) || e));
    if (e.name) bits.push('(' + e.name + ')');
  }
  bits.push('— ' + navigator.userAgent);
  const el = $('errtext');
  el.textContent = bits.join('\n');
  $('errbar').hidden = false;
}
addEventListener('error', e => showError('JS error: ' + (e.filename || '') + ':' + (e.lineno || ''), e.error || e.message));
addEventListener('unhandledrejection', e => showError('Unhandled promise rejection', e.reason));

let stageTimer = null, stageT0 = 0;
function stage(text) {
  stageT0 = performance.now();
  $('busystage').textContent = text;
  clearInterval(stageTimer);
  stageTimer = setInterval(() => {
    const s = ((performance.now() - stageT0) / 1000).toFixed(1);
    $('busystage').textContent = text + '  ' + s + 's';
  }, 200);
}

let hintTimer;
function hint(t) {
  els.hint.textContent = t; els.hint.classList.add('show');
  clearTimeout(hintTimer); hintTimer = setTimeout(() => els.hint.classList.remove('show'), 2600);
}
let toastTimer;
function toast(t) {
  els.toast.textContent = t; els.toast.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => els.toast.hidden = true, 2400);
}
function busy(on, text) {
  els.busytext.textContent = text || 'Working…';
  els.busy.hidden = !on;
  if (!on) { clearInterval(stageTimer); $('busystage').textContent = ''; }
}

// ---------------------------------------------------------------- gestures
const pointers = new Map();
let gesture = null;

cv.addEventListener('pointerdown', e => {
  if (!img) return;
  cv.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 1) {
    gesture = { kind: 'maybe-tap', x0: e.clientX, y0: e.clientY, t0: performance.now(),
                tx: view.tx, ty: view.ty, moved: 0 };
  } else if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    gesture = {
      kind: 'pinch',
      d0: Math.hypot(a.x - b.x, a.y - b.y),
      mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2,
      s0: view.s, tx: view.tx, ty: view.ty,
    };
  }
});

cv.addEventListener('pointermove', e => {
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (!gesture) return;

  if (gesture.kind === 'pinch' && pointers.size >= 2) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    const k = Math.max(0.06, Math.min(14, (d / gesture.d0)));
    const ns = gesture.s0 * k;
    const r = cv.getBoundingClientRect();
    const mx = gesture.mx - r.left, my = gesture.my - r.top;
    view.s = ns;
    view.tx = mx - (mx - gesture.tx) * (ns / gesture.s0);
    view.ty = my - (my - gesture.ty) * (ns / gesture.s0);
    draw();
    return;
  }

  const dx = e.clientX - gesture.x0, dy = e.clientY - gesture.y0;
  gesture.moved = Math.max(gesture.moved, Math.hypot(dx, dy));
  if (gesture.kind === 'maybe-tap' && gesture.moved > 9) gesture.kind = 'pan';
  if (gesture.kind === 'pan') {
    view.tx = gesture.tx + dx; view.ty = gesture.ty + dy;
    draw();
  }
});

function endPointer(e) {
  if (!pointers.has(e.pointerId)) return;
  const wasTap = gesture && gesture.kind === 'maybe-tap' &&
                 gesture.moved <= 9 && performance.now() - gesture.t0 < 600;
  pointers.delete(e.pointerId);
  if (wasTap && pointers.size === 0) {
    const r = cv.getBoundingClientRect();
    tap(e.clientX - r.left, e.clientY - r.top);
  }
  if (pointers.size === 0) gesture = null;
  else if (pointers.size === 1) {
    const [p] = [...pointers.values()];
    gesture = { kind: 'pan', x0: p.x, y0: p.y, t0: performance.now(),
                tx: view.tx, ty: view.ty, moved: 99 };
  }
}
cv.addEventListener('pointerup', endPointer);
cv.addEventListener('pointercancel', endPointer);

cv.addEventListener('wheel', e => {
  if (!img) return;
  e.preventDefault();
  const r = cv.getBoundingClientRect();
  const mx = e.clientX - r.left, my = e.clientY - r.top;
  const k = Math.exp(-e.deltaY * 0.0016);
  const ns = Math.max(0.02, Math.min(40, view.s * k));
  view.tx = mx - (mx - view.tx) * (ns / view.s);
  view.ty = my - (my - view.ty) * (ns / view.s);
  view.s = ns;
  draw();
}, { passive: false });

function nearest(list, p) {
  let hit = -1, best = 1e9;
  for (let i = 0; i < list.length; i++) {
    const d = Math.hypot(list[i].x - p.x, list[i].y - p.y);
    const tol = Math.max(list[i].r, 14 / view.s);
    if (d < tol && d < best) { best = d; hit = i; }
  }
  return hit;
}

/* A tap on an existing marker removes it, a tap on an unsure ring counts it,
   a tap on bare photo adds one. That is the whole editing model - it matches
   how you would tick ends off with a finger, and undo covers the misfires. */
function tap(px, py) {
  const p = toImg(px, py);
  const hit = nearest(pts, p), maybe = hit < 0 ? nearest(unsure, p) : -1;
  push();
  if (hit >= 0) { pts.splice(hit, 1); buzz(12); }
  else if (maybe >= 0) { pts.push(...unsure.splice(maybe, 1)); buzz(8); }
  else { pts.push({ x: p.x, y: p.y, r: typicalR() }); buzz(8); }
  draw(); persist();
}

// ---------------------------------------------------------------- detector
/* Gradient-vote circle finder.

   Every edge pixel points at the centre of whatever curve it sits on, so each
   one votes along its own gradient line at every plausible radius. Real cut
   ends collect votes from all the way round their rim and stand out as sharp
   peaks; noise scatters.

   Radius is then measured per peak rather than voted on, which keeps the
   accumulator two-dimensional and fast enough to run on a phone.

   The last step is the one that matters most in a yard photo: a candidate is
   only kept if its rim is bare timber. Sky, render, concrete, shadow and truck
   paint all produce round-ish edges, and colour is what separates them. */
function detectEnds(bitmap) {
  const MAXD = 1200;
  const sc = Math.min(1, MAXD / Math.max(bitmap.width, bitmap.height));
  const W = Math.max(1, Math.round(bitmap.width * sc));
  const H = Math.max(1, Math.round(bitmap.height * sc));

  const oc = document.createElement('canvas');
  oc.width = W; oc.height = H;
  const octx = oc.getContext('2d', { willReadFrequently: true });
  octx.drawImage(bitmap, 0, 0, W, H);
  const rgba = octx.getImageData(0, 0, W, H).data;

  // grayscale + light blur
  const g0 = new Float32Array(W * H);
  for (let i = 0, p = 0; i < g0.length; i++, p += 4)
    g0[i] = lum(rgba[p], rgba[p + 1], rgba[p + 2]);
  const g = blur3(blur3(g0, W, H), W, H);

  // sobel
  const gx = new Float32Array(W * H), gy = new Float32Array(W * H);
  const mag = new Float32Array(W * H);
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      const a = g[i - W - 1], b = g[i - W], c = g[i - W + 1];
      const d = g[i - 1], f = g[i + 1];
      const h = g[i + W - 1], k = g[i + W], l = g[i + W + 1];
      const sx = (c + 2 * f + l) - (a + 2 * d + h);
      const sy = (h + 2 * k + l) - (a + 2 * b + c);
      gx[i] = sx; gy[i] = sy; mag[i] = Math.hypot(sx, sy);
    }
  }

  // keep the strongest edges
  let mx = 0;
  for (let i = 0; i < mag.length; i++) if (mag[i] > mx) mx = mag[i];
  const hist = new Int32Array(256);
  for (let i = 0; i < mag.length; i++) hist[Math.min(255, (mag[i] / mx * 255) | 0)]++;
  let want = Math.floor(mag.length * 0.13), acc0 = 0, cut = 255;
  for (let b = 255; b >= 0; b--) { acc0 += hist[b]; if (acc0 >= want) { cut = b; break; } }
  const edgeThresh = (cut / 255) * mx;

  const short = Math.min(W, H);
  const rmin = Math.max(5, short * 0.013), rmax = Math.max(rmin + 4, short * 0.075);

  // vote
  const acc = new Float32Array(W * H);
  for (let y = 2; y < H - 2; y++) {
    for (let x = 2; x < W - 2; x++) {
      const i = y * W + x;
      const m = mag[i];
      if (m < edgeThresh) continue;
      const ux = gx[i] / m, uy = gy[i] / m;
      for (let r = rmin; r <= rmax; r += 1) {
        let cx = (x - ux * r) | 0, cy = (y - uy * r) | 0;
        if (cx > 0 && cy > 0 && cx < W && cy < H) acc[cy * W + cx] += 1;
        cx = (x + ux * r) | 0; cy = (y + uy * r) | 0;
        if (cx > 0 && cy > 0 && cx < W && cy < H) acc[cy * W + cx] += 1;
      }
    }
  }
  const sacc = blur3(acc, W, H);

  // peaks
  let amax = 0;
  for (let i = 0; i < sacc.length; i++) if (sacc[i] > amax) amax = sacc[i];
  const floor = amax * 0.20;
  const cand = [];
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x, v = sacc[i];
      if (v < floor) continue;
      if (v < sacc[i - 1] || v < sacc[i + 1] || v < sacc[i - W] || v < sacc[i + W]) continue;
      cand.push([v, x, y]);
    }
  }
  cand.sort((a, b) => b[0] - a[0]);

  const sep = rmin * 1.25;
  const peaks = [];
  for (const [v, x, y] of cand) {
    if (peaks.length >= 700) break;
    let ok = true;
    for (const q of peaks) {
      if ((q[0] - x) ** 2 + (q[1] - y) ** 2 < sep * sep) { ok = false; break; }
    }
    if (ok) peaks.push([x, y]);
  }

  // radius per peak: the ring whose gradients point most radially
  const NA = 56, cos = new Float32Array(NA), sin = new Float32Array(NA);
  for (let a = 0; a < NA; a++) {
    cos[a] = Math.cos(a * 6.2832 / NA); sin[a] = Math.sin(a * 6.2832 / NA);
  }
  /* Score a candidate ring two ways. Mean radial gradient says how strong the
     rim is; coverage says how far round it actually goes. The second is what
     separates a real end from a chance alignment - an end is supported at every
     angle, a coincidence only on one side. */
  function ringScore(px, py, r) {
    let sum = 0;
    const v = new Float32Array(NA);
    for (let a = 0; a < NA; a++) {
      const x = (px + cos[a] * r) | 0, y = (py + sin[a] * r) | 0;
      if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) continue;
      const i = y * W + x;
      const q = Math.abs(gx[i] * cos[a] + gy[i] * sin[a]);
      v[a] = q; sum += q;
    }
    const mean = sum / NA;
    let cov = 0;
    if (mean > 0) for (let a = 0; a < NA; a++) if (v[a] >= mean * COV_GRAD_F) cov++;
    return { score: mean, cov: cov / NA };
  }

  /* Fit a nominated centre: the radius whose ring is best supported, then a
     nudge onto the best-fitting spot. The vote map peaks a pixel or two off
     when rims are soft, and that offset drags the measured radius with it - so
     the nudge pays for itself twice, in what gets found and in markers landing
     where the eye says they should. */
  function fitRing(px, py, lo = rmin, hi = rmax) {
    let bestR = 0, bestS = 0, bestC = 0;
    for (let pass = 0; pass < 2; pass++) {
      bestR = 0; bestS = 0; bestC = 0;
      for (let r = lo; r <= hi; r += 1) {
        const q = ringScore(px, py, r);
        if (q.score > bestS) { bestS = q.score; bestR = r; bestC = q.cov; }
      }
      if (!bestR) return null;
      let bx = px, by = py, bs = bestS;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          if (!dx && !dy) continue;
          const q = ringScore(px + dx, py + dy, bestR);
          if (q.score > bs) { bs = q.score; bx = px + dx; by = py + dy; }
        }
      }
      if (bx === px && by === py) break;
      px = bx; py = by;
    }
    const rim = rimAndBore(rgba, W, H, px, py, bestR);
    return { x: px, y: py, r: bestR, score: bestS, cov: bestC, wood: rim.wood, dark: rim.dark };
  }

  /* Three ways in. Colour is the primary test, but it fails on rims in shadow -
     the top of a backlit stack, where saturation collapses; nearly every end
     missed on the second test load was up there. A ring supported the whole
     way round is strong enough evidence by itself, so those pass on a much
     weaker colour showing. And an end angled away from the camera shows no
     bright rim at all, only a dark bore with timber round it, so a clearly
     dark bore lets a weak colour showing through as well. */
  const accept = c => c.wood >= RIM_MIN_FRAC
    || (c.cov >= COV_MIN && c.wood >= RIM_MIN_FRAC * 0.4)
    || (c.dark >= BORE_DARK_MIN && c.wood >= RIM_MIN_FRAC * 0.5);

  const ends = [], rest = [];
  for (const [x, y] of peaks) {
    const c = fitRing(x, y);
    if (c) (accept(c) ? ends : rest).push(c);
  }

  /* Ends in one load share a size; stickers, lettering and a bystander's head
     do not. Judged against the accepted ends once there are enough of them to
     have a typical size at all. */
  const rm = ends.length >= 5 ? medianR(ends) : 0;
  const sized = c => !rm || (c.r > rm * 0.5 && c.r < rm * 1.8);
  const clash = (c, list) =>
    list.some(k => (c.x - k.x) ** 2 + (c.y - k.y) ** 2 < (0.55 * (c.r + k.r)) ** 2);

  // suppress overlaps, strongest first. Kept mild on purpose: ends really do
  // sit rim to rim, and an aggressive rule deletes the one hemmed in on every
  // side, which is exactly the miss nobody spots afterwards.
  const keep = [];
  for (const c of ends.sort((a, b) => b.score - a.score)) {
    if (sized(c) && !clash(c, keep)) keep.push(c);
  }

  /* Packing prior. Ends sit roughly hexagonally, so the spot where a third end
     would touch two kept neighbours is worth a look even though the vote map
     never nominated it - hemmed in on every side, its rim votes drown in its
     neighbours'. Only spots nominated from two different pairs (three or more
     neighbours) are tried, the radius search is held near the neighbours'
     size, and the evidence bar is the fully supported one plus a rim at least
     a fraction as strong as the ends already kept - coverage is relative to
     the ring's own mean, and at an empty gap noise alone can fill it - so
     nothing gets in on geometry alone. */
  const dim = keep.length ? median(keep, c => c.score) * 0.15 : 0;
  const spots = [];
  for (let i = 0; i < keep.length; i++) {
    for (let j = i + 1; j < keep.length; j++) {
      const a = keep[i], b = keep[j], s = a.r + b.r;
      const dx = b.x - a.x, dy = b.y - a.y;
      if (dx * dx + dy * dy > (s * 1.5) ** 2) continue;   // fit may sit on the bore edge, so allow up to ~3r
      for (const g of [1, -1]) {
        spots.push({ x: (a.x + b.x) / 2 - g * dy * 0.866, y: (a.y + b.y) / 2 + g * dx * 0.866, r: s / 2 });
      }
    }
  }
  spots.forEach((n, i) => {
    if (clash(n, keep)) return;
    if (!spots.some((m, j) => j !== i && (m.x - n.x) ** 2 + (m.y - n.y) ** 2 < (n.r * 0.4) ** 2)) return;
    const c = fitRing(n.x | 0, n.y | 0, n.r * 0.75, n.r * 1.25);
    if (c && c.score >= dim && c.cov >= COV_MIN && accept(c) && sized(c) && !clash(c, keep)) keep.push(c);
  });

  /* What did not make it, best-supported first, for the docket check to offer
     as unsure when the count falls short. Same size and spacing rules. */
  const maybe = [];
  for (const c of rest.sort((a, b) => (b.cov + b.wood) - (a.cov + a.wood))) {
    if (sized(c) && !clash(c, keep) && !clash(c, maybe)) maybe.push(c);
  }
  const toImage = c => ({ x: c.x / sc, y: c.y / sc, r: c.r / sc });
  return { ends: keep.map(toImage), unsure: maybe.map(toImage) };
}

function blur3(src, W, H) {
  const t = new Float32Array(W * H), o = new Float32Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 1; x < W - 1; x++)
      t[y * W + x] = (src[y * W + x - 1] + src[y * W + x] + src[y * W + x + 1]) / 3;
  for (let y = 1; y < H - 1; y++)
    for (let x = 0; x < W; x++)
      o[y * W + x] = (t[(y - 1) * W + x] + t[y * W + x] + t[(y + 1) * W + x]) / 3;
  return o;
}

/* Acceptance thresholds. Tuned against two hand-counted loads of 100 by
   measuring recall and precision, not by eye — see README. */
const RIM_MIN_FRAC = 0.38;   // ring must read this woody to pass on colour alone
const COV_MIN = 0.68;        // ...or be supported this far round to pass without
const COV_GRAD_F = 0.55;     // gradient counted as "supported", vs the ring mean
const BORE_DARK_MIN = 0.45;  // bore this much darker than its rim reads as a hole

const lum = (R, G, B) => 0.299 * R + 0.587 * G + 0.114 * B;

/* Colour and depth of a candidate. wood: fraction of the rim that is bare
   timber - saturation does the real work, since sun-bleached roofing and cream
   render sit in bamboo's hue band but are far paler; it reads the rim and not
   the bore, so shadowed ends still qualify. dark: how much darker the bore is
   than the rim, which an end angled away from the camera still shows when its
   rim catches no light. A culm cut through a node is a solid disc, so dark is
   never required, only allowed to help. */
function rimAndBore(rgba, W, H, cx, cy, r) {
  const N = 48; let hit = 0, seen = 0, rim = 0, bore = 0, nb = 0;
  for (let a = 0; a < N; a++) {
    const th = a * 6.2832 / N;
    for (const k of [0.35, 0.86, 0.98]) {
      const x = (cx + Math.cos(th) * r * k) | 0, y = (cy + Math.sin(th) * r * k) | 0;
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const p = (y * W + x) * 4, L = lum(rgba[p], rgba[p + 1], rgba[p + 2]);
      if (k < 0.5) { bore += L; nb++; continue; }
      seen++; rim += L;
      if (isWood(rgba[p], rgba[p + 1], rgba[p + 2])) hit++;
    }
  }
  return { wood: seen ? hit / seen : 0, dark: nb && rim > 0 ? 1 - (bore / nb) / (rim / seen) : 0 };
}

function isWood(R, G, B) {
  const r = R / 255, g = G / 255, b = B / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (mx < 0.16) return false;             // too dark to judge
  const s = mx === 0 ? 0 : d / mx;
  if (s < 0.24) return false;              // pale render, concrete, sky
  if (d === 0) return false;
  let h;
  if (mx === r) h = 60 * (((g - b) / d) % 6);
  else if (mx === g) h = 60 * ((b - r) / d + 2);
  else h = 60 * ((r - g) / d + 4);
  if (h < 0) h += 360;
  return h >= 8 && h <= 62;                // tan / straw / brown
}

// ---------------------------------------------------------------- decoding
/* Nothing on the photo-opening path may block indefinitely. A spinner that
   never clears is indistinguishable from a crash, and the user has no way out
   of it, so every step here is either time-boxed or fire-and-forget. */
const MAX_SIDE = 2800;

function withTimeout(p, ms, what) {
  return Promise.race([
    p,
    new Promise((_, rej) => setTimeout(() => rej(new Error((what || 'step') + ' timed out')), ms)),
  ]);
}

function decodeViaElement(file) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => { URL.revokeObjectURL(url); res(im); };
    im.onerror = () => { URL.revokeObjectURL(url); rej(new Error('browser could not decode this image')); };
    im.src = url;
  });
}

/* Redraw at a sane size. Phone cameras produce 12MP files and Safari will drop
   a canvas that gets too large, which fails as a blank screen rather than an
   error. Working at 2800px is still far more resolution than counting needs. */
function normalise(src) {
  const w = src.naturalWidth || src.width, h = src.naturalHeight || src.height;
  if (!w || !h) throw new Error('image has no dimensions');
  const k = Math.min(1, MAX_SIDE / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * k));
  c.height = Math.max(1, Math.round(h * k));
  c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
  if (src.close) { try { src.close(); } catch {} }
  return c;
}

/* Each decode route is tried in turn and each is time-boxed, because on Safari
   an unsupported option can leave the promise pending rather than reject. The
   budgets are short: three routes at 6s is a worst case somebody will sit
   through, three at 20s is not. */
async function decode(file) {
  let bmp = null, why = [];
  if (typeof createImageBitmap === 'function') {
    stage('decode: createImageBitmap+orientation');
    try {
      bmp = await withTimeout(
        createImageBitmap(file, { imageOrientation: 'from-image' }), 6000, 'bitmap+orientation');
    } catch (e) { why.push('bitmap+orient: ' + ((e && e.message) || e)); }
    if (!bmp) {
      stage('decode: createImageBitmap');
      try { bmp = await withTimeout(createImageBitmap(file), 6000, 'bitmap'); }
      catch (e) { why.push('bitmap: ' + ((e && e.message) || e)); }
    }
  } else {
    why.push('createImageBitmap unavailable');
  }
  if (!bmp) {
    stage('decode: img element');
    try { bmp = await withTimeout(decodeViaElement(file), 8000, 'img element'); }
    catch (e) {
      why.push('img: ' + ((e && e.message) || e));
      throw new Error(why.join(' | '));
    }
  }
  stage('resizing');
  return normalise(bmp);
}

// ---------------------------------------------------------------- actions
let loadSeq = 0;
async function loadFile(file) {
  const mine = ++loadSeq;
  if (!file) { showError('The picker returned no file.', null); return; }
  busy(true, 'Opening photo…');
  stage(`${file.name || 'photo'} · ${file.type || 'unknown type'} · ${Math.round((file.size || 0) / 1024)} KB`);
  try {
    const c = await decode(file);
    if (mine !== loadSeq) return;          // a newer pick superseded this one
    img = c;
    pts = []; unsure = []; detected = null; undoStack = [];
    els.empty.hidden = true; els.hud.hidden = false; els.bar.hidden = false;
    resize(); fit();
    persist();
    hint('Tap an end to add it. Tap a number to remove it.');
    storeImage(file);   // deliberately not awaited: storage must never gate the UI
  } catch (err) {
    showError('Could not open that photo.\nfile: ' + (file.name || '?') + ' · ' +
              (file.type || 'no type') + ' · ' + (file.size || 0) + ' bytes', err);
  } finally {
    if (mine === loadSeq) busy(false);
  }
}

/* Clear the input when the picker is opened, never after it returns. On iOS,
   resetting value while the File is still being read can revoke access to the
   underlying asset, and the read then stalls instead of failing. */
function onPick(e) {
  loadFile(e.target.files && e.target.files[0]);
}
for (const id of ['file', 'file2']) {
  const el = $(id);
  el.addEventListener('click', () => { el.value = ''; });
  el.addEventListener('change', onPick);
}

$('busycancel').addEventListener('click', () => { loadSeq++; busy(false); });
$('errclose').addEventListener('click', () => { $('errbar').hidden = true; });

$('detect').addEventListener('click', async () => {
  if (!img) return;
  busy(true, 'Finding ends…');
  await new Promise(r => setTimeout(r, 30));   // let the spinner paint
  try {
    const { ends, unsure: rest } = detectEnds(img);
    push();
    pts = ends; renumber(); detected = clone(pts);
    /* The docket count is a prior worth using: when detect falls short of it,
       show the next best candidates in blue for a tap to confirm. Never counted
       until tapped - reaching the docket by itself would defeat the check. */
    unsure = expected > ends.length ? rest.slice(0, expected - ends.length) : [];
    draw(); persist();
    hint(unsure.length
      ? `Found ${ends.length} of ${expected}. Blue rings are unsure — tap one to count it.`
      : `Found ${ends.length}. Now check the edges and any tight gaps.`);
  } catch (err) {
    toast('Detection failed — tap the ends instead. (' + ((err && err.message) || err) + ')');
  } finally {
    busy(false);
  }
});

$('undo').addEventListener('click', () => {
  if (!undoStack.length) { toast('Nothing to undo'); return; }
  ({ pts, unsure } = undoStack.pop());
  draw(); persist();
});

$('fit').addEventListener('click', fit);

$('expect').addEventListener('click', () => {
  els.expectval.value = expected == null ? '' : expected;
  els.sheet.hidden = false;
  setTimeout(() => els.expectval.focus(), 50);
});
$('sheetok').addEventListener('click', () => {
  const v = parseInt(els.expectval.value, 10);
  expected = Number.isFinite(v) && v > 0 ? v : null;
  els.sheet.hidden = true; updateCount(); persist();
});
$('sheetclear').addEventListener('click', () => {
  expected = null; els.expectval.value = '';
  els.sheet.hidden = true; updateCount(); persist();
});
els.sheet.addEventListener('click', e => { if (e.target === els.sheet) els.sheet.hidden = true; });

$('save').addEventListener('click', async () => {
  if (!img) return;
  busy(true, 'Building image…');
  try {
    const blob = await exportImage();
    logCount();
    busy(false);
    const file = new File([blob], `bamboo-${pts.length}.jpg`, { type: 'image/jpeg' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: `${pts.length} bamboo` });
    } else {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = file.name; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 20000);
      toast('Saved. If it opened in a tab, long-press to save.');
    }
  } catch (err) {
    busy(false);
    if (err && err.name !== 'AbortError') toast('Could not save the image.');
  }
});

function exportImage() {
  const k = img.width < 1800 ? 2 : 1;
  const c = document.createElement('canvas');
  c.width = img.width * k; c.height = img.height * k;
  const x = c.getContext('2d');
  x.drawImage(img, 0, 0, c.width, c.height);
  x.textAlign = 'center'; x.textBaseline = 'middle';

  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], px = p.x * k, py = p.y * k, r = p.r * k;
    x.beginPath();
    x.arc(px, py, Math.max(r * 0.92, 6), 0, 6.2832);
    x.lineWidth = Math.max(2, r * 0.07);
    x.strokeStyle = 'rgba(255,45,45,.97)';
    x.stroke();
    const fs = Math.max(11, r * 0.82);
    x.font = `700 ${fs}px -apple-system,system-ui,sans-serif`;
    x.lineWidth = Math.max(3, fs * 0.3);
    x.strokeStyle = 'rgba(0,0,0,.9)';
    x.strokeText(i + 1, px, py);
    x.fillStyle = '#ffd21e';
    x.fillText(i + 1, px, py);
  }

  const label = expected == null ? `TOTAL: ${pts.length}`
    : `TOTAL: ${pts.length} of ${expected}`;
  const fs = Math.max(22, c.width * 0.028);
  x.font = `700 ${fs}px -apple-system,system-ui,sans-serif`;
  x.textAlign = 'left'; x.textBaseline = 'top';
  const pad = fs * 0.45, w = x.measureText(label).width;
  x.fillStyle = 'rgba(0,0,0,.85)';
  x.fillRect(pad, pad, w + pad * 2, fs + pad * 1.6);
  x.strokeStyle = '#ffd21e'; x.lineWidth = Math.max(2, fs * 0.06);
  x.strokeRect(pad, pad, w + pad * 2, fs + pad * 1.6);
  x.fillStyle = '#ffd21e';
  x.fillText(label, pad * 2, pad * 1.7);

  return new Promise(res => c.toBlob(res, 'image/jpeg', 0.93));
}

// ---------------------------------------------------------------- persistence
/* A half-finished count is real work. Keep the photo and the markers so a
   backgrounded tab or a dropped connection does not throw it away. */
const DB = 'bamboo-counter';
function idb() {
  return new Promise((res, rej) => {
    if (!self.indexedDB) return rej(new Error('no indexedDB'));
    const q = indexedDB.open(DB, 1);
    q.onupgradeneeded = () => q.result.createObjectStore('kv');
    q.onsuccess = () => res(q.result);
    q.onerror = () => rej(q.error || new Error('open failed'));
    q.onblocked = () => rej(new Error('open blocked'));
  });
}
/* Time-boxed, and failure is always survivable. Safari suspends IndexedDB in
   private browsing and under storage pressure - transactions there can simply
   never fire an event, so waiting on one is waiting forever. Losing the saved
   photo costs a re-pick; hanging costs the whole count. */
function kvRaw(mode, fn) {
  return idb().then(db => new Promise((res, rej) => {
    const tx = db.transaction('kv', mode);
    const r = fn(tx.objectStore('kv'));
    tx.oncomplete = () => res(r && r.result);
    tx.onerror = () => rej(tx.error || new Error('tx failed'));
    tx.onabort = () => rej(tx.error || new Error('tx aborted'));
  }));
}
async function kv(mode, fn, ms) {
  try { return await withTimeout(kvRaw(mode, fn), ms || 4000, 'storage'); }
  catch { return null; }
}
function storeImage(blob) {
  kv('readwrite', s => s.put(blob, 'photo'), 8000);   // fire and forget
}
function persist() {
  try {
    localStorage.setItem('bc-state', JSON.stringify({ pts, unsure, detected, expected }));
  } catch {}
}
/* Every corrected count is a labelled photo, and labelled photos are what the
   detector is short of. Keep what detect found next to what the count ended as
   (image pixels), for the self-test page to hand back. */
function logCount() {
  try {
    const log = JSON.parse(localStorage.getItem('bc-log') || '[]');
    log.push({ t: new Date().toISOString(), w: img.width, h: img.height, expected, detected, final: pts });
    localStorage.setItem('bc-log', JSON.stringify(log.slice(-40)));
  } catch {}
}
async function restore() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem('bc-state') || 'null'); } catch {}
  let blob = null;
  try { blob = await kv('readonly', s => s.get('photo')); } catch {}
  if (!blob) return;
  if (img) return;                 // a fresh pick already won the race
  try {
    img = await decode(blob);
    const arr = k => (saved && Array.isArray(saved[k])) ? saved[k] : null;
    pts = arr('pts') || []; unsure = arr('unsure') || []; detected = arr('detected');
    expected = saved ? (saved.expected ?? null) : null;
    els.empty.hidden = true; els.hud.hidden = false; els.bar.hidden = false;
    resize(); fit();
    if (pts.length) hint(`Picked up where you left off — ${pts.length} marked.`);
  } catch {}
}

// ---------------------------------------------------------------- boot
/* An escape hatch worth having on a device you cannot debug: ?reset=1 throws
   away the service worker, caches and saved photo, then reloads clean. */
async function hardReset() {
  try {
    if (navigator.serviceWorker) {
      for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
    }
    if (self.caches) for (const k of await caches.keys()) await caches.delete(k);
    localStorage.removeItem('bc-state');
    if (self.indexedDB) indexedDB.deleteDatabase(DB);
  } catch {}
  location.replace(location.pathname);
}

resize();
if (/[?&]reset/.test(location.search)) {
  hardReset();
} else {
  restore().catch(e => showError('Restoring the previous count failed.', e));
  if ('serviceWorker' in navigator) {
    addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
}
