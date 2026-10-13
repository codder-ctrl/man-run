// Wires everything together: menu, race loop, input, HUD, results, sound.

import { VERSION, STEP, ANIMALS, ITEMS, ITEM_IDS, PLACE_NAMES } from './config.js';
import { createRace, stepRace, results } from './game.js';
import { createRenderer } from './render.js';
import { drawAnimal, poseFor, drawPortrait, ANIMAL } from './animals.js';
import { drawItemIcon } from './fx.js';
import { initAudio, sfx, startMusic, stopMusic, setSound, setMusic } from './sound.js';
import { THEMES, THEME_IDS } from './themes.js';

const $ = (id) => document.getElementById(id);
const canvas = $('scene');
const renderer = createRenderer(canvas);

// ---- Saved preferences ----

const SAVE_KEY = 'man-run';
const save = load();
function load() {
  try {
    return { animal: 'fox', map: 'forest', sound: true, music: true, races: 0, wins: 0, ...JSON.parse(localStorage.getItem(SAVE_KEY) || '{}') };
  } catch {
    return { animal: 'fox', map: 'forest', sound: true, music: true, races: 0, wins: 0 };
  }
}
function store() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch { /* private mode */ }
}
setSound(save.sound);
setMusic(save.music);

// ---- Portraits (head icons as data URLs) ----

const portraitCache = new Map();
function portrait(id, size = 96) {
  const key = id + size;
  if (!portraitCache.has(key)) {
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const g = c.getContext('2d');
    const k = size / 46;
    g.translate(size * 0.47, size * 0.56);
    g.scale(k, k);
    drawPortrait(g, id);
    portraitCache.set(key, c.toDataURL());
  }
  return portraitCache.get(key);
}

function iconCanvas(cv, id, t = 0) {
  const g = cv.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, cv.width, cv.height);
  if (!id) return;
  const k = cv.width / 56;
  g.setTransform(k, 0, 0, k, cv.width / 2, cv.height / 2);
  drawItemIcon(g, id, t);
}

// ---- Screens ----

const params = new URLSearchParams(location.search);
const AUTO = params.has('auto');
const MAP_PARAM = THEMES[params.get('map')] ? params.get('map') : null;
let hitStop = 0;
let mode = 'menu'; // menu | race | pause | results
let race = null;

function show(id, on) { $(id).classList.toggle('hidden', !on); }

function toMenu() {
  mode = 'menu';
  race = null;
  stopMusic();
  show('menu', true);
  show('hud', false);
  show('pause', false);
  show('results', false);
  refreshMenu();
}

function refreshMenu() {
  $('hero-name').textContent = ANIMAL[save.animal].name;
  document.querySelectorAll('.animal-card').forEach((el) => el.classList.toggle('on', el.dataset.id === save.animal));
  document.querySelectorAll('.map-chip').forEach((el) => el.classList.toggle('on', el.dataset.id === save.map));
  $('menu-stats').textContent = save.races ? `${save.races} yarış · ${save.wins} birincilik` : '';
}

