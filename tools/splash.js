// Man Run's key art: the loading screen picture (img/splash.webp) and the menu backdrop
// (img/menu-bg.webp), painted once at full resolution with the game's own vector characters.
// It never runs in the game, so it can afford what a frame can't: tens of thousands of grass
// blades, blurred depth layers, bloom. tools/splash.html draws it and posts the files to
// tools/icon-server.js (`node tools/icon-server.js splash`).

import { drawAnimal, poseFor } from '../js/animals.js';
import { drawBox, drawBlock } from '../js/scenery.js';
import { drawSaw } from '../js/fx.js';
import { THEMES } from '../js/themes.js';
import { rng } from '../js/track.js';
import { blob, line, flat, glow, circle, ellipse, roundRect, scallop, star, INK, rgba, mix } from '../js/paint.js';

export const W = 2560;
export const H = 1280;
const TAU = Math.PI * 2;
const SUN = { x: 1280, y: 300 };
const TH = THEMES.forest;
const K = 4.4; // world units → pixels for the characters and props

// The footpath's center line (feet stand on it), its far and near edges.
const pathY = (x) => 965 + 16 * Math.sin(x * 0.0017 + 0.4) + 7 * Math.sin(x * 0.0043 + 2);
const FAR = -30;
const NEAR = 56;
const meadowTop = (x) => 852 + 9 * Math.sin(x * 0.0029 + 1.3) + 5 * Math.sin(x * 0.011);

// ---- Helpers ----

function canvas(w = W, h = H) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}
// Paints fn on its own full-size layer, optionally blurred, and returns the layer.
function layer(fn, blur = 0) {
  const c = canvas();
  fn(c.getContext('2d'));
  if (!blur) return c;
  const b = canvas();
  const g = b.getContext('2d');
  g.filter = `blur(${blur}px)`;
  g.drawImage(c, 0, 0);
  return b;
}
function noise1(seed, scale) {
  const R = rng(seed);
  const v = Array.from({ length: 1024 }, () => R());
  const at = (i) => v[((i % 1024) + 1024) % 1024];
  return (x) => {
    const t = x / scale;
    const i = Math.floor(t);
    const f = t - i;
    const u = f * f * (3 - 2 * f);
    return at(i) + (at(i + 1) - at(i)) * u;
  };
}
function fbm(seed) {
  const o = [noise1(seed, 150), noise1(seed + 1, 62), noise1(seed + 2, 25), noise1(seed + 3, 9)];
  return (x) => o[0](x) * 0.5 + o[1](x) * 0.28 + o[2](x) * 0.15 + o[3](x) * 0.07;
}
// A band following a height function: from f(x)+top to f(x)+bottom (bottom null: to the floor).
function band(g, f, top, bottom, x0 = -20, x1 = W + 20, step = 8) {
  g.beginPath();
  g.moveTo(x0, f(x0) + top);
  for (let x = x0; x <= x1; x += step) g.lineTo(x, f(x) + top);
  if (bottom === null) {
    g.lineTo(x1, H + 20);
    g.lineTo(x0, H + 20);
  } else {
    for (let x = x1; x >= x0; x -= step) g.lineTo(x, f(x) + bottom);
  }
  g.closePath();
}
// A grass blade: a tapered curved leaf from (x, y) up to h tall.
function blade(g, x, y, h, w, bend, color) {
  g.beginPath();
  g.moveTo(x - w / 2, y);
  g.quadraticCurveTo(x - w * 0.25 + bend * 0.45, y - h * 0.62, x + bend, y - h);
  g.quadraticCurveTo(x + w * 0.25 + bend * 0.45, y - h * 0.62, x + w / 2, y);
  g.closePath();
  g.fillStyle = color;
  g.fill();
}
// A small tuft of three stroked blades (the far field).
function tuft(g, x, y, h, color, w) {
  g.strokeStyle = color;
  g.lineWidth = w;
  g.lineCap = 'round';
  g.beginPath();
  for (const [dx, k, b] of [[-0.35, 0.78, -0.5], [0, 1, 0.08], [0.35, 0.72, 0.55]]) {
    const bx = x + dx * h * 0.4;
    g.moveTo(bx, y);
    g.quadraticCurveTo(bx + b * h * 0.12, y - h * k * 0.6, bx + b * h * 0.42, y - h * k);
  }
  g.stroke();
}
function daisy(g, x, y, r, petal = '#ffffff', heart = '#ffc93a', ow = 0) {
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU;
    g.beginPath();
    g.ellipse(x + Math.cos(a) * r * 0.62, y + Math.sin(a) * r * 0.42, r * 0.42, r * 0.24, a, 0, TAU);
    if (ow) { g.lineWidth = ow; g.strokeStyle = rgba(INK, 0.35); g.stroke(); }
    g.fillStyle = petal;
    g.fill();
  }
  g.beginPath();
  g.ellipse(x, y, r * 0.3, r * 0.22, 0, 0, TAU);
  g.fillStyle = heart;
  g.fill();
}

// ---- Sky ----

function paintSky(g) {
  const sky = g.createLinearGradient(0, 0, 0, 860);
  sky.addColorStop(0, '#2b74cf');
  sky.addColorStop(0.32, '#4d9ce6');
  sky.addColorStop(0.62, '#97cef3');
  sky.addColorStop(0.86, '#dff2fb');
  sky.addColorStop(1, '#fff2d2');
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H);
  // Warm light around the sun, reaching across the sky.
  const warm = g.createRadialGradient(SUN.x, SUN.y, 0, SUN.x, SUN.y, 1300);
  warm.addColorStop(0, 'rgba(255,247,214,0.95)');
  warm.addColorStop(0.18, 'rgba(255,240,196,0.55)');
  warm.addColorStop(0.5, 'rgba(255,236,190,0.16)');
  warm.addColorStop(1, 'rgba(255,236,190,0)');
  g.fillStyle = warm;
  g.fillRect(0, 0, W, H);
}

