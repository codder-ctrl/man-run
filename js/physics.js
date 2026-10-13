// Moves a body (runner or saw) through the track's solids. Pure functions so the bots can
// run "what if I jump now?" simulations with the same rules.
//
// body: { x (center), y (feet), vx, vy, w, h, grounded, ... }

import { PHYS } from './config.js';
import { solidsNear, floorBelow, surfaceAt, slopeAt } from './track.js';

// Moves the body by its velocity for dt seconds and resolves collisions. Ground strips have
// sloped tops: a grounded body follows them up (any slope inside a strip is walkable) and
// sticks to them going down; only a strip's ends act as walls.
// Returns { blocked, landed, ground } (ground: the solid it stands on, if any).
export function moveBody(b, dt, T, stepUp = PHYS.stepUp) {
  const res = { blocked: false, landed: false, ground: null };
  const hw = b.w / 2;
  const near = solidsNear(T, b.x - hw - 40, b.x + hw + 40);

  // Horizontal.
  const ox = b.x;
  let nx = b.x + b.vx * dt;
  for (const s of near) {
    if (s.kind === 'plat') continue;
    if (b.vx > 0 && nx + hw > s.x && b.x + hw <= s.x + 0.5) {
      const top = surfaceAt(s, s.x);
      if (b.y - b.h >= s.y + s.h || b.y <= top + 0.01) continue;
      if (b.grounded && b.y - top <= stepUp) { b.y = top; continue; }
      nx = s.x - hw - 0.01;
      res.blocked = true;
    } else if (b.vx < 0 && nx - hw < s.x + s.w && b.x - hw >= s.x + s.w - 0.5) {
      const top = surfaceAt(s, s.x + s.w);
      if (b.y - b.h >= s.y + s.h || b.y <= top + 0.01) continue;
      nx = s.x + s.w + hw + 0.01;
      res.blocked = true;
    }
  }
  if (res.blocked) b.vx = 0;
  b.x = nx;
  const moved = Math.abs(nx - ox);

  // Vertical.
  let ny = b.y + b.vy * dt;
  const wasGrounded = b.grounded;
  b.grounded = false;
  if (b.vy >= 0) {
    let land = Infinity;
    const slopeTol = 0.5 + moved * 1.3; // a rising slope lifts the feet this much per step
    const snap = wasGrounded ? 2 + moved * 1.3 : 0; // stick to the ground going downhill
    for (const s of near) {
      if (b.x + hw <= s.x || b.x - hw >= s.x + s.w) continue;
      const top = surfaceAt(s, b.x);
      const tol = s.ys ? slopeTol : 0.5;
      if (b.y <= top + tol && ny + (s.ys ? snap : 0) >= top && top < land) { land = top; res.ground = s; }
    }
    if (land < Infinity) {
      ny = land;
      if (!wasGrounded) res.landed = true;
      b.vy = 0;
      b.grounded = true;
    }
  } else {
    for (const s of near) {
      if (s.kind !== 'block' && s.kind !== 'roof') continue;
      if (b.x + hw <= s.x || b.x - hw >= s.x + s.w) continue;
      const bottom = s.y + s.h;
      if (b.y - b.h >= bottom - 0.5 && ny - b.h < bottom) {
        ny = bottom + b.h;
        b.vy = 0;
      }
    }
  }
  b.y = ny;
  return res;
}

// Is the body's box touching any spike strip?
export function onSpikes(b, T) {
  for (const s of T.spikes) {
    if (s.x > b.x + 40) break;
    if (b.x + b.w / 2 - 4 > s.x && b.x - b.w / 2 + 4 < s.x + s.w && b.y > s.y - 18 && b.y - b.h < s.y) return s;
  }
  return null;
}

export function inStrip(list, b) {
  for (const m of list) {
    if (m.x > b.x) break;
    if (b.x <= m.x + m.w && Math.abs(b.y - m.y) < 2) return m;
  }
  return null;
}

