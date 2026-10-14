// Builds a race track from a seed: rolling ground with hills, valleys and bumps, plus pits,
// cliffs, walls, spikes, earthen ledges, mud, speed pads and "?" boxes. Pure data, no drawing.
//
// Solids: { x, y, w, h, kind } with y the top surface (y grows downward).
//   kind 'ground' — a strip of terrain with a height profile `ys` sampled every `dx` units from x
//     (y is its highest point); it reaches DEEP below. Inside a strip every slope is walkable;
//     the strip's ends are cliffs/walls.
//   kind 'block' — a stone wall standing on the ground.
//   kind 'plat'  — a one-way ledge (land on it from above, pass through from below and the sides).
//   kind 'roof'  — a low rock overhang 32 units above the ground: only a ducking runner fits under.

import { THEMES } from './themes.js';

export const DEEP = 900;
export const DX = 8;
const BUCKET = 256;
const MAX_SLOPE = 0.5;

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const smoothstep = (t) => t * t * (3 - 2 * t);

// Height of a solid's top at x (clamped to the solid's ends).
export function surfaceAt(s, x) {
  if (!s.ys) return s.y;
  const f = (Math.min(s.w, Math.max(0, x - s.x))) / s.dx;
  const i = Math.floor(f);
  const ys = s.ys;
  if (i >= ys.length - 1) return ys[ys.length - 1];
  const k = f - i;
  return ys[i] + (ys[i + 1] - ys[i]) * k;
}

// Slope (dy/dx, negative = uphill to the right) of a ground strip at x.
export function slopeAt(s, x) {
  if (!s || !s.ys) return 0;
  const i = Math.min(s.ys.length - 2, Math.max(0, Math.floor((x - s.x) / s.dx)));
  return (s.ys[i + 1] - s.ys[i]) / s.dx;
}