function paintRays(g) {
  g.globalCompositeOperation = 'lighter';
  const n = 22;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + 0.11;
    const half = i % 2 ? 0.035 : 0.06;
    const rg = g.createRadialGradient(SUN.x, SUN.y, 60, SUN.x, SUN.y, 1500);
    rg.addColorStop(0, `rgba(255,246,210,${i % 2 ? 0.1 : 0.17})`);
    rg.addColorStop(0.55, `rgba(255,246,210,${i % 2 ? 0.03 : 0.06})`);
    rg.addColorStop(1, 'rgba(255,246,210,0)');
    g.fillStyle = rg;
    g.beginPath();
    g.moveTo(SUN.x, SUN.y);
    g.arc(SUN.x, SUN.y, 1600, a - half, a + half);
    g.closePath();
    g.fill();
  }
  glow(g, SUN.x, SUN.y, 260, '#fff8dc', 0.75);
  flat(g, circle(SUN.x, SUN.y, 96), '#fffbea');
}

// A flat-bottomed cumulus, lit from the sun's side, painted on its own sprite.
function cloud(x, y, s, seed) {
  const R = rng(seed);
  const cw = Math.ceil(900 * s);
  const ch = Math.ceil(420 * s);
  const c = canvas(cw, ch);
  const g = c.getContext('2d');
  const ox = cw / 2;
  const oy = ch * 0.82;
  const puffs = [];
  for (let i = 0; i < 7; i++) {
    const u = i / 6 - 0.5;
    const r = (62 + R() * 34) * s * (1 - Math.abs(u) * 0.95);
    puffs.push([ox + u * 380 * s, oy - r * 0.5, r]);
  }
  for (let i = 0; i < 5; i++) {
    const u = (i + 0.5) / 5 - 0.5;
    const r = (58 + R() * 40) * s * (1 - Math.abs(u) * 1.1);
    puffs.push([ox + u * 280 * s + (R() - 0.5) * 30 * s, oy - 70 * s - r * 0.45 - (1 - Math.abs(u) * 2) * 30 * s, r]);
  }
  for (let i = 0; i < 6; i++) puffs.unshift([ox + (i / 5 - 0.5) * 330 * s, oy - 26 * s, (52 + R() * 14) * s]);
  g.save();
  const sx = SUN.x - x;
  const sy = SUN.y - y;
  const d = Math.hypot(sx, sy) || 1;
  for (const [px, py, r] of puffs) {
    const gr = g.createRadialGradient(px + (sx / d) * r * 0.35, py + (sy / d) * r * 0.2 - r * 0.25, r * 0.08, px, py, r);
    gr.addColorStop(0, '#ffffff');
    gr.addColorStop(0.62, '#f6fafd');
    gr.addColorStop(0.92, '#e2eef8');
    gr.addColorStop(1, '#d8e8f5');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(px, py, r, 0, TAU);
    g.fill();
  }
  // Shaded underside, melting into the sky at the bottom.
  g.globalCompositeOperation = 'source-atop';
  const sh = g.createLinearGradient(0, oy - 70 * s, 0, oy + 10 * s);
  sh.addColorStop(0, 'rgba(150,182,214,0)');
  sh.addColorStop(1, 'rgba(140,174,210,0.6)');
  g.fillStyle = sh;
  g.fillRect(0, 0, cw, ch);
  g.globalCompositeOperation = 'destination-in';
  const m = g.createLinearGradient(0, oy - 34 * s, 0, oy + 14 * s);
  m.addColorStop(0, 'rgba(0,0,0,1)');
  m.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = m;
  g.fillRect(0, 0, cw, ch);
  g.restore();
  return { c, x: x - ox, y: y - oy };
}

function paintClouds(g, list) {
  for (const [x, y, s, seed, blur, alpha] of list) {
    const cl = cloud(x, y, s, seed);
    g.save();
    if (blur) g.filter = `blur(${blur}px)`;
    g.globalAlpha = alpha;
    g.drawImage(cl.c, cl.x, cl.y);
    g.restore();
  }
}

// ---- Mountains and hills ----

