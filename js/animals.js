// The runners: chibi animals with big heads, drawn in the house style from paint.js.
// Origin between the feet, facing +x, up is -y. About 62 units tall.
// poseFor(runner, time) turns race state into a pose; drawAnimal draws it.

import { blob, line, flat, at, eye, ellipse, circle, smooth, poly, roundRect, INK, darker, lighter, tint } from './paint.js';
import { ANIMALS } from './config.js';

export const ANIMAL = Object.fromEntries(ANIMALS.map((a) => [a.id, a]));

const TAU = Math.PI * 2;
const sin = Math.sin;
const cos = Math.cos;

// ---- Pose ----

export function poseFor(r, t) {
  const p = {
    legF: 0, legB: 0, kneeF: 0, kneeB: 0, armF: 0, armB: 0, lean: 0, bob: 0, sq: 1,
    head: 0, blink: 0, mouth: 0, look: 0.4, tail: 0, scarf: 0, dizzy: 0, zap: 0, caught: 0, cheer: 0, slide: 0,
  };
  const blinkT = (t * 0.7 + r.id * 0.31) % 3.1;
  p.blink = blinkT < 0.12 ? 1 - Math.abs(blinkT - 0.06) / 0.06 : 0;
  const speed = Math.abs(r.vx);
  p.scarf = Math.min(1, speed / 320);

  if (r.stun > 0) {
    const k = r.stunKind;
    if (k === 'trap') {
      // Hopping on one leg, the other stuck in the trap.
      const h = Math.abs(sin(t * 9));
      p.caught = 1;
      p.legF = -0.25; p.legB = 0.5; p.kneeB = 0.6;
      p.bob = -h * 4; p.armF = -2.2 + sin(t * 18) * 0.4; p.armB = -2.4 - sin(t * 18) * 0.4;
      p.mouth = 2; p.lean = -0.1; p.look = -0.6;
      return p;
    }
    if (k === 'lightning') {
      p.zap = 1;
      p.armF = -2.6 + sin(t * 50) * 0.3; p.armB = -2.8 + cos(t * 47) * 0.3;
      p.legF = -0.3 + sin(t * 40) * 0.2; p.legB = 0.3 - sin(t * 40) * 0.2;
      p.mouth = 2; p.blink = 0; p.sq = 1 + sin(t * 60) * 0.04;
      return p;
    }
    // Dazed: sitting back with stars.
    p.dizzy = 1;
    p.legF = -1.35; p.legB = -1.15; p.kneeF = 0.2; p.kneeB = 0.4;
    p.bob = 12; p.lean = -0.18; p.armF = 0.6 + sin(t * 4) * 0.2; p.armB = 0.9;
    p.mouth = 3; p.head = sin(t * 5) * 0.12; p.sq = 0.96;
    return p;
  }

  if (r.cheer > 0 || (r.finished && speed < 20)) {
    const j = Math.abs(sin(t * 7));
    p.cheer = 1;
    p.bob = -j * 10; p.armF = -2.7 + sin(t * 14) * 0.2; p.armB = -2.5 - sin(t * 14) * 0.2;
    p.legF = 0.25 * j; p.legB = -0.25 * j; p.mouth = 1; p.tail = sin(t * 14) * 0.5;
    return p;
  }

  if (r.climb) {
    // Climbing: hands over hands, feet pushing, looking up at the top.
    const ph = (r.climbPhase || 0) * TAU;
    const s = Math.sin(ph);
    p.armF = -2.9 + s * 0.45; p.armB = -2.6 - s * 0.45; p.elbF = 0.5; p.elbB = 0.5;
    p.legF = -0.7 + s * 0.5; p.kneeF = 1.2; p.legB = -0.3 - s * 0.5; p.kneeB = 1.3;
    p.lean = 0.2; p.look = 0.6; p.mouth = 2; p.head = -0.2; p.tail = -0.3; p.bob = -Math.abs(s) * 2;
    return p;
  }

  if (r.duck) {
    if (r.grounded) {
      // Baseball slide: lying back, feet first, arms trailing.
      p.slide = 1;
      p.legF = -1.25; p.kneeF = 0.15; p.legB = -0.95; p.kneeB = 0.45;
      p.armF = -2.3 + Math.sin(t * 20) * 0.1; p.armB = -2.6; p.elbF = 0.3; p.elbB = 0.3;
      p.mouth = 1; p.look = 0.7; p.tail = -0.6; p.head = 0.35; p.scarf = 1;
    } else {
      // Tucked into a ball, dropping fast.
      p.legF = -1.5; p.kneeF = 2.3; p.legB = -1.1; p.kneeB = 2.2;
      p.armF = -0.7; p.armB = -0.4; p.elbF = 1.7; p.elbB = 1.6;
      p.bob = -4; p.mouth = 2; p.sq = 0.92; p.tail = -0.5;
    }
    return p;
  }

  if (!r.grounded) {
    if (r.vy < 0) {
      // Rising: knees tucked, arms up and back.
      p.legF = -0.9; p.kneeF = 1.1; p.legB = 0.7; p.kneeB = 0.9;
      p.armF = -2.3; p.armB = -0.9; p.lean = 0.1; p.mouth = 1; p.sq = 1.05;
    } else {
      // Falling: legs reach for the ground, arms flail.
      const f = Math.min(1, r.vy / 700);
      p.legF = -0.5 + f * 0.3; p.kneeF = 0.3; p.legB = 0.35; p.kneeB = 0.5;
      p.armF = -2.0 - sin(t * 22) * 0.5 * f; p.armB = -2.4 + sin(t * 22) * 0.5 * f;
      p.mouth = f > 0.7 ? 2 : 1; p.lean = 0.05;
    }
    p.tail = -0.4;
    return p;
  }

  if (speed < 15) {
    // Standing (countdown): gentle breathing, eager.
    const b = sin(t * 3 + r.id);
    p.bob = b * 0.8; p.armF = 0.45 + b * 0.05; p.armB = 0.2; p.elbF = 0.9; p.elbB = 0.6; p.legF = 0.1; p.legB = -0.1;
    p.tail = sin(t * 2.4 + r.id) * 0.3; p.lean = 0.05;
    return p;
  }

  // Running: the cycle advances with distance so feet don't slide.
  const ph = (r.runPhase || 0) * TAU;
  const amp = Math.min(1, speed / 260);
  const s = sin(ph);
  p.legF = s * 1.05 * amp;
  p.legB = -s * 1.05 * amp;
  p.kneeF = Math.max(0, -cos(ph)) * 1.3 * amp;
  p.kneeB = Math.max(0, cos(ph)) * 1.3 * amp;
  p.armF = -s * 1.0 * amp + 0.2;
  p.armB = s * 1.0 * amp + 0.2;
  p.elbF = 1.3 * amp;
  p.elbB = 1.3 * amp;
  p.bob = -Math.abs(cos(ph)) * 3.5 * amp;
  p.lean = 0.16 * amp + (r.boost > 0 || r.pad > 0 ? 0.12 : 0);
  p.tail = sin(ph * 2) * 0.25;
  p.mouth = r.boost > 0 || r.pad > 0 ? 1 : 0;
  if (r.inMud) { p.lean = 0.03; p.bob *= 0.5; }
  return p;
}

