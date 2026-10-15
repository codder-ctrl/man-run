// Moves a body (runner or saw) through the track's solids. Pure functions so the bots can
// run "what if I jump now?" simulations with the same rules.
//
// body: { x (center), y (feet), vx, vy, w, h, grounded, ... }

import { PHYS, PAW_BURST, PAW_BURST_MUL } from './config.js';
import { solidsNear, floorBelow, surfaceAt, slopeAt } from './track.js';

// Moves the body by its velocity for dt seconds and resolves collisions. Ground strips have
// sloped tops: a grounded body follows them up (any slope inside a strip is walkable) and
// sticks to them going down; only a strip's ends act as walls.
// Returns { blocked, landed, ground, wall } (ground: the solid it stands on; wall: { s, top } of
// a wall it ran into going right).
export function moveBody(b, dt, T, stepUp = PHYS.stepUp) {
  const res = { blocked: false, landed: false, ground: null, wall: null };
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
      if (!res.wall || top < res.wall.top) res.wall = { s, top };
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
      // Ground strips are solid all the way down: feet that ended up inside one (pulled back by a
      // trap on a slope, say) are lifted back onto it instead of sinking through.
      const inside = s.ys && b.x >= s.x && b.x <= s.x + s.w;
      const tol = s.ys ? (inside ? Math.max(slopeTol, 80) : slopeTol) : 0.5;
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

// Angles wrap all the way round, into (-π, π].
export const normAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// Starts an aimed blue-paw burst at `speed` (the animal's ability speed) toward `angle`.
export function startBurst(r, angle, speed) {
  let a = normAngle(angle || 0);
  // On the ground a downward aim can't go into the earth: it becomes flat forward or backward.
  if (r.grounded && Math.sin(a) < 0) a = Math.cos(a) >= 0 ? 0 : Math.PI;
  const v = speed * PAW_BURST_MUL;
  r.burst = { t: PAW_BURST, vx: Math.cos(a) * v, vy: -Math.sin(a) * v, a };
  if (r.burst.vy < 0) r.grounded = false;
  r.climb = null;
  r.slideT = 0;
  r.dive = false;
  r.airJump = false;
  r.dj = false; // a burst gives the double jump back
  r.duck = false;
  r.h = PHYS.h;
}

// One physics step of a runner's own movement: speed, jumping, sliding, wall climbing, gravity,
// collisions. input: { jump (pressed this step), hold (jump held), duck (EĞİL pressed this step) }.
// Returns the moveBody result plus `jumped`, `doubled` (double jump), `climbing`, `startClimb` and
// `topped` (just got over the top of a wall).
export function stepRunner(r, dt, T, input, topSpeed) {
  if (input.jump) r.jumpBuf = PHYS.buffer;
  else r.jumpBuf = Math.max(0, r.jumpBuf - dt);
  r.coyote = r.grounded ? PHYS.coyote : Math.max(0, r.coyote - dt);
  const free = r.canJump !== false; // not stunned, race running

  // Clinging to a wall (the user's design): touch any upright wall in the air and you stick to it.
  // Every jump kicks you a jump's height up the wall, where you grab on again; stop jumping and
  // you slide slowly down. Clear the top and you hop forward onto it; reach the floor and you let go.
  if (r.climb) {
    if (!free) r.climb = null;
    else {
      let jumped = false;
      if (r.jumpBuf > 0) {
        r.vy = -PHYS.jumpV;
        r.jumpBuf = 0;
        jumped = true;
      }
      if (r.vy < 0) r.vy += PHYS.gravity * dt; // rising after a kick: a normal jump arc
      else r.vy = Math.min(PHYS.wallSlide, r.vy + PHYS.gravity * dt * 0.5); // sliding down slowly
      r.vx = 60; // pressed against the wall
      r.duck = false;
      r.h = PHYS.h;
      r.airJump = false;
      r.dj = false; // the wall gives the double jump back
      r.flip = 0;
      const res = moveBody(r, dt, T);
      res.climbing = true;
      res.jumped = jumped;
      r.ground = res.ground;
      if (!res.blocked) {
        r.climb = null;
        r.vx = 180;
        r.vy = Math.min(r.vy, -160);
        res.topped = true;
      } else if (r.grounded) {
        r.climb = null;
      }
      return res;
    }
  }

  // Blue-paw burst: straight along the aimed line with gravity off, then some of the rise carries
  // on. A wall ends it (and is grabbed if climbable), so does a ceiling or landing from a dive.
  if (r.burst) {
    if (!free) r.burst = null;
    else {
      const B = r.burst;
      B.t -= dt;
      r.vx = B.vx;
      r.vy = B.vy;
      const res = moveBody(r, dt, T);
      res.bursting = true;
      const hitCeiling = B.vy < 0 && r.vy === 0;
      const landed = B.vy > 0 && r.grounded;
      if (B.t <= 0 || res.blocked || hitCeiling || landed) {
        r.burst = null;
        r.vy = B.vy < 0 && !hitCeiling ? B.vy * 0.5 : r.vy;
        if (res.blocked && res.wall && !r.grounded) { r.climb = { top: res.wall.top }; r.vy = Math.min(r.vy, 0); res.startClimb = true; }
      }
      r.ground = res.ground;
      return res;
    }
  }

  // Sliding: one press of EĞİL slides for a moment; in the air it dives first. Nobody stands up
  // under a roof.
  if (input.duck && free) {
    if (r.grounded) r.slideT = PHYS.slideTime;
    else r.dive = true;
  }
  if (r.dive && r.grounded) { r.dive = false; r.slideT = PHYS.slideTime; }
  if (r.grounded) r.slideT = Math.max(0, (r.slideT || 0) - dt);
  const headroom = !roofAbove(r, T);
  let duck = (r.slideT > 0 && free) || (r.dive && free) || (r.duck && !headroom);

  let jumped = false;
  let doubled = false;
  if (r.jumpBuf > 0 && r.coyote > 0 && free && headroom) {
    r.vy = -PHYS.jumpV;
    r.grounded = false;
    r.coyote = 0;
    r.jumpBuf = 0;
    r.cut = false;
    r.jumpT = 0;
    r.airJump = true;
    r.slideT = 0;
    r.dive = false;
    jumped = true;
    duck = false;
  } else if (r.jumpBuf > 0 && !r.grounded && !r.dj && free) {
    // Double jump (the user asked for it): once per airtime, a second, slightly lower jump with a
    // forward somersault. Landing, a wall or a paw burst gives it back. Holding works as usual.
    r.vy = -PHYS.doubleJumpV;
    r.dj = true;
    r.jumpBuf = 0;
    r.cut = false;
    r.jumpT = 0;
    r.airJump = true;
    r.dive = false;
    r.flip = PHYS.flipTime;
    doubled = true;
    duck = false;
  }
  r.duck = duck;
  r.h = duck ? PHYS.duckH : PHYS.h;

  // Speed: uphill slower, downhill faster; jumps and slides cost a little speed.
  const sl = r.grounded && r.ground ? slopeAt(r.ground, r.x) : 0;
  r.slope = sl;
  if (topSpeed > 0) {
    topSpeed *= 1 + Math.max(-0.5, Math.min(0.5, sl)) * 0.4;
    if (r.airJump || duck) topSpeed *= PHYS.moveSlow;
  }
  if (r.vx < topSpeed) r.vx = Math.min(topSpeed, r.vx + PHYS.accel * dt * (r.vx < 80 ? 1.6 : 1));
  else r.vx = Math.max(topSpeed, r.vx - (r.grounded ? 1400 : PHYS.airDecel) * dt);

  if (r.dive && !r.grounded && r.vy < PHYS.maxFall) r.vy += PHYS.fastFall * dt;
  r.jumpT = (r.jumpT || 0) + dt;
  if (!input.hold && r.vy < 0 && !r.cut && r.jumpT >= PHYS.minHold) {
    r.vy *= PHYS.jumpCut;
    r.cut = true;
  }
  r.vy = Math.min(PHYS.maxFall, r.vy + PHYS.gravity * dt);
  const res = moveBody(r, dt, T);
  r.ground = res.ground;
  if (r.grounded) { r.airJump = false; r.dj = false; r.flip = 0; }
  res.jumped = jumped;
  res.doubled = doubled;

  // Ran into an upright wall in the air: stick to it (a rising jump keeps rising).
  if (res.blocked && res.wall && free && !duck && !r.grounded) {
    r.climb = { top: res.wall.top };
    if (r.vy > PHYS.wallSlide) r.vy = PHYS.wallSlide;
    r.slideT = 0;
    r.dive = false;
    res.startClimb = true;
  }
  return res;
}

function cloneBody(r) {
  return { x: r.x, y: r.y, vx: Math.max(r.vx, 120), vy: r.vy, w: r.w, h: r.h, grounded: r.grounded, ground: r.ground, coyote: r.coyote, jumpBuf: 0, cut: r.cut, duck: r.duck, slideT: r.slideT || 0, dive: r.dive, airJump: r.airJump, dj: r.dj, climb: null, burst: r.burst ? { ...r.burst } : null, canJump: true };
}

// The path an aimed blue paw would take from where the runner is now (the aiming player's
// private arrow draws it): points every `every` steps for `seconds`.
export function predictBurst(r, T, angle, speed, seconds = 0.85, dt = 1 / 60, every = 3) {
  const b = cloneBody(r);
  b.vx = r.vx;
  startBurst(b, angle, speed);
  const pts = [[b.x, b.y - 26]];
  let i = 0;
  for (let t = 0; t < seconds; t += dt) {
    stepRunner(b, dt, T, { jump: false, hold: false }, speed);
    if (++i % every === 0) pts.push([b.x, b.y - 26]);
    if (b.y > T.lowest + 300) break;
  }
  return pts;
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
// duck: press EĞİL right now (to see whether sliding gets under a roof).
// A wall counts as danger even though runners can climb it: jumping over is faster.
// burst: { angle, speed } fires an aimed blue paw right now (the bots compare angles with it).
export function simulate(r, T, topSpeed, jumpNow, horizon, dt = 1 / 60, duck = false, burst = null) {
  const b = cloneBody(r);
  if (burst) startBurst(b, burst.angle, burst.speed);
  let airborne = false;
  for (let t = 0; t < horizon; t += dt) {
    const res = stepRunner(b, dt, T, { jump: jumpNow && t === 0, hold: true, duck: duck && t === 0 }, topSpeed);
    if (res.jumped || res.doubled) airborne = true;
    if (res.blocked || res.climbing) return { danger: 'wall', t, x: b.x };
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
