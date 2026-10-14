// The world painter. Depth comes from layers:
//   sky → far mountains (soft, blurred) → hills → treeline   (pre-rendered tiles, parallax)
//   → back wall of earth just behind the lane                 (in the terrain chunks)
//   → the running lane: thick cobbled ground with a grass lip (in the terrain chunks)
//   → runners, items, effects                                 (live, render.js)
//   → foreground bushes and leaves sliding past faster        (pre-rendered sprites, parallax)
// The static track is painted once into 512-unit-wide chunk canvases and reused every frame.

import { blob, line, flat, glow, at, ellipse, circle, roundRect, poly, scallop, smooth, star, INK, darker, lighter, rgba, mix } from './paint.js';
import { rng, surfaceAt, backAt, solidsNear, floorBelow } from './track.js';
import { THEMES } from './themes.js';

const TAU = Math.PI * 2;

// ---- Backdrop ----

export function createBackdrop(theme) {
  let key = '';
  let sky = null;
  let layers = [];

  function build(w, h, scale) {
    key = `${w}x${h}x${scale}`;
    // Sky, sun and rays never move: one screen-sized image.
    sky = document.createElement('canvas');
    sky.width = w;
    sky.height = h;
    const g = sky.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, theme.sky[0]);
    grad.addColorStop(0.55, theme.sky[1]);
    grad.addColorStop(1, theme.sky[2]);
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    const sx = w * 0.78;
    const sy = h * 0.18;
    glow(g, sx, sy, h * 0.45, theme.sun, 0.55);
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.translate(sx, sy);
    for (let i = 0; i < 9; i++) {
      g.rotate(TAU / 9);
      const rg = g.createLinearGradient(0, 0, h * 0.9, 0);
      rg.addColorStop(0, rgba(theme.sun, 0.12));
      rg.addColorStop(1, rgba(theme.sun, 0));
      g.fillStyle = rg;
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(h * 0.9, -h * 0.06);
      g.lineTo(h * 0.9, h * 0.06);
      g.closePath();
      g.fill();
    }
    g.restore();
    g.fillStyle = theme.sun;
    g.beginPath();
    g.arc(sx, sy, h * 0.065, 0, TAU);
    g.fill();

    // Parallax layers, each cropped to the band it actually covers.
    const tileW = Math.ceil(1600 * scale);
    const make = (fn, top, blur = 0) => {
      const c = document.createElement('canvas');
      c.width = tileW;
      c.height = Math.ceil(h * (1 - top) + h * 0.35);
      const t = c.getContext('2d');
      if (blur && 'filter' in t) t.filter = `blur(${blur}px)`;
      t.translate(0, -h * top);
      t.scale(scale, scale);
      fn(t, tileW / scale, h / scale, theme);
      return { c, top: h * top };
    };
    layers = [
      { f: 0.04, fy: 0.02, ...make(paintClouds, 0, 0.6 * scale), clip: 0.5 },
      { f: 0.1, fy: 0.04, ...make(paintFar, 0.2, 1.6 * scale) },
      { f: 0.24, fy: 0.08, ...make(paintHills, 0.5, 1.0 * scale) },
      { f: 0.45, fy: 0.14, ...make(paintTreeline, 0.64, 0.5 * scale) },
    ];
  }

  return {
    draw(ctx, w, h, scale, camX, camY) {
      if (`${w}x${h}x${scale}` !== key) build(w, h, scale);
      ctx.drawImage(sky, 0, 0);
      for (const L of layers) {
        const tw = L.c.width;
        const ox = -(((camX * scale * L.f) % tw) + tw) % tw;
        const oy = Math.round(L.top + Math.max(-h * 0.3, Math.min(h * 0.3, -camY * scale * L.fy)));
        const vis = Math.min(L.c.height, h - oy);
        if (vis <= 0) continue;
        for (let x = Math.round(ox); x < w; x += tw) {
          const sw = Math.min(tw, w - x);
          ctx.drawImage(L.c, 0, 0, sw, vis, x, oy, sw, vis);
        }
      }
    },
  };
}

function paintClouds(g, W, H, th) {
  const R = rng(11);
  for (let i = 0; i < 8; i++) {
    const x = (i + R() * 0.6) * (W / 8);
    const y = H * (0.06 + R() * 0.3);
    const s = 0.6 + R() * 0.9;
    for (const dx of [-W, 0, W]) {
      blob(g, scallop(x + dx, y, 52 * s, 17 * s, 9, 0.55, R), th.cloud, { ow: 0, depth: 6, shade: th.cloudShade, light: false });
    }
  }
}

function wrapX(W, fn) { for (const dx of [-W, 0, W]) fn(dx); }

function paintFar(g, W, H, th) {
  const R = rng(23);
  const base = H * 0.68;
  const n = 6;
  const seg = W / n;
  for (let i = 0; i < n; i++) {
    const x = i * seg + R() * seg * 0.4;
    const top = base - H * (0.24 + R() * 0.18);
    const half = seg * (0.65 + R() * 0.35);
    wrapX(W, (dx) => {
      const px = x + dx;
      if (th.id === 'desert') {
        // Flat-topped mesas with stripes.
        g.fillStyle = th.far.base;
        g.beginPath();
        g.moveTo(px - half, base + 10);
        g.lineTo(px - half * 0.55, top + 14);
        g.lineTo(px - half * 0.45, top);
        g.lineTo(px + half * 0.45, top);
        g.lineTo(px + half * 0.55, top + 14);
        g.lineTo(px + half, base + 10);
        g.closePath();
        g.fill();
        g.fillStyle = th.far.shade;
        for (let k = 1; k < 4; k++) g.fillRect(px - half * (0.5 + k * 0.12), top + k * (base - top) * 0.22, half * (1 + k * 0.24), 5);
        g.fillStyle = th.far.cap;
        g.fillRect(px - half * 0.45, top, half * 0.9, 6);
        return;
      }
      g.fillStyle = th.far.base;
      g.beginPath();
      g.moveTo(px - half, base + 10);
      g.lineTo(px - half * 0.14, top + 8);
      g.quadraticCurveTo(px, top - 5, px + half * 0.14, top + 8);
      g.lineTo(px + half, base + 10);
      g.closePath();
      g.fill();
      g.fillStyle = th.far.shade;
      g.beginPath();
      g.moveTo(px + 2, top + 2);
      g.lineTo(px + half, base + 10);
      g.lineTo(px + half * 0.15, base + 10);
      g.closePath();
      g.fill();
      g.fillStyle = th.far.cap;
      const sh = (base - top) * (th.id === 'snow' ? 0.45 : 0.22);
      g.beginPath();
      g.moveTo(px - half * 0.14 - sh * 0.25, top + 8 + sh * 0.5);
      g.lineTo(px - half * 0.14, top + 8);
      g.quadraticCurveTo(px, top - 5, px + half * 0.14, top + 8);
      g.lineTo(px + half * 0.14 + sh * 0.3, top + 8 + sh * 0.55);
      g.lineTo(px + 5, top + sh * 0.38);
      g.lineTo(px - 7, top + sh * 0.62);
      g.closePath();
      g.fill();
    });
  }
  // Haze toward the horizon.
  const hz = g.createLinearGradient(0, base - H * 0.25, 0, base + 10);
  hz.addColorStop(0, rgba(th.haze, 0));
  hz.addColorStop(1, rgba(th.haze, 0.75));
  g.fillStyle = hz;
  g.fillRect(0, base - H * 0.25, W, H * 0.25 + 10);
  g.fillStyle = mix(th.far.base, th.haze, 0.6);
  g.fillRect(0, base + 8, W, H);
}

function ridgePts(W, base, amp, n, R) {
  const pts = [];
  const hs = [];
  for (let i = 0; i < n; i++) hs.push(amp * (0.45 + R() * 0.55));
  for (let i = 0; i <= n; i++) pts.push([(i * W) / n, base - hs[i % n]]);
  return pts;
}
function fillRidge(g, pts, bottom, color) {
  g.beginPath();
  g.moveTo(pts[0][0], bottom);
  g.lineTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) {
    const [px, py] = pts[i - 1];
    const [x, y] = pts[i];
    const m = (x - px) / 2;
    g.bezierCurveTo(px + m, py, x - m, y, x, y);
  }
  g.lineTo(pts[pts.length - 1][0], bottom);
  g.closePath();
  g.fillStyle = color;
  g.fill();
}
function ridgeY(pts, W, x) {
  const n = pts.length - 1;
  const seg = W / n;
  const k = Math.max(0, Math.min(n - 1, Math.floor(x / seg)));
  const t = (x - k * seg) / seg;
  const e = 3 * t * t - 2 * t * t * t;
  return pts[k][1] + (pts[k + 1][1] - pts[k][1]) * e;
}

