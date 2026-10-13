// Online rooms: the lobby (who is in, which animal, map, bots) and starting races. The race
// itself is kept in step by netsync.js; this module only routes messages to it.

import { VERSION, ANIMALS } from './config.js';
import { hostRoom, joinRoom } from './net.js';
import { THEMES, THEME_IDS } from './themes.js';

const MAX = 4;

// ui: { lobby(state), start(info), message(msg), closed(text), error(text) }
export function createOnline(ui) {
  const st = { role: null, code: '', players: [], bots: true, map: 'forest', me: null, racing: false };
  let room = null;
  let hostSync = null;

  const publicState = () => ({ role: st.role, code: st.code, players: st.players.map((p) => ({ ...p })), bots: st.bots, map: st.map, me: st.me });
  const broadcastLobby = () => {
    room.broadcast({ t: 'lobby', players: st.players, bots: st.bots, map: st.map, code: st.code });
    ui.lobby(publicState());
  };
  const freeAnimal = (want, except) => {
    const taken = new Set(st.players.filter((p) => p.pid !== except).map((p) => p.animal));
    if (!taken.has(want)) return want;
    return ANIMALS.find((a) => !taken.has(a.id)).id;
  };

  async function host({ name, animal, map }) {
    st.role = 'host';
    st.map = map;
    st.me = 'host';
    st.players = [{ pid: 'host', name, animal, host: true }];
    room = await hostRoom({
      message(pid, msg) {
        if (msg.t === 'hello') {
          if (msg.v !== VERSION) { room.send(pid, { t: 'refuse', why: 'version' }); setTimeout(() => room.kick(pid), 300); return; }
          if (st.racing) { room.send(pid, { t: 'refuse', why: 'busy' }); setTimeout(() => room.kick(pid), 300); return; }
          if (st.players.length >= MAX) { room.send(pid, { t: 'refuse', why: 'full' }); setTimeout(() => room.kick(pid), 300); return; }
          st.players.push({ pid, name: String(msg.name || 'Oyuncu').slice(0, 12), animal: freeAnimal(msg.animal, pid), host: false });
          room.send(pid, { t: 'you', pid });
          broadcastLobby();
        } else if (msg.t === 'animal') {
          const p = st.players.find((q) => q.pid === pid);
          if (p && !st.racing) { p.animal = freeAnimal(msg.animal, pid); broadcastLobby(); }
        } else if (hostSync) hostSync.receive(pid, msg);
      },
      leave(pid) {
        const p = st.players.find((q) => q.pid === pid);
        st.players = st.players.filter((q) => q.pid !== pid);
        if (hostSync) hostSync.drop(pid);
        if (p) ui.error(`${p.name} odadan ayrıldı.`);
        if (!st.racing) broadcastLobby();
      },
      error(text) { ui.error(text); },
    });
    st.code = room.code;
    ui.lobby(publicState());
  }

  async function join(code, { name, animal }) {
    st.role = 'guest';
    st.code = code;
    room = await joinRoom(code, {
      message(msg) {
        if (msg.t === 'you') st.me = msg.pid;
        else if (msg.t === 'lobby') {
          st.players = msg.players;
          st.bots = msg.bots;
          st.map = msg.map;
          st.racing = false;
          ui.lobby(publicState());
        } else if (msg.t === 'start') {
          st.racing = true;
          const me = msg.roster.findIndex((p) => p.pid === st.me);
          ui.start({ role: 'guest', seed: msg.seed, theme: msg.theme, roster: msg.roster.map((p, i) => ({ animal: p.animal, name: p.name, ctrl: i === me ? 'local' : 'remote' })), me });
        } else if (msg.t === 'refuse') {
          const why = { version: 'Oyun sürümün farklı. Sayfayı yenileyip tekrar dene.', busy: 'Odada yarış sürüyor, bitince tekrar dene.', full: 'Oda dolu (4 kişi).' }[msg.why] || 'Odaya girilemedi.';
          leave();
          ui.closed(why);
        } else ui.message(msg);
      },
      close() { const was = st.role; reset(); if (was) ui.closed('Oda kapandı.'); },
      error(text) { ui.error(text); },
    });
    room.send({ t: 'hello', name, animal, v: VERSION });
  }

  // Host: builds the roster and tells everyone to go.
  function start() {
    const used = new Set(st.players.map((p) => p.animal));
    const roster = st.players.map((p) => ({ pid: p.pid, animal: p.animal, name: p.name, human: true }));
    if (st.bots) for (const a of ANIMALS) if (roster.length < MAX && !used.has(a.id)) roster.push({ pid: null, animal: a.id, name: null, human: false });
    const seed = (Math.random() * 1e9) >>> 0;
    // Every phone must build the same map, so "Karışık" is settled here.
    const theme = st.map === 'mix' || !THEMES[st.map] ? THEME_IDS[Math.floor(Math.random() * THEME_IDS.length)] : st.map;
    st.racing = true;
    room.broadcast({ t: 'start', seed, theme, roster });
    const peers = new Map();
    roster.forEach((p, i) => { if (p.human && p.pid !== 'host') peers.set(p.pid, i); });
    return {
      role: 'host', seed, theme, me: 0, peers,
      roster: roster.map((p) => ({ animal: p.animal, name: p.name, ctrl: !p.human ? 'bot' : p.pid === 'host' ? 'local' : 'remote' })),
    };
  }

  function reset() {
    st.role = null;
    st.players = [];
    st.racing = false;
    st.me = null;
    hostSync = null;
    room = null;
  }

  function leave() {
    if (room) room.close();
    reset();
  }

  return {
    get state() { return publicState(); },
    get role() { return st.role; },
    host,
    join,
    start,
    leave,
    setBots(on) { st.bots = on; broadcastLobby(); },
    setMap(m) { st.map = m; broadcastLobby(); },
    setAnimal(animal) {
      if (st.role === 'host') { st.players[0].animal = freeAnimal(animal, 'host'); broadcastLobby(); } else if (room) room.send({ t: 'animal', animal });
    },
    // Back to the lobby after a race (host).
    toLobby() { st.racing = false; hostSync = null; if (room) broadcastLobby(); },
    attachHostSync(sync) { hostSync = sync; },
    // Host → one friend or everyone (null); guest → host.
    send(to, msg) {
      if (!room) return;
      if (st.role === 'host') { if (to) room.send(to, msg); else room.broadcast(msg); } else room.send(msg);
    },
  };
}
