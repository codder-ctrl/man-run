// Game constants: physics, animals, items. World units: y grows downward, a runner is about
// 60 units tall, the view is VIEW_H units tall whatever the screen size.

export const VERSION = '0.9.0';

export const VIEW_H = 450; // a little wider than before: runners are faster now
export const STEP = 1 / 120; // fixed physics step (seconds)

export const PHYS = {
  gravity: 2000,
  jumpV: 720, // takeoff speed; apex ≈ jumpV² / 2g ≈ 130 units
  jumpCut: 0.6, // releasing early multiplies the rising speed by this...
  minHold: 0.12, // ...but not before this long, so a quick tap still clears a wall
  maxFall: 1100,
  run: 340, // top running speed (raised from 300 in v0.7: the user wanted more speed)
  accel: 800, // speed gained per second while below top speed
  boost: 530, // top speed while boosted (Hız item, speed pads)
  mud: 190, // top speed in mud
  coyote: 0.09, // still allowed to jump this long after leaving a ledge
  buffer: 0.12, // a jump pressed this early before landing still happens
  w: 26, // runner box width
  h: 50, // runner box height
  duckH: 28, // box height while ducking (low roofs leave 32 units)
  slideTime: 0.7, // one press of EĞİL slides this long, then the runner stands up again
  fastFall: 2600, // extra pull while diving (EĞİL pressed in the air)
  moveSlow: 0.8, // top speed multiplier while in the air after a jump and while sliding
  airDecel: 600, // how fast the speed drops to that in the air (on the ground: 1400)
  wallSlide: 70, // clinging to a wall: how fast you slide down it when you stop jumping
  stepUp: 10, // ledges this low are walked up without jumping
  killY: 700, // falling this far below the lowest ground respawns the runner
  respawnDelay: 0.9,
};

// Animals: the player picks one, the bots take the others.
// ears: 'pointy' | 'round' | 'long'; tail: 'bushy' | 'stub' | 'puff' | 'thin'
export const ANIMALS = [
  { id: 'fox', name: 'Tilki', body: '#f08a2c', belly: '#fff3e0', dark: '#8a3c16', accent: '#2e7bd6', ears: 'pointy', tail: 'bushy', snout: 1.0 },
  { id: 'bear', name: 'Ayı', body: '#9a6036', belly: '#e9c79a', dark: '#4e2c18', accent: '#d33b3b', ears: 'round', tail: 'stub', snout: 0.8 },
  { id: 'bunny', name: 'Tavşan', body: '#f2eef4', belly: '#ffd6e2', dark: '#9d8fa6', accent: '#3fb36b', ears: 'long', tail: 'puff', snout: 0.5 },
  { id: 'wolf', name: 'Kurt', body: '#7f8fa6', belly: '#e4e8ef', dark: '#3b4559', accent: '#f2b632', ears: 'pointy', tail: 'bushy', snout: 1.15 },
  { id: 'cat', name: 'Kedi', body: '#3c3a46', belly: '#f3efe9', dark: '#17161c', accent: '#e85d9a', ears: 'pointy', tail: 'thin', snout: 0.45 },
  { id: 'panda', name: 'Panda', body: '#f7f5f0', belly: '#ffffff', dark: '#24222a', accent: '#8a55d6', ears: 'round', tail: 'stub', snout: 0.6, patches: true },
];

// Items from the "?" boxes. weights[place-1]: leaders get defensive items, the last get strong ones.
export const ITEMS = {
  lightning: { name: 'Şimşek', color: '#ffd23f', weights: [1, 3, 5, 7] },
  shield: { name: 'Kalkan', color: '#59c8ff', weights: [6, 4, 3, 2] },
  saw: { name: 'Testere', color: '#c9d2dc', weights: [3, 5, 5, 4] },
  trap: { name: 'Kapan', color: '#9aa3ad', weights: [6, 4, 2, 1] },
  speed: { name: 'Hız', color: '#ff7a2f', weights: [2, 4, 5, 6] },
  anvil: { name: 'Örs', color: '#5d6672', weights: [0, 2, 4, 5] },
};
export const ITEM_IDS = Object.keys(ITEMS);

export const STUN = {
  lightning: 1.4,
  saw: 1.6,
  trap: 2.0,
  anvil: 2.0,
  spikes: 1.1,
};
export const SHIELD_TIME = 6;
export const SPEED_TIME = 3;
export const PAD_TIME = 1.4;
export const BOX_RESPAWN = 4;
export const SAW_SPEED = 840;
export const SAW_R = 30; // saw radius (2.5× the first saws, the user asked for big ones)
export const TRAP_SCALE = 1.5; // traps are 1.5× the first ones
export const TRAP_THROW = 520; // how hard an aimed trap is thrown
export const SAW_LIFE = 3.2;

// Bots: reaction chance per decision tick and how far ahead they look.
export const BOT_SKILL = [
  { react: 0.55, slip: 0.04, itemDelay: [0.4, 1.6] },
  { react: 0.45, slip: 0.06, itemDelay: [0.5, 2.0] },
  { react: 0.38, slip: 0.08, itemDelay: [0.6, 2.4] },
];

// Blue paw: every animal's own dash. It charges over PAW_CHARGE seconds; the extra distance it
// gives is about the same for everyone (short and fast or long and steady).
export const PAW_CHARGE = 15;
export const ABILITIES = {
  fox: { name: 'Tilki Atılışı', speed: 630, time: 1.3, desc: 'kısa ama çok hızlı' },
  bear: { name: 'Ayı Gücü', speed: 520, time: 2.1, desc: 'uzun ve güçlü' },
  bunny: { name: 'Tavşan Sıçrayışı', speed: 585, time: 1.6, desc: 'çevik ve hızlı' },
  wolf: { name: 'Kurt Koşusu', speed: 565, time: 1.8, desc: 'dengeli ve hızlı' },
  cat: { name: 'Kedi Çevikliği', speed: 610, time: 1.5, desc: 'sessiz ve hızlı' },
  panda: { name: 'Bambu Rüzgârı', speed: 530, time: 2.0, desc: 'uzun soluklu' },
};

// Aimed blue paw: hold the 🐾 button and drag to aim (all the way round), release to fire. The
// runner bursts that way for PAW_BURST seconds at its ability speed × PAW_BURST_MUL with gravity
// off, then the usual dash boost carries on. Angles: 0 forward, +π/2 up, ±π backward, -π/2 down.
export const PAW_BURST = 0.22;
export const PAW_BURST_MUL = 1.2;
// Items that can be aimed the same way (the rest are used when the button is let go).
export const AIMED_ITEMS = new Set(['saw', 'trap']);

export const PLACE_NAMES = ['1.', '2.', '3.', '4.'];
