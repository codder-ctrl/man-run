// Race rules: runners, items, hazards, places. No drawing; events go to the renderer and sound
// through race.events (drained by main.js every frame).
//
// Roles (race.role):
//   'solo'  — everything runs here (one player + bots).
//   'host'  — everything runs here; friends' runners are 'remote': their movement comes from their
//             phones (net reports), but items, hits, boxes, places and the finish are decided here.
//   'guest' — only this phone's own runner moves here (so jumping never lags); everything else
//             (other runners, bots, saws, boxes, places) is copied from the host's snapshots.
// Runner control (r.ctrl): 'local' (this phone's input), 'bot', 'remote'.

import { PHYS, ITEMS, ITEM_IDS, STUN, SHIELD_TIME, SPEED_TIME, PAD_TIME, BOX_RESPAWN, SAW_SPEED, SAW_LIFE, SAW_R, TRAP_SCALE, TRAP_THROW, ANIMALS, BOT_SKILL, ABILITIES, PAW_CHARGE } from './config.js';
import { buildTrack, respawnAt, rng, floorBelow } from './track.js';
import { stepRunner, moveBody, onSpikes, inStrip, startBurst } from './physics.js';
import { createBot } from './ai.js';

export const COUNTDOWN = 3;

function makeRunner(id, animal, ctrl, name) {
  return {
    id, animal, ctrl, name: name || null,
    isBot: ctrl === 'bot',
    x: 150 - id * 34, y: 0, vx: 0, vy: 0, w: PHYS.w, h: PHYS.h,
    grounded: true, coyote: 0, jumpBuf: 0, cut: true, hold: false,
    stun: 0, stunKind: null, shield: 0, boost: 0, pad: 0, invuln: 0,
    item: null, rolling: 0, dead: 0, deathX: 0, finished: false, finishTime: 0, place: id + 1,
    inMud: false, airTime: 0, runPhase: 0, slope: 0,
    duck: false, paw: 0, dash: 0, // blue paw: charge 0..1 and dash time left
    aim: null, // aiming angle while the blue paw or an item button is held (everyone sees the pose)
    aimKind: null, // what is being aimed: 'paw' or an item id
    bot: null,
  };
}

// opts: { seed, theme, length, playerAnimal, allBots, autoPlayer } for solo races, or
//       { seed, theme, role: 'host'|'guest', roster: [{ animal, name, ctrl }], me } for online ones.
export function createRace(opts = {}) {
  const seed = opts.seed ?? (Math.random() * 1e9) >>> 0;
  const theme = opts.theme || 'forest';
  const T = buildTrack(seed, { length: opts.length ?? 16500, theme });
  const R = rng(seed ^ 0x9e3779b9);
  let roster = opts.roster;
  if (!roster) {
    const playerAnimal = opts.playerAnimal || 'fox';
    const others = ANIMALS.filter((a) => a.id !== playerAnimal).map((a) => a.id);
    for (let i = others.length - 1; i > 0; i--) {
      const j = Math.floor(R() * (i + 1));
      [others[i], others[j]] = [others[j], others[i]];
    }
    roster = [{ animal: playerAnimal, ctrl: opts.allBots || opts.autoPlayer ? 'bot' : 'local' }];
    for (let i = 1; i < 4; i++) roster.push({ animal: others[i - 1], ctrl: 'bot' });
  }
  const role = opts.role || 'solo';
  const runners = roster.map((p, i) => makeRunner(i, p.animal, role === 'guest' && i !== opts.me ? 'remote' : p.ctrl, p.name));
  const race = {
    T, seed, R, runners, role, theme,
    player: runners[opts.me ?? 0],
    time: -COUNTDOWN, // negative during the countdown
    phase: 'countdown', // countdown → race → done
    saws: [], traps: [], anvils: [],
    events: [],
    outbox: [], // guest → host messages (item use)
    order: runners.slice(),
    finishedCount: 0,
    doneTimer: 0,
    allBots: !!opts.allBots,
    nextId: 1,
  };
  race.humans = runners.filter((r) => r.ctrl !== 'bot');
  runners.forEach((r) => { if (r.ctrl === 'bot') r.bot = createBot(r, BOT_SKILL[(r.id + 2) % 3], R); });
  race.useItem = (r, angle = null) => useItem(race, r, angle);
  return race;
}