function buildMenu() {
  $('version').textContent = 'v' + VERSION;
  const grid = $('animal-grid');
  for (const a of ANIMALS) {
    const b = document.createElement('button');
    b.className = 'animal-card';
    b.dataset.id = a.id;
    b.setAttribute('aria-label', a.name);
    const img = new Image();
    img.src = portrait(a.id, 120);
    img.alt = '';
    img.style.width = '100%';
    img.style.height = '100%';
    b.appendChild(img);
    b.addEventListener('click', () => {
      initAudio();
      sfx('click');
      save.animal = a.id;
      store();
      refreshMenu();
    });
    grid.appendChild(b);
  }
  const maps = $('map-row');
  for (const id of [...THEME_IDS, 'mix']) {
    const b = document.createElement('button');
    b.className = 'map-chip';
    b.dataset.id = id;
    b.textContent = id === 'mix' ? '🎲 Karışık' : `${THEMES[id].icon} ${THEMES[id].name}`;
    b.addEventListener('click', () => {
      initAudio();
      sfx('click');
      save.map = id;
      store();
      refreshMenu();
    });
    maps.appendChild(b);
  }
  const help = $('help-items');
  const desc = {
    lightning: 'Herkesi çarpar, sersemletir',
    shield: 'Saldırılardan ve dikenlerden korur',
    saw: 'Öne fırlar, ilk çarptığını devirir',
    trap: 'Arkana bırakılır, basan takılır',
    speed: 'Kısa süre çok hızlı koşarsın',
    anvil: 'Öndekinin kafasına düşer',
  };
  for (const id of ITEM_IDS) {
    const d = document.createElement('div');
    d.className = 'help-item';
    const cv = document.createElement('canvas');
    cv.width = 76;
    cv.height = 76;
    iconCanvas(cv, id);
    d.appendChild(cv);
    const txt = document.createElement('div');
    txt.innerHTML = `<b>${ITEMS[id].name}</b>${desc[id]}`;
    d.appendChild(txt);
    help.appendChild(d);
  }
  refreshMenu();
  syncToggles();
}

function syncToggles() {
  for (const id of ['btn-sound', 'btn-sound2']) $(id).setAttribute('aria-pressed', String(save.sound));
  for (const id of ['btn-music', 'btn-music2']) $(id).setAttribute('aria-pressed', String(save.music));
}
function toggleSound() { save.sound = !save.sound; setSound(save.sound); store(); syncToggles(); sfx('click'); }
function toggleMusic() {
  save.music = !save.music;
  setMusic(save.music);
  store();
  syncToggles();
}

// Menu hero preview: the chosen animal running on the spot.
const preview = $('hero-preview');
const pg = preview.getContext('2d');
function drawPreview(t) {
  const w = preview.width;
  const h = preview.height;
  pg.setTransform(1, 0, 0, 1, 0, 0);
  pg.clearRect(0, 0, w, h);
  pg.fillStyle = 'rgba(40,60,20,0.25)';
  pg.beginPath();
  pg.ellipse(w / 2, h * 0.9, 50, 9, 0, 0, Math.PI * 2);
  pg.fill();
  pg.setTransform(2.6, 0, 0, 2.6, w / 2 - 6, h * 0.9);
  const fake = { id: 0, vx: 300, vy: 0, grounded: true, runPhase: (t * 1.4) % 1 };
  drawAnimal(pg, save.animal, poseFor(fake, t), t);
}

// ---- Race ----

function startRace() {
  initAudio();
  sfx('click');
  goFullscreen();
  const map = save.map === 'mix' || !THEMES[save.map] ? THEME_IDS[Math.floor(Math.random() * THEME_IDS.length)] : save.map;
  race = createRace({ playerAnimal: save.animal, autoPlayer: AUTO, theme: MAP_PARAM || map });
  renderer.setRace(race);
  buildHeads();
  mode = 'race';
  show('menu', false);
  show('results', false);
  show('pause', false);
  show('hud', true);
  setItem(null);
  lastPlace = 0;
  $('count').className = 'count';
  startMusic(THEMES[race.T.theme].music);
}

function goFullscreen() {
  const touch = matchMedia('(pointer: coarse)').matches;
  if (!touch) return;
  const el = document.documentElement;
  if (!document.fullscreenElement && el.requestFullscreen) {
    el.requestFullscreen({ navigationUI: 'hide' }).then(() => screen.orientation?.lock?.('landscape').catch(() => {})).catch(() => {});
  }
}

function buildHeads() {
  const box = $('progress-heads');
  box.innerHTML = '';
  // Player last so it sits on top.
  for (const r of race.runners.slice().reverse()) {
    const d = document.createElement('div');
    d.className = 'phead' + (r === race.player ? ' me' : '');
    d.dataset.id = r.id;
    const img = new Image();
    img.src = portrait(r.animal, 80);
    d.appendChild(img);
    box.appendChild(d);
  }
}