export function buildTrack(seed, { length = 15000, theme = 'forest' } = {}) {
  const R = rng(seed);
  const rnd = (a, b) => a + R() * (b - a);
  const pick = (arr) => arr[Math.floor(R() * arr.length)];
  const T = { seed, theme, solids: [], spikes: [], boxes: [], pads: [], mud: [], respawns: [], deco: [], startX: 160, finishX: 0, end: 0, lowest: 0, highest: 0 };
  let x = -700;
  let gy = 0;
  let piece = null;

  // ---- Terrain primitives ----
  const startPiece = () => { piece = { kind: 'ground', x, dx: DX, ys: [gy], h: DEEP }; };
  const endPiece = () => {
    if (!piece) return;
    if (piece.ys.length < 2) piece.ys.push(gy);
    piece.w = (piece.ys.length - 1) * DX;
    piece.y = Math.min(...piece.ys);
    T.solids.push(piece);
    piece = null;
  };
  // Runs `len` units while the ground eases from the current height to `toY`.
  const run = (len, toY = gy, shape = smoothstep) => {
    if (!piece) startPiece();
    const minLen = Math.abs(toY - gy) * 1.5 / MAX_SLOPE;
    const n = Math.max(1, Math.round(Math.max(len, minLen) / DX));
    const y0 = gy;
    for (let i = 1; i <= n; i++) piece.ys.push(Math.round((y0 + (toY - y0) * shape(i / n)) * 10) / 10);
    x += n * DX;
    gy = toY;
  };
  // Rolling bumps that end at the starting height.
  const bumps = (len, amp, waves) => {
    if (!piece) startPiece();
    const n = Math.max(1, Math.round(len / DX));
    for (let i = 1; i <= n; i++) {
      const s = Math.sin((Math.PI * waves * i) / n);
      piece.ys.push(Math.round((gy - amp * s * s) * 10) / 10);
    }
    x += n * DX;
  };
  const gap = (w) => { endPiece(); x += Math.round(w); startPiece(); };
  const cliff = (dy) => { endPiece(); gy += Math.round(dy); startPiece(); };
  const gapDown = (w, dy) => { endPiece(); x += Math.round(w); gy += Math.round(dy); startPiece(); };

  const respawn = () => T.respawns.push({ x: x + 30, y: gy });
  const box = (bx, by) => T.boxes.push({ x: bx, y: by, taken: {}, id: T.boxes.length });
  const deco = (kind, dx = x, dy = null) => T.deco.push({ kind, x: dx, y: dy, r: R() });
  const decoSet = (THEMES[theme] || THEMES.forest).decoSet;
  const sprinkle = (from, to) => {
    for (let p = from + rnd(20, 80); p < to - 30; p += rnd(60, 170)) deco(pick(decoSet), p);
  };
  // One box per spot (boxes are per runner, so everybody gets this one).
  const boxRow = (bx) => box(bx + 40, null);
  const clampY = (y) => Math.max(-320, Math.min(220, y));

  // ---- Segments (d: difficulty 0..1 along the track) ----
  const SEG = {
    flat() {
      respawn();
      const s = x;
      run(rnd(160, 300));
      sprinkle(s, x);
      if (R() < 0.35) deco('tree', s + rnd(40, 140));
    },
    rolling() {
      respawn();
      const s = x;
      run(60);
      bumps(rnd(420, 640), rnd(22, 40), R() < 0.5 ? 2 : 3);
      run(60);
      sprinkle(s, x);
    },
    hillUp(d) {
      respawn();
      const s = x;
      run(80);
      run(rnd(260, 380), clampY(gy - rnd(70, 140)));
      run(rnd(80, 160));
      sprinkle(s, x);
      if (R() < 0.4) deco('tree', x - 60);
    },
    hillDown() {
      respawn();
      const s = x;
      run(80);
      run(rnd(260, 380), clampY(gy + rnd(70, 140)));
      run(rnd(80, 160));
      sprinkle(s, x);
    },
    valley() {
      respawn();
      const s = x;
      const y0 = gy;
      run(60);
      run(rnd(240, 320), clampY(gy + rnd(60, 110)));
      const b = x;
      run(rnd(60, 120));
      if (R() < 0.6) boxRow(b - 20);
      run(rnd(240, 320), y0);
      run(60);
      sprinkle(s, x);
    },
    hillPit(d) {
      // Run down a slope straight into a pit: jump at full speed.
      respawn();
      run(80);
      run(rnd(240, 300), clampY(gy + rnd(50, 90)));
      run(rnd(30, 60));
      gap(rnd(90, 110 + d * 32));
      run(rnd(160, 220));
    },
    pit(d) {
      respawn();
      const s = x;
      run(rnd(120, 180));
      sprinkle(s, x - 40);
      gap(rnd(80, 100 + d * 45)); // jumps cost speed: 145 is the widest
      run(rnd(140, 200));
    },
    doublePit(d) {
      respawn();
      run(rnd(110, 150));
      gap(rnd(80, 100 + d * 25));
      run(rnd(70, 110));
      gap(rnd(80, 100 + d * 25));
      run(rnd(140, 180));
    },
    stepUp(d) {
      if (gy < -240) return SEG.stepDown(d);
      respawn();
      run(rnd(110, 160));
      cliff(-rnd(45, 68 + d * 14));
      const s = x;
      run(rnd(200, 300));
      sprinkle(s, x);
    },
    stepDown(d) {
      if (gy > 150) return SEG.stepUp(d);
      respawn();
      run(rnd(140, 220));
      cliff(rnd(60, 130));
      const s = x;
      run(rnd(200, 300));
      sprinkle(s, x);
    },
    stairs(d) {
      if (gy < -200) return SEG.stepDown(d);
      respawn();
      run(rnd(100, 140));
      const n = R() < 0.5 ? 2 : 3;
      for (let i = 0; i < n; i++) { cliff(-44); run(rnd(100, 140)); }
      run(rnd(100, 180));
    },
    wall(d) {
      respawn();
      run(rnd(140, 200));
      const w = Math.round(rnd(46, 86));
      const h = Math.round(rnd(48, 68 + d * 20));
      T.solids.push({ x, y: gy - h, w, h, kind: 'block' });
      run(w);
      run(rnd(220, 300));
      sprinkle(x - 200, x);
    },
    spikes(d) {
      respawn();
      const s = x;
      run(rnd(140, 200));
      sprinkle(s, x - 30);
      const w = Math.round(rnd(48, 70 + d * 40));
      T.spikes.push({ x, y: gy, w });
      run(w);
      run(rnd(180, 260));
    },
    wallSpikes() {
      respawn();
      run(rnd(160, 200));
      const w = 46;
      const h = Math.round(rnd(44, 56));
      T.solids.push({ x, y: gy - h, w, h, kind: 'block' });
      run(w);
      run(rnd(130, 160));
      const sw = Math.round(rnd(50, 70));
      T.spikes.push({ x, y: gy, w: sw });
      run(sw);
      run(rnd(200, 260));
    },
    island(d) {
      respawn();
      run(rnd(120, 160));
      const pw = rnd(250, 300 + d * 40);
      const pl = rnd(100, 130);
      const px = x + (pw - pl) / 2;
      const py = gy - rnd(30, 60);
      T.solids.push({ x: px, y: py, w: pl, h: 18, kind: 'plat' });
      if (R() < 0.5) box(px + pl / 2, py - 34);
      gap(pw);
      run(rnd(160, 220));
    },
    upper() {
      // Lower route with spikes or mud, an earthen ledge route above with boxes.
      respawn();
      run(rnd(120, 160));
      const len = rnd(420, 560);
      const s = x;
      const py = gy - rnd(100, 112);
      let px = s + 40;
      const parts = R() < 0.5 ? 2 : 3;
      const pl = (len - 60) / parts - 40;
      for (let i = 0; i < parts; i++) {
        T.solids.push({ x: px, y: py, w: pl, h: 18, kind: 'plat' });
        px += pl + 40;
      }
      box(s + len / 2, py - 34);
      if (R() < 0.5) T.spikes.push({ x: s + len * 0.35, y: gy, w: Math.round(rnd(50, 70)) });
      else T.mud.push({ x: s + 60, y: gy, w: len - 120 });
      run(len);
      run(rnd(160, 220));
    },
    mud() {
      respawn();
      run(rnd(100, 140));
      const w = rnd(200, 320);
      T.mud.push({ x, y: gy, w });
      run(w);
      run(rnd(120, 180));
    },
    pad() {
      respawn();
      const s = x;
      run(rnd(120, 180));
      T.pads.push({ x, y: gy, w: 70 });
      run(80);
      // A boosted run over rolling ground feels great.
      bumps(rnd(360, 480), rnd(18, 30), 2);
      sprinkle(s, x);
    },
    padJump(d) {
      respawn();
      run(rnd(140, 180));
      T.pads.push({ x, y: gy, w: 70 });
      run(rnd(110, 130));
      gap(rnd(150, 170 + d * 20));
      run(rnd(200, 260));
    },
    drop() {
      if (gy > 110) return SEG.hillUp();
      respawn();
      run(rnd(120, 160));
      gapDown(rnd(60, 90), rnd(110, 150));
      run(rnd(260, 340));
    },
    duck() {
      // A low rock overhang: too tall to jump over, slide under it.
      respawn();
      run(rnd(160, 220));
      const w = Math.round(rnd(90, 170));
      T.solids.push({ x, y: gy - 32 - 130, w, h: 130, kind: 'roof' });
      run(w);
      run(rnd(160, 220));
    },
    boxes() {
      respawn();
      const s = x;
      run(rnd(140, 180));
      boxRow(x);
      run(rnd(300, 380));
      sprinkle(s, s + 100);
    },
  };

  const easy = ['flat', 'rolling', 'rolling', 'hillUp', 'hillDown', 'hillUp', 'hillDown', 'valley', 'pit', 'stepUp', 'stepDown', 'wall', 'spikes', 'boxes', 'pad', 'mud', 'duck'];
  const hard = ['pit', 'doublePit', 'hillPit', 'stairs', 'wall', 'wallSpikes', 'spikes', 'island', 'upper', 'padJump', 'drop', 'hillUp', 'hillDown', 'valley', 'rolling', 'mud', 'duck'];

  // Start line area (the ground reaches back off screen behind the start).
  run(700);
  respawn();
  run(620);
  sprinkle(40, 560);
  deco('startSign', 120);
  deco('tree', 360);

  let lastBox = x;
  let prev = '';
  while (x < length) {
    const d = Math.min(1, x / length);
    if (x - lastBox > 800) {
      SEG.boxes(d);
      lastBox = x;
      prev = 'boxes';
      continue;
    }
    let name;
    do { name = pick(R() < 0.75 - d * 0.5 ? easy : hard); } while (name === prev || (name === 'boxes' && x - lastBox < 500));
    if (name === 'boxes' || name === 'upper' || name === 'island' || name === 'valley') lastBox = x;
    SEG[name](d);
    prev = name;
  }

  // Finish line on flat ground, then a run-out.
  respawn();
  run(260);
  T.finishX = x;
  run(1400);
  sprinkle(T.finishX + 120, x - 100);
  endPiece();
  T.end = x;
  undulate(T, R);

  for (const s of T.solids) {
    if (s.kind === 'ground') {
      T.lowest = Math.max(T.lowest, ...s.ys);
      T.highest = Math.min(T.highest, s.y);
    }
  }
  index(T);
  // Things placed by x only get their height from the finished ground.
  for (const p of T.respawns) p.y = floorBelow(T, p.x, -Infinity);
  for (const b of T.boxes) if (b.y === null) b.y = floorBelow(T, b.x, -Infinity) - 34;
  for (const d of T.deco) {
    const g = groundAt(T, d.x);
    d.y = g ? surfaceAt(g, d.x) : Infinity;
    d.slope = slopeAt(g, d.x);
  }
  const blocks = T.solids.filter((s) => s.kind === 'block' || s.kind === 'roof');
  T.deco = T.deco.filter((d) => d.y < Infinity && Math.abs(d.slope) < 0.35 && !blocks.some((b) => d.x > b.x - 24 && d.x < b.x + b.w + 24) && !T.spikes.some((s) => d.x > s.x - 20 && d.x < s.x + s.w + 20) && !T.mud.some((m) => d.x > m.x - 10 && d.x < m.x + m.w + 10) && !T.pads.some((p) => d.x > p.x - 10 && d.x < p.x + p.w + 10));
  T.back = backProfile(T, R);
  return T;
}