function paintRange(g, { base, peaks, color, light, shadeColor, snowLine, haze, seed }) {
  const n = fbm(seed);
  const hAt = (x) => {
    let h = 0;
    for (const p of peaks) {
      const d = Math.abs(x - p.x) / p.w;
      if (d < 1) h = Math.max(h, p.h * Math.pow(1 - d, 1.3));
    }
    return h;
  };
  const step = 4;
  const ys = [];
  for (let x = -40; x <= W + 40; x += step) {
    const h = hAt(x);
    ys.push([x, base - h - (n(x) - 0.5) * (14 + h * 0.22)]);
  }
  const top = Math.min(...ys.map((p) => p[1]));
  // Body.
  g.beginPath();
  g.moveTo(-40, H);
  for (const [x, y] of ys) g.lineTo(x, y);
  g.lineTo(W + 40, H);
  g.closePath();
  const body = g.createLinearGradient(0, top, 0, base + 40);
  body.addColorStop(0, light);
  body.addColorStop(0.5, color);
  body.addColorStop(1, mix(color, haze, 0.55));
  g.fillStyle = body;
  g.fill();
  // Faces turned away from the sun are shaded; snow on the high parts.
  for (let i = 0; i < ys.length - 1; i++) {
    const [x, y] = ys[i];
    const slope = ys[i + 1][1] - y;
    const facesRight = slope > 0;
    const lit = x < SUN.x ? facesRight : !facesRight;
    const h = hAt(x);
    if (!lit && h > 10) {
      const sg = g.createLinearGradient(0, y, 0, base);
      sg.addColorStop(0, rgba(shadeColor, 0.42));
      sg.addColorStop(1, rgba(shadeColor, 0.04));
      g.fillStyle = sg;
      g.fillRect(x, y, step + 0.6, base - y + 30);
    }
    if (h > snowLine) {
      const depth = (h - snowLine) * 0.5 + (n(x * 3.1) - 0.5) * 26 + 6;
      if (depth > 0) {
        g.fillStyle = lit ? '#f7fbff' : '#c9d7ea';
        g.fillRect(x, y - 1, step + 0.6, depth);
      }
    }
  }
  // Haze toward the foot.
  const hz = g.createLinearGradient(0, base - 170, 0, base + 30);
  hz.addColorStop(0, rgba(haze, 0));
  hz.addColorStop(1, rgba(haze, 0.85));
  g.fillStyle = hz;
  g.fillRect(-40, base - 170, W + 80, H);
}

function roundTree(g, x, y, s, R, colors, ow) {
  const [leaf, shade, light, trunk] = colors;
  blob(g, roundRect(x - 4 * s, y - 30 * s, 8 * s, 32 * s, 3 * s), trunk, { ow: ow * 0.7, depth: 2 * s, ink: rgba(INK, 0.5) });
  blob(g, scallop(x, y - 46 * s, 30 * s, 26 * s, 8, 0.4, R), leaf, { ow, depth: 5 * s, shade, light, ink: rgba(INK, 0.55) });
  blob(g, scallop(x + 4 * s, y - 64 * s, 19 * s, 15 * s, 6, 0.4, R), mix(leaf, light, 0.25), { ow: ow * 0.8, depth: 3.5 * s, shade, light, ink: rgba(INK, 0.5) });
}
function pine(g, x, y, s, colors, ow) {
  const [leaf, shade, light, trunk] = colors;
  blob(g, roundRect(x - 4 * s, y - 16 * s, 8 * s, 18 * s, 2 * s), trunk, { ow: ow * 0.7, depth: 2 * s, ink: rgba(INK, 0.5) });
  for (let i = 0; i < 3; i++) {
    const ty = y - 12 * s - i * 22 * s;
    const w = (30 - i * 7) * s;
    blob(g, (c) => { c.moveTo(x - w, ty); c.quadraticCurveTo(x - w * 0.3, ty - 14 * s, x, ty - 38 * s); c.quadraticCurveTo(x + w * 0.3, ty - 14 * s, x + w, ty); c.quadraticCurveTo(x, ty + 5 * s, x - w, ty); c.closePath(); }, leaf, { ow, depth: 4 * s, shade, light, ink: rgba(INK, 0.55) });
  }
}

function paintHills(g) {
  // Far hills with small hazy trees.
  const f1 = (x) => 735 + 30 * Math.sin(x * 0.0021 + 1) + 16 * Math.sin(x * 0.0057 + 0.3);
  band(g, f1, 0, null);
  let gr = g.createLinearGradient(0, 690, 0, 860);
  gr.addColorStop(0, '#a6d888');
  gr.addColorStop(1, '#86c46a');
  g.fillStyle = gr;
  g.fill();
  const R = rng(91);
  for (let x = 20; x < W; x += 30 + R() * 50) {
    const y = f1(x) + 8 + R() * 30;
    const s = 0.55 + R() * 0.3;
    if (R() < 0.35) pine(g, x, y, s, ['#6aa86a', '#588f58', '#86c083', '#7a6a55'], 0);
    else roundTree(g, x, y, s, R, ['#74b661', '#5f9d50', '#93cf79', '#7a6a55'], 0);
  }
  g.fillStyle = 'rgba(214,236,248,0.42)';
  band(g, f1, -60, null);
  g.fill();
  // Nearer hills.
  const f2 = (x) => 790 + 22 * Math.sin(x * 0.0026 + 2.4) + 12 * Math.sin(x * 0.0071 + 1.1);
  band(g, f2, 0, null);
  gr = g.createLinearGradient(0, 760, 0, 880);
  gr.addColorStop(0, '#93d070');
  gr.addColorStop(1, '#6db552');
  g.fillStyle = gr;
  g.fill();
  g.fillStyle = 'rgba(214,236,248,0.18)';
  band(g, f2, 0, null);
  g.fill();
}

// The dense treeline right behind the meadow.
function paintTreeline(g) {
  const R = rng(57);
  for (let x = -40; x < W + 60; x += 34 + R() * 46) {
    const y = meadowTop(x) + 10 + R() * 8;
    const s = 1.2 + R() * 1.0;
    if (R() < 0.3) pine(g, x, y, s, ['#3f8a4d', '#2f6d3c', '#5aa564', '#6b4a32'], 2.2);
    else roundTree(g, x, y, s, R, ['#4a9a40', '#357d33', '#6dbb55', '#6b4a32'], 2.2);
  }
}

// ---- The meadow and the path ----

