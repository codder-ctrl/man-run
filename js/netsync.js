// Keeps an online race in step between phones. Transport-agnostic: give it a `send(msg)` and
// feed it incoming messages, so tests can wire a host and guests together in memory.
//
// Host:  receives each friend's own movement ('st', 30/s) and item presses ('use'); sends
//        snapshots of the whole race ('s', 20/s) with the events that happened since the last one.
// Guest: moves its own runner locally (no input lag), reports it, and draws everything else from
//        the snapshots, interpolated 100 ms behind so remote runners glide smoothly.

import { ITEM_IDS, SHIELD_TIME, SPEED_TIME } from './config.js';
import { applyHit, makeBot } from './game.js';

const SNAP_EVERY = 0.05;
const REPORT_EVERY = 1 / 30;
const INTERP = 0.1;
const STUNS = [null, 'lightning', 'saw', 'trap', 'anvil', 'spikes'];
// Events worth sending to friends (movement events are inferred on each phone instead).
const FORWARD = new Set(['box', 'hit', 'blocked', 'lightning', 'sawBreak', 'trap', 'anvil', 'anvilWarn', 'use', 'finish', 'itemReady', 'done']);

const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;

// ---- Host ----

// peers: Map peerId → runner id. send(peerId|null, msg): null = everyone.
export function createHostSync(race, peers, send) {
  let snapT = 0;
  let pending = [];
  const lastHeard = new Map();

  function snapshot() {
    const msg = {
      t: 's',
      time: r2(race.time),
      phase: race.phase,
      fc: race.finishedCount,
      cl: race.closing === undefined ? -1 : r1(race.closing),
      r: race.runners.map((r) => [
        r1(r.x), r1(r.y), Math.round(r.vx), Math.round(r.vy), r.grounded ? 1 : 0,
        r2(r.stun), STUNS.indexOf(r.stunKind), r1(r.shield), r1(r.boost), r1(r.pad), r1(r.invuln),
        r.item ? ITEM_IDS.indexOf(r.item) : -1, r2(r.rolling), r2(r.dead), r1(r.deathX),
        r.finished ? 1 : 0, r2(r.finishTime), r.place, r2(r.runPhase || 0), r2(r.slope || 0), r.inMud ? 1 : 0,
        r.duck ? 1 : 0, r2(r.dash), r.climb ? 1 : 0,
      ]),
      sw: race.saws.map((s) => [s.id, r1(s.x), r1(s.y), Math.round(s.vx), s.grounded ? 1 : 0]),
      tr: race.traps.map((t) => [t.id, r1(t.x), r1(t.y), r2(t.snap)]),
      an: race.anvils.map((a) => [a.id, a.target, r2(a.t), a.warn, a.fall, r1(a.x), r1(a.y), a.done ? 1 : 0]),
      ev: pending,
    };
    pending = [];
    return msg;
  }

  return {
    // Every race event on the host passes through here.
    event(e) { if (FORWARD.has(e.type)) pending.push(e); },
    receive(peerId, msg) {
      const id = peers.get(peerId);
      if (id === undefined) return;
      const r = race.runners[id];
      if (r.ctrl !== 'remote') return;
      lastHeard.set(peerId, race.time);
      if (msg.t === 'st') {
        r.net = { at: race.time, x: msg.x, y: msg.y, vx: msg.vx, vy: msg.vy, grounded: !!msg.g, dead: msg.d, deathX: msg.dx, runPhase: msg.rp, slope: msg.sl, inMud: !!msg.m, duck: !!msg.k, dash: msg.ds || 0, climb: !!msg.c };
        if (msg.sk === 'spikes' && r.stunKind !== 'spikes' && r.stun <= 0) { r.stun = msg.st; r.stunKind = 'spikes'; r.invuln = 1.4; }
      } else if (msg.t === 'use') {
        race.useItem(r);
      }
    },
    // A friend's connection closed: their runner carries on as a bot.
    drop(peerId) {
      const id = peers.get(peerId);
      if (id === undefined) return;
      peers.delete(peerId);
      const r = race.runners[id];
      if (r.ctrl === 'remote') makeBot(race, r);
    },
    tick(dt) {
      // Friends silent for 5 s (screen off, lost signal) are handed to a bot.
      if (race.phase === 'race') {
        for (const [pid, id] of peers) {
          const heard = lastHeard.get(pid) ?? 0;
          if (race.time - heard > 5 && race.runners[id].ctrl === 'remote') makeBot(race, race.runners[id]);
        }
      }
      snapT += dt;
      if (snapT >= SNAP_EVERY || pending.some((e) => e.type === 'done')) {
        snapT = 0;
        send(null, snapshot());
      }
    },
  };
}

// ---- Guest ----