let lastPlace = 0;
function updateHud(t) {
  const T = race.T;
  const total = T.finishX - T.startX;
  for (const el of $('progress-heads').children) {
    const r = race.runners[+el.dataset.id];
    const x = r.dead > 0 ? r.deathX : r.x;
    const k = Math.max(0, Math.min(1, (x - T.startX) / total));
    el.style.left = (k * 100).toFixed(2) + '%';
  }
  const p = race.player;
  if (p.place !== lastPlace) {
    const el = $('place');
    $('place-n').textContent = p.place;
    el.className = `place p${p.place}`;
    void el.offsetWidth;
    el.classList.add('pop');
    lastPlace = p.place;
  }
  // Item button roulette.
  if (p.rolling > 0) {
    const id = ITEM_IDS[Math.floor(t * 14) % ITEM_IDS.length];
    if (id !== shownItem) { iconCanvas($('item-icon'), id); shownItem = id; sfx('roll'); }
  }
  if (race.closing !== undefined && !p.finished) {
    const s = Math.ceil(race.closing);
    if (s !== lastClosing) { lastClosing = s; banner(`Yarış bitiyor: ${s}`); }
  }
}
let lastClosing = -1;

let shownItem = null;
function setItem(id) {
  shownItem = id;
  iconCanvas($('item-icon'), id);
  const btn = $('btn-item');
  btn.classList.toggle('empty', !id);
  btn.classList.toggle('ready', !!id);
  $('item-name').textContent = id ? ITEMS[id].name : '';
}

function banner(text) {
  const el = $('banner');
  el.textContent = text;
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
}

function countdown(text, go) {
  const el = $('count');
  el.textContent = text;
  el.className = 'count' + (go ? ' go' : '');
  void el.offsetWidth;
  el.classList.add('show');
}

function handleEvent(e) {
  renderer.onEvent(e);
  const r = e.id !== undefined ? race.runners[e.id] : null;
  const me = r && r === race.player;
  const near = r && Math.abs(r.x - race.player.x) < 700;
  switch (e.type) {
    case 'tick': countdown(String(e.n)); sfx('tick'); break;
    case 'go': countdown('KOŞ!', true); sfx('go'); break;
    case 'jump': if (me) sfx('jump'); break;
    case 'land': if (me) sfx('land'); break;
    case 'box': if (me || near) sfx('box'); break;
    case 'itemReady': if (me) { setItem(r.item); sfx('itemReady'); } break;
    case 'use':
      if (me) setItem(null);
      if (me || near) {
        if (e.item === 'saw') sfx('saw');
        else if (e.item === 'trap') sfx('trapSet');
        else if (e.item === 'speed') sfx('speed');
        else if (e.item === 'shield') sfx('shield');
      }
      if (!me && e.item !== 'lightning') {
        if (near) banner(`${ANIMAL[r.animal].name}: ${ITEMS[e.item].name}!`);
      }
      break;
    case 'lightning': sfx('lightning'); if (!me) banner(`${ANIMAL[r.animal].name} şimşek çaktı!`); break;
    case 'anvilWarn': if (me) { sfx('anvilWarn'); banner('Dikkat, örs geliyor!'); } break;
    case 'anvil': if (me || near) sfx('anvil'); break;
    case 'hit':
      if (me) { sfx(e.kind === 'spikes' ? 'spikes' : 'hit'); hitStop = 0.08; }
      else if (near && e.kind !== 'lightning') sfx('hit');
      if (e.from === race.player.id && !me && e.kind !== 'lightning') hitStop = Math.max(hitStop, 0.05);
      if (e.from === race.player.id && !me) banner(`${ANIMAL[r.animal].name} vuruldu!`);
      break;
    case 'blocked': if (me || near) sfx('blocked'); break;
    case 'sawBreak': if (near) sfx('sawBreak'); break;
    case 'trap': if (me || near) sfx('trap'); break;
    case 'pad': if (me) sfx('pad'); break;
    case 'fall': if (me) sfx('fall'); break;
    case 'respawn': if (me) sfx('respawn'); break;
    case 'finish':
      if (me) {
        sfx('finish');
        countdown(e.place === 1 ? 'BİRİNCİ!' : `${e.place}. OLDUN`, true);
        stopMusic();
      } else banner(`${ANIMAL[r.animal].name} bitirdi! (${e.place}.)`);
      break;
    case 'done': showResults(); break;
    default:
  }
}