function paintHills(g, W, H, th) {
  const R = rng(37);
  const base = H * 0.76;
  const pts = ridgePts(W, base, H * 0.15, 5, R);
  fillRidge(g, pts, H + 400, th.hills.base);
  // Lighter tops, darker valleys.
  const sh = g.createLinearGradient(0, base - H * 0.15, 0, base + H * 0.1);
  sh.addColorStop(0, rgba(th.hills.dark, 0));
  sh.addColorStop(1, rgba(th.hills.dark, 0.7));
  g.save();
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = sh;
  g.fillRect(0, 0, W, H);
  g.restore();
  for (let i = 0; i < 30; i++) {
    const x = R() * W;
    const y = ridgeY(pts, W, x) + 6 + R() * 34;
    const r = 7 + R() * 7;
    wrapX(W, (dx) => {
      if (th.tree === 'pine') {
        g.fillStyle = th.hills.tree;
        g.beginPath(); g.moveTo(x + dx, y - r * 2.2); g.lineTo(x + dx + r * 0.8, y); g.lineTo(x + dx - r * 0.8, y); g.closePath(); g.fill();
        g.fillStyle = '#ffffff';
        g.beginPath(); g.moveTo(x + dx, y - r * 2.2); g.lineTo(x + dx + r * 0.3, y - r * 1.4); g.lineTo(x + dx - r * 0.3, y - r * 1.4); g.closePath(); g.fill();
      } else if (th.tree === 'palm') {
        g.fillStyle = th.hills.tree;
        g.fillRect(x + dx - 1, y - r * 1.6, 2, r * 1.6);
        flat(g, ellipse(x + dx, y - r * 1.6, r * 0.9, r * 0.35), th.hills.tree);
      } else {
        g.fillStyle = darker(th.hills.tree, 0.3);
        g.fillRect(x + dx - 1.2, y, 2.4, r * 0.9);
        flat(g, circle(x + dx, y - r * 0.2, r), th.hills.tree);
        flat(g, circle(x + dx - r * 0.3, y - r * 0.5, r * 0.45), th.hills.treeLight);
      }
    });
  }
}

function paintTreeline(g, W, H, th) {
  const R = rng(51);
  const base = H * 0.86;
  const pts = ridgePts(W, base, H * 0.06, 7, R);
  fillRidge(g, pts, H + 400, th.near.base);
  for (let x = 0; x < W; x += 24 + R() * 30) {
    const y = ridgeY(pts, W, x) + 4 + R() * 10;
    const h = 46 + R() * 54;
    const kind = th.tree === 'pine' || (th.tree === 'round' && R() < 0.45) ? 'pine' : th.tree === 'palm' ? (R() < 0.5 ? 'cactus' : 'rock') : 'round';
    wrapX(W, (dx) => {
      const px = x + dx;
      if (kind === 'pine') {
        g.fillStyle = th.near.dark;
        g.beginPath(); g.moveTo(px, y - h); g.lineTo(px + h * 0.28, y); g.lineTo(px - h * 0.28, y); g.closePath(); g.fill();
        g.fillStyle = th.near.light;
        g.beginPath(); g.moveTo(px, y - h); g.lineTo(px - h * 0.28, y); g.lineTo(px - h * 0.05, y); g.closePath(); g.fill();
        if (th.id === 'snow') {
          g.fillStyle = '#ffffff';
          g.beginPath(); g.moveTo(px, y - h); g.lineTo(px + h * 0.1, y - h * 0.7); g.lineTo(px - h * 0.1, y - h * 0.7); g.closePath(); g.fill();
        }
      } else if (kind === 'cactus') {
        g.fillStyle = th.near.dark;
        g.fillRect(px - 3, y - h * 0.6, 6, h * 0.6);
        g.fillRect(px - 10, y - h * 0.42, 4, h * 0.2);
        g.fillRect(px + 6, y - h * 0.5, 4, h * 0.22);
      } else if (kind === 'rock') {
        flat(g, ellipse(px, y, h * 0.3, h * 0.18), th.near.dark);
      } else {
        flat(g, circle(px, y - h * 0.55, h * 0.36), th.near.dark);
        flat(g, circle(px - h * 0.12, y - h * 0.68, h * 0.18), th.near.light);
      }
    });
  }
}

// ---- Terrain chunks ----

const CW = 512;

export function createTerrain(T, theme) {
  const cache = new Map(); // chunk index → { c, y0, s }
  let cacheScale = 0;

  function band(ci) {
    const x0 = ci * CW;
    const x1 = x0 + CW;
    let top = Infinity;
    let bottom = -Infinity;
    for (const s of solidsNear(T, x0, x1)) {
      top = Math.min(top, s.y);
      if (s.ys) {
        const i0 = Math.max(0, Math.floor((x0 - s.x) / s.dx));
        const i1 = Math.min(s.ys.length - 1, Math.ceil((x1 - s.x) / s.dx));
        for (let i = i0; i <= i1; i++) bottom = Math.max(bottom, s.ys[i]);
      } else bottom = Math.max(bottom, s.y + s.h);
    }
    for (let x = x0; x <= x1; x += 32) top = Math.min(top, backAt(T, x));
    if (top === Infinity) top = 0;
    if (bottom === -Infinity) bottom = top + 200;
    return { y0: Math.floor(top - 240), y1: Math.ceil(Math.max(bottom, top) + 560) };
  }

  function render(ci, s) {
    const { y0, y1 } = band(ci);
    const x0 = ci * CW;
    const c = document.createElement('canvas');
    c.width = Math.ceil(CW * s) + 2;
    c.height = Math.min(4096, Math.ceil((y1 - y0) * s));
    const g = c.getContext('2d');
    g.setTransform(s, 0, 0, s, -x0 * s, -y0 * s);
    const view = { x0: x0 - 2, x1: x0 + CW + 2, y0, y1 };
    paintChunk(g, T, theme, view);
    return { c, y0, s };
  }

  return {
    // Draws the chunks covering the view. ensure: also prepare one chunk ahead.
    draw(ctx, view, scale, camX, camY, baseScale = scale) {
      // Chunks are cached at the base scale; camera zoom just stretches them.
      const s = Math.min(baseScale, 2);
      if (s !== cacheScale) { cache.clear(); cacheScale = s; }
      const c0 = Math.floor(view.x0 / CW);
      const c1 = Math.floor(view.x1 / CW);
      let made = 0;
      for (let ci = c0; ci <= c1; ci++) {
        let ch = cache.get(ci);
        if (!ch) { ch = render(ci, s); cache.set(ci, ch); made++; }
        const k = scale / s;
        const dx = Math.round((ci * CW - camX) * scale);
        const dy = Math.round((ch.y0 - camY) * scale);
        // Blit only the part of the chunk that is on screen.
        const top = Math.max(0, -dy);
        const bottom = Math.min(ch.c.height * k, ctx.canvas.height - dy);
        if (bottom <= top) continue;
        ctx.drawImage(ch.c, 0, top / k, ch.c.width, (bottom - top) / k, dx, dy + top, Math.ceil(ch.c.width * k), bottom - top);
      }
      // Warm the next chunk ahead when nothing was painted this frame.
      if (!made && !cache.has(c1 + 1)) cache.set(c1 + 1, render(c1 + 1, s));
      // Forget chunks far behind.
      for (const k of cache.keys()) if (k < c0 - 2 || k > c1 + 3) cache.delete(k);
    },
    warm(x0, x1, scale) {
      const s = Math.min(scale, 2);
      if (s !== cacheScale) { cache.clear(); cacheScale = s; }
      for (let ci = Math.floor(x0 / CW); ci <= Math.floor(x1 / CW); ci++) if (!cache.has(ci)) cache.set(ci, render(ci, s));
    },
    clear() { cache.clear(); },
  };
}

function paintChunk(g, T, th, view) {
  drawBackMeadow(g, T, th, view);
  for (const d of T.deco) if (d.kind === 'tree' && d.x > view.x0 - 140 && d.x < view.x1 + 140) drawTree(g, d, th);
  // Bushes, rocks and signs stand on the far edge of the path, behind it.
  for (const d of T.deco) if (STATIC_DECO.has(d.kind) && d.x > view.x0 - 80 && d.x < view.x1 + 80) drawDeco(g, d, 0, th);
  const near = solidsNear(T, view.x0 - 60, view.x1 + 60);
  const grounds = near.filter((q) => q.kind === 'ground').sort((a, b) => a.x - b.x);
  for (const q of grounds) drawMeadow(g, q, th, view);
  for (const q of grounds) drawPath(g, q, th, view);
  drawSteps(g, grounds, th);
  for (const q of near) if (q.kind === 'plat') drawBoardwalk(g, q, T, th);
  for (const q of near) if (q.kind === 'block') drawBlock(g, q, th);
  for (const q of near) if (q.kind === 'roof') drawRoof(g, q, th);
  for (const sp of T.spikes) if (sp.x + sp.w > view.x0 - 20 && sp.x < view.x1 + 20) drawSpikes(g, sp);
}

// Path along a height function from x0 to x1, then down to `bottom`.
function terrainPath(g, f, x0, x1, bottom, step = 8, offset = 0) {
  g.moveTo(x0, bottom);
  for (let x = x0; x < x1; x += step) g.lineTo(x, f(x) + offset);
  g.lineTo(x1, f(x1) + offset);
  g.lineTo(x1, bottom);
  g.closePath();
}