// Lays a gentle, never-ending roll over all the ground so the lane always curves a little,
// except where things need flat ground (spikes, mud, pads, walls, under ledges, cliff edges,
// start and finish), which keep their designed heights.
function undulate(T, R) {
  const zones = [[-1000, 700], [T.finishX - 300, T.end + 10]];
  for (const sp of T.spikes) zones.push([sp.x, sp.x + sp.w]);
  for (const m of T.mud) zones.push([m.x, m.x + m.w]);
  for (const p of T.pads) zones.push([p.x - 20, p.x + p.w + 20]);
  for (const s of T.solids) {
    if (s.kind === 'roof') zones.push([s.x - 70, s.x + s.w + 10]); // flat for the warning sign too
    else if (s.kind === 'block' || s.kind === 'plat') zones.push([s.x - 10, s.x + s.w + 10]);
    else { zones.push([s.x, s.x + 50]); zones.push([s.x + s.w - 50, s.x + s.w]); }
  }
  const p1 = R() * 10;
  const p2 = R() * 10;
  const len = T.finishX || 1;
  for (const s of T.solids) {
    if (!s.ys) continue;
    for (let i = 0; i < s.ys.length; i++) {
      const x = s.x + i * s.dx;
      let d = Infinity;
      for (const [a, b] of zones) {
        const dz = x < a ? a - x : x > b ? x - b : 0;
        if (dz < d) d = dz;
        if (d === 0) break;
      }
      if (d === 0) continue;
      const m = smoothstep(Math.min(1, d / 90));
      const amp = 18 + 14 * Math.min(1, x / len);
      const u = amp * Math.sin(x / 300 + p1) + amp * 0.45 * Math.sin(x / 140 + p2);
      s.ys[i] = Math.round((s.ys[i] + u * m) * 10) / 10;
    }
    s.y = Math.min(...s.ys);
  }
}