// A friend left: their runner keeps going as a bot (host only).
export function makeBot(race, r) {
  r.ctrl = 'bot';
  r.isBot = true;
  r.bot = createBot(r, BOT_SKILL[1], race.R);
  r.net = null;
  race.humans = race.runners.filter((o) => o.ctrl !== 'bot');
}

const emit = (race, type, data = {}) => race.events.push({ type, ...data });

function topSpeed(race, r) {
  if (r.stun > 0 || r.dead > 0) return 0;
  if (r.finished && r.x > race.T.finishX + 420) return 0; // jog to a stop past the line
  let s = PHYS.run;
  if (r.boost > 0 || r.pad > 0) s = PHYS.boost;
  else if (r.inMud && r.dash <= 0) s = PHYS.mud;
  if (r.dash > 0) s = Math.max(s, ABILITIES[r.animal].speed);
  if (r.bot) s *= r.bot.speedMul;
  return s;
}

// What a hit does to a runner's body (also used by a guest when the host says it was hit).
export function applyHit(r, kind) {
  r.stun = Math.max(r.stun, STUN[kind]);
  r.stunKind = kind;
  r.boost = 0;
  r.pad = 0;
  r.dash = 0;
  r.burst = null;
  if (kind === 'spikes') { r.vy = -520; r.vx = -140; r.grounded = false; r.invuln = 1.4; }
  else if (kind === 'saw' || kind === 'anvil') { r.vx = 0; if (r.grounded) r.vy = -260; r.grounded = false; }
  else r.vx *= 0.2;
}

// Hits a runner with an attack; shields block. Returns true if it landed.
export function hit(race, r, kind, from, extra = {}) {
  if (r.dead > 0 || r.finished) return false;
  if (r.shield > 0) { emit(race, 'blocked', { id: r.id, kind }); return false; }
  if (kind === 'spikes' && r.invuln > 0) return false;
  applyHit(r, kind);
  emit(race, 'hit', { id: r.id, kind, from: from?.id, ...extra });
  return true;
}

function rollItem(race, r) {
  const place = Math.min(4, r.place);
  let total = 0;
  for (const id of ITEM_IDS) total += ITEMS[id].weights[place - 1];
  let v = race.R() * total;
  for (const id of ITEM_IDS) {
    v -= ITEMS[id].weights[place - 1];
    if (v < 0) return id;
  }
  return 'shield';
}

// Thrown items. angle: the aim (0 forward, π/2 up, ±π back) or null for the plain use: a saw
// rolls forward, a trap drops right behind. An aimed saw flies off that way and rolls on along
// the ground once it lands (backward too); an aimed trap is lobbed and arms where it lands.
function makeSaw(race, r, angle) {
  const a = angle ?? 0;
  const dir = Math.cos(a) >= 0 ? 1 : -1;
  const push = dir > 0 ? Math.max(0, r.vx) : 0;
  const speed = SAW_SPEED + push;
  const size = SAW_R * 1.85;
  return { id: race.nextId++, x: r.x + (SAW_R + 16) * Math.cos(a), y: r.y - 2 - Math.max(0, Math.sin(a)) * 20, vx: Math.cos(a) * speed, vy: -Math.sin(a) * speed * 0.85, speed, dir, rollOn: angle === null || angle === undefined || Math.abs(Math.sin(a)) < 0.2, w: size, h: size, grounded: false, owner: r.id, life: SAW_LIFE, spin: 0, bounces: 0 };
}
// Traps are per runner, like the boxes: catching one runner doesn't spring it for the others
// (caught[runnerId] = race time it caught them). It never catches its owner.
function makeTrap(race, r, angle) {
  const w = 30 * TRAP_SCALE;
  const h = 10 * TRAP_SCALE;
  if (angle === null || angle === undefined) return { id: race.nextId++, x: r.x - 34, y: r.y, vx: 0, vy: 0, w, h, grounded: false, owner: r.id, caught: {} };
  return { id: race.nextId++, x: r.x, y: r.y - 30, vx: Math.cos(angle) * TRAP_THROW + Math.max(0, r.vx) * 0.5, vy: -Math.sin(angle) * TRAP_THROW - 140, w, h, grounded: false, owner: r.id, caught: {}, thrown: true };
}