function paintBackMeadow(g) {
  band(g, meadowTop, 0, null);
  const gr = g.createLinearGradient(0, 840, 0, 960);
  gr.addColorStop(0, '#97d36c');
  gr.addColorStop(1, '#66b842');
  g.fillStyle = gr;
  g.fill();
  const R = rng(17);
  // Rows of small tufts, far to near.
  for (let y = 846; y < 990; y += 2.2) {
    const k = (y - 846) / 140;
    for (let x = -10; x < W + 10; x += 7 + R() * 9) {
      const top = meadowTop(x);
      if (y < top + 3 || y > pathY(x) + FAR + 6) continue;
      const h = 5 + k * 7 + R() * 4;
      const col = [mix('#7fc456', '#cfeefc', 0.3 - k * 0.3), '#5aa83a', '#a9dc78', '#4c9532'][Math.floor(R() * 4)];
      tuft(g, x, y, h, col, 1.3 + k * 0.6);
      if (R() < 0.012) daisy(g, x, y - h * 0.5, 3 + k * 2, ['#ffffff', '#ffd23f', '#ff8fb0'][Math.floor(R() * 3)]);
    }
  }
  // Bushes along the far edge of the path.
  const RB = rng(23);
  for (const bx of [320, 760, 1080, 1420, 1990, 2300]) {
    const by = pathY(bx) + FAR + 4;
    const s = 0.9 + RB() * 0.5;
    blob(g, scallop(bx, by - 22 * s, 64 * s, 30 * s, 8, 0.45, RB), '#4f9e3c', { ow: 2.6, depth: 6, shade: '#3a7f30', light: '#7cc65a', ink: rgba(INK, 0.6) });
    for (let i = 0; i < 3; i++) flat(g, circle(bx - 40 * s + RB() * 80 * s, by - 30 * s - RB() * 18 * s, 4), ['#ffffff', '#ff7d9a', '#ffd23f'][i]);
  }
}

function paintPath(g) {
  band(g, pathY, FAR, NEAR);
  const gr = g.createLinearGradient(0, 925, 0, 1030);
  gr.addColorStop(0, '#f8edc9');
  gr.addColorStop(0.5, '#ead6a2');
  gr.addColorStop(1, '#d8bc83');
  g.fillStyle = gr;
  g.fill();
  band(g, pathY, FAR, FAR + 12);
  g.fillStyle = 'rgba(255,250,232,0.55)';
  g.fill();
  band(g, pathY, NEAR - 12, NEAR);
  g.fillStyle = 'rgba(160,126,70,0.32)';
  g.fill();
  // Two soft wheel ruts.
  for (const off of [6, 32]) {
    g.beginPath();
    for (let x = -20; x <= W + 20; x += 8) (x === -20 ? g.moveTo : g.lineTo).call(g, x, pathY(x) + off);
    g.lineWidth = 8 + off * 0.12;
    g.strokeStyle = 'rgba(196,164,104,0.32)';
    g.stroke();
  }
  // Pebbles, bigger nearer.
  const R = rng(5);
  for (let i = 0; i < 1500; i++) {
    const x = R() * W;
    const dy = FAR + 4 + R() * (NEAR - FAR - 8);
    const y = pathY(x) + dy;
    const f = 0.55 + ((dy - FAR) / (NEAR - FAR)) * 0.95;
    const rx = (1.6 + R() * 3.6) * f;
    const ry = rx * 0.6;
    const col = ['#cdb37c', '#dcc690', '#bfa16f', '#efe2bd', '#c4ab78'][Math.floor(R() * 5)];
    flat(g, ellipse(x + 0.8, y + ry * 0.5, rx, ry), 'rgba(120,90,50,0.35)');
    flat(g, ellipse(x, y, rx, ry), col);
    flat(g, ellipse(x - rx * 0.3, y - ry * 0.35, rx * 0.4, ry * 0.3), 'rgba(255,255,240,0.55)');
  }
  // Grass spilling over both edges.
  const RG = rng(29);
  for (let x = -10; x < W + 10; x += 4 + RG() * 6) {
    tuft(g, x, pathY(x) + FAR + 3 + RG() * 3, 7 + RG() * 8, ['#6cbd45', '#8fd05f', '#559f39'][Math.floor(RG() * 3)], 1.6);
  }
  for (let x = -10; x < W + 10; x += 3 + RG() * 5) {
    const y = pathY(x) + NEAR + 4;
    const h = 12 + RG() * 14;
    blade(g, x, y, h, 3.4, (RG() - 0.4) * 8, ['#5cb43c', '#7dca4e', '#4a9d33'][Math.floor(RG() * 3)]);
  }
}