function fmtTime(s) {
  const m = Math.floor(s / 60);
  const sec = s - m * 60;
  return `${m}:${sec.toFixed(2).padStart(5, '0')}`;
}

function showResults() {
  mode = 'results';
  const res = results(race);
  const mine = res.find((r) => r.id === race.player.id);
  save.races++;
  if (mine.place === 1) save.wins++;
  store();
  $('res-title').textContent = mine.place === 1 ? 'Birinci oldun! 🏆' : `${mine.place}. oldun!`;
  sfx(mine.place === 1 ? 'win' : mine.place <= 2 ? 'finish' : 'lose');
  const list = $('res-list');
  list.innerHTML = '';
  const medals = ['🥇', '🥈', '🥉', '4.'];
  for (const r of res) {
    const li = document.createElement('li');
    if (r.id === race.player.id) li.className = 'me';
    li.innerHTML = `<span class="medal">${medals[r.place - 1]}</span><img alt="" src="${portrait(r.animal, 80)}"><span class="nm">${ANIMAL[r.animal].name}${r.id === race.player.id ? ' (Sen)' : ''}</span><span class="tm">${r.time !== null ? fmtTime(r.time) : '—'}</span>`;
    list.appendChild(li);
  }
  show('hud', false);
  show('results', true);
}

function pause() {
  if (mode !== 'race') return;
  mode = 'pause';
  show('pause', true);
  stopMusic();
}
function resume() {
  if (mode !== 'pause') return;
  mode = 'race';
  show('pause', false);
  if (!race.player.finished) startMusic(THEMES[race.T.theme].music);
  last = performance.now();
}

// ---- Input ----

const input = { jumpQueued: false, hold: false, itemQueued: false };
const held = new Set();
function jumpDown(src) {
  initAudio();
  if (!held.has(src)) input.jumpQueued = true;
  held.add(src);
  input.hold = true;
  $('btn-jump').classList.add('down');
}
function jumpUp(src) {
  held.delete(src);
  input.hold = held.size > 0;
  if (!input.hold) $('btn-jump').classList.remove('down');
}

const JUMP_KEYS = new Set(['Space', 'ArrowUp', 'KeyW']);
const ITEM_KEYS = new Set(['KeyE', 'Enter', 'ArrowRight', 'KeyD']);
window.addEventListener('keydown', (e) => {
  if (mode === 'race') {
    if (JUMP_KEYS.has(e.code)) { e.preventDefault(); if (!e.repeat) jumpDown('k' + e.code); }
    else if (ITEM_KEYS.has(e.code)) { e.preventDefault(); if (!e.repeat) input.itemQueued = true; }
    else if (e.code === 'Escape' || e.code === 'KeyP') pause();
  } else if (mode === 'pause' && (e.code === 'Escape' || e.code === 'KeyP')) resume();
  else if (mode === 'menu' && (e.code === 'Space' || e.code === 'Enter')) { e.preventDefault(); startRace(); }
  else if (mode === 'results' && (e.code === 'Space' || e.code === 'Enter')) { e.preventDefault(); startRace(); }
});
window.addEventListener('keyup', (e) => { if (JUMP_KEYS.has(e.code)) jumpUp('k' + e.code); });