export function useItem(race, r, angle = null) {
  if (!r.item || r.rolling > 0 || r.dead > 0 || race.phase !== 'race') return false;
  if (race.role === 'guest') {
    // The host decides what the item does; it answers through its snapshots and events.
    race.outbox.push({ t: 'use', a: typeof angle === 'number' ? Math.round(angle * 100) / 100 : null });
    r.item = null;
    r.usedAt = race.time;
    return true;
  }
  const item = r.item;
  r.item = null;
  emit(race, 'use', { id: r.id, item });
  if (item === 'shield') r.shield = SHIELD_TIME;
  else if (item === 'speed') { r.boost = SPEED_TIME; r.stun = 0; }
  else if (item === 'lightning') {
    for (const o of race.runners) if (o !== r) hit(race, o, 'lightning', r);
    emit(race, 'lightning', { id: r.id });
  } else if (item === 'saw') {
    race.saws.push(makeSaw(race, r, angle));
  } else if (item === 'trap') {
    race.traps.push(makeTrap(race, r, angle));
  } else if (item === 'anvil') {
    const leader = race.order.find((o) => o !== r && !o.finished && o.dead <= 0);
    if (leader) {
      race.anvils.push({ id: race.nextId++, target: leader.id, owner: r.id, t: 0, warn: 0.75, fall: 0.32, x: leader.x, y: leader.y });
      emit(race, 'anvilWarn', { id: leader.id });
    }
  }
  return true;
}

// Blue paw: a burst toward the aimed angle (0 = forward), then the dash boost. Movement belongs to
// the runner's own phone, so a guest uses it locally.
export function usePaw(race, r, angle = 0) {
  if (r.paw < 1 || r.dash > 0 || r.dead > 0 || r.stun > 0 || race.phase !== 'race' || r.finished) return false;
  r.paw = 0;
  r.dash = ABILITIES[r.animal].time;
  r.aim = null;
  startBurst(r, angle, ABILITIES[r.animal].speed);
  emit(race, 'paw', { id: r.id, angle: r.burst.a });
  return true;
}

function tickTimers(race, r, dt) {
  r.invuln = Math.max(0, r.invuln - dt);
  r.shield = Math.max(0, r.shield - dt);
  r.boost = Math.max(0, r.boost - dt);
  r.pad = Math.max(0, r.pad - dt);
  if (r.rolling > 0) {
    r.rolling -= dt;
    if (r.rolling <= 0) { r.rolling = 0; if (race.role !== 'guest') emit(race, 'itemReady', { id: r.id, item: r.item }); }
  }
  const wasStunned = r.stun > 0;
  r.stun = Math.max(0, r.stun - dt);
  if (wasStunned && r.stun === 0) r.stunKind = null;
}

// "?" boxes are per runner: taking one hides it only for you (b.taken[runnerId] = respawn time
// left), so everyone gets their own box at the same spot. A guest only marks its own boxes
// (the host rolls the item).
function pickupBoxes(race, r, visualOnly = false) {
  for (const b of race.T.boxes) {
    if (b.taken[r.id] > 0 || Math.abs(b.x - r.x) > 30) continue;
    if (r.y - r.h < b.y + 15 && r.y > b.y - 15) {
      b.taken[r.id] = BOX_RESPAWN;
      emit(race, 'box', { id: r.id, x: b.x, y: b.y });
      if (visualOnly) continue;
      if (!r.item) {
        r.item = rollItem(race, r);
        r.rolling = r.ctrl === 'bot' ? 0.01 : 0.9;
        if (r.bot) r.bot.gotItem();
      }
    }
  }
}

function checkFinish(race, r) {
  if (!r.finished && r.x >= race.T.finishX && race.phase === 'race') {
    r.finished = true;
    r.finishTime = race.time;
    race.finishedCount++;
    r.place = race.finishedCount;
    emit(race, 'finish', { id: r.id, place: r.place, time: r.finishTime });
  }
}