// Cobblestone textures: one tile per look and scale, used as a repeating pattern anchored to
// world coordinates (so chunks line up). Far cheaper than drawing every stone in every chunk.
const tiles = new Map();
function cobblePattern(g, colors, mortar, cw, chh, seed, s) {
  const key = colors.join() + mortar + cw + chh + seed + s;
  let tile = tiles.get(key);
  if (!tile) {
    const cols = 8;
    const rows = 8;
    const TW = cw * cols;
    const TH = chh * rows;
    const c = document.createElement('canvas');
    c.width = Math.round(TW * s);
    c.height = Math.round(TH * s);
    const t = c.getContext('2d');
    t.scale(c.width / TW, c.height / TH);
    t.fillStyle = mortar;
    t.fillRect(0, 0, TW, TH);
    for (let row = 0; row < rows; row++) {
      const off = (row & 1) * cw * 0.5;
      for (let col = -1; col <= cols; col++) {
        const R = rng(((col * 73856093) ^ (row * 19349663) ^ seed) >>> 0);
        const x = col * cw + off + cw / 2 + (R() - 0.5) * 5;
        const y = row * chh + chh / 2 + (R() - 0.5) * 4;
        const w = cw * (0.42 + R() * 0.07);
        const h = chh * (0.39 + R() * 0.07);
        const color = colors[Math.floor(R() * colors.length)];
        for (const dx of [-TW, 0, TW]) {
          for (const dy of [-TH, 0, TH]) {
            const px = x + dx;
            const py = y + dy;
            if (px + w < 0 || px - w > TW || py + h < 0 || py - h > TH) continue;
            t.beginPath();
            roundRect(px - w, py - h, w * 2, h * 2, Math.min(w, h) * 0.8)(t);
            t.fillStyle = color;
            t.fill();
            t.beginPath();
            t.ellipse(px - w * 0.3, py - h * 0.35, w * 0.45, h * 0.28, -0.2, 0, TAU);
            t.fillStyle = 'rgba(255,255,255,0.13)';
            t.fill();
            t.beginPath();
            t.ellipse(px + w * 0.35, py + h * 0.45, w * 0.5, h * 0.25, -0.2, 0, TAU);
            t.fillStyle = 'rgba(60,30,10,0.12)';
            t.fill();
          }
        }
      }
    }
    tile = { c, TW, TH };
    tiles.set(key, tile);
  }
  const pat = g.createPattern(tile.c, 'repeat');
  if (pat.setTransform) pat.setTransform(new DOMMatrix().scale(tile.TW / tile.c.width, tile.TH / tile.c.height));
  return pat;
}

// Fills the current clip with cobblestones (the caller has clipped to the shape).
function cobbles(g, f, x0, x1, y1, colors, mortar, below, cw = 30, chh = 24, seed = 0) {
  const m = g.getTransform();
  const s = Math.hypot(m.a, m.b) || 1;
  // Never 0: a hidden page can report a zero-size canvas.
  g.fillStyle = cobblePattern(g, colors, mortar, cw, chh, seed, Math.max(0.25, Math.min(2, Math.round(s * 4) / 4)));
  const top = Math.min(f(x0), f(x1), f((x0 + x1) / 2)) - 200;
  g.fillRect(x0, top, x1 - x0, y1 - top);
}

// ---- The meadow world (v0.8) ----
// Seen a little from above: a back field rising to the hill line, the path the runners use, and a
// near field that comes toward the viewer down to the bottom of the screen. Fields are painted in
// rows that follow the path's curve; each row uses the same grass texture at a bigger scale than
// the one behind it and overlaps it with a ragged grass edge, which reads as perspective.

// tint: [color, alpha] baked into the tile (haze far away, shade up close), so each row is a single
// pattern fill.
const grassTiles = new Map();
function grassTile(th, kind, tint = null) {
  const key = th.id + kind + (tint ? tint.join() : '');
  let tile = grassTiles.get(key);
  if (tile) return tile;
  const TW = 128;
  const TH = 64;
  const px = 2;
  const c = document.createElement('canvas');
  c.width = TW * px;
  c.height = TH * px;
  const t = c.getContext('2d');
  t.scale(px, px);
  const M = kind === 'hill' ? { ...th.meadow, ...th.hill, base: th.hill.base, blade: th.hill.blade, bladeLight: th.hill.light, dark: th.hill.dark } : th.meadow;
  t.fillStyle = M.base;
  t.fillRect(0, 0, TW, TH);
  const R = rng(kind === 'hill' ? 71 : 37);
  const snow = th.id === 'snow';
  // Soft patches of lighter and darker ground.
  for (let i = 0; i < 14; i++) {
    const x = R() * TW;
    const y = R() * TH;
    for (const dx of [-TW, 0, TW]) for (const dy of [-TH, 0, TH]) {
      t.fillStyle = rgba(i % 2 ? M.bladeLight : M.dark, snow ? 0.08 : 0.12);
      t.beginPath();
      t.ellipse(x + dx, y + dy, 14 + R() * 10, 5 + R() * 4, 0, 0, TAU);
      t.fill();
    }
  }
  // Grass tufts (snow: mostly sparkles with a few dark tips).
  const tufts = snow ? 26 : 110;
  for (let i = 0; i < tufts; i++) {
    const x = R() * TW;
    const y = R() * TH;
    const h = 3 + R() * 4;
    const col = [M.blade, M.bladeLight, M.dark][Math.floor(R() * 3)];
    for (const dx of [-TW, 0, TW]) for (const dy of [-TH, 0, TH]) {
      t.strokeStyle = col;
      t.lineWidth = 1.1;
      t.lineCap = 'round';
      t.beginPath();
      t.moveTo(x + dx - 1.5, y + dy);
      t.lineTo(x + dx - 2.5, y + dy - h * 0.8);
      t.moveTo(x + dx, y + dy);
      t.lineTo(x + dx + 0.3, y + dy - h);
      t.moveTo(x + dx + 1.5, y + dy);
      t.lineTo(x + dx + 2.6, y + dy - h * 0.75);
      t.stroke();
    }
  }
  if (snow) {
    for (let i = 0; i < 40; i++) {
      const x = R() * TW;
      const y = R() * TH;
      t.fillStyle = i % 3 ? '#ffffff' : '#cfe4fa';
      t.fillRect(x, y, 1.2, 1.2);
    }
  }
  // A few flowers in the near field.
  if (kind === 'front') {
    for (let i = 0; i < 7; i++) {
      const x = R() * TW;
      const y = R() * TH;
      t.fillStyle = M.accent[i % M.accent.length];
      t.beginPath();
      t.arc(x, y, 1.3, 0, TAU);
      t.fill();
    }
  }
  if (tint && tint[1] > 0) {
    t.fillStyle = rgba(tint[0], tint[1]);
    t.fillRect(0, 0, TW, TH);
  }
  tile = { c, TW, TH };
  grassTiles.set(key, tile);
  return tile;
}

function grassPattern(g, tile, scale, squash) {
  const pat = g.createPattern(tile.c, 'repeat');
  if (pat.setTransform) pat.setTransform(new DOMMatrix().scale((scale * tile.TW) / tile.c.width, (scale * squash * tile.TH) / tile.c.height));
  return pat;
}

// A row between f(x) + top and f(x) + bottom (bottom null = down to `floor`), with a ragged grass
// edge of `tooth` units along its top.
function rowPath(g, f, x0, x1, top, bottom, floor, tooth = 0) {
  g.beginPath();
  if (tooth > 0) {
    const w = Math.max(3, tooth * 1.2);
    g.moveTo(x0, f(x0) + top);
    let up = false;
    for (let x = x0; x <= x1 + w; x += w / 2) {
      const xx = Math.min(x, x1);
      const k = Math.sin(xx * 12.9898) * 43758.5453;
      const jitter = (k - Math.floor(k)) * 0.6 + 0.4;
      g.lineTo(xx, f(xx) + top - (up ? tooth * jitter : 0));
      up = !up;
      if (xx === x1) break;
    }
  } else {
    g.moveTo(x0, f(x0) + top);
    for (let x = x0; x < x1; x += 8) g.lineTo(x, f(x) + top);
    g.lineTo(x1, f(x1) + top);
  }
  if (bottom === null) {
    g.lineTo(x1, floor);
    g.lineTo(x0, floor);
  } else {
    for (let x = x1; x > x0; x -= 8) g.lineTo(x, f(x) + bottom);
    g.lineTo(x0, f(x0) + bottom);
  }
  g.closePath();
}