// ---- Drawing ----

// opts: { alpha, shield }
export function drawAnimal(ctx, id, p, t = 0) {
  const a = ANIMAL[id] || ANIMALS[0];
  const limb = a.patches ? a.dark : a.body;
  const foot = a.patches ? a.dark : darker(a.body, 0.18);
  // Lightning: the body flickers to a dark x-ray silhouette with white bones.
  const xray = p.zap > 0 && sin(t * 38) > -0.3;
  const oldTint = tint.amount;
  const oldColor = tint.color;
  if (xray) { tint.amount = 0.9; tint.color = '#1b1830'; }
  p.xray = xray;
  const bone = (pts) => {
    if (!xray) return;
    const saved = tint.amount;
    tint.amount = 0;
    line(ctx, (c) => { c.moveTo(pts[0][0], pts[0][1]); for (const q of pts) c.lineTo(q[0], q[1]); }, '#ffffff', 1.8);
    for (const q of pts) flat(ctx, circle(q[0], q[1], 1.4), '#ffffff');
    tint.amount = saved;
  };

  ctx.save();
  ctx.translate(0, p.bob);
  if (p.slide) {
    // Lie back around the feet so the whole body fits under a low roof.
    ctx.translate(16 * p.slide, -7 * p.slide);
    ctx.rotate(-0.88 * p.slide);
  }

  // Limbs are stroked polylines (outline, fill, highlight) so bent joints stay seamless.
  const limbStroke = (pts, r, color) => {
    const path = (c) => { c.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]); };
    line(ctx, path, INK, r * 2 + 3.4);
    line(ctx, path, color, r * 2);
    ctx.save();
    ctx.translate(-0.7, -0.7);
    line(ctx, path, lighter(color, 0.3), r * 0.7, 0.7);
    ctx.restore();
  };
  // Legs: hip at (0,-14), thigh and shin 7.5; angle 0 hangs down, positive swings backward.
  const leg = (side, ang, knee, color) => {
    const hx = side * 2.5;
    const hy = -14;
    const kx = hx - sin(ang) * 7.5;
    const ky = hy + cos(ang) * 7.5;
    const fa = ang + knee;
    const fx = kx - sin(fa) * 7.5;
    const fy = ky + cos(fa) * 7.5;
    limbStroke([[hx, hy], [kx, ky], [fx, fy]], 3.9, color);
    blob(ctx, ellipse(fx + 2.6, fy + 0.6, 5.4, 3.3, -fa * 0.3), foot, { ow: 1.8, depth: 1.4 });
    bone([[hx, hy], [kx, ky], [fx, fy], [fx + 4, fy + 0.5]]);
  };
  // Arms: shoulder at (1,-28); the elbow bends forward more the harder the arm swings.
  const arm = (side, ang, color, bend = 0.5) => {
    const sx = 1 + side * 1.5;
    const sy = -28;
    const ex = sx - sin(ang) * 6;
    const ey = sy + cos(ang) * 6;
    const fa = ang - bend;
    const hx = ex - sin(fa) * 6;
    const hy = ey + cos(fa) * 6;
    limbStroke([[sx, sy], [ex, ey], [hx, hy]], 2.8, color);
    blob(ctx, circle(hx, hy, 3.5), a.patches ? a.dark : lighter(color, 0.12), { ow: 1.6, depth: 1.2 });
    bone([[sx, sy], [ex, ey], [hx, hy]]);
  };

  ctx.save();
  ctx.rotate(p.lean * 0.5);
  // Back limbs (darker, behind the body).
  arm(-1, p.armB, darker(limb, 0.18), p.elbB ?? 0.5);
  leg(-1, p.legB, p.kneeB, darker(limb, 0.15));

  // Tail.
  drawTail(ctx, a, p, t);

  // Scarf tail flapping behind.
  if (p.scarf > 0.05 || p.dizzy) {
    const wave = sin(t * 18) * 3 * p.scarf;
    const len = 10 + 12 * p.scarf;
    blob(ctx, smooth([[-4, -33], [-4 - len * 0.5, -34 + wave * 0.5 - p.scarf * 2], [-4 - len, -31 + wave], [-4 - len * 0.9, -27 + wave], [-4 - len * 0.45, -29 + wave * 0.4], [-3, -29]], 0.9), a.accent, { ow: 1.6, depth: 1.5 });
  }

  // Torso.
  blob(ctx, ellipse(0, -22, 9.5, 11.5), a.body, { ow: 2, depth: 2.4 });
  flat(ctx, ellipse(3, -20, 5.5, 7.5), a.belly, 0.95);
  // Scarf around the neck.
  blob(ctx, ellipse(1, -31.5, 9, 3.6, 0.08), a.accent, { ow: 1.7, depth: 1.4 });
  if (xray) {
    bone([[0, -13], [0.5, -22], [1, -31]]);
    const saved = tint.amount;
    tint.amount = 0;
    for (let i = 0; i < 3; i++) line(ctx, (c) => c.ellipse(1, -27 + i * 4, 6 - i, 1.6, 0, 0.2, Math.PI - 0.2), '#ffffff', 1.4);
    line(ctx, (c) => c.ellipse(0, -13, 5, 2.2, 0, 0, Math.PI * 2), '#ffffff', 1.4);
    tint.amount = saved;
  }

  leg(1, p.legF, p.kneeF, limb);
  ctx.restore();

  // Head (follows the lean less than the body).
  at(ctx, 3 + p.lean * 6, -44, p.lean * 0.25 + p.head, () => drawHead(ctx, a, p, t));

  ctx.save();
  ctx.rotate(p.lean * 0.5);
  arm(1, p.armF, limb, p.elbF ?? 0.5);
  ctx.restore();

  if (p.caught) drawTrapOn(ctx, -1, 0);
  ctx.restore();

  if (p.dizzy) {
    for (let i = 0; i < 3; i++) {
      const ang = t * 5 + (i * TAU) / 3;
      const sx = 3 + cos(ang) * 15;
      const sy = -64 + p.bob + sin(ang) * 4;
      blob(ctx, starPath(sx, sy, 4.6, 2), '#ffd23f', { ow: 1.4, depth: 1 });
    }
  }
  if (xray) { tint.amount = oldTint; tint.color = oldColor; }
}