// The near field: blades grow and deepen toward the viewer, with flowers.
function paintNearField(g) {
  band(g, pathY, NEAR, null);
  const gr = g.createLinearGradient(0, 1000, 0, H);
  gr.addColorStop(0, '#5db63c');
  gr.addColorStop(0.45, '#409530');
  gr.addColorStop(1, '#255f20');
  g.fillStyle = gr;
  g.fill();
  const R = rng(41);
  const edge = (x) => pathY(x) + NEAR + 6;
  for (let y = 1000; y < H + 60; y += 1.6 + Math.max(0, y - 1000) * 0.018) {
    const k = Math.max(0, Math.min(1, (y - 1010) / 270));
    const h = 12 + k * k * 70 + k * 18;
    const w = 3 + k * 9;
    const gap = 3 + k * 10;
    for (let x = -30 + R() * gap; x < W + 30; x += gap * (0.6 + R() * 0.8)) {
      if (y < edge(x)) continue;
      const r = R();
      const col = r < 0.16 ? mix('#b4e47a', '#4f9a35', k * 0.8) : r < 0.55 ? mix('#6cc147', '#2a6e25', k) : mix('#4ea333', '#1d5219', k);
      blade(g, x, y + 4, h * (0.7 + R() * 0.6), w * (0.7 + R() * 0.5), (R() - 0.35) * h * 0.35, col);
      if (R() < 0.0035 + k * 0.004) {
        const fr = 5 + k * 18;
        const fy = y - h * (0.5 + R() * 0.4);
        if (R() < 0.6) daisy(g, x, fy, fr, '#ffffff', '#ffc93a', k > 0.4 ? 1.5 : 0);
        else daisy(g, x, fy, fr * 0.8, R() < 0.5 ? '#ffd23f' : '#ff7d9a', '#ffefb0', k > 0.4 ? 1.5 : 0);
      }
    }
  }
}

// Framing trees: a big round tree on the left, two pines on the right.
function paintBigTrees(g) {
  const R = rng(3);
  const x = 150;
  const y = meadowTop(150) + 40;
  const s = 6.2;
  blob(g, (c) => { c.moveTo(x - 9 * s, y + 4); c.quadraticCurveTo(x - 5 * s, y - 40 * s, x - 6 * s, y - 70 * s); c.lineTo(x + 6 * s, y - 70 * s); c.quadraticCurveTo(x + 5 * s, y - 40 * s, x + 10 * s, y + 4); c.closePath(); }, '#7a4f2e', { ow: 5, depth: 8, shade: '#5c3a22', light: '#9a6a42' });
  line(g, (c) => { c.moveTo(x - 2 * s, y - 40 * s); c.quadraticCurveTo(x - 14 * s, y - 52 * s, x - 22 * s, y - 60 * s); }, INK, 26);
  line(g, (c) => { c.moveTo(x - 2 * s, y - 40 * s); c.quadraticCurveTo(x - 14 * s, y - 52 * s, x - 22 * s, y - 60 * s); }, '#7a4f2e', 16);
  const leaf = ['#4a9e3f', '#357f35', '#78c75d'];
  blob(g, scallop(x + 6 * s, y - 86 * s, 62 * s, 40 * s, 10, 0.38, R), leaf[0], { ow: 5, depth: 16, shade: leaf[1], light: leaf[2] });
  blob(g, scallop(x - 26 * s, y - 104 * s, 40 * s, 30 * s, 8, 0.4, R), '#52a845', { ow: 4.6, depth: 14, shade: leaf[1], light: '#86d468' });
  blob(g, scallop(x + 18 * s, y - 116 * s, 44 * s, 30 * s, 8, 0.4, R), '#58ad48', { ow: 4.6, depth: 14, shade: '#3c8a3a', light: '#8fdc70' });
  // Leaf clusters for texture.
  for (let i = 0; i < 26; i++) {
    const lx = x - 50 * s + R() * 110 * s;
    const ly = y - 130 * s + R() * 60 * s;
    flat(g, scallop(lx, ly, 9 * s, 6 * s, 6, 0.4, R), i % 3 ? 'rgba(134,212,104,0.45)' : 'rgba(53,127,53,0.4)');
  }
  for (let i = 0; i < 7; i++) {
    const ax = x - 40 * s + R() * 90 * s;
    const ay = y - 120 * s + R() * 50 * s;
    blob(g, circle(ax, ay, 3.4 * s), '#e85d5d', { ow: 2.4, depth: 4, shade: '#b83a3a', light: '#ff9a8a' });
  }
  const pc = ['#3f7461', '#2c5848', '#5a9580', '#6b4a32'];
  pine(g, 2310, meadowTop(2310) + 46, 4.6, pc, 4);
  pine(g, 2470, meadowTop(2470) + 56, 5.6, pc, 4.4);
}

// ---- The cast and their props ----

function feet(x) { return pathY(x); }