for (const id of ['touch-jump', 'btn-jump']) {
  const el = $(id);
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    jumpDown('p' + e.pointerId);
    try { el.setPointerCapture(e.pointerId); } catch { /* synthetic or already released pointer */ }
  });
  el.addEventListener('pointerup', (e) => jumpUp('p' + e.pointerId));
  el.addEventListener('pointercancel', (e) => jumpUp('p' + e.pointerId));
  el.addEventListener('lostpointercapture', (e) => jumpUp('p' + e.pointerId));
}
$('btn-item').addEventListener('pointerdown', (e) => { e.preventDefault(); initAudio(); input.itemQueued = true; });
window.addEventListener('blur', () => { held.clear(); input.hold = false; pause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

$('btn-race').addEventListener('click', startRace);
$('btn-again').addEventListener('click', startRace);
$('btn-menu').addEventListener('click', () => { sfx('click'); toMenu(); });
$('btn-pause').addEventListener('click', pause);
$('btn-resume').addEventListener('click', () => { sfx('click'); resume(); });
$('btn-quit').addEventListener('click', () => { sfx('click'); toMenu(); });
for (const id of ['btn-sound', 'btn-sound2']) $(id).addEventListener('click', () => { initAudio(); toggleSound(); });
for (const id of ['btn-music', 'btn-music2']) $(id).addEventListener('click', () => { initAudio(); toggleMusic(); });
$('btn-help').addEventListener('click', () => { initAudio(); sfx('click'); show('help', true); });
$('btn-help-close').addEventListener('click', () => { sfx('click'); show('help', false); });

// Rotate hint for phones held upright.
let rotateDismissed = false;
function checkRotate() {
  const touch = matchMedia('(pointer: coarse)').matches;
  const portraitMode = innerHeight > innerWidth;
  show('rotate', touch && portraitMode && !rotateDismissed);
}
$('btn-rotate-ok').addEventListener('click', () => { rotateDismissed = true; checkRotate(); });
window.addEventListener('resize', () => { renderer.resize(); checkRotate(); });

// ---- Loop ----

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const t = now / 1000;
  if (mode === 'menu') drawPreview(t);
  let drawDt = mode === 'race' ? dt : 0;
  if (race && mode === 'race') {
    if (hitStop > 0) {
      // A tiny freeze on big hits makes them land.
      hitStop -= dt;
      drawDt = dt * 0.15;
    } else {
      // Split the frame into equal sub-steps no longer than STEP: smooth on any refresh rate.
      const n = Math.max(1, Math.ceil(dt / STEP - 0.01));
      const sdt = dt / n;
      for (let i = 0; i < n && mode === 'race'; i++) {
        const inp = { jump: input.jumpQueued, hold: input.hold, item: input.itemQueued };
        input.jumpQueued = false;
        input.itemQueued = false;
        stepRace(race, sdt, inp);
        for (const e of race.events) handleEvent(e);
        race.events.length = 0;
      }
    }
    updateHud(t);
  }
  if (race) {
    renderer.draw(drawDt, t);
    if (mode === 'race') renderer.reportFrame(dt);
  }
}

buildMenu();
renderer.resize();
checkRotate();
requestAnimationFrame(frame);

if ('serviceWorker' in navigator && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// Test hook on localhost.
if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
  // advance(s): run the race s seconds synchronously (hidden panes throttle animation frames).
  const advance = (sec) => {
    for (let i = 0; i < sec / STEP && race && mode === 'race'; i++) {
      stepRace(race, STEP, { jump: input.jumpQueued, hold: input.hold, item: input.itemQueued });
      input.jumpQueued = false;
      input.itemQueued = false;
      for (const e of race.events) handleEvent(e);
      race.events.length = 0;
      if (i % 2 === 0) renderer.draw(STEP * 2, performance.now() / 1000 + i * STEP);
    }
    updateHud(performance.now() / 1000);
  };
  window.manrun = { get race() { return race; }, startRace, renderer, input, advance, useItem: (id) => { race.player.item = id; race.player.rolling = 0; input.itemQueued = true; } };
}