function starPath(x, y, r1, r2) {
  return (c) => {
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? r2 : r1;
      const ang = -Math.PI / 2 + (i * Math.PI) / 5;
      if (i === 0) c.moveTo(x + cos(ang) * r, y + sin(ang) * r);
      else c.lineTo(x + cos(ang) * r, y + sin(ang) * r);
    }
    c.closePath();
  };
}

function drawTail(ctx, a, p, t) {
  const wag = p.tail + sin(t * 6) * 0.08;
  at(ctx, -8, -17, wag, () => {
    if (a.tail === 'bushy') {
      blob(ctx, smooth([[2, 1], [-6, 2], [-15, -3], [-21, -11], [-18, -17], [-11, -12], [-5, -6], [1, -4]], 0.9), a.body, { ow: 1.8, depth: 2 });
      blob(ctx, smooth([[-15, -8], [-21, -11], [-18, -17], [-13, -15]], 0.9), a.belly, { ow: 0, depth: 1 });
    } else if (a.tail === 'thin') {
      line(ctx, (c) => { c.moveTo(1, 0); c.bezierCurveTo(-10, 2, -16, -6, -12, -16); c.quadraticCurveTo(-10, -20, -6, -19); }, INK, 6.2);
      line(ctx, (c) => { c.moveTo(1, 0); c.bezierCurveTo(-10, 2, -16, -6, -12, -16); c.quadraticCurveTo(-10, -20, -6, -19); }, a.body, 3.4);
    } else if (a.tail === 'puff') {
      blob(ctx, circle(-3, -2, 5.5), '#ffffff', { ow: 1.6, depth: 1.4, shade: '#dcd6e4' });
    } else {
      blob(ctx, circle(-2, -1, 4), a.patches ? a.dark : a.body, { ow: 1.6, depth: 1.2 });
    }
  });
}

