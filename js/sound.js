// Soft synthesized sound effects and a mellow race tune (Web Audio, no files).
// Everything goes through a gentle low-pass, a small generated room reverb and a compressor, and
// effects use round waveforms (sine/triangle, filtered noise) so nothing is shrill.
// The audio context starts on the first tap (browsers require a gesture).

let ac = null;
let master = null;
let sfxBus = null;
let musicBus = null;
let verb = null;
let noiseBuf = null;
const settings = { sound: true, music: true };
const SFX_VOL = 0.75;
const MUSIC_VOL = 0.2;

export function initAudio() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ac = new AC();
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.ratio.value = 3;
  comp.attack.value = 0.01;
  comp.release.value = 0.2;
  const tone = ac.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = 7000;
  master = ac.createGain();
  master.gain.value = 0.85;
  master.connect(tone).connect(comp).connect(ac.destination);

  // Small room reverb from decaying noise.
  verb = ac.createConvolver();
  const len = Math.floor(ac.sampleRate * 1.6);
  const ir = ac.createBuffer(2, len, ac.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  }
  verb.buffer = ir;
  const verbGain = ac.createGain();
  verbGain.gain.value = 0.28;
  verb.connect(verbGain).connect(master);

  sfxBus = ac.createGain();
  sfxBus.gain.value = settings.sound ? SFX_VOL : 0;
  sfxBus.connect(master);
  musicBus = ac.createGain();
  musicBus.gain.value = settings.music ? MUSIC_VOL : 0;
  musicBus.connect(master);
  const send = ac.createGain();
  send.gain.value = 0.5;
  sfxBus.connect(send).connect(verb);
  const msend = ac.createGain();
  msend.gain.value = 0.7;
  musicBus.connect(msend).connect(verb);

  noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}

export function setSound(on) { settings.sound = on; if (sfxBus) sfxBus.gain.setTargetAtTime(on ? SFX_VOL : 0, ac.currentTime, 0.05); }
export function setMusic(on) { settings.music = on; if (musicBus) musicBus.gain.setTargetAtTime(on ? MUSIC_VOL : 0, ac.currentTime, 0.1); }

// A shaped tone. lp: low-pass cutoff (Hz) to round off triangle/saw tones.
function tone({ type = 'sine', f = 440, f2 = null, t = 0, dur = 0.15, vol = 0.2, attack = 0.008, bus = sfxBus, curve = 'exp', lp = 0, detune = 0 }) {
  if (!ac) return;
  const now = ac.currentTime + t;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, now);
  if (detune) o.detune.value = detune;
  if (f2) {
    if (curve === 'exp') o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), now + dur);
    else o.frequency.linearRampToValueAtTime(f2, now + dur);
  }
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(vol, now + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  let node = o;
  if (lp) {
    const fl = ac.createBiquadFilter();
    fl.type = 'lowpass';
    fl.frequency.value = lp;
    o.connect(fl);
    node = fl;
  }
  node.connect(g).connect(bus);
  o.start(now);
  o.stop(now + dur + 0.05);
}

