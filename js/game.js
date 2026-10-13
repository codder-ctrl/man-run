// Race rules: runners, items, hazards, places. No drawing; events go to the renderer and sound
// through race.events (drained by main.js every frame).

import { PHYS, ITEMS, ITEM_IDS, STUN, SHIELD_TIME, SPEED_TIME, PAD_TIME, BOX_RESPAWN, SAW_SPEED, SAW_LIFE, ANIMALS, BOT_SKILL } from './config.js';
import { buildTrack, respawnAt, rng } from './track.js';
import { stepRunner, moveBody, onSpikes, inStrip } from './physics.js';
import { createBot } from './ai.js';

export const COUNTDOWN = 3;

function makeRunner(id, animal, isBot, lane) {
  return {
    id, animal, isBot,
    x: 150 - lane * 34, y: 0, vx: 0, vy: 0, w: PHYS.w, h: PHYS.h,
    grounded: true, coyote: 0, jumpBuf: 0, cut: true, hold: false,
    stun: 0, stunKind: null, shield: 0, boost: 0, pad: 0, invuln: 0,
    item: null, rolling: 0, dead: 0, finished: false, finishTime: 0, place: lane + 1,
    inMud: false, lastJump: -1, airTime: 0, lane,
    bot: null,
  };
}

// opts: { seed, playerAnimal, length, theme }
export function createRace(opts = {}) {
  const seed = opts.seed ?? (Math.random() * 1e9) >>> 0;
  const T = buildTrack(seed, { length: opts.length ?? 15000, theme: opts.theme || 'forest' });
  const R = rng(seed ^ 0x9e3779b9);
  const playerAnimal = opts.playerAnimal || 'fox';
  const others = ANIMALS.filter((a) => a.id !== playerAnimal).map((a) => a.id);
  for (let i = others.length - 1; i > 0; i--) {
    const j = Math.floor(R() * (i + 1));
    [others[i], others[j]] = [others[j], others[i]];
  }
  const runners = [makeRunner(0, playerAnimal, !!(opts.allBots || opts.autoPlayer), 0)];
  for (let i = 1; i < 4; i++) runners.push(makeRunner(i, others[i - 1], true, i));
  runners.forEach((r) => { if (r.isBot) r.bot = createBot(r, BOT_SKILL[(r.id + 2) % 3], R); });
  const race = {
    T, seed, R, runners, player: runners[0],
    time: -COUNTDOWN, // negative during the countdown
    phase: 'countdown', // countdown → race → done
    saws: [], traps: [], anvils: [],
    events: [],
    order: runners.slice(),
    finishedCount: 0,
    doneTimer: 0,
    allBots: !!opts.allBots,
  };
  race.useItem = (r) => useItem(race, r);
  return race;
}

const emit = (race, type, data = {}) => race.events.push({ type, ...data });

function topSpeed(race, r) {
  if (r.stun > 0 || r.dead > 0) return 0;
  if (r.finished && r.x > race.T.finishX + 420) return 0; // jog to a stop past the line
  let s = PHYS.run;
  if (r.boost > 0 || r.pad > 0) s = PHYS.boost;
  else if (r.inMud) s = PHYS.mud;
  if (r.isBot && r.bot) s *= r.bot.speedMul;
  return s;
}

