// Drawing style shared by every actor, icon and backdrop: thick warm outlines, a flat fill, a
// shade crescent on the lower right and a highlight crescent on the upper left (light comes
// from the top left of the screen whatever the shape's own rotation or mirroring).
// Only uses the canvas 2D API on the context it is given, so tests can draw into a mock.

export const INK = '#2a1b17';

// ---- Colors ----

const parsed = new Map();
function rgb(hex) {
  let c = parsed.get(hex);
  if (!c) {
    const h = hex.length === 4 ? hex.replace(/^#(.)(.)(.)$/, '#$1$1$2$2$3$3') : hex;
    c = [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
    parsed.set(hex, c);
  }
  return c;
}

const toHex = (r, g, b) => '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');

const mixed = new Map();
export function mix(a, b, t) {
  const key = a + b + t;
  let out = mixed.get(key);
  if (!out) {
    const [r1, g1, b1] = rgb(a);
    const [r2, g2, b2] = rgb(b);
    out = toHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
    mixed.set(key, out);
  }
  return out;
}

export const darker = (c, t = 0.32) => mix(c, '#3b1d3f', t);
export const lighter = (c, t = 0.42) => mix(c, '#fff8e0', t);
export const rgba = (hex, a) => { const [r, g, b] = rgb(hex); return `rgba(${r},${g},${b},${a})`; };

// While `tint.amount` > 0 every fill is pushed toward `tint.color` (hit flash, frozen look...).
export const tint = { amount: 0, color: '#ffffff' };
const fillOf = (c) => (tint.amount > 0 ? mix(c, tint.color, Math.round(tint.amount * 20) / 20) : c);

// ---- Transforms ----

// Runs `fn` in a local frame at (x, y), rotated by `rot` and scaled.
export function at(ctx, x, y, rot, fn, sx = 1, sy = sx) {
  ctx.save();
  ctx.translate(x, y);
  if (rot) ctx.rotate(rot);
  if (sx !== 1 || sy !== 1) ctx.scale(sx, sy);
  fn();
  ctx.restore();
}

// A local-space vector that points to the screen's lower right, `len` local units long, so
// shading stays lit from the top left under any rotation or mirror.
function lightOffset(ctx, len) {
  const m = ctx.getTransform();
  const det = m.a * m.d - m.b * m.c || 1;
  // Inverse of the linear part applied to the screen direction (1, 1).
  let x = (m.d - m.c) / det;
  let y = (m.a - m.b) / det;
  const l = Math.hypot(x, y) || 1;
  x = (x / l) * len;
  y = (y / l) * len;
  return [x, y];
}

// ---- Shapes ----

// Fills a shape built by `path(ctx)` in the house style.
// opts: ow (outline width, 0 for none), shade/light (colors or false), depth (crescent size),
// alpha, noLight (skip the highlight).
export function blob(ctx, path, color, opts = {}) {
  const { ow = 2.4, depth = 3.2, alpha = 1 } = opts;
  if (alpha <= 0) return;
  if (alpha < 1) ctx.globalAlpha *= alpha;
  ctx.beginPath();
  path(ctx);
  if (ow > 0) {
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.lineWidth = ow * 2;
    ctx.strokeStyle = opts.ink || INK;
    ctx.stroke();
  }
  ctx.fillStyle = fillOf(color);
  ctx.fill();

  const shade = opts.shade === false ? null : opts.shade || darker(color);
  const light = opts.light === false || opts.noLight ? null : opts.light || lighter(color);
  if (shade || light) {
    const [dx, dy] = lightOffset(ctx, depth);
    ctx.save();
    ctx.clip();
    if (shade) {
      // Everything outside the shape moved up-left by `depth` is the lower-right crescent.
      ctx.beginPath();
      path(ctx);
      ctx.translate(-dx, -dy);
      path(ctx);
      ctx.translate(dx, dy);
      ctx.fillStyle = fillOf(shade);
      ctx.fill('evenodd');
    }
    if (light) {
      const [lx, ly] = [dx * 0.55, dy * 0.55];
      ctx.beginPath();
      path(ctx);
      ctx.translate(lx, ly);
      path(ctx);
      ctx.translate(-lx, -ly);
      ctx.globalAlpha *= 0.85;
      ctx.fillStyle = fillOf(light);
      ctx.fill('evenodd');
    }
    ctx.restore();
  }
  if (alpha < 1) ctx.globalAlpha /= alpha;
}

// Just the outline (for details like mouths and seams).
export function line(ctx, path, color = INK, width = 2, alpha = 1) {
  ctx.beginPath();
  path(ctx);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.lineWidth = width;
  ctx.strokeStyle = color === INK ? INK : fillOf(color);
  const a = ctx.globalAlpha;
  ctx.globalAlpha = a * alpha;
  ctx.stroke();
  ctx.globalAlpha = a;
}

// Flat fill without outline or shading.
export function flat(ctx, path, color, alpha = 1) {
  ctx.beginPath();
  path(ctx);
  const a = ctx.globalAlpha;
  ctx.globalAlpha = a * alpha;
  ctx.fillStyle = fillOf(color);
  ctx.fill();
  ctx.globalAlpha = a;
}

// Soft radial glow (additive look without changing the composite mode).
export function glow(ctx, x, y, r, color, alpha = 0.6) {
  if (r <= 0 || alpha <= 0) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(color, alpha));
  g.addColorStop(0.45, rgba(color, alpha * 0.45));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

// Soft ground shadow.
export function shadow(ctx, x, y, w, alpha = 0.28) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, 0.28);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, w);
  g.addColorStop(0, `rgba(30,16,20,${alpha})`);
  g.addColorStop(0.7, `rgba(30,16,20,${alpha * 0.7})`);
  g.addColorStop(1, 'rgba(30,16,20,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, w, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ---- Path builders (call inside a path callback) ----

export const ellipse = (x, y, rx, ry, rot = 0) => (c) => c.ellipse(x, y, Math.abs(rx), Math.abs(ry), rot, 0, Math.PI * 2);
export const circle = (x, y, r) => ellipse(x, y, r, r);

export function roundRect(x, y, w, h, r) {
  return (c) => {
    const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    c.moveTo(x + rr, y);
    c.arcTo(x + w, y, x + w, y + h, rr);
    c.arcTo(x + w, y + h, x, y + h, rr);
    c.arcTo(x, y + h, x, y, rr);
    c.arcTo(x, y, x + w, y, rr);
    c.closePath();
  };
}

// Smooth closed shape through points (Catmull-Rom converted to Béziers).
export function smooth(points, tension = 1) {
  return (c) => {
    const n = points.length;
    const p = (i) => points[(i + n) % n];
    c.moveTo(p(0)[0], p(0)[1]);
    for (let i = 0; i < n; i++) {
      const [x0, y0] = p(i - 1);
      const [x1, y1] = p(i);
      const [x2, y2] = p(i + 1);
      const [x3, y3] = p(i + 2);
      const t = tension / 6;
      c.bezierCurveTo(x1 + (x2 - x0) * t, y1 + (y2 - y0) * t, x2 - (x3 - x1) * t, y2 - (y3 - y1) * t, x2, y2);
    }
    c.closePath();
  };
}

// Straight-edged closed polygon.
export function poly(points) {
  return (c) => {
    c.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) c.lineTo(points[i][0], points[i][1]);
    c.closePath();
  };
}