// The back field: from the hill line down behind the path, getting hazier toward the top.
const BACK_ROWS = [0, 22, 50, 92, 150, 240, 380];
function drawBackMeadow(g, T, th, view) {
  const f = (x) => backAt(T, x);
  const x0 = view.x0 - 10;
  const x1 = view.x1 + 10;
  const floor = view.y1 + 10;
  const H = th.hill;
  for (let i = 0; i < BACK_ROWS.length; i++) {
    const k = i / (BACK_ROWS.length - 1);
    // The last row stops where the near field takes over (no point painting under it).
    rowPath(g, f, x0, x1, BACK_ROWS[i], i < BACK_ROWS.length - 1 ? BACK_ROWS[i + 1] + 4 : 460, floor, i ? 2 + k * 2 : 0);
    const tint = [th.meadow.haze, Math.round((0.42 - k * 0.3) * 20) / 20];
    g.fillStyle = grassPattern(g, grassTile(th, 'hill', tint), 0.32 + k * 0.32, 0.45 + k * 0.25);
    g.fill();
  }
  // The hill line, with a soft ragged edge.
  rowPath(g, f, x0, x1, -3, 6, floor, 3);
  g.fillStyle = H.light;
  g.fill();
  g.lineWidth = 1.6;
  g.strokeStyle = rgba(INK, 0.28);
  g.beginPath();
  for (let x = x0; x <= x1; x += 8) (x === x0 ? g.moveTo : g.lineTo).call(g, x, f(x) - 2);
  g.stroke();
  // Shrubs along the hill line.
  for (let cx = Math.floor(x0 / 90) * 90; cx < x1; cx += 90) {
    const R = rng(cx * 31 + 5);
    if (R() < 0.45) continue;
    const bx = cx + R() * 80;
    const by = f(bx) - 1;
    const sz = 0.6 + R() * 0.6;
    blob(g, scallop(bx, by - 8 * sz, 22 * sz, 11 * sz, 7, 0.45, R), H.dark, { ow: 1.4, ink: rgba(INK, 0.35), depth: 3, shade: darker(H.dark, 0.2), light: H.base });
  }
}

// The near field: rows from just under the path down to the bottom of the screen, growing with
// nearness (bigger blades, deeper color) like grass coming toward you.
const FRONT_ROWS = [17, 28, 43, 63, 91, 129, 181, 253, 353];
function drawMeadow(g, s, th, view) {
  const f = (x) => surfaceAt(s, x);
  const x0 = Math.max(s.x, view.x0 - 20);
  const x1 = Math.min(s.x + s.w, view.x1 + 20);
  if (x1 <= x0) return;
  const floor = view.y1 + 10;
  const M = th.meadow;
  const n = FRONT_ROWS.length;
  for (let i = 0; i < n; i++) {
    const k = i / (n - 1);
    const sc = 0.42 + k * k * 2.1;
    rowPath(g, f, x0, x1, FRONT_ROWS[i], i < n - 1 ? FRONT_ROWS[i + 1] + 2 : null, floor, i ? 2.5 + k * 9 : 0);
    const tint = k < 0.45 ? [M.haze, 0.3 * (1 - k / 0.45)] : [M.dark, 0.26 * ((k - 0.45) / 0.55)];
    tint[1] = Math.round(tint[1] * 20) / 20;
    g.fillStyle = grassPattern(g, grassTile(th, 'front', tint), sc, 0.5 + k * 0.4);
    g.fill();
  }
  // The path's soft shadow on the grass right under it.
  rowPath(g, f, x0, x1, 16, 24, floor, 0);
  g.fillStyle = rgba(M.dark, 0.22);
  g.fill();
}

// The path: a flat, light band the runners stand in the middle of (feet at f(x), the far edge 9
// above, the near edge 18 below), with ruts and pebbles, grass spilling over both edges.
const pathTiles = new Map();
function pathTile(th) {
  let tile = pathTiles.get(th.id);
  if (tile) return tile;
  const TW = 96;
  const TH = 32;
  const px = 2;
  const c = document.createElement('canvas');
  c.width = TW * px;
  c.height = TH * px;
  const t = c.getContext('2d');
  t.scale(px, px);
  const P = th.path;
  t.fillStyle = P.base;
  t.fillRect(0, 0, TW, TH);
  const R = rng(13);
  for (let i = 0; i < 30; i++) {
    const x = R() * TW;
    const y = R() * TH;
    const r = 0.6 + R() * 1.3;
    for (const dx of [-TW, 0, TW]) for (const dy of [-TH, 0, TH]) {
      t.fillStyle = i % 4 ? P.pebble : P.light;
      t.beginPath();
      t.ellipse(x + dx, y + dy, r * 1.4, r, 0, 0, TAU);
      t.fill();
    }
  }
  for (let i = 0; i < 10; i++) {
    const x = R() * TW;
    const y = R() * TH;
    for (const dx of [-TW, 0, TW]) {
      t.fillStyle = rgba(P.edge, 0.12);
      t.beginPath();
      t.ellipse(x + dx, y, 10 + R() * 8, 2, 0, 0, TAU);
      t.fill();
    }
  }
  tile = { c, TW, TH };
  pathTiles.set(th.id, tile);
  return tile;
}

function drawPath(g, s, th, view) {
  const f = (x) => surfaceAt(s, x);
  const x0 = Math.max(s.x, view.x0 - 20);
  const x1 = Math.min(s.x + s.w, view.x1 + 20);
  if (x1 <= x0) return;
  const P = th.path;
  const M = th.meadow;
  const floor = view.y1 + 10;
  rowPath(g, f, x0, x1, -9, 18, floor, 0);
  const tile = pathTile(th);
  g.fillStyle = grassPattern(g, tile, 1, 1);
  g.fill();
  // Lighter far half (it faces the sky more), slightly darker near edge.
  rowPath(g, f, x0, x1, -9, -1, floor, 0);
  g.fillStyle = rgba(P.light, 0.55);
  g.fill();
  rowPath(g, f, x0, x1, 12, 18, floor, 0);
  g.fillStyle = rgba(P.edge, 0.22);
  g.fill();
  // Two faint ruts.
  g.lineWidth = 1.4;
  g.strokeStyle = rgba(P.edge, 0.35);
  for (const off of [2, 9.5]) {
    g.beginPath();
    for (let x = x0; x <= x1; x += 8) (x === x0 ? g.moveTo : g.lineTo).call(g, x, f(x) + off);
    g.stroke();
  }
  // Edges: grass (or snow) spilling over the far and the near side.
  const snow = th.id === 'snow';
  const fringe = (off, h, colA, colB, seed) => {
    if (snow) {
      g.fillStyle = colA;
      g.beginPath();
      for (let x = x0; x <= x1; x += 9) {
        const k = Math.sin((x + seed) * 7.13) * 0.5 + 0.5;
        g.moveTo(x + 5, f(x) + off);
        g.ellipse(x, f(x) + off, 5, 1.5 + k * h * 0.4, 0, 0, TAU);
      }
      g.fill();
      return;
    }
    for (const [col, phase] of [[colA, 0], [colB, 3]]) {
      g.strokeStyle = col;
      g.lineWidth = 1.5;
      g.lineCap = 'round';
      g.beginPath();
      for (let x = x0 + phase; x <= x1; x += 6) {
        const k = Math.sin((x + seed) * 12.9898) * 43758.5453;
        const j = k - Math.floor(k);
        const y = f(x) + off;
        g.moveTo(x, y);
        g.lineTo(x - 1.5 + j * 3, y - h * (0.5 + j * 0.6));
      }
      g.stroke();
    }
  };
  fringe(-8, 6, th.hill.blade, th.hill.dark, 1);
  g.lineWidth = 1.4;
  g.strokeStyle = rgba(P.edge, 0.6);
  g.beginPath();
  for (let x = x0; x <= x1; x += 8) (x === x0 ? g.moveTo : g.lineTo).call(g, x, f(x) + 17.5);
  g.stroke();
  fringe(20, 8, M.blade, M.bladeLight, 7);
}

// Where the path steps up or down: a short stone retaining wall over the seam.
function drawSteps(g, grounds, th) {
  for (let i = 1; i < grounds.length; i++) {
    const A = grounds[i - 1];
    const B = grounds[i];
    if (Math.abs(A.x + A.w - B.x) > 1) continue;
    const x = B.x;
    const ya = surfaceAt(A, x);
    const yb = surfaceAt(B, x);
    if (Math.abs(ya - yb) < 3) continue;
    const top = Math.min(ya, yb) - 9;
    const bottom = Math.max(ya, yb) + 28;
    const w = 20;
    const body = roundRect(x - w / 2, top, w, bottom - top, 6);
    blob(g, body, th.block.base, { ow: 2.2, depth: 3 });
    g.save();
    g.beginPath();
    body(g);
    g.clip();
    cobbles(g, () => top - 100, x - w / 2, x + w / 2, bottom, [th.block.base, lighter(th.block.base, 0.15), darker(th.block.base, 0.12)], th.block.seam, -100, 14, 12, 5);
    g.restore();
    line(g, body, INK, 2.2);
    drawCap(g, () => top + 3, x - w / 2 - 3, x + w / 2 + 3, th, true, true, x);
  }
}