function drawHead(ctx, a, p, t) {
  const R = 15;
  // Ears behind the head.
  const earColor = a.patches ? a.dark : a.body;
  const inner = a.patches ? '#4a4652' : a.belly;
  if (a.ears === 'pointy') {
    const ear = (x, rot, s) => at(ctx, x, -10, rot, () => {
      blob(ctx, poly([[-6 * s, 3], [0, -12 * s], [6 * s, 3]]), earColor, { ow: 1.8, depth: 1.6 });
      flat(ctx, poly([[-3 * s, 2], [0, -7 * s], [3 * s, 2]]), inner);
    });
    ear(-7, -0.35, 0.9);
    ear(3, 0.15, 1);
  } else if (a.ears === 'round') {
    blob(ctx, circle(-8, -11, 5.5), earColor, { ow: 1.8, depth: 1.5 });
    blob(ctx, circle(5, -13, 5.5), earColor, { ow: 1.8, depth: 1.5 });
    flat(ctx, circle(5, -13, 2.8), inner);
  } else {
    const flop = sin(t * 9) * 0.08 + p.scarf * 0.3;
    at(ctx, -5, -10, -0.35 - flop, () => {
      blob(ctx, ellipse(0, -11, 4.2, 12), earColor, { ow: 1.8, depth: 1.6 });
    });
    at(ctx, 2, -11, -0.1 - flop * 0.8, () => {
      blob(ctx, ellipse(0, -12, 4.6, 13), earColor, { ow: 1.8, depth: 1.6 });
      flat(ctx, ellipse(0.5, -11, 2.2, 9), inner);
    });
  }

  // Skull.
  blob(ctx, ellipse(0, 0, R + 1, R), a.body, { ow: 2.2, depth: 3 });
  // Cheek/face patch.
  flat(ctx, ellipse(7, 5, 8.5, 6.5), a.belly, 0.95);
  if (a.patches) {
    flat(ctx, ellipse(9, -2, 4.6, 5.6, 0.4), a.dark);
    flat(ctx, ellipse(1, -2, 3.4, 5, 0.3), a.dark);
  }

  // Snout.
  const sn = a.snout;
  blob(ctx, ellipse(12 + sn * 3, 4, 4.5 + sn * 3, 4.2 + sn * 0.6), a.belly, { ow: 1.8, depth: 1.6 });
  blob(ctx, ellipse(14.5 + sn * 5.6, 1.6, 2.8, 2.2), INK, { ow: 0, light: '#6a5560', shade: false });

  if (p.xray) {
    // X-ray skull instead of a face.
    const saved = tint.amount;
    tint.amount = 0;
    blob(ctx, (c) => { c.ellipse(1, -2, 11, 10, 0, 0, Math.PI * 2); }, '#ffffff', { ow: 1.4, depth: 1.5, shade: '#c9d2e6', light: false });
    blob(ctx, ellipse(12 + sn * 2, 3, 5 + sn * 2, 4), '#ffffff', { ow: 1.4, depth: 1, shade: '#c9d2e6', light: false });
    flat(ctx, ellipse(-2, -3, 3, 3.4), '#1b1830');
    flat(ctx, ellipse(7, -3, 3.4, 3.8), '#1b1830');
    flat(ctx, ellipse(14 + sn * 3, 1.5, 1.6, 1.2), '#1b1830');
    for (let i = 0; i < 4; i++) flat(ctx, roundRect(5 + i * 2.6, 6.5, 1.8, 3, 0.6), '#1b1830');
    tint.amount = saved;
    return;
  }
  // Eyes: the far eye is smaller.
  const angry = p.mouth === 2 ? 0.6 : 0;
  eye(ctx, 1, -3, 3.6, { lx: p.look, blink: p.blink, angry, ow: 1.4 });
  eye(ctx, 9.5, -3, 4.6, { lx: p.look, blink: p.blink, angry, ow: 1.5 });
  if (p.dizzy) {
    // Swirly eyes.
    for (const [ex, er] of [[1, 3.2], [9.5, 4]]) {
      flat(ctx, circle(ex, -3, er + 0.6), '#ffffff');
      line(ctx, (c) => { for (let i = 0; i <= 14; i++) { const ang = i * 0.9 + t * 8; const rr = (i / 14) * er; if (i === 0) c.moveTo(ex, -3); else c.lineTo(ex + cos(ang) * rr, -3 + sin(ang) * rr); } }, INK, 1.1);
    }
  }

  // Mouth.
  const mx = 11 + sn * 2.4;
  const my = 8.5;
  if (p.mouth === 0) line(ctx, (c) => { c.moveTo(mx - 3, my - 0.6); c.quadraticCurveTo(mx, my + 1.6, mx + 2.6, my - 0.4); }, INK, 1.4);
  else if (p.mouth === 1) {
    blob(ctx, (c) => { c.moveTo(mx - 3.5, my - 1); c.quadraticCurveTo(mx, my + 5.5, mx + 3.2, my - 1); c.closePath(); }, '#b8344a', { ow: 1.3, depth: 1, noLight: true });
  } else if (p.mouth === 2) {
    blob(ctx, ellipse(mx, my + 1, 2.4, 3), '#7a1f30', { ow: 1.3, depth: 0.8, noLight: true });
  } else {
    line(ctx, (c) => { c.moveTo(mx - 3.5, my); for (let i = 1; i <= 4; i++) c.lineTo(mx - 3.5 + i * 1.75, my + (i % 2 ? -1.2 : 0.6)); }, INK, 1.3);
  }
  // Blush.
  flat(ctx, ellipse(4, 6, 2.6, 1.6), '#ff7d8f', 0.45);
}