// A limb: a capsule from (x1, y1) to (x2, y2) with radii r1 and r2.
export function capsule(x1, y1, x2, y2, r1, r2 = r1) {
  return (c) => {
    const a = Math.atan2(y2 - y1, x2 - x1);
    c.arc(x1, y1, r1, a + Math.PI / 2, a - Math.PI / 2);
    c.arc(x2, y2, r2, a - Math.PI / 2, a + Math.PI / 2);
    c.closePath();
  };
}

// Five-pointed (or n-pointed) star.
export function star(x, y, r1, r2, n = 5, rot = -Math.PI / 2) {
  return (c) => {
    for (let i = 0; i < n * 2; i++) {
      const r = i % 2 ? r2 : r1;
      const a = rot + (i * Math.PI) / n;
      if (i === 0) c.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      else c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    c.closePath();
  };
}

// A scalloped blob (tree canopies, bushes, clouds, smoke): `n` bumps around an ellipse.
// `rand` (0..1 generator) jitters the bumps; pass a seeded one for stable shapes.
export function scallop(cx, cy, rx, ry, n = 8, bulge = 0.35, rand = () => 0.5) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + (rand() - 0.5) * 0.25;
    pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, 1 + (rand() - 0.5) * 0.5]);
  }
  return (c) => {
    c.moveTo(pts[0][0], pts[0][1]);
    for (let i = 0; i < n; i++) {
      const [x1, y1] = pts[i];
      const [x2, y2, j] = pts[(i + 1) % n];
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;
      const dx = mx - cx;
      const dy = my - cy;
      const d = Math.hypot(dx / rx, dy / ry) || 1;
      const push = 1 + bulge * j;
      c.quadraticCurveTo(cx + (dx / d) * push, cy + (dy / d) * push, x2, y2);
    }
    c.closePath();
  };
}