// The grass (or snow, or sand) lip on top of a surface.
function drawCap(g, f, x0, x1, th, roundL, roundR, seed) {
  const G = th.grass;
  const top = (x) => f(Math.max(x0 + 6, Math.min(x1 - 6, x))) - 9;
  const kind = th.block.cap;
  const dripY = (x) => {
    const base = f(Math.max(x0 + 6, Math.min(x1 - 6, x))) + 13;
    if (kind === 'sand') return base - 2 + Math.sin(x * 0.11) * 1.5;
    if (kind === 'snow') {
      const k = (x * 0.13 + seed) % 6;
      return base + (k < 1.2 ? 9 * Math.sin((k / 1.2) * Math.PI) : 0) + Math.sin(x * 0.4) * 1.4;
    }
    return base + Math.abs(Math.sin(x * 0.19)) * 6;
  };
  const path = (c) => {
    c.moveTo(x0, top(x0) + (roundL ? 7 : 0));
    if (roundL) c.quadraticCurveTo(x0, top(x0), x0 + 7, top(x0));
    for (let x = x0 + 7; x < x1 - 7; x += 8) c.lineTo(x, top(x));
    c.lineTo(x1 - 7, top(x1));
    if (roundR) c.quadraticCurveTo(x1, top(x1), x1, top(x1) + 7);
    else c.lineTo(x1, top(x1));
    for (let x = x1; x >= x0; x -= 4) c.lineTo(x, dripY(x));
    c.closePath();
  };
  blob(g, path, G.base, { ow: 2.3, depth: 4, shade: G.dark, light: G.light });
  // Bright top face (the lip seen slightly from above).
  g.save();
  g.beginPath();
  path(g);
  g.clip();
  g.beginPath();
  g.moveTo(x0, top(x0));
  for (let x = x0; x <= x1; x += 8) g.lineTo(x, top(x));
  for (let x = x1; x >= x0; x -= 8) g.lineTo(x, top(x) + 6);
  g.closePath();
  g.fillStyle = rgba(G.light, 0.75);
  g.fill();
  g.restore();
  // Tufts poking up.
  if (kind === 'grass') {
    for (let x = x0 + 10; x < x1 - 8; x += 11) {
      const R = rng(Math.floor(x) * 7 + 3);
      if (R() < 0.35) continue;
      const y = top(x) + 1;
      const h = 4 + R() * 5;
      blob(g, poly([[x - 3, y + 2], [x - 1 + R() * 2, y - h], [x + 3, y + 2]]), G.blade, { ow: 1.4, depth: 0, shade: false, light: false });
    }
  } else if (kind === 'snow') {
    // Icicles under the lip.
    for (let x = x0 + 12; x < x1 - 10; x += 26) {
      const R = rng(Math.floor(x) * 11 + 1);
      if (R() < 0.5) continue;
      const y = dripY(x) - 2;
      const h = 6 + R() * 10;
      blob(g, poly([[x - 3, y], [x, y + h], [x + 3, y]]), '#dff4ff', { ow: 1.3, depth: 0.8, shade: '#a9d4ef', light: false });
    }
  } else {
    for (let x = x0 + 14; x < x1 - 10; x += 30) {
      const R = rng(Math.floor(x) * 5 + 9);
      if (R() < 0.5) continue;
      flat(g, ellipse(x, top(x) + 4 + R() * 3, 2 + R() * 1.5, 1.4), G.dark, 0.7);
    }
  }
}

export function drawBlock(g, s, th) {
  const B = th.block;
  if (B.ice) {
    blob(g, roundRect(s.x, s.y, s.w, s.h, 7), B.base, { ow: 2.4, depth: 5, shade: B.seam, light: '#e8fbff' });
    g.save();
    g.globalAlpha = 0.5;
    line(g, (c) => { c.moveTo(s.x + 8, s.y + s.h - 10); c.lineTo(s.x + s.w * 0.45, s.y + 10); }, '#ffffff', 3);
    line(g, (c) => { c.moveTo(s.x + s.w * 0.4, s.y + s.h - 6); c.lineTo(s.x + s.w * 0.75, s.y + 18); }, '#ffffff', 2);
    g.restore();
  } else {
    blob(g, roundRect(s.x, s.y, s.w, s.h, 6), B.base, { ow: 2.4, depth: 4 });
    g.save();
    g.beginPath();
    roundRect(s.x, s.y, s.w, s.h, 6)(g);
    g.clip();
    cobbles(g, () => s.y - 100, s.x, s.x + s.w, s.y + s.h, [B.base, lighter(B.base, 0.15), darker(B.base, 0.12)], B.seam, -100, 26, 20, 7);
    g.restore();
    line(g, roundRect(s.x, s.y, s.w, s.h, 6), INK, 2.4);
  }
  drawCap(g, () => s.y + 2, s.x - 4, s.x + s.w + 4, th, true, true, s.x);
}

// Low rock overhang: hazy pillars behind suggest an arch going back; the slab hangs 32 units
// above the ground with roots dangling, and casts a dark band on the ground below.
function drawRoof(g, s, th) {
  const D = th.dirt;
  const bottom = s.y + s.h;
  const ground = bottom + 32;
  // Shadow on the ground under it.
  g.fillStyle = rgba(D.deep, 0.35);
  g.beginPath();
  g.ellipse(s.x + s.w / 2, ground - 2, s.w / 2 + 14, 7, 0, 0, TAU);
  g.fill();
  // Pillars behind the lane.
  for (const px of [s.x + 6, s.x + s.w - 20]) {
    g.fillStyle = mix(th.back.face, th.back.haze, 0.35);
    g.fillRect(px, bottom - 4, 14, 36);
    g.fillStyle = rgba(INK, 0.25);
    g.fillRect(px + 10, bottom - 4, 4, 36);
  }
  const body = (c) => {
    c.moveTo(s.x - 8, s.y + 10);
    c.quadraticCurveTo(s.x - 8, s.y, s.x + 6, s.y);
    c.lineTo(s.x + s.w - 6, s.y);
    c.quadraticCurveTo(s.x + s.w + 8, s.y, s.x + s.w + 8, s.y + 10);
    c.lineTo(s.x + s.w + 4, bottom - 10);
    c.quadraticCurveTo(s.x + s.w + 2, bottom + 2, s.x + s.w - 12, bottom);
    for (let x = s.x + s.w - 12; x > s.x + 12; x -= 14) c.lineTo(x, bottom + (Math.sin(x * 0.7) > 0 ? 3 : 0));
    c.quadraticCurveTo(s.x - 2, bottom + 2, s.x - 4, bottom - 10);
    c.closePath();
  };
  blob(g, body, D.base, { ow: 2.4, depth: 5, shade: D.deep });
  g.save();
  g.beginPath();
  body(g);
  g.clip();
  cobbles(g, () => s.y, s.x - 10, s.x + s.w + 10, bottom + 4, [D.stoneA, D.stoneB, D.stoneC], D.mortar, 6, 30, 24, 11);
  const sh = g.createLinearGradient(0, bottom - 40, 0, bottom + 4);
  sh.addColorStop(0, rgba(D.deep, 0));
  sh.addColorStop(1, rgba(D.deep, 0.55));
  g.fillStyle = sh;
  g.fillRect(s.x - 10, bottom - 40, s.w + 20, 46);
  g.restore();
  line(g, body, INK, 2.4);
  // Roots and vines hanging from the edge (they stay above head height of a sliding runner).
  for (let x = s.x + 10; x < s.x + s.w - 6; x += 17) {
    const R = rng(Math.floor(x) * 3 + 5);
    const len = 4 + R() * 7;
    line(g, (c) => { c.moveTo(x, bottom); c.quadraticCurveTo(x + 2, bottom + len * 0.6, x - 1, bottom + len); }, th.id === 'snow' ? '#dff4ff' : th.id === 'desert' ? '#8a5a2e' : '#3f8a35', 2.2);
  }
  drawCap(g, () => s.y + 2, s.x - 8, s.x + s.w + 8, th, true, true, s.x + 3);
  // A warning sign at the entrance: slide!
  const sx = s.x - 46;
  blob(g, roundRect(sx - 2, ground - 40, 4, 40, 1.5), '#7a4f2e', { ow: 1.6, depth: 1 });
  blob(g, roundRect(sx - 14, ground - 56, 28, 22, 4), '#ffd23f', { ow: 2, depth: 2 });
  line(g, (c) => { c.moveTo(sx - 6, ground - 50); c.lineTo(sx, ground - 42); c.lineTo(sx + 6, ground - 50); }, INK, 3);
}

// One-way ledge: a wooden boardwalk on posts that stand on the far edge of the path below.
function drawBoardwalk(g, s, T, th) {
  const wood = th.id === 'snow' ? '#a77b52' : th.id === 'desert' ? '#b07a44' : '#b9824c';
  const posts = [s.x + 8, s.x + s.w / 2, s.x + s.w - 8];
  for (const px of posts) {
    const fy = floorBelow(T, px, s.y + 20);
    if (fy === Infinity) continue;
    const y1 = fy - 8;
    blob(g, roundRect(px - 4, s.y + 6, 8, y1 - s.y - 6, 2), darker(wood, 0.25), { ow: 1.8, depth: 1.5 });
  }
  const deck = roundRect(s.x - 4, s.y - 5, s.w + 8, 13, 4);
  blob(g, deck, wood, { ow: 2.3, depth: 3, shade: darker(wood, 0.3), light: lighter(wood, 0.3) });
  g.strokeStyle = rgba(INK, 0.35);
  g.lineWidth = 1.4;
  g.beginPath();
  for (let x = s.x + 14; x < s.x + s.w - 4; x += 16) { g.moveTo(x, s.y - 3); g.lineTo(x, s.y + 6); }
  g.stroke();
  if (th.id === 'snow') blob(g, roundRect(s.x - 3, s.y - 8, s.w + 6, 5, 2.5), '#ffffff', { ow: 1.4, depth: 1, light: false, shade: '#d4e3f2' });
}