function noise({ t = 0, dur = 0.2, vol = 0.2, freq = 1200, q = 1, type = 'bandpass', f2 = null, attack = 0.005, bus = sfxBus }) {
  if (!ac) return;
  const now = ac.currentTime + t;
  const src = ac.createBufferSource();
  src.buffer = noiseBuf;
  const fl = ac.createBiquadFilter();
  fl.type = type;
  fl.frequency.setValueAtTime(freq, now);
  if (f2) fl.frequency.exponentialRampToValueAtTime(f2, now + dur);
  fl.Q.value = q;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(vol, now + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  src.connect(fl).connect(g).connect(bus);
  src.start(now, Math.random() * 0.5);
  src.stop(now + dur + 0.05);
}

// A soft bell: two sines a twelfth apart with a quick shimmer.
function bell(f, t = 0, vol = 0.1, dur = 0.5, bus = sfxBus) {
  tone({ f, t, dur, vol, bus });
  tone({ f: f * 3, t, dur: dur * 0.5, vol: vol * 0.25, bus });
  tone({ f: f * 2.01, t, dur: dur * 0.7, vol: vol * 0.3, bus });
}

const jitter = (f, k = 0.04) => f * (1 + (Math.random() - 0.5) * k);

const SFX = {
  jump() { tone({ f: jitter(330), f2: jitter(560), dur: 0.14, vol: 0.12 }); noise({ dur: 0.08, vol: 0.04, freq: 1800, q: 0.7 }); },
  land() { tone({ f: 120, f2: 60, dur: 0.1, vol: 0.14 }); noise({ dur: 0.08, vol: 0.06, freq: 400, type: 'lowpass' }); },
  box() { [784, 988, 1175].forEach((f, i) => bell(f, i * 0.05, 0.07, 0.4)); noise({ dur: 0.1, vol: 0.05, freq: 3000, q: 0.8 }); },
  itemReady() { bell(1047, 0, 0.08, 0.35); bell(1568, 0.09, 0.08, 0.5); },
  roll() { tone({ type: 'triangle', f: jitter(700, 0.3), dur: 0.05, vol: 0.035, lp: 2500 }); },
  lightning() {
    noise({ dur: 0.12, vol: 0.32, freq: 2500, q: 0.5 });
    noise({ t: 0.03, dur: 0.9, vol: 0.22, freq: 900, f2: 120, q: 0.4, type: 'lowpass' });
    tone({ f: 70, f2: 38, t: 0.02, dur: 0.9, vol: 0.28 });
  },
  saw() { noise({ dur: 0.45, vol: 0.12, freq: 1400, f2: 2600, q: 4 }); tone({ type: 'triangle', f: 380, f2: 520, dur: 0.35, vol: 0.06, lp: 1800 }); },
  sawBreak() { noise({ dur: 0.12, vol: 0.14, freq: 3200, q: 2 }); bell(1400, 0, 0.05, 0.25); },
  trapSet() { tone({ type: 'triangle', f: 260, dur: 0.06, vol: 0.08, lp: 1500 }); noise({ t: 0.03, dur: 0.05, vol: 0.06, freq: 2200, q: 3 }); },
  trap() { noise({ dur: 0.06, vol: 0.22, freq: 2800, q: 4 }); tone({ f: 200, f2: 90, dur: 0.15, vol: 0.14 }); },
  anvilWarn() { bell(1320, 0, 0.06, 0.15); bell(1320, 0.16, 0.06, 0.15); },
  anvil() { [180, 470, 745].forEach((f, i) => tone({ f, dur: 0.7 - i * 0.15, vol: 0.14 - i * 0.03 })); noise({ dur: 0.12, vol: 0.18, freq: 350, type: 'lowpass' }); },
  hit() { tone({ f: jitter(300), f2: 140, dur: 0.2, vol: 0.16 }); noise({ dur: 0.08, vol: 0.08, freq: 900, q: 1 }); },
  spikes() { tone({ f: jitter(520), f2: 260, dur: 0.18, vol: 0.12 }); noise({ dur: 0.07, vol: 0.08, freq: 2400, q: 2 }); },
  blocked() { bell(1760, 0, 0.06, 0.3); tone({ f: 880, f2: 1320, dur: 0.15, vol: 0.05 }); },
  shield() { [523, 784, 1047].forEach((f, i) => bell(f, i * 0.05, 0.06, 0.6)); },
  speed() { noise({ dur: 0.55, vol: 0.14, freq: 500, f2: 2600, q: 1.2 }); tone({ f: 220, f2: 660, dur: 0.4, vol: 0.07 }); },
  pad() { tone({ f: 440, f2: 990, dur: 0.18, vol: 0.1 }); noise({ dur: 0.2, vol: 0.06, freq: 1500, f2: 3500, q: 1 }); },
  fall() { tone({ f: 880, f2: 220, dur: 0.75, vol: 0.1, curve: 'lin' }); },
  respawn() { bell(660, 0, 0.06, 0.25); bell(990, 0.07, 0.06, 0.3); },
  tick() { bell(660, 0, 0.1, 0.3); },
  go() { bell(1320, 0, 0.11, 0.6); bell(660, 0, 0.08, 0.6); },
  finish() { [523, 659, 784, 1047].forEach((f, i) => bell(f, i * 0.09, 0.08, 0.5)); },
  win() { [784, 988, 1175, 1568, 1319, 1568].forEach((f, i) => bell(f, i * 0.12, 0.08, 0.6)); },
  lose() { [523, 494, 440, 392].forEach((f, i) => tone({ type: 'triangle', f, t: i * 0.18, dur: 0.35, vol: 0.08, lp: 1500 })); },
  click() { tone({ f: 900, dur: 0.05, vol: 0.06 }); },
};

export function sfx(name) {
  if (!ac || !settings.sound) return;
  const f = SFX[name];
  if (f) f();
}

// ---- Music: a mellow loop (soft keys, round bass, light drums) ----

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
// Chords as semitone offsets from the key's root, 8 bars.
const PROG = {
  major: [[0, 4, 7, 11], [9, 12, 16, 19], [5, 9, 12, 16], [7, 11, 14, 17], [0, 4, 7, 11], [9, 12, 16, 19], [2, 5, 9, 12], [7, 11, 14, 17]],
  mixo: [[0, 4, 7, 10], [10, 14, 17, 21], [5, 9, 12, 16], [0, 4, 7, 10], [0, 4, 7, 10], [10, 14, 17, 21], [5, 9, 12, 16], [7, 10, 14, 17]],
};
// Pentatonic melody steps (scale degrees, null = rest) over 2 bars of 8ths; A and B phrases.
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16];
const PHRASES = [
  [4, null, 3, 2, null, 2, 3, null, 4, null, null, 5, 4, null, 3, null],
  [2, null, 3, 4, null, 5, 4, null, 3, null, 2, null, 1, null, null, null],
  [5, null, 4, null, 3, 4, 5, null, 6, null, 5, null, 4, null, null, null],
  [3, null, 2, null, 1, null, 2, 3, 2, null, null, 0, 1, null, null, null],
];