// Hits a runner with an attack; shields block. Returns true if it landed.
export function hit(race, r, kind, from) {
  if (r.dead > 0 || r.finished) return false;
  if (r.shield > 0) { emit(race, 'blocked', { id: r.id, kind }); return false; }
  if (kind === 'spikes' && r.invuln > 0) return false;
  r.stun = Math.max(r.stun, STUN[kind]);
  r.stunKind = kind;
  r.boost = 0;
  r.pad = 0;
  if (kind === 'spikes') { r.vy = -520; r.vx = -140; r.grounded = false; r.invuln = 1.4; }
  else if (kind === 'saw' || kind === 'anvil') { r.vx = 0; if (r.grounded) r.vy = -260; r.grounded = false; }
  else r.vx *= 0.2;
  emit(race, 'hit', { id: r.id, kind, from: from?.id });
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

export function useItem(race, r) {
  if (!r.item || r.rolling > 0 || r.dead > 0 || race.phase !== 'race') return false;
  const item = r.item;
  r.item = null;
  emit(race, 'use', { id: r.id, item });
  if (item === 'shield') r.shield = SHIELD_TIME;
  else if (item === 'speed') { r.boost = SPEED_TIME; r.stun = 0; }
  else if (item === 'lightning') {
    for (const o of race.runners) if (o !== r) hit(race, o, 'lightning', r);
    emit(race, 'lightning', { id: r.id });
  } else if (item === 'saw') {
    race.saws.push({ x: r.x + 26, y: r.y - 2, vx: SAW_SPEED + Math.max(0, r.vx), speed: SAW_SPEED + Math.max(0, r.vx), vy: 0, w: 22, h: 22, grounded: r.grounded, owner: r.id, life: SAW_LIFE, spin: 0 });
  } else if (item === 'trap') {
    race.traps.push({ x: r.x - 30, y: r.y, vy: 0, w: 30, h: 10, grounded: false, owner: r.id, armed: 0.4, snap: 0, victim: -1 });
  } else if (item === 'anvil') {
    const leader = race.order.find((o) => o !== r && !o.finished && o.dead <= 0);
    if (leader) {
      race.anvils.push({ target: leader.id, owner: r.id, t: 0, warn: 0.75, fall: 0.32, x: leader.x, y: leader.y });
      emit(race, 'anvilWarn', { id: leader.id });
    }
  }
  return true;
}

function updateRunner(race, r, dt, input) {
  const T = race.T;
  r.invuln = Math.max(0, r.invuln - dt);
  r.shield = Math.max(0, r.shield - dt);
  r.boost = Math.max(0, r.boost - dt);
  r.pad = Math.max(0, r.pad - dt);
  if (r.rolling > 0) {
    r.rolling -= dt;
    if (r.rolling <= 0) { r.rolling = 0; emit(race, 'itemReady', { id: r.id, item: r.item }); }
  }

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

  const wasStunned = r.stun > 0;
  r.stun = Math.max(0, r.stun - dt);
  if (wasStunned && r.stun === 0) r.stunKind = null;
  r.canJump = r.stun <= 0 && race.phase === 'race';
  const wasGrounded = r.grounded;
  const res = stepRunner(r, dt, T, r.canJump ? input : { jump: false, hold: false }, topSpeed(race, r));
  if (res.jumped) emit(race, 'jump', { id: r.id });
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

  // "?" boxes.
  for (const b of T.boxes) {
    if (b.t > 0 || Math.abs(b.x - r.x) > 30) continue;
    if (r.y - r.h < b.y + 15 && r.y > b.y - 15) {
      b.t = BOX_RESPAWN;
      emit(race, 'box', { id: r.id, x: b.x, y: b.y });
      if (!r.item) {
        r.item = rollItem(race, r);
        r.rolling = r.isBot ? 0.01 : 0.9;
        if (r.bot) r.bot.gotItem();
      }
    }
  }

  if (r.y > T.lowest + PHYS.killY * 0.6) {
    r.dead = PHYS.respawnDelay;
    r.deathX = r.x;
    r.stun = 0;
    r.shield = 0;
    emit(race, 'fall', { id: r.id });
  }

  if (!r.finished && r.x >= T.finishX && race.phase === 'race') {
    r.finished = true;
    r.finishTime = race.time;
    race.finishedCount++;
    r.place = race.finishedCount;
    emit(race, 'finish', { id: r.id, place: r.place });
  }
}

function updateSaws(race, dt) {
  const T = race.T;
  for (const s of race.saws) {
    s.life -= dt;
    s.spin += dt * 30;
    s.vy = Math.min(PHYS.maxFall, s.vy + PHYS.gravity * dt);
    const res = moveBody(s, dt, T, 14);
    if (res.blocked) {
      // Hops over walls and steps (gives up after a few).
      s.vx = s.speed;
      if (s.grounded) s.vy = -680;
      s.hops = (s.hops || 0) + 1;
      if (s.hops > 40) s.life = 0;
    }
    if (s.y > T.lowest + 400) s.life = 0;
    for (const r of race.runners) {
      if (r.id === s.owner || r.dead > 0 || r.finished || s.life <= 0) continue;
      if (Math.abs(r.x - s.x) < (r.w + s.w) / 2 && s.y > r.y - r.h && s.y - s.h < r.y) {
        hit(race, r, 'saw', race.runners[s.owner]);
        s.life = 0;
        emit(race, 'sawBreak', { x: s.x, y: s.y - 11 });
      }
    }
  }
  race.saws = race.saws.filter((s) => s.life > 0);
}

function updateTraps(race, dt) {
  const T = race.T;
  for (const t of race.traps) {
    t.armed = Math.max(0, t.armed - dt);
    if (!t.grounded) {
      t.vy = Math.min(PHYS.maxFall, t.vy + PHYS.gravity * dt);
      t.vx = 0;
      moveBody(t, dt, T, 0);
      if (t.y > T.lowest + 400) t.gone = true;
    }
    if (t.snap > 0) { t.snap += dt; if (t.snap > 1.6) t.gone = true; continue; }
    for (const r of race.runners) {
      if (r.dead > 0 || r.finished) continue;
      if (r.id === t.owner && t.armed > 0) continue;
      if (Math.abs(r.x - t.x) < 22 && Math.abs(r.y - t.y) < 14) {
        t.snap = 0.001;
        t.victim = r.id;
        if (hit(race, r, 'trap', race.runners[t.owner])) { r.x = t.x; r.vx = 0; }
        emit(race, 'trap', { id: r.id, x: t.x, y: t.y });
        break;
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

// Advances the race by one fixed step. input: { jump, hold, item } for the player.
export function stepRace(race, dt, input = {}) {
  race.time += dt;
  if (race.phase === 'countdown') {
    const before = Math.ceil(race.time - dt);
    const now = Math.ceil(race.time);
    if (now !== before && race.time < 0) emit(race, 'tick', { n: -now });
    if (race.time >= 0) { race.phase = 'race'; emit(race, 'go'); }
  }
  const T = race.T;
  for (const b of T.boxes) if (b.t > 0) b.t = Math.max(0, b.t - dt);

  for (const r of race.runners) {
    if (race.phase === 'countdown') continue;
    let inp = { jump: false, hold: false };
    if (r.isBot) inp = r.bot.think(race, dt);
    else if (!r.finished) {
      inp = { jump: !!input.jump, hold: !!input.hold };
      if (input.item) useItem(race, r);
    } else inp = { jump: false, hold: false };
    updateRunner(race, r, dt, inp);
  }
  updateSaws(race, dt);
  updateTraps(race, dt);
  updateAnvils(race, dt);
  updatePlaces(race);

  if (race.phase === 'race' && !race.allBots) {
    const p = race.player;
    if (p.finished) {
      race.doneTimer += dt;
      if (race.doneTimer > 2.2) { race.phase = 'done'; emit(race, 'done'); }
    } else if (race.finishedCount >= 3) {
      // Everyone else is home: a short grace period, then the race closes.
      race.doneTimer += dt;
      race.closing = Math.max(0, 15 - race.doneTimer);
      if (race.doneTimer > 15) { race.phase = 'done'; emit(race, 'done'); }
    }
  }
}

export function results(race) {
  return race.order.map((r, i) => ({ id: r.id, animal: r.animal, place: i + 1, time: r.finished ? r.finishTime : null, player: !r.isBot || r === race.player }));
}