export function drawSpikes(ctx, sp) {
  const n = Math.max(2, Math.round(sp.w / 14));
  const w = sp.w / n;
  blob(ctx, roundRect(sp.x - 3, sp.y - 6, sp.w + 6, 8, 3), '#4a525e', { ow: 2, depth: 1.5 });
  for (let i = 0; i < n; i++) {
    const x = sp.x + i * w;
    blob(ctx, poly([[x + 1, sp.y - 4], [x + w / 2, sp.y - 24], [x + w - 1, sp.y - 4]]), '#d9e1e8', { ow: 1.9, depth: 2.6, shade: '#8a95a2', light: '#ffffff' });
    flat(ctx, poly([[x + w / 2 - 1, sp.y - 20], [x + w / 2 + 0.5, sp.y - 23], [x + w / 2 + 1, sp.y - 12]]), '#ffffff', 0.8);
  }
}

export function drawMud(ctx, m, t) {
  const y = m.y;
  blob(ctx, (c) => {
    c.moveTo(m.x - 6, y + 2);
    c.quadraticCurveTo(m.x - 4, y - 7, m.x + 10, y - 7);
    for (let x = m.x + 10; x <= m.x + m.w - 10; x += 12) c.lineTo(x, y - 7 + Math.sin(x * 0.08 + t * 2) * 1.8);
    c.quadraticCurveTo(m.x + m.w + 4, y - 7, m.x + m.w + 6, y + 2);
    c.lineTo(m.x + m.w + 2, y + 9);
    c.lineTo(m.x - 2, y + 9);
    c.closePath();
  }, '#6e4a2f', { ow: 2, depth: 3, shade: '#4f321f', light: '#8c6243' });
  for (let i = 0; i < Math.floor(m.w / 70); i++) flat(ctx, ellipse(m.x + 30 + i * 70 + Math.sin(t + i) * 4, y - 3, 12, 2), '#a07a58', 0.6);
  for (let i = 0; i < Math.floor(m.w / 50); i++) {
    const ph = (t * 0.6 + i * 0.37) % 1;
    const bx = m.x + 20 + ((i * 53) % Math.max(1, m.w - 30));
    flat(ctx, circle(bx, y - 5 - ph * 7, 2.6 * (1 - ph) + 0.8), '#9a7050', 1 - ph);
  }
}

export function drawPad(ctx, p, t) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  glow(ctx, p.x + p.w / 2, p.y - 8, 56, '#ffcf3a', 0.28 + Math.sin(t * 8) * 0.08);
  ctx.restore();
  blob(ctx, roundRect(p.x - 3, p.y - 9, p.w + 6, 11, 4), '#353c48', { ow: 2, depth: 1.5 });
  for (let i = 0; i < 3; i++) {
    const ph = (t * 2.6 - i * 0.28) % 1;
    const a = 0.35 + 0.65 * Math.max(0, Math.sin(ph * Math.PI));
    const x = p.x + 7 + i * 20;
    ctx.globalAlpha = a;
    blob(ctx, poly([[x, p.y - 8], [x + 8, p.y - 8], [x + 17, p.y - 3.5], [x + 8, p.y + 1], [x, p.y + 1], [x + 8, p.y - 3.5]]), '#ffd23f', { ow: 1.3, depth: 1, light: '#fff3a8' });
    ctx.globalAlpha = 1;
  }
}

// "?" item box (red, like the arcade classics). pop: 0..1 grows back in after respawning.
export function drawBox(ctx, b, t, pop = 1) {
  if (pop <= 0) return;
  const bob = Math.sin(t * 3 + b.id) * 3;
  const k = pop < 1 ? pop * (1.25 - 0.25 * pop) : 1;
  at(ctx, b.x, b.y + bob, Math.sin(t * 2 + b.id) * 0.06, () => {
    glow(ctx, 0, 0, 30, '#ff8aa0', 0.35);
    blob(ctx, roundRect(-14, -14, 28, 28, 5), '#ec3b52', { ow: 2.3, depth: 4, shade: '#b51f3a', light: '#ff8a9a' });
    line(ctx, roundRect(-10, -10, 20, 20, 3), '#ff9aaa', 1.4, 0.7);
    ctx.font = '21px "Lilita One", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 4;
    ctx.strokeStyle = INK;
    ctx.strokeText('?', 0, 1.5);
    ctx.fillStyle = '#ffffff';
    ctx.fillText('?', 0, 1.5);
    const ph = (t * 0.7 + b.id * 0.2) % 2.2;
    if (ph < 1) {
      ctx.save();
      ctx.beginPath();
      roundRect(-14, -14, 28, 28, 5)(ctx);
      ctx.clip();
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.beginPath();
      const sx = -30 + ph * 60;
      ctx.moveTo(sx, -16); ctx.lineTo(sx + 8, -16); ctx.lineTo(sx - 4, 16); ctx.lineTo(sx - 12, 16);
      ctx.fill();
      ctx.restore();
    }
  }, k, k);
}

// ---- Decorations ----

const STATIC_DECO = new Set(['bush', 'rock', 'mushroom', 'fern', 'startSign', 'pine', 'snowman', 'iceCrystal', 'bushSnow', 'cactus', 'cactusSmall', 'skull']);
export const LIVE_DECO = new Set(['flower', 'grass', 'tumble']);

function drawTree(g, d, th) {
  const R = rng(Math.floor(d.r * 1e6));
  const { x, y } = d;
  const h = 130 + R() * 60;
  if (th.tree === 'pine') {
    blob(g, roundRect(x - 6, y - h * 0.3, 12, h * 0.3 + 4, 3), '#6b4a32', { ow: 2.2, depth: 2 });
    for (let i = 0; i < 4; i++) {
      const ty = y - h * 0.22 - i * h * 0.2;
      const w = 52 - i * 10;
      blob(g, poly([[x - w, ty], [x, ty - h * 0.3], [x + w, ty]]), '#3f7461', { ow: 2.2, depth: 4, shade: '#2c5848', light: '#5a9580' });
      blob(g, (c) => { c.moveTo(x - w * 0.55, ty - h * 0.13); c.lineTo(x, ty - h * 0.3); c.lineTo(x + w * 0.55, ty - h * 0.13); c.quadraticCurveTo(x + w * 0.2, ty - h * 0.08, x, ty - h * 0.12); c.quadraticCurveTo(x - w * 0.2, ty - h * 0.08, x - w * 0.55, ty - h * 0.13); c.closePath(); }, '#ffffff', { ow: 1.6, depth: 2, shade: '#d4e3f2', light: false });
    }
    return;
  }
  if (th.tree === 'palm') {
    const lean = (R() - 0.5) * 0.3;
    const tx = x + lean * h;
    blob(g, (c) => { c.moveTo(x - 7, y + 2); c.quadraticCurveTo(x + lean * h * 0.4 - 5, y - h * 0.5, tx - 4, y - h); c.lineTo(tx + 4, y - h); c.quadraticCurveTo(x + lean * h * 0.4 + 5, y - h * 0.5, x + 7, y + 2); c.closePath(); }, '#a87a4a', { ow: 2.2, depth: 3 });
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + (i - 2.5) * 0.55;
      at(g, tx, y - h, a, () => blob(g, (c) => { c.moveTo(0, -4); c.quadraticCurveTo(30, -14, 58, 6); c.quadraticCurveTo(30, -2, 0, 4); c.closePath(); }, '#5f9a3e', { ow: 2, depth: 3, shade: '#447a2c', light: '#86c25a' }));
    }
    flat(g, circle(tx - 4, y - h + 6, 5), '#7a4f2a');
    flat(g, circle(tx + 5, y - h + 7, 5), '#7a4f2a');
    return;
  }
  blob(g, poly([[x - 8, y + 2], [x - 5, y - h * 0.55], [x + 5, y - h * 0.55], [x + 9, y + 2]]), '#7a4f2e', { ow: 2.3, depth: 3 });
  line(g, (c) => { c.moveTo(x - 2, y - h * 0.3); c.lineTo(x - 18, y - h * 0.5); }, INK, 6);
  line(g, (c) => { c.moveTo(x - 2, y - h * 0.3); c.lineTo(x - 18, y - h * 0.5); }, '#7a4f2e', 3);
  blob(g, scallop(x, y - h * 0.7, 52, 42, 9, 0.4, R), '#4a9e3f', { ow: 2.4, depth: 7, shade: '#357f35', light: '#78c75d' });
  blob(g, scallop(x + 8, y - h * 0.94, 34, 27, 7, 0.4, R), '#58ad48', { ow: 2.2, depth: 5, shade: '#3c8a3a', light: '#86d468' });
  for (let i = 0; i < 4; i++) flat(g, circle(x - 30 + R() * 60, y - h * 0.65 - R() * 50, 3), '#e85d5d');
}