export function createGuestSync(race, send) {
  const me = race.player;
  const buf = []; // recent snapshots: { time, r }
  let reportT = 0;
  let lastMsgAt = 0;
  let clock = 0;
  const events = [];

  function applySelf(row) {
    // The host owns items, shields, boosts, places and the finish; this phone owns the body.
    const [, , , , , stun, sk, shield, boost, , , item, rolling, , , fin, ft, place] = row;
    me.shield = shield;
    me.boost = boost;
    if (!(me.usedAt !== undefined && race.time - me.usedAt < 0.6)) {
      me.item = item >= 0 ? ITEM_IDS[item] : null;
      me.rolling = rolling;
    }
    me.place = place;
    if (fin && !me.finished) { me.finished = true; me.finishTime = ft; }
    // A hit whose event got lost still lands.
    if (stun > me.stun + 0.3 && STUNS[sk] && STUNS[sk] !== 'spikes') { me.stun = stun; me.stunKind = STUNS[sk]; }
  }

  function applySnapshot(s) {
    lastMsgAt = clock;
    // Clock: follow the host's race time.
    const diff = s.time - race.time;
    if (Math.abs(diff) > 0.3) race.time = s.time;
    else race.time += diff * 0.1;
    if (s.phase === 'race' && race.phase === 'countdown') race.phase = 'race';
    if (s.phase === 'done') race.phase = 'done';
    race.finishedCount = s.fc;
    race.closing = s.cl >= 0 ? s.cl : undefined;
    buf.push({ time: s.time, r: s.r });
    while (buf.length > 12) buf.shift();
    applySelf(s.r[me.id]);
    for (let i = 0; i < race.runners.length; i++) race.runners[i].place = s.r[i][17];
    race.order = race.runners.slice().sort((a, b) => a.place - b.place);
    // Saws, traps, anvils. (Boxes are per runner: this phone marks its own as it touches them.)
    race.saws = s.sw.map(([id, x, y, vx, g]) => {
      const old = race.saws.find((o) => o.id === id);
      return { id, x, y, vx, grounded: !!g, spin: old ? old.spin : 0 };
    });
    race.traps = s.tr.map(([id, x, y, snap]) => ({ id, x, y, snap }));
    race.anvils = s.an.map(([id, target, t, warn, fall, x, y, done]) => ({ id, target, t, warn, fall, x, y, done: !!done }));
    for (const e of s.ev) handleEvent(e);
  }

  function handleEvent(e) {
    if (e.type === 'box' && e.id === me.id) return; // already shown when this phone touched it
    if (e.id === me.id) {
      if (e.type === 'hit') {
        applyHit(me, e.kind);
        if (e.kind === 'trap' && e.x !== undefined) { me.x = e.x; me.vx = 0; }
      } else if (e.type === 'use') {
        if (e.item === 'shield') me.shield = SHIELD_TIME;
        if (e.item === 'speed') { me.boost = SPEED_TIME; me.stun = 0; }
      } else if (e.type === 'finish') {
        me.finished = true;
        me.finishTime = e.time;
        me.place = e.place;
      }
    }
    events.push(e);
  }

  // Places remote runners at the interpolated position for this frame.
  function interpolate() {
    if (!buf.length) return;
    const rt = race.time - INTERP;
    let a = buf[0];
    let b = buf[buf.length - 1];
    for (let i = 0; i < buf.length - 1; i++) {
      if (buf[i].time <= rt && buf[i + 1].time >= rt) { a = buf[i]; b = buf[i + 1]; break; }
    }
    const span = b.time - a.time;
    const k = span > 0 ? Math.max(0, Math.min(1, (rt - a.time) / span)) : 1;
    const ahead = Math.max(0, Math.min(0.15, rt - b.time));
    for (const r of race.runners) {
      if (r === me) continue;
      const A = a.r[r.id];
      const B = b.r[r.id];
      const jump = Math.abs(B[0] - A[0]) > 300; // respawn: don't slide across the map
      const lerp = (i) => (jump ? B[i] : A[i] + (B[i] - A[i]) * k);
      r.x = lerp(0) + (B[13] > 0 ? 0 : B[2] * ahead);
      r.y = lerp(1);
      r.vx = B[2];
      r.vy = B[3];
      r.grounded = !!B[4];
      r.stun = B[5];
      r.stunKind = STUNS[B[6]];
      r.shield = B[7];
      r.boost = B[8];
      r.pad = B[9];
      r.invuln = B[10];
      r.item = B[11] >= 0 ? ITEM_IDS[B[11]] : null;
      r.dead = B[13];
      r.deathX = B[14];
      r.finished = !!B[15];
      r.finishTime = B[16];
      r.runPhase = B[18];
      r.slope = B[19];
      r.inMud = !!B[20];
      r.duck = !!B[21];
      r.h = r.duck ? 28 : 50;
      r.dash = B[22];
      r.climb = B[23] ? { top: r.y } : null;
    }
  }

  return {
    receive(msg) { if (msg.t === 's') applySnapshot(msg); },
    // Events from the host to show this frame (sounds, effects, HUD).
    takeEvents() { return events.splice(0); },
    // Seconds since the host was last heard from.
    get silence() { return clock - lastMsgAt; },
    tick(dt) {
      clock += dt;
      interpolate();
      for (const m of race.outbox.splice(0)) send(m);
      reportT += dt;
      if (reportT >= REPORT_EVERY && race.phase !== 'countdown') {
        reportT = 0;
        send({ t: 'st', x: r1(me.x), y: r1(me.y), vx: Math.round(me.vx), vy: Math.round(me.vy), g: me.grounded ? 1 : 0, d: r2(me.dead), dx: r1(me.deathX), rp: r2(me.runPhase || 0), sl: r2(me.slope || 0), m: me.inMud ? 1 : 0, sk: me.stunKind, st: r2(me.stun), k: me.duck ? 1 : 0, ds: r2(me.dash), c: me.climb ? 1 : 0 });
      }
    },
  };
}
