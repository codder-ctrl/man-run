// Computer runners. Every few frames a bot asks the physics "what if I keep running?" and,
// when trouble shows up ahead, "what if I jump now?". Reaction chance and the occasional
// hesitation make them beatable. Items are used with simple rules after a short delay.

import { PHYS } from './config.js';
import { simulate } from './physics.js';

const TICK = 1 / 30;

export function createBot(r, skill, R) {
  let acc = 0;
  let holdT = 0;
  let pressJump = false;
  let hesitate = 0;
  let seenDanger = null;
  let itemWait = 0;
  let itemAge = 0;

  const bot = {
    speedMul: 1,
    gotItem() {
      itemWait = skill.itemDelay[0] + R() * (skill.itemDelay[1] - skill.itemDelay[0]);
      itemAge = 0;
    },
    think(race, dt) {
      acc += dt;
      holdT = Math.max(0, holdT - dt);
      hesitate = Math.max(0, hesitate - dt);
      rubberBand(race);
      if (r.item && r.rolling <= 0) items(race, dt);
      if (acc >= TICK) {
        acc = 0;
        decide(race);
      }
      const out = { jump: pressJump, hold: holdT > 0 || r.vy < -60 };
      pressJump = false;
      return out;
    },
  };

  function rubberBand(race) {
    // Far ahead of the humans: ease off a little. Far behind them: push a little.
    const humans = (race.humans || []).filter((h) => !h.finished && h !== r);
    if (r.finished || !humans.length) { bot.speedMul = 1; return; }
    let gap = Infinity;
    for (const h of humans) if (Math.abs(r.x - h.x) < Math.abs(gap)) gap = r.x - h.x;
    const target = gap > 900 ? 0.94 : gap > 500 ? 0.97 : gap < -900 ? 1.07 : gap < -450 ? 1.03 : 1;
    bot.speedMul += (target - bot.speedMul) * 0.02;
  }

  function decide(race) {
    if (r.dead > 0 || r.stun > 0 || !r.grounded && r.coyote <= 0) return;
    if (race.phase !== 'race') return;
    const T = race.T;
    const top = (r.boost > 0 || r.pad > 0 ? PHYS.boost : r.inMud ? PHYS.mud : PHYS.run) * bot.speedMul;
    const ahead = simulate(r, T, top, false, 0.4);
    if (!ahead.danger) { seenDanger = null; return; }
    // New obstacle: sometimes the bot freezes for a moment (that is how they fall in pits).
    const key = Math.round(ahead.x / 40);
    if (seenDanger !== key) {
      seenDanger = key;
      if (R() < skill.slip * (r.finished ? 0 : 1)) hesitate = 0.18 + R() * 0.15;
    }
    if (hesitate > 0) return;
    const jump = simulate(r, T, top, true, 1.4);
    const ok = !jump.danger;
    const urgent = ahead.t < 0.12;
    if ((ok && R() < skill.react + (ahead.t < 0.2 ? 0.3 : 0)) || urgent) {
      pressJump = true;
      holdT = 0.35;
    }
  }

  function items(race, dt) {
    itemAge += dt;
    itemWait -= dt;
    if (itemWait > 0) return;
    const others = race.runners.filter((o) => o !== r && o.dead <= 0 && !o.finished);
    const aheadNear = others.some((o) => o.x > r.x && o.x - r.x < 900 && Math.abs(o.y - r.y) < 120);
    const behindNear = others.some((o) => o.x < r.x && r.x - o.x < 500);
    const threat = race.saws.some((s) => s.owner !== r.id && s.x < r.x && r.x - s.x < 400) || race.anvils.some((a) => a.target === r.id && !a.done);
    let use = false;
    switch (r.item) {
      case 'shield': use = threat || itemAge > 4; break;
      case 'saw': use = (aheadNear && r.grounded) || itemAge > 5; break;
      case 'trap': use = (behindNear && r.grounded) || (itemAge > 4 && r.grounded); break;
      case 'anvil': use = r.place > 1 || itemAge > 3; break;
      case 'speed': use = r.grounded; break;
      default: use = true;
    }
    if (use) race.useItem(r);
  }

  return bot;
}