export function drawDeco(ctx, d, t, th) {
  const R = rng(Math.floor(d.r * 1e6));
  const { x, y } = d;
  switch (d.kind) {
    case 'bush': {
      const s = 0.8 + R() * 0.5;
      blob(ctx, scallop(x, y - 10 * s, 24 * s, 13 * s, 7, 0.45, R), '#4fa843', { ow: 2, depth: 3, shade: '#3a8a3a', light: '#7fcf62' });
      if (R() < 0.5) for (let i = 0; i < 3; i++) flat(ctx, circle(x - 12 * s + R() * 24 * s, y - 10 * s - R() * 8 * s, 2), '#ff6b8a');
      break;
    }
    case 'bushSnow': {
      const s = 0.8 + R() * 0.5;
      blob(ctx, scallop(x, y - 10 * s, 24 * s, 13 * s, 7, 0.45, R), '#3f7461', { ow: 2, depth: 3, shade: '#2c5848', light: '#5a9580' });
      blob(ctx, scallop(x, y - 18 * s, 18 * s, 6 * s, 6, 0.4, R), '#ffffff', { ow: 1.5, depth: 1.5, shade: '#d4e3f2', light: false });
      break;
    }
    case 'fern': {
      for (let i = -2; i <= 2; i++) {
        at(ctx, x, y, i * 0.35, () => blob(ctx, (c) => { c.moveTo(0, 0); c.quadraticCurveTo(-5, -14, 0, -26); c.quadraticCurveTo(5, -14, 0, 0); c.closePath(); }, '#3f9a3a', { ow: 1.4, depth: 1.5 }));
      }
      break;
    }
    case 'flower': {
      const c = ['#ff6b8a', '#ffd23f', '#ffffff', '#b07cff'][Math.floor(R() * 4)];
      const sway = Math.sin(t * 2 + x) * 0.08;
      at(ctx, x, y - 4, sway, () => {
        line(ctx, (g) => { g.moveTo(0, 0); g.quadraticCurveTo(2, -7, 0, -14); }, '#3d8a35', 2);
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * TAU;
          blob(ctx, circle(Math.cos(a) * 3.6, -14 + Math.sin(a) * 3.6, 2.8), c, { ow: 1.2, depth: 0.8 });
        }
        flat(ctx, circle(0, -14, 2.2), '#ffb12e');
      });
      break;
    }
    case 'rock': {
      const s = 0.7 + R() * 0.6;
      const col = th.id === 'desert' ? '#c98a5a' : th.id === 'snow' ? '#8a9ab0' : '#9aa4ae';
      blob(ctx, smooth([[x - 12 * s, y - 2], [x - 9 * s, y - 11 * s], [x + 1, y - 15 * s], [x + 11 * s, y - 9 * s], [x + 13 * s, y - 2]], 0.8), col, { ow: 2, depth: 2.5 });
      if (th.id === 'snow') blob(ctx, ellipse(x, y - 13 * s, 8 * s, 3 * s), '#ffffff', { ow: 1.2, depth: 1, light: false, shade: '#d4e3f2' });
      break;
    }
    case 'grass': {
      for (let i = -2; i <= 2; i++) {
        const sw = Math.sin(t * 2.5 + x * 0.1 + i) * 1.5;
        line(ctx, (g) => { g.moveTo(x + i * 3, y - 4); g.quadraticCurveTo(x + i * 4, y - 10, x + i * 5 + sw, y - 14 - (2 - Math.abs(i)) * 2); }, '#3f9536', 2.2);
      }
      break;
    }
    case 'mushroom': {
      blob(ctx, roundRect(x - 2.5, y - 12, 5, 9, 2), '#f4ecd8', { ow: 1.4, depth: 1 });
      blob(ctx, (g) => { g.moveTo(x - 9, y - 11); g.quadraticCurveTo(x, y - 23, x + 9, y - 11); g.closePath(); }, '#e04a3a', { ow: 1.6, depth: 1.6 });
      flat(ctx, circle(x - 3, y - 15, 1.6), '#ffffff');
      flat(ctx, circle(x + 3, y - 14, 1.3), '#ffffff');
      break;
    }
    case 'pine': {
      const h = 40 + R() * 20;
      blob(ctx, poly([[x - h * 0.32, y - 4], [x, y - h], [x + h * 0.32, y - 4]]), '#3f7461', { ow: 2, depth: 3, shade: '#2c5848', light: '#5a9580' });
      blob(ctx, poly([[x - h * 0.13, y - h * 0.62], [x, y - h], [x + h * 0.13, y - h * 0.62]]), '#ffffff', { ow: 1.4, depth: 1, light: false, shade: '#d4e3f2' });
      break;
    }
    case 'snowman': {
      blob(ctx, circle(x, y - 12, 12), '#ffffff', { ow: 2, depth: 3, shade: '#cddcee' });
      blob(ctx, circle(x, y - 30, 8.5), '#ffffff', { ow: 2, depth: 2.5, shade: '#cddcee' });
      flat(ctx, circle(x + 2, y - 32, 1.4), INK);
      flat(ctx, circle(x + 6, y - 32, 1.4), INK);
      blob(ctx, poly([[x + 6, y - 29], [x + 15, y - 28], [x + 6, y - 27]]), '#ff8a2f', { ow: 1, depth: 0.5 });
      blob(ctx, roundRect(x - 9, y - 41, 18, 4, 2), '#e8344a', { ow: 1.4, depth: 1 });
      break;
    }
    case 'iceCrystal': {
      blob(ctx, poly([[x - 6, y - 3], [x - 3, y - 20], [x, y - 26], [x + 3, y - 18], [x + 7, y - 3]]), '#bfeaff', { ow: 1.8, depth: 2, shade: '#7cc6ea', light: '#ffffff' });
      break;
    }
    case 'cactus': {
      const h = 36 + R() * 20;
      blob(ctx, roundRect(x - 6, y - h, 12, h, 6), '#5f9a3e', { ow: 2, depth: 2.5, shade: '#447a2c', light: '#86c25a' });
      blob(ctx, (c) => { c.moveTo(x - 6, y - h * 0.45); c.lineTo(x - 15, y - h * 0.45); c.lineTo(x - 15, y - h * 0.75); }, '#5f9a3e', { ow: 0, depth: 0 });
      line(ctx, (c) => { c.moveTo(x - 5, y - h * 0.45); c.lineTo(x - 14, y - h * 0.45); c.lineTo(x - 14, y - h * 0.72); }, INK, 9);
      line(ctx, (c) => { c.moveTo(x - 5, y - h * 0.45); c.lineTo(x - 14, y - h * 0.45); c.lineTo(x - 14, y - h * 0.72); }, '#5f9a3e', 5.4);
      line(ctx, (c) => { c.moveTo(x + 5, y - h * 0.6); c.lineTo(x + 13, y - h * 0.6); c.lineTo(x + 13, y - h * 0.82); }, INK, 9);
      line(ctx, (c) => { c.moveTo(x + 5, y - h * 0.6); c.lineTo(x + 13, y - h * 0.6); c.lineTo(x + 13, y - h * 0.82); }, '#5f9a3e', 5.4);
      if (R() < 0.5) flat(ctx, circle(x, y - h - 2, 3), '#ff6b8a');
      break;
    }
    case 'cactusSmall': {
      blob(ctx, ellipse(x, y - 9, 8, 10), '#6fa848', { ow: 2, depth: 2, shade: '#4f8a32', light: '#8fc66a' });
      flat(ctx, circle(x, y - 19, 2.5), '#ffd23f');
      break;
    }
    case 'skull': {
      blob(ctx, ellipse(x, y - 6, 8, 6), '#f3ead8', { ow: 1.8, depth: 1.5 });
      flat(ctx, circle(x - 3, y - 6, 1.8), INK);
      flat(ctx, circle(x + 3, y - 6, 1.8), INK);
      break;
    }
    case 'tumble': {
      const rot = t * 3 + x;
      const bx = x + Math.sin(t * 0.8 + x) * 20;
      const by = y - 9 - Math.abs(Math.sin(t * 3 + x)) * 8;
      ctx.save();
      ctx.translate(bx, by);
      ctx.rotate(rot);
      for (let i = 0; i < 4; i++) line(ctx, circle(0, 0, 9 - i * 2), '#a8834e', 1.6, 0.9);
      line(ctx, (c) => { c.moveTo(-9, 0); c.lineTo(9, 0); c.moveTo(0, -9); c.lineTo(0, 9); }, '#a8834e', 1.4);
      ctx.restore();
      break;
    }
    case 'startSign': {
      blob(ctx, roundRect(x - 3, y - 70, 6, 70, 2), '#7a4f2e', { ow: 2, depth: 1.5 });
      blob(ctx, roundRect(x - 34, y - 92, 68, 28, 6), '#f5e1b5', { ow: 2.2, depth: 3 });
      ctx.font = '15px "Lilita One", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#6a3b1c';
      ctx.fillText('BAŞLA', x, y - 77);
      break;
    }
    default:
  }
}