// A runner whose body moves on this phone (the player or a bot).
function updateRunner(race, r, dt, input) {
  const T = race.T;
  tickTimers(race, r, dt);

  if (r.dead > 0) {
    r.dead -= dt;
    if (r.dead <= 0) {
      const p = respawnAt(T, r.deathX);
      r.dead = 0;
      r.x = p.x; r.y = p.y; r.vx = 0; r.vy = 0; r.grounded = true;
      r.stun = 0; r.invuln = 1.5;
      emit(race, 'respawn', { id: r.id });
    }
    return;
  }

  r.dash = Math.max(0, r.dash - dt);
  if (race.phase === 'race' && !r.finished && r.dash <= 0) r.paw = Math.min(1, r.paw + dt / PAW_CHARGE);
  r.canJump = r.stun <= 0 && race.phase === 'race';
  const wasGrounded = r.grounded;
  const res = stepRunner(r, dt, T, r.canJump ? input : { jump: false, hold: false }, topSpeed(race, r));
  if (res.jumped) emit(race, 'jump', { id: r.id });
  if (res.startClimb) emit(race, 'climb', { id: r.id });
  if (res.topped) emit(race, 'topped', { id: r.id });
  if (input.duck && r.duck && r.grounded) emit(race, 'slide', { id: r.id });
  r.climbPhase = r.climb ? ((r.climbPhase || 0) + dt * 4) % 1 : 0;
  if (res.landed && r.airTime > 0.25) emit(race, 'land', { id: r.id, hard: r.airTime > 0.7 });
  r.airTime = r.grounded ? 0 : r.airTime + dt;
  if (r.grounded) r.runPhase = ((r.runPhase || 0) + (r.vx * dt) / 62) % 1;
  if (res.blocked && wasGrounded) r.bumped = 0.2;
  r.bumped = Math.max(0, (r.bumped || 0) - dt);

  r.inMud = r.grounded && !!inStrip(T.mud, r);
  if (r.grounded && inStrip(T.pads, r)) {
    if (r.pad <= 0) emit(race, 'pad', { id: r.id });
    r.pad = PAD_TIME;
  }
  if (r.shield <= 0 && onSpikes(r, T)) hit(race, r, 'spikes');
  pickupBoxes(race, r, race.role === 'guest');

  if (r.y > T.lowest + PHYS.killY * 0.6) {
    r.dead = PHYS.respawnDelay;
    r.deathX = r.x;
    r.stun = 0;
    r.shield = 0;
    emit(race, 'fall', { id: r.id });
  }
  if (race.role !== 'guest') checkFinish(race, r);
}

// A runner moved by another phone. On the host the latest report is extrapolated a little and the
// host still handles its boxes and finish; on a guest the net code interpolates it from snapshots.
function updateRemote(race, r, dt) {
  tickTimers(race, r, dt);
  if (race.role === 'host') {
    const n = r.net;
    if (n) {
      const age = Math.max(0, Math.min(0.12, race.time - n.at));
      r.x = n.x + (n.dead > 0 ? 0 : n.vx * age);
      r.y = n.y + (n.grounded || n.dead > 0 ? 0 : n.vy * age);
      r.vx = n.vx; r.vy = n.vy; r.grounded = n.grounded; r.dead = n.dead; r.deathX = n.deathX;
      r.runPhase = n.runPhase; r.slope = n.slope; r.inMud = n.inMud;
      r.duck = n.duck; r.h = n.duck ? PHYS.duckH : PHYS.h; r.dash = n.dash; r.climb = n.climb ? { top: r.y } : null;
      r.aim = n.aim ?? null;
      r.aimKind = r.aim === null ? null : n.aimKind || 'paw';
    }
    if (r.dead <= 0) pickupBoxes(race, r);
    checkFinish(race, r);
  }
  // Infer jump/land/fall/respawn effects from state changes.
  const st = r.dead > 0 ? 'dead' : r.grounded ? 'ground' : 'air';
  if (r.lastSt && st !== r.lastSt) {
    if (st === 'air' && r.lastSt === 'ground' && r.vy < -200) emit(race, 'jump', { id: r.id, remote: true });
    if (st === 'ground' && r.lastSt === 'air') emit(race, 'land', { id: r.id, remote: true });
    if (st === 'dead') emit(race, 'fall', { id: r.id, remote: true });
    if (r.lastSt === 'dead') emit(race, 'respawn', { id: r.id, remote: true });
  }
  r.lastSt = st;
  r.climbPhase = r.climb ? ((r.climbPhase || 0) + dt * 4) % 1 : 0;
  if (r.dash > 0 && !(r.lastDash > 0)) emit(race, 'paw', { id: r.id, remote: true });
  r.lastDash = r.dash;
}