// Spatial buckets so collision queries only look at nearby pieces.
function index(T) {
  T.buckets = new Map();
  T.solids.forEach((s, i) => {
    s.i = i;
    for (let b = Math.floor(s.x / BUCKET); b <= Math.floor((s.x + s.w) / BUCKET); b++) {
      if (!T.buckets.has(b)) T.buckets.set(b, []);
      T.buckets.get(b).push(s);
    }
  });
}

// Solids overlapping the x range [x0, x1].
export function solidsNear(T, x0, x1) {
  const b0 = Math.floor(x0 / BUCKET);
  const b1 = Math.floor(x1 / BUCKET);
  if (b0 === b1) return T.buckets.get(b0) || [];
  const out = [];
  for (let b = b0; b <= b1; b++) {
    for (const s of T.buckets.get(b) || []) if (!out.includes(s)) out.push(s);
  }
  return out;
}

// Top of the highest solid under x at or below y (Infinity over a pit).
export function floorBelow(T, x, y) {
  let best = Infinity;
  for (const s of solidsNear(T, x, x)) {
    if (x < s.x || x > s.x + s.w) continue;
    const top = surfaceAt(s, x);
    if (top >= y - 0.5 && top < best) best = top;
  }
  return best;
}

// The ground strip under x (or null over a pit).
export function groundAt(T, x) {
  for (const s of solidsNear(T, x, x)) if (s.kind === 'ground' && x >= s.x && x <= s.x + s.w) return s;
  return null;
}