function runner(g, id, x, y, pose, t, opts = {}) {
  g.save();
  g.translate(x, y);
  if (opts.rot) g.rotate(opts.rot);
  g.scale(K, K);
  drawAnimal(g, id, pose, t);
  g.restore();
}
// A soft one-color silhouette of a runner (the blue paw's afterimages).
function ghost(g, id, pose, x, y, rot, color, alpha) {
  const c = canvas(760, 760);
  const l = c.getContext('2d');
  l.translate(380, 560);
  if (rot) l.rotate(rot);
  l.scale(K, K);
  drawAnimal(l, id, pose, 0.35);
  l.setTransform(1, 0, 0, 1, 0, 0);
  l.globalCompositeOperation = 'source-in';
  l.fillStyle = color;
  l.fillRect(0, 0, 760, 760);
  g.save();
  g.globalAlpha = alpha;
  g.filter = 'blur(4px)';
  g.drawImage(c, x - 380, y - 560);
  g.restore();
}
// Speed streaks trailing behind a runner's body.
function streaks(g, x, top, bottom, n, R, len = 260) {
  g.save();
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < n; i++) {
    const y = top + R() * (bottom - top);
    const l = len * (0.5 + R() * 0.7);
    const x1 = x - 40 - R() * 50;
    const sg = g.createLinearGradient(x1 - l, 0, x1, 0);
    sg.addColorStop(0, 'rgba(255,255,255,0)');
    sg.addColorStop(1, `rgba(255,255,255,${0.25 + R() * 0.25})`);
    g.fillStyle = sg;
    g.fillRect(x1 - l, y, l, 3 + R() * 3);
  }
  g.restore();
}
function groundShadow(g, x, y, w, alpha = 0.3) {
  g.save();
  g.translate(x, y + 4);
  g.scale(1, 0.24);
  const sg = g.createRadialGradient(0, 0, 0, 0, 0, w);
  sg.addColorStop(0, `rgba(70,45,20,${alpha})`);
  sg.addColorStop(0.7, `rgba(70,45,20,${alpha * 0.6})`);
  sg.addColorStop(1, 'rgba(70,45,20,0)');
  g.fillStyle = sg;
  g.beginPath();
  g.arc(0, 0, w, 0, TAU);
  g.fill();
  g.restore();
}
function dust(g, x, y, n, R, dir = -1) {
  for (let i = 0; i < n; i++) {
    const px = x + dir * (10 + i * 26 + R() * 14);
    const py = y - 10 - R() * 18 - i * 3;
    const r = 18 + R() * 16 - i * 2;
    g.globalAlpha = 0.85 - i * 0.12;
    blob(g, circle(px, py, r), '#f3e6c8', { ow: 2, ink: rgba(INK, 0.25), depth: 5, shade: '#dccaa2', light: '#fffaf0' });
  }
  g.globalAlpha = 1;
}
function pawPrint(g, x, y, s) {
  flat(g, ellipse(x, y, 9 * s, 6 * s), '#7cc6ff');
  for (let i = 0; i < 3; i++) flat(g, circle(x - 8 * s + i * 8 * s, y - 9 * s, 3.4 * s), '#7cc6ff');
}

function paintCast(g) {
  const t = 0.35;
  const R = rng(77);
  const th = TH;
  // Props: the stone wall the bunny clears and the "?" box ahead.
  const wx = 1215;
  groundShadow(g, wx, feet(wx), 110, 0.35);
  g.save();
  g.translate(wx, feet(wx));
  g.scale(K, K);
  drawBlock(g, { x: -18, y: -42, w: 36, h: 42 }, th);
  g.restore();

  // Bear: just threw the saw, arm still pointing.
  const bx = 420;
  groundShadow(g, bx, feet(bx), 120);
  streaks(g, bx - 30, feet(bx) - 250, feet(bx) - 40, 7, R, 200);
  dust(g, bx - 40, feet(bx), 4, R);
  runner(g, 'bear', bx, feet(bx), poseFor({ id: 3, vx: 340, vy: 0, grounded: true, runPhase: 0.62, aim: 0.18 }, t), t);

  // The saw, flying with a blurred trail and sparks.
  const sx = 700;
  const sy = feet(sx) - 150;
  for (let k = 4; k >= 1; k--) {
    g.globalAlpha = 0.14 * (5 - k) / 4;
    g.save(); g.translate(sx - k * 34, sy + k * 3); g.scale(K, K); drawSaw(g, 0, 0, 21, -k * 0.5); g.restore();
  }
  g.globalAlpha = 1;
  g.save(); g.translate(sx, sy); g.scale(K, K); drawSaw(g, 0, 0, 21, 0.3); g.restore();
  g.save();
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 26; i++) {
    const a = Math.PI * (0.75 + R() * 0.5);
    const r0 = 90 + R() * 20;
    const len = 20 + R() * 50;
    g.strokeStyle = `rgba(255,${200 + R() * 55 | 0},90,${0.6 + R() * 0.4})`;
    g.lineWidth = 2 + R() * 3;
    g.beginPath();
    g.moveTo(sx + Math.cos(a) * r0, sy + Math.sin(a) * r0);
    g.lineTo(sx + Math.cos(a) * (r0 + len), sy + Math.sin(a) * (r0 + len));
    g.stroke();
  }
  glow(g, sx, sy, 150, '#fff0b0', 0.25);
  g.restore();

  // Panda: running, glancing back at the saw.
  const px = 930;
  groundShadow(g, px, feet(px), 115);
  streaks(g, px - 30, feet(px) - 250, feet(px) - 40, 7, R, 220);
  dust(g, px - 40, feet(px), 3, R);
  const pp = poseFor({ id: 1, vx: 340, vy: 0, grounded: true, runPhase: 0.18 }, t);
  pp.look = -0.7; pp.mouth = 2; pp.head = -0.08;
  runner(g, 'panda', px, feet(px), pp, t);

  // Bunny: sailing over the wall.
  const ux = 1240;
  groundShadow(g, ux, feet(ux) - 42 * K, 70, 0.25);
  const up = poseFor({ id: 2, vx: 340, vy: -300, grounded: false }, t);
  up.legF = -1.1; up.kneeF = 1.3; up.legB = 1.0; up.kneeB = 0.5; up.armF = -1.35; up.elbF = 0.25; up.armB = 1.0; up.elbB = 0.4; up.lean = 0.2; up.mouth = 1; up.look = 0.7;
  runner(g, 'bunny', ux, feet(wx) - 42 * K - 70, up, t, { rot: 0.12 });

  // The "?" box ahead, glowing.
  const qx = 1530;
  const qy = feet(qx) - 76 * K;
  g.save();
  g.globalCompositeOperation = 'lighter';
  glow(g, qx, qy, 220, '#ff8aa0', 0.35);
  g.restore();
  g.save(); g.translate(qx, qy); g.scale(K * 1.05, K * 1.05); drawBox(g, { x: 0, y: 0, id: 0 }, 0.9, 1); g.restore();
  g.save();
  g.globalCompositeOperation = 'lighter';
  for (const [dx, dy, r] of [[-95, -80, 26], [100, -60, 18], [70, 95, 14], [-110, 60, 12]]) {
    flat(g, star(qx + dx, qy + dy, r, r * 0.28, 4), 'rgba(255,240,200,0.9)');
  }
  g.restore();

  // Fox: leading, mid-leap on a blue paw dash, with blue afterimages and prints.
  const fx = 1930;
  const fy = feet(fx) - 175;
  for (let i = 0; i < 5; i++) pawPrint(g, 1560 + i * 72, feet(1560 + i * 72) + 10 + (i % 2) * 14, 1.1 + i * 0.05);
  groundShadow(g, fx, feet(fx), 80, 0.22);
  g.save();
  g.globalCompositeOperation = 'lighter';
  glow(g, fx, fy - 30 * K, 330, '#4aa8ff', 0.4);
  g.restore();
  const fp = poseFor({ id: 0, vx: 520, vy: -200, grounded: false, boost: 1 }, t);
  fp.legF = -1.0; fp.kneeF = 1.2; fp.legB = 0.95; fp.kneeB = 0.55; fp.armF = -1.45; fp.elbF = 0.2; fp.armB = 1.05; fp.elbB = 0.35; fp.lean = 0.24; fp.mouth = 1; fp.look = 0.75; fp.scarf = 1; fp.tail = -0.5;
  streaks(g, fx - 120, fy - 230, fy - 20, 9, R, 320);
  ghost(g, 'fox', fp, fx - 290, fy + 44, 0.08, '#2a78f0', 0.3);
  ghost(g, 'fox', fp, fx - 150, fy + 20, 0.08, '#2a78f0', 0.55);
  runner(g, 'fox', fx, fy, fp, t, { rot: 0.08 });
  g.save();
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 14; i++) {
    const a = R() * TAU;
    const r = 120 + R() * 140;
    flat(g, star(fx - 60 + Math.cos(a) * r, fy - 140 + Math.sin(a) * r * 0.7, 8 + R() * 12, 3, 4), 'rgba(170,220,255,0.85)');
  }
  g.restore();
}