function updateSaws(race, dt) {
  const T = race.T;
  for (const s of race.saws) {
    s.life -= dt;
    const res = stepSaw(s, dt, T);
    if (res.bounced) emit(race, 'sawBounce', { x: s.x + s.dir * -s.w / 2, y: s.y - s.h / 2 });
    if (s.y > T.lowest + 400) s.life = 0;
    for (const r of race.runners) {
      if (r.id === s.owner || r.dead > 0 || r.finished || s.life <= 0) continue;
      if (Math.abs(r.x - s.x) < (r.w + s.w) / 2 && s.y > r.y - r.h && s.y - s.h < r.y) {
        hit(race, r, 'saw', race.runners[s.owner]);
        s.life = 0;
        emit(race, 'sawBreak', { x: s.x, y: s.y - s.h / 2 });
      }
    }
  }
  race.saws = race.saws.filter((s) => s.life > 0);
}

// One step of a saw: flies under gravity, rolls along the ground once it lands (in the direction
// it was thrown), hops over walls. Shared with the aim preview.
export function stepSaw(s, dt, T) {
  s.spin += dt * 30 * (s.dir || 1);
  s.vy = Math.min(PHYS.maxFall, s.vy + PHYS.gravity * dt);
  const wasGrounded = s.grounded;
  const res = moveBody(s, dt, T, 14);
  if (s.grounded && (!wasGrounded || s.rollOn)) { s.vx = (s.dir || 1) * s.speed; s.rollOn = true; }
  if (res.blocked) {
    // An upright wall bounces it back the way it came (with a little hop).
    s.dir = -(s.dir || 1);
    s.vx = s.dir * s.speed;
    if (s.grounded) s.vy = -260;
    s.bounces = (s.bounces || 0) + 1;
    res.bounced = true;
    if (s.bounces > 6) s.life = 0;
  }
  return res;
}

// One step of a thrown trap: flies until it lands, then stays put.
export function stepTrap(t, dt, T) {
  if (t.grounded) return;
  t.vy = Math.min(PHYS.maxFall, t.vy + PHYS.gravity * dt);
  moveBody(t, dt, T, 0);
  if (t.grounded) t.vx = 0;
}

// The path an aimed saw or trap would take (the aiming player's private preview).
export function predictItemPath(race, r, item, angle, seconds = 0.9, dt = 1 / 60, every = 3) {
  const o = item === 'saw' ? makeSaw({ nextId: 0 }, r, angle) : makeTrap({ nextId: 0 }, r, angle);
  const lift = item === 'saw' ? o.h / 2 : 4;
  const pts = [[o.x, o.y - lift]];
  let i = 0;
  for (let t = 0; t < seconds; t += dt) {
    if (item === 'saw') stepSaw(o, dt, race.T);
    else { stepTrap(o, dt, race.T); if (o.grounded) { pts.push([o.x, o.y - 4]); break; } }
    if (++i % every === 0) pts.push([o.x, o.y - lift]);
    if (o.y > race.T.lowest + 300) break;
  }
  return pts;
}

function updateTraps(race, dt) {
  const T = race.T;
  for (const t of race.traps) {
    if (!t.grounded) {
      stepTrap(t, dt, T);
      if (t.y > T.lowest + 400) t.gone = true;
      if (t.thrown && !t.grounded) continue; // in flight: harmless until it lands
    }
    for (const r of race.runners) {
      if (r.dead > 0 || r.finished) continue;
      if (r.id === t.owner || t.caught[r.id] !== undefined) continue; // never its owner, once each
      if (Math.abs(r.x - t.x) < 22 * TRAP_SCALE && Math.abs(r.y - t.y) < 14 * TRAP_SCALE) {
        t.caught[r.id] = race.time;
        if (hit(race, r, 'trap', race.runners[t.owner], { x: t.x })) {
          r.x = t.x;
          r.vx = 0;
          const fy = floorBelow(T, r.x, r.y - 60);
          if (fy < Infinity) { r.y = fy; r.vy = 0; r.grounded = true; }
        }
        emit(race, 'trap', { id: r.id, x: t.x, y: t.y });
      }
    }
  }
  race.traps = race.traps.filter((t) => !t.gone);
}