// One physics step of a runner's own movement: speed, jumping, gravity, collisions.
// input: { jump (pressed this step), hold (button held) }. Returns the moveBody result plus
// a `jumped` flag.
export function stepRunner(r, dt, T, input, topSpeed) {
  if (input.jump) r.jumpBuf = PHYS.buffer;
  else r.jumpBuf = Math.max(0, r.jumpBuf - dt);
  r.coyote = r.grounded ? PHYS.coyote : Math.max(0, r.coyote - dt);

  // Uphill is slower, downhill faster.
  const sl = r.grounded && r.ground ? slopeAt(r.ground, r.x) : 0;
  r.slope = sl;
  if (topSpeed > 0) topSpeed *= 1 + Math.max(-0.5, Math.min(0.5, sl)) * 0.4;
  if (r.vx < topSpeed) r.vx = Math.min(topSpeed, r.vx + PHYS.accel * dt * (r.vx < 80 ? 1.6 : 1));
  else r.vx = Math.max(topSpeed, r.vx - 1400 * dt);

  // Ducking: a low slide on the ground, a quick drop in the air. Nobody stands up under a roof.
  const headroom = !roofAbove(r, T);
  let duck = (!!input.duck && r.canJump !== false) || (r.duck && !headroom);
  let jumped = false;
  if (r.jumpBuf > 0 && r.coyote > 0 && r.canJump !== false && headroom) {
    r.vy = -PHYS.jumpV;
    r.grounded = false;
    r.coyote = 0;
    r.jumpBuf = 0;
    r.cut = false;
    r.jumpT = 0;
    jumped = true;
    duck = false;
  }
  r.duck = duck;
  r.h = duck ? PHYS.duckH : PHYS.h;
  if (duck && input.duck && !r.grounded && r.vy < PHYS.maxFall) r.vy += PHYS.fastFall * dt;
  r.jumpT = (r.jumpT || 0) + dt;
  if (!input.hold && r.vy < 0 && !r.cut && r.jumpT >= PHYS.minHold) {
    r.vy *= PHYS.jumpCut;
    r.cut = true;
  }
  r.vy = Math.min(PHYS.maxFall, r.vy + PHYS.gravity * dt);
  const res = moveBody(r, dt, T);
  r.ground = res.ground;
  res.jumped = jumped;
  return res;
}

// Would standing up hit a wall block or a low roof?
export function roofAbove(r, T) {
  const hw = r.w / 2;
  for (const s of solidsNear(T, r.x - hw, r.x + hw)) {
    if (s.kind !== 'block' && s.kind !== 'roof') continue;
    if (r.x + hw <= s.x || r.x - hw >= s.x + s.w) continue;
    if (s.y + s.h > r.y - PHYS.h && s.y < r.y - 1) return true;
  }
  return false;
}

// "What happens if I keep running / jump right now?" for the bots.
// Returns { danger, t } where danger is null, 'pit', 'wall' or 'spikes' and t the time it shows up.
// duck: hold the duck button the whole time (to see whether sliding gets under a roof).
export function simulate(r, T, topSpeed, jumpNow, horizon, dt = 1 / 60, duck = false) {
  const b = { x: r.x, y: r.y, vx: Math.max(r.vx, 120), vy: r.vy, w: r.w, h: r.h, grounded: r.grounded, ground: r.ground, coyote: r.coyote, jumpBuf: 0, cut: r.cut, duck: r.duck };
  let airborne = false;
  for (let t = 0; t < horizon; t += dt) {
    const res = stepRunner(b, dt, T, { jump: jumpNow && t === 0, hold: true, duck }, topSpeed);
    if (res.jumped) airborne = true;
    if (res.blocked) return { danger: 'wall', t, x: b.x };
    if (onSpikes(b, T)) return { danger: 'spikes', t, x: b.x };
    if (!b.grounded && floorBelow(T, b.x, b.y) === Infinity) {
      // Over a pit: only a problem if we are already falling into it.
      if (!jumpNow || b.vy > 0) {
        if (b.y > r.y + 60 || !jumpNow) return { danger: 'pit', t, x: b.x };
      }
    }
    if (jumpNow && airborne && b.grounded) return { danger: null, t, x: b.x, landed: true };
  }
  return { danger: null, t: horizon, x: b.x };
}