// Last respawn point at or behind x.
export function respawnAt(T, x) {
  let r = T.respawns[0];
  for (const p of T.respawns) {
    if (p.x <= x) r = p;
    else break;
  }
  return r;
}

// The dark back wall of earth behind the running lane: a smoothed, raised copy of the ground
// line (continuous over pits), sampled every 16 units. It is purely decorative.
function backProfile(T, R) {
  const step = 16;
  const x0 = T.solids.reduce((m, s) => Math.min(m, s.x), 0);
  const n = Math.ceil((T.end - x0) / step) + 1;
  const raw = new Float32Array(n);
  let last = 0;
  for (let i = 0; i < n; i++) {
    const y = floorBelow(T, x0 + i * step, -Infinity);
    raw[i] = y < Infinity ? y : NaN;
    if (!Number.isNaN(raw[i])) last = raw[i];
  }
  // Fill pits by joining their edges.
  for (let i = 0; i < n; i++) {
    if (!Number.isNaN(raw[i])) continue;
    let j = i;
    while (j < n && Number.isNaN(raw[j])) j++;
    const a = i > 0 ? raw[i - 1] : last;
    const b = j < n ? raw[j] : a;
    for (let k = i; k < j; k++) raw[k] = a + (b - a) * ((k - i + 1) / (j - i + 1));
    i = j;
  }
  // Highest ground within ±120, then smoothed.
  const win = Math.round(120 / step);
  let env = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let m = Infinity;
    for (let k = Math.max(0, i - win); k <= Math.min(n - 1, i + win); k++) m = Math.min(m, raw[k]);
    env[i] = m;
  }
  for (let pass = 0; pass < 3; pass++) {
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let s = 0;
      let c = 0;
      for (let k = Math.max(0, i - 5); k <= Math.min(n - 1, i + 5); k++) { s += env[k]; c++; }
      out[i] = s / c;
    }
    env = out;
  }
  const p1 = R() * 10;
  const p2 = R() * 10;
  const ys = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const xx = x0 + i * step;
    const k = 0.35 + 0.4 * Math.sin(xx / 610 + p1) + 0.25 * Math.sin(xx / 270 + p2);
    ys[i] = env[i] - (6 + 120 * Math.max(0, k));
  }
  return { x0, step, ys };
}

export function backAt(T, x) {
  const B = T.back;
  const f = (x - B.x0) / B.step;
  const i = Math.max(0, Math.min(B.ys.length - 2, Math.floor(f)));
  const k = Math.max(0, Math.min(1, f - i));
  return B.ys[i] + (B.ys[i + 1] - B.ys[i]) * k;
}