// Leaves and petals drifting through the air.
function paintAir(g) {
  const R = rng(63);
  for (let i = 0; i < 22; i++) {
    const x = R() * W;
    const y = 420 + R() * 560;
    if (Math.abs(x - SUN.x) < 700 && y < 520) continue; // keep the logo clear
    const s = 0.8 + R() * 1.4;
    const col = ['#7cc65a', '#a8d84e', '#f2c14e', '#ff9ab8'][Math.floor(R() * 4)];
    g.save();
    g.translate(x, y);
    g.rotate(R() * TAU);
    blob(g, (c) => { c.moveTo(-12 * s, 0); c.quadraticCurveTo(0, -8 * s, 12 * s, 0); c.quadraticCurveTo(0, 8 * s, -12 * s, 0); c.closePath(); }, col, { ow: 1.8, depth: 2, ink: rgba(INK, 0.6) });
    g.restore();
  }
}

// Big out-of-focus blades in the corners (depth of field), calmer in the middle where the
// loading bar sits.
function paintForeground(g) {
  const R = rng(99);
  const cols = ['#1f4f22', '#2a6428', '#357a31', '#244f24'];
  for (let i = 0; i < 260; i++) {
    const x = R() * W;
    const side = Math.min(x, W - x) / (W / 2); // 0 at the edges, 1 in the middle
    const h = (60 + R() * 120) + (1 - side) * (1 - side) * 320 * R();
    blade(g, x, H + 30, h, 22 + R() * 30, (R() - 0.5) * h * 0.6, cols[Math.floor(R() * 4)]);
  }
  for (const [x, y, r] of [[120, 1120, 46], [2440, 1090, 52], [330, 1200, 34]]) daisy(g, x, y, r, '#ffffff', '#ffc93a');
}

// ---- The logo ----