// Checkered finish arch at x (ground y). The back post and ground stripe are drawn behind the
// runners, the front post and the banner in front of them.
export function drawFinish(ctx, x, y, t, front) {
  const h = 160;
  const post = (px, color) => {
    blob(ctx, roundRect(px - 6, y - h, 12, h + 2, 4), color, { ow: 2.2, depth: 2.5 });
    for (let i = 1; i < 6; i++) line(ctx, (g) => { g.moveTo(px - 5, y - h + i * 26); g.lineTo(px + 5, y - h + i * 26 - 6); }, '#ff4d5e', 3.5);
  };
  if (!front) {
    post(x + 58, '#d9e1ea');
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 2; j++) {
        ctx.fillStyle = (i + j) % 2 ? '#ffffff' : '#262330';
        ctx.fillRect(x - 9 + i * 6, y - 6 + j * 6, 6, 6);
      }
    }
    return;
  }
  post(x - 58, '#eef3f8');
  const x0 = x - 64;
  const x1 = x + 64;
  const cols = 16;
  const cw = (x1 - x0) / cols;
  const wave = (k) => Math.sin(t * 4 - k * 0.5) * 3;
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < 2; r++) {
      ctx.fillStyle = (r + c) % 2 ? '#ffffff' : '#262330';
      ctx.fillRect(x0 + c * cw, y - h - 14 + r * 9 + wave(c), cw + 0.5, 9);
    }
  }
  line(ctx, (g) => { g.moveTo(x0, y - h - 14 + wave(0)); for (let c = 1; c <= cols; c++) g.lineTo(x0 + c * cw, y - h - 14 + wave(c)); }, INK, 2);
  line(ctx, (g) => { g.moveTo(x0, y - h + 4 + wave(0)); for (let c = 1; c <= cols; c++) g.lineTo(x0 + c * cw, y - h + 4 + wave(c)); }, INK, 2);
  blob(ctx, roundRect(x - 34, y - h - 46, 68, 28, 8), '#ffd23f', { ow: 2.4, depth: 3 });
  ctx.font = '17px "Lilita One", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#6a3b1c';
  ctx.fillText('BİTİŞ', x, y - h - 31);
  for (const fx of [x0, x1]) {
    line(ctx, (g) => { g.moveTo(fx, y - h - 10); g.lineTo(fx, y - h - 44); }, INK, 3);
    blob(ctx, (g) => { g.moveTo(fx, y - h - 44); g.quadraticCurveTo(fx + 10, y - h - 46 + wave(2), fx + 20, y - h - 40 + wave(3)); g.lineTo(fx + 20, y - h - 28 + wave(4)); g.quadraticCurveTo(fx + 10, y - h - 32 + wave(3), fx, y - h - 30); g.closePath(); }, fx === x0 ? '#ff4d5e' : '#2e7bd6', { ow: 1.8, depth: 2 });
  }
}

// ---- Foreground: blurred plants sliding past in front of everything ----

export function createForeground(theme) {
  let key = '';
  let sprites = [];
  const F = 1.4; // parallax: moves faster than the lane

  function build(scale) {
    key = String(scale);
    sprites = [];
    for (let i = 0; i < 6; i++) {
      const R = rng(1000 + i * 17);
      const w = 220;
      const h = 150;
      const c = document.createElement('canvas');
      c.width = Math.ceil(w * scale);
      c.height = Math.ceil(h * scale);
      const g = c.getContext('2d');
      if ('filter' in g) g.filter = `blur(${2.2 * scale}px)`;
      g.scale(scale, scale);
      g.translate(w / 2, h);
      paintForePlant(g, i, R, theme);
      sprites.push({ c, w, h });
    }
  }

  return {
    draw(ctx, W, H, scale, camX) {
      if (key !== String(scale)) build(scale);
      const viewW = W / scale;
      const fx = camX * F;
      const cell = 420;
      for (let ci = Math.floor(fx / cell) - 1; ci <= Math.floor((fx + viewW) / cell) + 1; ci++) {
        const R = rng(ci * 7919 + 13);
        if (R() < 0.35) continue;
        const sp = sprites[Math.floor(R() * sprites.length)];
        const x = (ci * cell + R() * cell * 0.6 - fx) * scale;
        const y = H + (R() * 30 - 8) * scale;
        const k = 0.8 + R() * 0.5;
        ctx.drawImage(sp.c, x - (sp.c.width * k) / 2, y - sp.c.height * k, sp.c.width * k, sp.c.height * k);
      }
    },
  };
}

function paintForePlant(g, i, R, th) {
  const [c1, c2, c3] = th.fore;
  const kind = i % 3;
  if (th.id === 'desert' && kind === 0) {
    blob(g, smooth([[-80, 4], [-60, -40], [-10, -62], [40, -50], [80, 4]], 0.8), c1, { ow: 0, depth: 8, shade: darker(c1, 0.3), light: false });
    return;
  }
  if (th.id === 'snow' && kind === 1) {
    blob(g, scallop(0, -20, 90, 34, 9, 0.4, R), c2, { ow: 0, depth: 8, shade: '#b9cbe2', light: false });
    return;
  }
  if (kind === 0) {
    // Big leaves fanning up.
    for (let k = -3; k <= 3; k++) {
      at(g, k * 6, 0, k * 0.32 + (R() - 0.5) * 0.15, () => blob(g, (c) => { c.moveTo(0, 0); c.quadraticCurveTo(-26, -60, 0, -120 - R() * 20); c.quadraticCurveTo(26, -60, 0, 0); c.closePath(); }, k % 2 ? c1 : c3, { ow: 0, depth: 6, shade: darker(c1, 0.25), light: lighter(c1, 0.15) }));
    }
  } else if (kind === 1) {
    blob(g, scallop(0, -36, 96, 48, 9, 0.45, R), c1, { ow: 0, depth: 9, shade: darker(c1, 0.3), light: lighter(c1, 0.12) });
    blob(g, scallop(-30, -60, 48, 30, 7, 0.4, R), c3, { ow: 0, depth: 6, shade: darker(c3, 0.3), light: false });
  } else {
    // A clump of wide grass blades.
    for (let k = 0; k < 11; k++) {
      const x = -70 + k * 14 + (R() - 0.5) * 6;
      const hh = 60 + R() * 70;
      const lean = (R() - 0.5) * 40;
      g.beginPath();
      g.moveTo(x - 9, 0);
      g.quadraticCurveTo(x - 4 + lean * 0.4, -hh * 0.6, x + lean, -hh);
      g.quadraticCurveTo(x + 6 + lean * 0.3, -hh * 0.5, x + 9, 0);
      g.closePath();
      g.fillStyle = k % 2 ? c1 : c3;
      g.fill();
    }
  }
}

// ---- Weather: screen-space flakes, leaves or sand ----

export function createWeather(theme) {
  const kind = theme.weather;
  const parts = [];
  const N = kind === 'snow' ? 70 : kind === 'leaves' ? 14 : 26;
  for (let i = 0; i < N; i++) parts.push({ x: Math.random(), y: Math.random(), z: 0.4 + Math.random() * 0.9, ph: Math.random() * 10 });
  let lastCam = null;
  return {
    draw(ctx, W, H, scale, camX, camY, dt, t) {
      const dcx = lastCam ? camX - lastCam.x : 0;
      const dcy = lastCam ? camY - lastCam.y : 0;
      lastCam = { x: camX, y: camY };
      for (const p of parts) {
        // Move with the wind, plus parallax against the camera (closer flakes move more).
        let vx = 0;
        let vy = 0;
        if (kind === 'snow') { vx = -0.02 + Math.sin(t + p.ph) * 0.02; vy = 0.08 * p.z; }
        else if (kind === 'leaves') { vx = -0.05 + Math.sin(t * 1.3 + p.ph) * 0.04; vy = 0.04 * p.z; }
        else { vx = -0.35 * p.z; vy = Math.sin(t * 2 + p.ph) * 0.01; }
        p.x += vx * dt - (dcx * scale * p.z * 0.9) / W;
        p.y += vy * dt - (dcy * scale * p.z * 0.4) / H;
        p.x = ((p.x % 1) + 1) % 1;
        p.y = ((p.y % 1) + 1) % 1;
        const x = p.x * W;
        const y = p.y * H;
        const s = scale * p.z;
        if (kind === 'snow') {
          ctx.globalAlpha = 0.85;
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(x, y, 2.2 * s, 0, TAU);
          ctx.fill();
        } else if (kind === 'leaves') {
          ctx.fillStyle = p.ph > 5 ? '#e8a23a' : '#7cc463';
          ctx.strokeStyle = INK;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.ellipse(x, y, 6 * s, (3 * Math.abs(Math.cos(t * 2.5 + p.ph)) + 0.6) * s, t * 2 + p.ph, 0, TAU);
          ctx.fill();
          ctx.stroke();
        } else {
          ctx.globalAlpha = 0.35;
          ctx.strokeStyle = '#fff1d0';
          ctx.lineWidth = 1.4 * s;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + 18 * s, y);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
    },
  };
}

export { THEMES };