// Bear trap clamped on a foot (drawn in the runner's frame).
function drawTrapOn(ctx, x, y) {
  drawTrap(ctx, x, y, 1);
}

// A bear trap at (x, y) on the ground; snap 0 = open, 1 = shut.
export function drawTrap(ctx, x, y, snap = 0) {
  at(ctx, x, y, 0, () => {
    blob(ctx, ellipse(0, -1.5, 15, 3.4), '#6d747d', { ow: 1.6, depth: 1.2 });
    const open = 1 - snap;
    for (const side of [-1, 1]) {
      at(ctx, side * 12 * (0.3 + open * 0.7), -2, side * (open * 1.1), () => {
        const jaw = (c) => { c.moveTo(-side * 0, 0); c.arc(0, 0, 10, side > 0 ? Math.PI : 0, side > 0 ? Math.PI * 1.5 : -Math.PI * 0.5, side < 0); };
        line(ctx, jaw, INK, 5);
        line(ctx, jaw, '#aab3bd', 2.6);
      });
    }
    // Teeth.
    for (let i = -2; i <= 2; i++) flat(ctx, poly([[i * 4 - 1.6, -3], [i * 4, -7 - open * 2], [i * 4 + 1.6, -3]]), '#e7ecf1');
    blob(ctx, circle(0, -2, 2.6), '#8a929b', { ow: 1.3, depth: 0.8 });
  });
}

// Small head-only portrait for the HUD and menus.
export function drawPortrait(ctx, id, t = 0) {
  const p = { blink: 0, mouth: 1, look: 0.3, scarf: 0, dizzy: 0, head: 0, lean: 0 };
  drawHead(ctx, ANIMAL[id] || ANIMALS[0], p, t);
}