function paintLogo(g, cx, cy) {
  const size = 300;
  const font = `${size}px "Lilita One", sans-serif`;
  const words = [
    { t: 'MAN', top: '#fff59a', mid: '#ffd23f', bot: '#ffa51f', side: '#c46a00' },
    { t: 'RUN', top: '#ffc27a', mid: '#ff8a2a', bot: '#f0541a', side: '#a8320c' },
  ];
  const lc = canvas(1700, 760);
  const l = lc.getContext('2d');
  l.font = font;
  l.textBaseline = 'alphabetic';
  l.lineJoin = 'round';
  const gap = 70;
  const widths = words.map((w) => l.measureText(w.t).width);
  const total = widths[0] + widths[1] + gap;
  const ox = 850 - total / 2;
  const oy = 470;
  const xs = [ox, ox + widths[0] + gap];
  const ext = 30;
  // Thick ink base, extruded down.
  for (let d = ext; d >= 0; d -= 2) {
    words.forEach((w, i) => { l.lineWidth = 40; l.strokeStyle = INK; l.strokeText(w.t, xs[i], oy + d); });
  }
  // Side faces.
  for (let d = ext - 4; d >= 2; d -= 2) {
    words.forEach((w, i) => { l.fillStyle = mix(w.side, w.bot, 1 - d / ext); l.fillText(w.t, xs[i], oy + d); });
  }
  // Front face.
  words.forEach((w, i) => {
    l.lineWidth = 20;
    l.strokeStyle = INK;
    l.strokeText(w.t, xs[i], oy);
    const fg = l.createLinearGradient(0, oy - size * 0.75, 0, oy);
    fg.addColorStop(0, w.top);
    fg.addColorStop(0.5, w.mid);
    fg.addColorStop(1, w.bot);
    l.fillStyle = fg;
    l.fillText(w.t, xs[i], oy);
  });
  // Gloss on the upper half of the letters, and a bright rim along their tops.
  const gc = canvas(1700, 760);
  const gl = gc.getContext('2d');
  gl.font = font;
  words.forEach((w, i) => gl.fillText(w.t, xs[i], oy));
  gl.globalCompositeOperation = 'source-in';
  const gg = gl.createLinearGradient(0, oy - size * 0.78, 0, oy - size * 0.3);
  gg.addColorStop(0, 'rgba(255,255,255,0.75)');
  gg.addColorStop(0.55, 'rgba(255,255,255,0.28)');
  gg.addColorStop(0.56, 'rgba(255,255,255,0)');
  gl.fillStyle = gg;
  gl.fillRect(0, 0, 1700, 760);
  l.drawImage(gc, 0, 0);
  const rc = canvas(1700, 760);
  const rl = rc.getContext('2d');
  rl.font = font;
  words.forEach((w, i) => rl.fillText(w.t, xs[i], oy));
  rl.globalCompositeOperation = 'destination-out';
  words.forEach((w, i) => rl.fillText(w.t, xs[i], oy + 9));
  rl.globalCompositeOperation = 'source-in';
  rl.fillStyle = 'rgba(255,255,255,0.8)';
  rl.fillRect(0, 0, 1700, 760);
  l.drawImage(rc, 0, 0);

  // Soft shadow, then the logo, tilted.
  g.save();
  g.translate(cx, cy);
  g.rotate(-0.055);
  g.save();
  g.filter = 'blur(22px)';
  g.globalAlpha = 0.4;
  g.drawImage(lc, -850 + 10, -470 + 150 + 40);
  g.restore();
  g.drawImage(lc, -850, -470 + 150);
  g.restore();
  // Sparkles on the letters.
  g.save();
  g.globalCompositeOperation = 'lighter';
  for (const [x, y, r] of [[cx - total / 2 + 30, cy - 110, 46], [cx + total / 2 - 10, cy - 150, 38], [cx + 40, cy + 70, 26]]) {
    glow(g, x, y, r * 2.4, '#fff8d0', 0.5);
    flat(g, star(x, y, r, r * 0.2, 4), '#ffffff');
  }
  g.restore();
}

// ---- Finishing ----

function bloomAndVignette(g, c) {
  const small = canvas(W / 4, H / 4);
  const s = small.getContext('2d');
  s.filter = 'blur(10px)';
  s.drawImage(c, 0, 0, W / 4, H / 4);
  g.save();
  g.globalCompositeOperation = 'screen';
  g.globalAlpha = 0.2;
  g.drawImage(small, 0, 0, W, H);
  g.restore();
  const v = g.createRadialGradient(W / 2, H * 0.45, H * 0.45, W / 2, H * 0.45, W * 0.62);
  v.addColorStop(0, 'rgba(30,14,40,0)');
  v.addColorStop(1, 'rgba(30,14,40,0.38)');
  g.fillStyle = v;
  g.fillRect(0, 0, W, H);
}

// Paints the key art. logo/cast false: the calm menu backdrop.
export function paintSplash(target, { logo = true, cast = true } = {}) {
  const g = target.getContext('2d');
  paintSky(g);
  g.drawImage(layer(paintRays, 10), 0, 0);
  g.drawImage(layer((l) => paintClouds(l, [
    [430, 300, 1.25, 4, 0, 1], [2150, 230, 1.1, 8, 0, 1], [820, 520, 0.6, 15, 1.5, 0.9],
    [1880, 520, 0.7, 16, 1.5, 0.9], [120, 560, 0.5, 23, 2, 0.8], [2470, 580, 0.45, 42, 2, 0.8],
  ])), 0, 0);
  g.drawImage(layer((l) => paintRange(l, {
    base: 770, seed: 7, color: '#93b8dc', light: '#b7d2ec', shadeColor: '#5d7fb0', haze: '#d6ecf8', snowLine: 150,
    peaks: [{ x: 160, w: 420, h: 250 }, { x: 640, w: 380, h: 320 }, { x: 1060, w: 300, h: 210 }, { x: 1520, w: 360, h: 280 }, { x: 1980, w: 420, h: 330 }, { x: 2420, w: 360, h: 240 }],
  }), 2.4), 0, 0);
  g.drawImage(layer((l) => paintRange(l, {
    base: 805, seed: 19, color: '#7aa6cc', light: '#9cc0e0', shadeColor: '#4a6f9c', haze: '#d2e9f5', snowLine: 120,
    peaks: [{ x: 380, w: 300, h: 150 }, { x: 900, w: 280, h: 175 }, { x: 1340, w: 260, h: 120 }, { x: 1760, w: 300, h: 165 }, { x: 2260, w: 320, h: 185 }],
  }), 1.3), 0, 0);
  g.drawImage(layer(paintHills, 0.8), 0, 0);
  g.drawImage(layer(paintTreeline, 0.4), 0, 0);
  paintBackMeadow(g);
  paintBigTrees(g);
  paintPath(g);
  paintNearField(g);
  if (cast) paintCast(g);
  if (cast) paintAir(g);
  g.drawImage(layer(paintForeground, 9), 0, 0);
  if (logo) paintLogo(g, SUN.x, 255);
  bloomAndVignette(g, target);
}