let musicTimer = null;
let nextTime = 0;
let stepN = 0;
let mood = { root: 53, tempo: 104, mode: 'major', lead: 'pluck' };

export function startMusic(m) {
  if (!ac) return;
  stopMusic();
  if (m) mood = m;
  nextTime = ac.currentTime + 0.15;
  stepN = 0;
  musicTimer = setInterval(schedule, 50);
}

export function stopMusic() {
  if (musicTimer) clearInterval(musicTimer);
  musicTimer = null;
}

function keys(f, t, dur, vol) {
  // Soft electric-piano-ish: sine + a quiet octave, slow-ish attack.
  tone({ f, t, dur, vol, attack: 0.02, bus: musicBus });
  tone({ f: f * 2, t, dur: dur * 0.6, vol: vol * 0.25, attack: 0.01, bus: musicBus });
}

function schedule() {
  if (!ac) return;
  const step = 60 / mood.tempo / 2; // 8th notes
  const prog = PROG[mood.mode] || PROG.major;
  while (nextTime < ac.currentTime + 0.3) {
    const t = nextTime - ac.currentTime;
    const bar = Math.floor(stepN / 8) % prog.length;
    const s = stepN % 8;
    const chord = prog[bar];
    const root = mood.root;
    const swing = s % 2 ? step * 0.12 : 0;
    // Drums: soft kick on 1 and 3, brushy snare on 2 and 4, gentle shaker.
    if (s === 0 || s === 4) tone({ f: 110, f2: 45, t, dur: 0.22, vol: 0.32, bus: musicBus });
    if (s === 2 || s === 6) noise({ t, dur: 0.14, vol: 0.06, freq: 2200, q: 0.6, bus: musicBus });
    noise({ t: t + swing, dur: 0.04, vol: s % 2 ? 0.02 : 0.03, freq: 7000, type: 'highpass', bus: musicBus });
    // Bass: root on 1, fifth on the "and" of 2, root on 3.
    if (s === 0 || s === 4) tone({ type: 'triangle', f: midi(root - 12 + chord[0]), t, dur: step * 1.8, vol: 0.22, lp: 600, bus: musicBus });
    if (s === 3) tone({ type: 'triangle', f: midi(root - 12 + chord[0] + 7), t: t + swing, dur: step * 0.9, vol: 0.16, lp: 600, bus: musicBus });
    // Keys: chord on 1 (held), light stab on the "and" of 3.
    if (s === 0) for (const n of chord) keys(midi(root + n), t, step * 6, 0.035);
    if (s === 5) for (const n of chord.slice(1)) keys(midi(root + 12 + n), t + swing, step * 1.2, 0.018);
    // Melody: phrases A A' B A'' over 8 bars, rests between.
    const phrase = PHRASES[[0, 1, 2, 3][Math.floor(bar / 2) % 4]];
    const deg = phrase[(bar % 2) * 8 + s];
    if (deg !== null && deg !== undefined) {
      const f = midi(root + 12 + PENTA[deg]);
      if (mood.lead === 'bell') bell(f, t + swing, 0.03, step * 3, musicBus);
      else {
        tone({ type: 'triangle', f, t: t + swing, dur: step * 2.2, vol: 0.05, lp: 2200, bus: musicBus });
        tone({ f: f * 2, t: t + swing, dur: step, vol: 0.012, bus: musicBus });
      }
    }
    nextTime += step;
    stepN++;
  }
}
