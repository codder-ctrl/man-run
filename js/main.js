// Wires everything together: menu, race loop, input, HUD, results, sound.

import { VERSION, STEP, ANIMALS, ITEMS, ITEM_IDS, PLACE_NAMES, ABILITIES, AIMED_ITEMS } from './config.js';
import { createRace, stepRace, results } from './game.js';
import { createRenderer } from './render.js';
import { drawAnimal, poseFor, drawPortrait, ANIMAL } from './animals.js';
import { drawItemIcon } from './fx.js';
import { initAudio, sfx, startMusic, stopMusic, setSound, setMusic } from './sound.js';
import { THEMES, THEME_IDS } from './themes.js';
import { createOnline } from './online.js';
import { createHostSync, createGuestSync } from './netsync.js';
import { cleanCode } from './net.js';
import { normAngle } from './physics.js';

const $ = (id) => document.getElementById(id);
const canvas = $('scene');
const renderer = createRenderer(canvas);

// ---- Saved preferences ----

const SAVE_KEY = 'man-run';
const save = load();
function load() {
  try {
    return { animal: 'fox', map: 'forest', name: '', sound: true, music: true, races: 0, wins: 0, ...JSON.parse(localStorage.getItem(SAVE_KEY) || '{}') };
  } catch {
    return { animal: 'fox', map: 'forest', name: '', sound: true, music: true, races: 0, wins: 0 };
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
let mode = 'splash'; // splash | menu | race | pause | results
let race = null;

function show(id, on) { $(id).classList.toggle('hidden', !on); }

function toMenu() {
  mode = 'menu';
  race = null;
  sync = null;
  stopMusic();
  show('splash', false);
  show('menu', true);
  show('hud', false);
  show('pause', false);
  show('results', false);
  show('lobby', false);
  show('online', false);
  refreshMenu();
}

const nameOf = (r) => r.name || ANIMAL[r.animal].name;

let toastTimer = 0;
function toast(text) {
  const el = $('toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

function refreshMenu() {
  $('hero-name').textContent = ANIMAL[save.animal].name;
  $('hero-paw').textContent = `🐾 ${ABILITIES[save.animal].name}: ${ABILITIES[save.animal].desc}`;
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
    saw: 'Duvardan seker, değdiği herkesi biçer',
    trap: 'Basan herkes bir kez takılır',
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

// ---- Loading screen ----
// The key art with a loading bar while the art, fonts and menu backdrop load, then "tap to start"
// (the tap also unlocks sound and, on phones, full screen) and the character select menu.

const TIPS = [
  'İpucu: Duvara yapış, zıpla zıpla tırman!',
  'İpucu: 🐾 düğmesini basılı tut ve kaydır, her yöne atıl.',
  'İpucu: Testereyi geriye at, arkandakileri biç!',
  'İpucu: Kırmızı halkalı kapanlara basma.',
  'İpucu: Gereksiz zıplama, havada yavaşlarsın.',
  'İpucu: Alçak kayaların altından EĞİL ile kay.',
  'İpucu: Eşya düğmesini basılı tut, bırakınca kullanılır.',
];
const loading = { p: 0.04, target: 0.04, ready: false, t0: performance.now(), last: performance.now() };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const settle = (p, ms) => Promise.race([Promise.resolve(p).catch(() => {}), wait(ms)]);
function preload(src) {
  const img = new Image();
  img.src = src;
  return img.decode ? img.decode() : new Promise((r) => { img.onload = r; img.onerror = r; });
}
async function boot() {
  $('load-runner').style.backgroundImage = `url(${portrait(save.animal, 100)})`;
  $('splash-tip').textContent = TIPS[Math.floor(Math.random() * TIPS.length)];
  $('splash-version').textContent = 'v' + VERSION;
  loading.target = 0.25;
  const art = $('splash-art');
  await settle(art.decode ? art.decode() : null, 5000);
  art.classList.add('in');
  loading.target = 0.5;
  await settle(document.fonts && Promise.all([document.fonts.load('30px "Lilita One"'), document.fonts.load('700 16px Fredoka')]), 3000);
  loading.target = 0.75;
  await settle(preload('img/menu-bg.webp'), 4000);
  loading.target = 1;
}
// Eases the bar toward the progress, never faster than ~1.6 s for the whole bar. Runs on real
// time so a slow frame rate can't hold it back.
function updateSplash(now) {
  const dt = Math.min(0.25, Math.max(0, (now - loading.last) / 1000));
  loading.last = now;
  const cap = (now - loading.t0) / 1600;
  const goal = Math.min(loading.target, cap);
  loading.p += (goal - loading.p) * Math.min(1, dt * 6);
  $('splash').style.setProperty('--p', loading.p.toFixed(4));
  if (!loading.ready && loading.target >= 1 && loading.p > 0.985) {
    loading.ready = true;
    $('splash').classList.add('ready');
    $('load-text').textContent = matchMedia('(pointer: coarse)').matches ? 'Başlamak için dokun' : 'Başlamak için tıkla';
    sfx('itemReady');
  }
}
function leaveSplash() {
  if (mode !== 'splash' || !loading.ready) return;
  initAudio();
  sfx('go');
  goFullscreen();
  mode = 'menu';
  $('splash').classList.add('out');
  show('menu', true);
  $('menu').classList.add('enter');
  refreshMenu();
  setTimeout(() => show('splash', false), 550);
}
$('splash').addEventListener('click', leaveSplash);

// ---- Race ----

const pickMap = (m) => (m === 'mix' || !THEMES[m] ? THEME_IDS[Math.floor(Math.random() * THEME_IDS.length)] : m);

function startRace() {
  if (online.role) { hostRematch(); return; }
  initAudio();
  sfx('click');
  goFullscreen();
  race = createRace({ playerAnimal: save.animal, autoPlayer: AUTO, theme: MAP_PARAM || pickMap(save.map) });
  sync = null;
  beginRace();
}

// Shared by solo and online races once `race` exists.
function beginRace() {
  renderer.setRace(race);
  buildHeads();
  mode = 'race';
  show('splash', false);
  show('menu', false);
  show('results', false);
  show('pause', false);
  show('lobby', false);
  show('online', false);
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
  // Blue paw button: fills up, glows when ready.
  const pb = $('btn-paw');
  pb.style.setProperty('--fill', p.dash > 0 ? 1 : p.paw.toFixed(3));
  pb.classList.toggle('ready', p.paw >= 1 && p.dash <= 0);
  pb.classList.toggle('active', p.dash > 0);
  // Item button roulette, and keeping the button honest (online the host owns items).
  if (p.rolling <= 0 && (p.item || null) !== shownItem) setItem(p.item || null);
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
    case 'box': if (me) sfx('box'); break;
    case 'climb': if (me) sfx('climb'); break;
    case 'slide': if (me) sfx('duck'); break;
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
        if (near) banner(`${nameOf(r)}: ${ITEMS[e.item].name}!`);
      }
      break;
    case 'lightning': sfx('lightning'); if (!me) banner(`${nameOf(r)} şimşek çaktı!`); break;
    case 'anvilWarn': if (me) { sfx('anvilWarn'); banner('Dikkat, örs geliyor!'); } break;
    case 'anvil': if (me || near) sfx('anvil'); break;
    case 'hit':
      if (me) { sfx(e.kind === 'spikes' ? 'spikes' : 'hit'); if (!sync) hitStop = 0.08; }
      else if (near && e.kind !== 'lightning') sfx('hit');
      if (e.from === race.player.id && !me && e.kind !== 'lightning' && !sync) hitStop = Math.max(hitStop, 0.05);
      if (e.from === race.player.id && !me) banner(`${nameOf(r)} vuruldu!`);
      break;
    case 'blocked': if (me || near) sfx('blocked'); break;
    case 'sawBreak': case 'sawCut': if (Math.abs(e.x - race.player.x) < 700) sfx('sawBreak'); break;
    case 'sawBounce': if (Math.abs(e.x - race.player.x) < 700) sfx('sawBreak'); break;
    case 'trap': if (me || near) sfx('trap'); break;
    case 'pad': if (me) sfx('pad'); break;
    case 'paw': if (me || near) sfx('paw'); break;
    case 'fall': if (me) sfx('fall'); break;
    case 'respawn': if (me) sfx('respawn'); break;
    case 'finish':
      if (me) {
        sfx('finish');
        countdown(e.place === 1 ? 'BİRİNCİ!' : `${e.place}. OLDUN`, true);
        stopMusic();
      } else banner(`${nameOf(r)} bitirdi! (${e.place}.)`);
      break;
    case 'done': showResults(e.results); break;
    default:
  }
}

function fmtTime(s) {
  const m = Math.floor(s / 60);
  const sec = s - m * 60;
  return `${m}:${sec.toFixed(2).padStart(5, '0')}`;
}

function showResults(given) {
  if (mode === 'results') return;
  mode = 'results';
  const res = given || results(race);
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
    li.innerHTML = `<span class="medal">${medals[r.place - 1]}</span><img alt="" src="${portrait(r.animal, 80)}"><span class="nm"></span><span class="tm">${r.time !== null ? fmtTime(r.time) : '—'}</span>`;
    li.querySelector('.nm').textContent = (r.name || ANIMAL[r.animal].name) + (r.id === race.player.id ? ' (Sen)' : '');
    list.appendChild(li);
  }
  const guest = online.role === 'guest';
  show('btn-again', !guest);
  show('res-wait', guest);
  $('btn-menu').textContent = !online.role ? 'Menü' : guest ? 'Odadan Çık' : 'Lobiye Dön';
  show('hud', false);
  show('results', true);
}

function pause() {
  if (mode !== 'race') return;
  if (sync) {
    // Online races can't stop for one player: just show the panel over the running race.
    show('pause-online', true);
    $('btn-quit').textContent = 'Odadan Çık';
    show('pause', true);
    return;
  }
  show('pause-online', false);
  $('btn-quit').textContent = 'Menüye Dön';
  mode = 'pause';
  show('pause', true);
  stopMusic();
}
function resume() {
  if (sync) { show('pause', false); return; }
  if (mode !== 'pause') return;
  mode = 'race';
  show('pause', false);
  if (!race.player.finished) startMusic(THEMES[race.T.theme].music);
  last = performance.now();
}

// ---- Input ----

const input = { jumpQueued: false, hold: false, itemQueued: false, itemAngle: null, duckQueued: false, pawQueued: false, pawAngle: 0 };

// ---- Aiming (Brawl Stars style): the blue paw and the items ----
// Hold 🐾 or the item button: nothing happens until you let go. For the paw, a saw or a trap, drag
// to aim all the way round: the direction from where you pressed to your finger. Only this screen
// shows the arrow and path; everyone sees the animal point (or hold the item up). Let go to use;
// a tap uses the plain way (paw forward, saw rolling forward, trap dropped behind). Keyboard:
// hold Q (paw) or E (item), turn the aim with ↑/↓, let go.
const aim = { on: false, kind: null, item: null, aimed: false, moved: false, angle: 0, src: null, x0: 0, y0: 0, keyDir: 0 };
const AIM_BTN = { paw: 'btn-paw', item: 'btn-item' };
const AIM_KNOB = { paw: 'paw-knob', item: 'item-knob' };
const pawReady = () => race && mode === 'race' && race.phase === 'race' && race.player.paw >= 1 && race.player.dash <= 0 && race.player.dead <= 0 && !race.player.finished;
const itemReady = () => race && mode === 'race' && race.phase === 'race' && !!race.player.item && race.player.rolling <= 0 && race.player.dead <= 0 && !race.player.finished;
function setKnob(x, y) { if (aim.kind) $(AIM_KNOB[aim.kind]).style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`; }
// The default aim before any drag: where the plain use would go.
const defaultAngle = () => (aim.kind === 'item' && aim.item === 'trap' ? Math.PI : 0);
function aimStart(kind, src, x, y) {
  if (aim.on || !(kind === 'paw' ? pawReady() : itemReady())) return false;
  const item = kind === 'item' ? race.player.item : null;
  Object.assign(aim, { on: true, kind, item, aimed: kind === 'paw' || AIMED_ITEMS.has(item), moved: false, src, x0: x, y0: y, keyDir: 0 });
  aim.angle = defaultAngle();
  $(AIM_BTN[kind]).classList.add('aiming');
  setKnob(0, 0);
  sfx('aim');
  return true;
}
function aimMove(x, y) {
  const dx = x - aim.x0;
  const dy = y - aim.y0;
  const d = Math.hypot(dx, dy);
  if (!aim.aimed) return; // lightning, anvil, shield, speed: just hold and let go
  const k = d > 30 ? 30 / d : 1;
  setKnob(dx * k, dy * k);
  if (d > 10) { aim.angle = normAngle(Math.atan2(-dy, dx)); aim.moved = true; }
}
function aimEnd(fire) {
  if (!aim.on) return;
  const { kind, angle, moved } = aim;
  setKnob(0, 0);
  $(AIM_BTN[kind]).classList.remove('aiming');
  Object.assign(aim, { on: false, kind: null, item: null, src: null, keyDir: 0 });
  if (!fire) return;
  if (kind === 'paw') {
    input.pawQueued = true;
    input.pawAngle = moved ? angle : 0;
  } else {
    input.itemQueued = true;
    input.itemAngle = moved ? angle : null;
  }
}
// What the runner shows while a button is held: the aim, or the item held up for the rest.
function aimInput() {
  if (!aim.on) return { aim: null, aimKind: null };
  const kind = aim.kind === 'paw' ? 'paw' : aim.item;
  return { aim: aim.aimed ? aim.angle : Math.PI / 2, aimKind: kind, aimPlain: aim.aimed && !aim.moved };
}
// EĞİL is a tap, like jumping: one press slides for a moment (or dives in the air).
function duckPress() {
  initAudio();
  input.duckQueued = true;
  const b = $('btn-duck');
  b.classList.add('down');
  setTimeout(() => b.classList.remove('down'), 140);
}
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
const DUCK_KEYS = new Set(['ArrowDown', 'KeyS']);
const PAW_KEYS = new Set(['KeyQ', 'ShiftLeft', 'ShiftRight']);
window.addEventListener('keydown', (e) => {
  if (mode === 'race' && aim.on && aim.src === 'k' && (e.code === 'ArrowUp' || e.code === 'KeyW' || e.code === 'ArrowDown' || e.code === 'KeyS')) {
    e.preventDefault();
    aim.keyDir = e.code === 'ArrowUp' || e.code === 'KeyW' ? 1 : -1;
    return;
  }
  if (mode === 'race') {
    if (JUMP_KEYS.has(e.code)) { e.preventDefault(); if (!e.repeat) jumpDown('k' + e.code); }
    else if (ITEM_KEYS.has(e.code)) { e.preventDefault(); if (!e.repeat) aimStart('item', 'k', 0, 0); }
    else if (DUCK_KEYS.has(e.code)) { e.preventDefault(); if (!e.repeat) duckPress(); }
    else if (PAW_KEYS.has(e.code)) { e.preventDefault(); if (!e.repeat) aimStart('paw', 'k', 0, 0); }
    else if (e.code === 'Escape' || e.code === 'KeyP') pause();
  } else if (mode === 'pause' && (e.code === 'Escape' || e.code === 'KeyP')) resume();
  else if (mode === 'splash' && (e.code === 'Space' || e.code === 'Enter') && !e.repeat) { e.preventDefault(); leaveSplash(); }
  else if (mode === 'menu' && (e.code === 'Space' || e.code === 'Enter') && !e.target.closest?.('input') && $('online').classList.contains('hidden')) { e.preventDefault(); startRace(); }
  else if (mode === 'results' && (e.code === 'Space' || e.code === 'Enter') && online.role !== 'guest') { e.preventDefault(); startRace(); }
});
window.addEventListener('keyup', (e) => {
  if (aim.src === 'k' && ((aim.kind === 'paw' && PAW_KEYS.has(e.code)) || (aim.kind === 'item' && ITEM_KEYS.has(e.code)))) aimEnd(true);
  if (aim.src === 'k' && ['ArrowUp', 'KeyW', 'ArrowDown', 'KeyS'].includes(e.code)) aim.keyDir = 0;
  if (JUMP_KEYS.has(e.code)) jumpUp('k' + e.code);
});

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
for (const kind of ['paw', 'item']) {
  const btn = $(AIM_BTN[kind]);
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    initAudio();
    if (aimStart(kind, 'p' + e.pointerId, e.clientX, e.clientY)) {
      try { btn.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
    }
  });
  btn.addEventListener('pointermove', (e) => { if (aim.src === 'p' + e.pointerId) aimMove(e.clientX, e.clientY); });
  btn.addEventListener('pointerup', (e) => { if (aim.src === 'p' + e.pointerId) aimEnd(true); });
  btn.addEventListener('pointercancel', (e) => { if (aim.src === 'p' + e.pointerId) aimEnd(false); });
}
$('btn-duck').addEventListener('pointerdown', (e) => { e.preventDefault(); duckPress(); });
window.addEventListener('blur', () => { held.clear(); input.hold = false; if (!sync) pause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && !sync) pause(); });

$('btn-race').addEventListener('click', startRace);
$('btn-again').addEventListener('click', startRace);
$('btn-menu').addEventListener('click', () => {
  sfx('click');
  if (online.role === 'host') { race = null; sync = null; online.toLobby(); return; }
  if (online.role) leaveOnline();
  toMenu();
});
$('btn-pause').addEventListener('click', pause);
$('btn-resume').addEventListener('click', () => { sfx('click'); resume(); });
$('btn-quit').addEventListener('click', () => { sfx('click'); if (online.role) leaveOnline(); toMenu(); });
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

// ---- Online ----

let sync = null; // createHostSync / createGuestSync for the current online race
const online = createOnline({
  lobby: (state) => showLobby(state),
  start: (info) => startOnlineRace(info),
  message: (msg) => { if (sync && sync.receive && online.role === 'guest') sync.receive(msg); },
  closed: (text) => { sync = null; toMenu(); toast(text); },
  error: (text) => toast(text),
});

function setStatus(text, err) {
  const el = $('online-status');
  el.textContent = text;
  el.classList.toggle('err', !!err);
}

function playerName() {
  const n = $('player-name').value.trim().slice(0, 12);
  save.name = n;
  store();
  return n || 'Oyuncu';
}

let busy = false;
async function hostOnline() {
  if (busy) return;
  busy = true;
  initAudio();
  sfx('click');
  setStatus('Oda açılıyor…');
  try {
    await online.host({ name: playerName(), animal: save.animal, map: save.map === 'mix' ? 'mix' : save.map });
    setStatus('');
  } catch (err) {
    setStatus(err.message, true);
  }
  busy = false;
}

async function joinOnline() {
  if (busy) return;
  const code = cleanCode($('join-code').value);
  $('join-code').value = code;
  if (code.length !== 4) { setStatus('Oda kodu 4 harf olmalı.', true); return; }
  busy = true;
  initAudio();
  sfx('click');
  setStatus('Bağlanılıyor…');
  try {
    await online.join(code, { name: playerName(), animal: save.animal });
    setStatus('');
  } catch (err) {
    setStatus(err.message, true);
  }
  busy = false;
}

function leaveOnline() {
  online.leave();
  sync = null;
}

function buildLobbyMaps() {
  const row = $('lobby-maps');
  for (const id of [...THEME_IDS, 'mix']) {
    const b = document.createElement('button');
    b.className = 'map-chip';
    b.dataset.id = id;
    b.textContent = id === 'mix' ? '🎲 Karışık' : `${THEMES[id].icon} ${THEMES[id].name}`;
    b.addEventListener('click', () => { sfx('click'); online.setMap(id); });
    row.appendChild(b);
  }
}

function showLobby(state) {
  // The host's lobby updates (someone left mid-race) wait until the host goes back to it.
  if (state.role === 'host' && (mode === 'race' || mode === 'results') && race) return;
  mode = 'lobby';
  race = null;
  sync = null;
  stopMusic();
  for (const id of ['menu', 'hud', 'pause', 'results', 'online']) show(id, false);
  show('lobby', true);
  $('lobby-code').textContent = state.code || '----';
  const host = state.role === 'host';
  show('lobby-host', host);
  show('lobby-wait', !host);
  $('lobby-hint').textContent = (host ? 'Arkadaşların "Arkadaşla Oyna"dan bu kodu girsin. ' : 'Odaya girdin! ') + 'Kartına dokunup hayvanını değiştirebilirsin.';
  document.querySelectorAll('#lobby-maps .map-chip').forEach((el) => el.classList.toggle('on', el.dataset.id === state.map));
  $('btn-bots').setAttribute('aria-pressed', String(state.bots));
  const list = $('lobby-list');
  list.innerHTML = '';
  for (let i = 0; i < 4; i++) {
    const p = state.players[i];
    const li = document.createElement('li');
    if (p) {
      const mine = p.pid === state.me;
      if (mine) li.className = 'me';
      li.innerHTML = `<img alt="" src="${portrait(p.animal, 96)}"><span class="pn"></span><small></small>`;
      li.querySelector('.pn').textContent = p.name;
      li.querySelector('small').textContent = [p.host ? 'Kurucu' : '', mine ? 'Sen' : ''].filter(Boolean).join(' · ');
      if (mine) {
        li.addEventListener('click', () => {
          sfx('click');
          const taken = new Set(state.players.filter((q) => q.pid !== p.pid).map((q) => q.animal));
          const ids = ANIMALS.map((a) => a.id);
          let k = ids.indexOf(p.animal);
          do { k = (k + 1) % ids.length; } while (taken.has(ids[k]));
          save.animal = ids[k];
          store();
          online.setAnimal(ids[k]);
        });
      }
    } else {
      li.className = 'empty';
      li.innerHTML = state.bots ? '🤖<span>Bot</span>' : '<span>Boş</span>';
    }
    list.appendChild(li);
  }
}

function startOnlineRace(info) {
  initAudio();
  goFullscreen();
  race = createRace({ seed: info.seed, theme: info.theme, role: info.role, roster: info.roster, me: info.me });
  if (info.role === 'host') {
    sync = createHostSync(race, info.peers, (to, msg) => online.send(to, msg));
    online.attachHostSync(sync);
  } else {
    sync = createGuestSync(race, (msg) => online.send(null, msg));
  }
  mode = 'race';
  beginRace();
}

function hostStart() {
  if (online.role !== 'host') return;
  sfx('click');
  startOnlineRace(online.start());
}

function hostRematch() {
  if (online.role !== 'host') return;
  hostStart();
}

function netTick(dt) {
  sync.tick(dt);
  if (online.role === 'guest') {
    for (const e of sync.takeEvents()) handleEvent(e);
    if (sync.silence > 6) {
      leaveOnline();
      toMenu();
      toast('Oda kurucuyla bağlantı koptu.');
    }
  }
}

$('btn-online').addEventListener('click', () => {
  initAudio();
  sfx('click');
  $('player-name').value = save.name || '';
  setStatus('');
  show('online', true);
});
$('btn-online-back').addEventListener('click', () => { sfx('click'); show('online', false); });
$('btn-host').addEventListener('click', hostOnline);
$('btn-join').addEventListener('click', joinOnline);
$('join-code').addEventListener('input', (e) => { e.target.value = cleanCode(e.target.value); });
$('join-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') joinOnline(); });
$('btn-start').addEventListener('click', hostStart);
$('btn-bots').addEventListener('click', () => { sfx('click'); online.setBots(!online.state.bots); });
$('btn-leave').addEventListener('click', () => { sfx('click'); leaveOnline(); toMenu(); });
buildLobbyMaps();

// ---- Loop ----

let last = performance.now();
function frame(now, fromRaf) {
  if (fromRaf !== false) requestAnimationFrame((t) => frame(t, true));
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const t = now / 1000;
  if (mode === 'splash') updateSplash(now);
  if (mode === 'menu') drawPreview(t);
  let drawDt = mode === 'race' ? dt : 0;
  if (race && mode === 'race') {
    if (hitStop > 0 && !sync) {
      // A tiny freeze on big hits makes them land.
      hitStop -= dt;
      drawDt = dt * 0.15;
    } else {
      // Split the frame into equal sub-steps no longer than STEP: smooth on any refresh rate.
      const n = Math.max(1, Math.ceil(dt / STEP - 0.01));
      const sdt = dt / n;
      if (aim.on) {
        if (!(aim.kind === 'paw' ? pawReady() : itemReady())) aimEnd(false);
        else if (aim.src === 'k' && aim.aimed) {
          if (aim.keyDir) { aim.angle = normAngle(aim.angle + aim.keyDir * dt * 2.6); aim.moved = true; }
          setKnob(Math.cos(aim.angle) * 22, -Math.sin(aim.angle) * 22);
        }
      }
      for (let i = 0; i < n && mode === 'race'; i++) {
        const inp = { jump: input.jumpQueued, hold: input.hold, item: input.itemQueued, itemAngle: input.itemAngle, duck: input.duckQueued, paw: input.pawQueued, pawAngle: input.pawAngle, ...aimInput() };
        input.jumpQueued = false;
        input.duckQueued = false;
        input.itemQueued = false;
        input.pawQueued = false;
        stepRace(race, sdt, inp);
        for (const e of race.events) { if (sync && sync.event) sync.event(e); handleEvent(e); }
        race.events.length = 0;
      }
    }
    if (sync) netTick(dt);
    updateHud(t);
  }
  if (race && mode === 'results' && sync) netTick(dt); // the room keeps talking on the results screen
  if (race) {
    renderer.draw(drawDt, t);
    if (mode === 'race') renderer.reportFrame(dt);
  }
}

buildMenu();
renderer.resize();
checkRotate();
boot();
requestAnimationFrame(frame);

if ('serviceWorker' in navigator && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// ---- Installing to the phone ----
// Android Chrome/Edge/Samsung offer a one-tap install prompt (beforeinstallprompt); iPhones and
// in-app browsers (Instagram, Telegram...) don't, so the guide explains the menu steps instead.

let installPrompt = null;
const installed = () => matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches || navigator.standalone === true;
function refreshInstall() { show('btn-install', !installed()); }
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e;
  refreshInstall();
});
window.addEventListener('appinstalled', () => {
  installPrompt = null;
  show('install', false);
  refreshInstall();
  toast('Yüklendi! Ana ekranında Man Run simgesi var.');
});

function installSteps() {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const inApp = /Instagram|FBAN|FBAV|FB_IAB|Line\/|Telegram|Snapchat|musical_ly|BytedanceWebview|; wv\)/.test(ua);
  const samsung = /SamsungBrowser/.test(ua);
  const android = /Android/.test(ua);
  if (inApp) {
    return [
      'Bu sayfa bir uygulamanın içinde açılmış; buradan yüklenemiyor.',
      `Sağ üstteki <b>⋮</b> ya da <b>…</b> menüsünden <b>${ios ? "Safari'de aç" : "Chrome'da aç"}</b>'ı seç.`,
      'Açılan tarayıcıda bu menüye tekrar gel ve <b>📲 Telefona Yükle</b>\'ye dokun.',
    ];
  }
  if (ios) {
    return [
      'Ekranın altındaki (iPad\'de üstündeki) <b>Paylaş</b> düğmesine dokun: içinden yukarı ok çıkan kare ⬆️.',
      'Listeyi biraz kaydır ve <b>Ana Ekrana Ekle</b>\'yi seç.',
      'Sağ üstteki <b>Ekle</b>\'ye dokun. Man Run simgesi ana ekranına gelir.',
    ];
  }
  if (samsung) {
    return [
      'Alttaki <b>≡</b> menü düğmesine dokun.',
      '<b>Sayfayı ekle</b> → <b>Ana ekran</b>\'ı seç.',
      '<b>Ekle</b>\'ye dokun.',
    ];
  }
  if (android) {
    return [
      "Chrome'da sağ üstteki <b>⋮</b> menüsüne dokun.",
      '<b>Uygulamayı yükle</b> ya da <b>Ana ekrana ekle</b>\'yi seç.',
      '<b>Yükle</b>\'ye dokun. Man Run simgesi ana ekranına gelir.',
    ];
  }
  return [
    "Chrome ya da Edge'de adres çubuğunun sağındaki <b>yükle</b> simgesine (⊕ ya da 🖥️) tıkla.",
    'Ya da tarayıcı menüsünden <b>Man Run\'ı yükle</b>\'yi seç.',
  ];
}