// Combines several path builders into one.
export const many = (...paths) => (c) => { for (const p of paths) p(c); };

// ---- Limbs ----

// A curling limb as a list of points from (x, y): `a` is the starting heading (0 = up,
// positive leans toward +x), `curl` the total turn along the way, `wave` sways it.
export function curlPts(x, y, a, len, curl, wave = 0, n = 9) {
  const pts = [];
  const step = len / n;
  let ang = a;
  for (let i = 0; i <= n; i++) {
    pts.push([x, y]);
    ang += curl / n + Math.sin(wave + i * 0.7) * 0.05;
    x += Math.sin(ang) * step;
    y -= Math.cos(ang) * step;
  }
  return pts;
}

// A tapered tube along `pts`, `r0` thick at the base and `r1` at the tip, with optional
// sucker dots along one side.
export function tube(ctx, pts, r0, r1, color, opts = {}) {
  const n = pts.length;
  const left = [];
  const right = [];
  for (let i = 0; i < n; i++) {
    const [x, y] = pts[i];
    const [ax, ay] = pts[Math.max(0, i - 1)];
    const [bx, by] = pts[Math.min(n - 1, i + 1)];
    const d = Math.hypot(bx - ax, by - ay) || 1;
    const nx = -(by - ay) / d;
    const ny = (bx - ax) / d;
    const r = r0 + (r1 - r0) * (i / (n - 1));
    left.push([x + nx * r, y + ny * r]);
    right.push([x - nx * r, y - ny * r]);
  }
  blob(ctx, smooth([...left, ...right.reverse()], 0.85), color, { depth: opts.depth ?? 2 });
  if (opts.sucker) {
    for (let i = 1; i < n - 1; i++) {
      const [x, y] = pts[i];
      const [px, py] = left[i];
      const r = r0 + (r1 - r0) * (i / (n - 1));
      flat(ctx, circle(x + (px - x) * 0.55, y + (py - y) * 0.55, r * 0.32), opts.sucker, 0.9);
    }
  }
}

// ---- Faces ----

// A cartoon eye: white, pupil looking toward (lx, ly) in -1..1, blink in 0..1 closes it.
export function eye(ctx, x, y, r, { lx = 0.3, ly = 0, blink = 0, pupil = INK, white = '#ffffff', angry = 0, ow = 1.6 } = {}) {
  const open = Math.max(0.08, 1 - blink);
  blob(ctx, ellipse(x, y, r * 0.86, r * open), white, { ow, depth: r * 0.25, shade: '#d8d2dc', noLight: true });
  if (open > 0.2) {
    flat(ctx, ellipse(x + lx * r * 0.32, y + ly * r * 0.3 * open, r * 0.48, r * 0.56 * open), pupil);
    flat(ctx, circle(x + lx * r * 0.32 - r * 0.18, y + ly * r * 0.3 * open - r * 0.2 * open, r * 0.17), '#ffffff');
  }
  if (angry) {
    // Brow slanting down toward the nose (the eye's left when facing right is the outer side).
    line(ctx, (c) => { c.moveTo(x - r * 1.0, y - r * (1.0 + 0.25 * angry)); c.lineTo(x + r * 0.9, y - r * (0.95 - 0.45 * angry)); }, INK, ow * 1.7);
  }
}