function updateAnvils(race, dt) {
  for (const a of race.anvils) {
    const r = race.runners[a.target];
    a.t += dt;
    if (r.dead <= 0) { a.x = r.x; a.y = r.y; }
    if (a.t >= a.warn + a.fall && !a.done) {
      a.done = true;
      if (r.dead <= 0) hit(race, r, 'anvil', race.runners[a.owner]);
      emit(race, 'anvil', { id: r.id, x: a.x, y: a.y });
    }
  }
  race.anvils = race.anvils.filter((a) => a.t < a.warn + a.fall + 0.6);
}

function updatePlaces(race) {
  const list = race.runners.slice().sort((a, b) => {
    if (a.finished || b.finished) {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      return a.finished ? -1 : 1;
    }
    const ax = a.dead > 0 ? a.deathX : a.x;
    const bx = b.dead > 0 ? b.deathX : b.x;
    return bx - ax;
  });
  list.forEach((r, i) => { if (!r.finished) r.place = i + 1; });
  race.order = list;
}

// Advances the race. input: { jump, hold, item } for this phone's player.
export function stepRace(race, dt, input = {}) {
  race.time += dt;
  const guest = race.role === 'guest';
  if (race.phase === 'countdown') {
    const before = Math.ceil(race.time - dt);
    const now = Math.ceil(race.time);
    if (now !== before && race.time < 0) emit(race, 'tick', { n: -now });
    if (race.time >= 0) { race.phase = 'race'; emit(race, 'go'); }
  }
  const T = race.T;
  for (const b of T.boxes) for (const k in b.taken) if (b.taken[k] > 0) b.taken[k] = Math.max(0, b.taken[k] - dt);

  for (const r of race.runners) {
    if (race.phase === 'countdown') continue;
    if (r.ctrl === 'remote') { updateRemote(race, r, dt); continue; }
    let inp = { jump: false, hold: false };
    if (r.ctrl === 'bot') {
      inp = r.bot.think(race, dt);
      r.aim = inp.aim ?? null;
      r.aimKind = r.aim === null ? null : inp.aimKind || 'paw';
      if (inp.paw) usePaw(race, r, inp.pawAngle);
    } else if (!r.finished) {
      inp = { jump: !!input.jump, hold: !!input.hold, duck: !!input.duck };
      r.aim = input.aim ?? null;
      r.aimKind = r.aim === null ? null : input.aimKind || 'paw';
      r.aimPlain = !!input.aimPlain; // aiming but not dragged yet: the plain use would happen
      if (input.item) useItem(race, r, input.itemAngle ?? null);
      if (input.paw) usePaw(race, r, input.pawAngle);
    } else { r.aim = null; r.aimKind = null; }
    updateRunner(race, r, dt, inp);
  }
  if (guest) {
    // Saws keep flying between snapshots; anvils keep their clocks.
    for (const s of race.saws) { s.x += s.vx * dt; s.spin += dt * 30; }
    for (const a of race.anvils) a.t += dt;
    return;
  }
  updateSaws(race, dt);
  updateTraps(race, dt);
  updateAnvils(race, dt);
  updatePlaces(race);

  if (race.phase === 'race' && !race.allBots) {
    // Done shortly after every human is home, or 15 s after all but one runner finished.
    const humansLeft = race.humans.filter((r) => !r.finished).length;
    if (race.humans.length && humansLeft === 0) {
      race.doneTimer += dt;
      if (race.doneTimer > 2.2) finishRace(race);
    } else if (race.finishedCount >= Math.max(1, race.runners.length - 1)) {
      race.closeTimer = (race.closeTimer || 0) + dt;
      race.closing = Math.max(0, 15 - race.closeTimer);
      if (race.closeTimer > 15) finishRace(race);
    }
  }
}

function finishRace(race) {
  updatePlaces(race);
  race.phase = 'done';
  emit(race, 'done', { results: results(race) });
}

export function results(race) {
  return race.order.map((r, i) => ({ id: r.id, animal: r.animal, name: r.name, place: i + 1, time: r.finished ? r.finishTime : null }));
}