function openInstall() {
  initAudio();
  sfx('click');
  const list = $('install-steps');
  list.innerHTML = '';
  if (installPrompt) {
    show('btn-install-go', true);
    const li = document.createElement('li');
    li.innerHTML = 'Aşağıdaki <b>Yükle</b> düğmesine dokun, çıkan pencerede de <b>Yükle</b>\'yi seç.';
    list.appendChild(li);
  } else {
    show('btn-install-go', false);
    for (const step of installSteps()) {
      const li = document.createElement('li');
      li.innerHTML = step;
      list.appendChild(li);
    }
  }
  show('install', true);
}

$('btn-install').addEventListener('click', openInstall);
$('btn-install-close').addEventListener('click', () => { sfx('click'); show('install', false); });
$('btn-install-go').addEventListener('click', async () => {
  if (!installPrompt) return;
  const p = installPrompt;
  installPrompt = null;
  p.prompt();
  const choice = await p.userChoice.catch(() => null);
  if (!choice || choice.outcome !== 'accepted') openInstall();
});
refreshInstall();

// Test hook on localhost.
if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
  // advance(s): run the race s seconds synchronously (hidden panes throttle animation frames).
  const advance = (sec) => {
    for (let i = 0; i < sec / STEP && race && mode === 'race'; i++) {
      stepRace(race, STEP, { jump: input.jumpQueued, hold: input.hold, item: input.itemQueued, itemAngle: input.itemAngle, duck: input.duckQueued, paw: input.pawQueued, pawAngle: input.pawAngle, ...aimInput() });
      input.jumpQueued = false;
      input.duckQueued = false;
      input.itemQueued = false;
      input.pawQueued = false;
      for (const e of race.events) handleEvent(e);
      race.events.length = 0;
      if (i % 2 === 0) renderer.draw(STEP * 2, performance.now() / 1000 + i * STEP);
    }
    updateHud(performance.now() / 1000);
  };
  // pump(): drive the game loop from a MessageChannel, which background tabs don't throttle
  // (two tabs racing each other in the browser pane).
  let pumping = false;
  const pump = () => {
    if (pumping) return;
    pumping = true;
    const ch = new MessageChannel();
    let lastFrame = 0;
    ch.port1.onmessage = () => {
      if (!pumping) return;
      const now = performance.now();
      if (now - lastFrame >= 16) { lastFrame = now; frame(now, false); }
      ch.port2.postMessage(0);
    };
    ch.port2.postMessage(0);
  };
  window.manrun = { get race() { return race; }, get mode() { return mode; }, get online() { return online; }, aim, aimStart, aimMove, aimEnd, startRace, renderer, input, advance, pump, stopPump: () => { pumping = false; }, useItem: (id) => { race.player.item = id; race.player.rolling = 0; input.itemQueued = true; } };
}
