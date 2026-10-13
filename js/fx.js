// Particles and one-shot effects in world units: cartoon dust puffs, box shards, glowing sparks,
// stars, comic "POW" bursts, confetti, fireworks, lightning bolts with branches, shockwaves and
// floating text. Glowing things are drawn additively.

import { blob, flat, line, glow, circle, ellipse, roundRect, poly, star, INK, rgba, lighter, darker } from './paint.js';

const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);

export function createFx() {
  const parts = [];
  const bolts = [];
  const rings = [];
  const texts = [];
  const bursts = [];
  const add = (p) => { if (parts.length < 500) parts.push(p); };

  const api = {
    dust(x, y, n = 5, dir = -1, color = '#efe3cc') {
      for (let i = 0; i < n; i++) {
        add({ k: 'puff', soft: true, x: x + rand(-8, 8), y: y - 4, vx: dir * rand(30, 90) + (dir === 0 ? rand(-90, 90) : 0), vy: rand(-50, -15), drag: 3, life: rand(0.35, 0.6), age: 0, r: rand(3.5, 6.5), color });
      }
    },
    landing(x, y, color = '#efe3cc', hard = false) {
      const n = hard ? 10 : 6;
      for (let i = 0; i < n; i++) {
        const s = i % 2 ? 1 : -1;
        add({ k: 'puff', x: x + s * rand(4, 12), y: y - 3, vx: s * rand(60, 160), vy: rand(-40, -10), drag: 4, life: rand(0.35, 0.6), age: 0, r: rand(5, hard ? 11 : 8), color });
      }
    },
    poof(x, y, color = '#ffffff') {
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU;
        add({ k: 'puff', x: x + Math.cos(a) * 10, y: y + Math.sin(a) * 10, vx: Math.cos(a) * 140, vy: Math.sin(a) * 110, drag: 4, life: 0.6, age: 0, r: rand(9, 14), color });
      }
      api.twinkles(x, y, 6, '#fff6b0');
    },
    twinkles(x, y, n = 6, color = '#fff6b0') {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU;
        const v = rand(60, 160);
        add({ k: 'twinkle', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 2, life: rand(0.4, 0.7), age: 0, r: rand(4, 7), rot: Math.random(), vr: rand(-6, 6), color, add: true });
      }
    },
    shards(x, y, colors = ['#ec3b52', '#ff8a9a', '#ffffff']) {
      for (let i = 0; i < 14; i++) {
        const a = Math.random() * TAU;
        const v = rand(140, 360);
        add({ k: 'shard', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 140, g: 1000, life: 0.8, age: 0, r: rand(3, 6.5), rot: a, vr: rand(-18, 18), color: colors[i % colors.length] });
      }
      api.twinkles(x, y, 8);
      rings.push({ x, y, age: 0, life: 0.35, r: 40, color: '#fff3a0', w: 5 });
      bursts.push({ x, y, age: 0, life: 0.18, r: 30, color: '#ffffff', spikes: 8 });
    },
    sparks(x, y, color = '#ffd23f', n = 10, speed = 1) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU;
        const v = rand(150, 400) * speed;
        add({ k: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, g: 700, life: rand(0.3, 0.55), age: 0, r: 2, color, add: true });
      }
    },
    grind(x, y, dir = -1) {
      // Sparks spraying back off a spinning saw.
      for (let i = 0; i < 2; i++) add({ k: 'spark', x, y, vx: dir * rand(200, 420), vy: rand(-260, -60), g: 900, life: rand(0.2, 0.35), age: 0, r: 2, color: Math.random() < 0.5 ? '#ffd23f' : '#ffffff', add: true });
    },
    stars(x, y) {
      for (let i = 0; i < 6; i++) {
        const a = -Math.PI / 2 + (i - 2.5) * 0.45;
        add({ k: 'star', x, y, vx: Math.cos(a) * 170, vy: Math.sin(a) * 170, g: 520, life: 0.7, age: 0, r: 5.5, rot: 0, vr: 8, color: '#ffd23f' });
      }
    },
    pow(x, y, color = '#fff27a') {
      bursts.push({ x, y, age: 0, life: 0.28, r: 34, color, spikes: 11, outline: true });
      rings.push({ x, y, age: 0, life: 0.3, r: 44, color: '#ffffff', w: 6 });
    },
    confetti(x, y, n = 60) {
      const cols = ['#ff4d5e', '#ffd23f', '#3fb36b', '#2e7bd6', '#e85d9a', '#ffffff'];
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.8;
        const v = rand(260, 640);
        add({ k: 'conf', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 420, drag: 1.6, life: rand(1.8, 2.8), age: 0, r: rand(3, 5), rot: Math.random() * 6, vr: rand(-8, 8), color: cols[i % cols.length] });
      }
    },
    firework(x, y) {
      const cols = ['#ff4d5e', '#ffd23f', '#59c8ff', '#7be05a', '#e85d9a'];
      const c = cols[Math.floor(Math.random() * cols.length)];
      for (let i = 0; i < 26; i++) {
        const a = (i / 26) * TAU;
        const v = rand(180, 240);
        add({ k: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 160, drag: 1.2, life: rand(0.8, 1.1), age: 0, r: 2.6, color: c, add: true });
      }
      rings.push({ x, y, age: 0, life: 0.4, r: 60, color: c, w: 4, add: true });
    },
    smoke(x, y, n = 6, color = '#4a4550') {
      for (let i = 0; i < n; i++) {
        add({ k: 'puff', x: x + rand(-12, 12), y: y - Math.random() * 30, vx: rand(-25, 25), vy: rand(-80, -40), drag: 1, life: rand(0.7, 1.1), age: 0, r: rand(6, 11), color });
      }
    },
    pawPrint(x, y, color = '#4aa8ff') {
      add({ k: 'pawp', x, y, vx: 0, vy: 0, life: 1.1, age: 0, r: 5, rot: Math.random() * 0.4 - 0.2, color });
    },
    speedLine(x, y) {
      add({ k: 'line', x, y, vx: -320, vy: 0, life: 0.22, age: 0, r: rand(18, 36), color: '#ffffff' });
    },
    bolt(x, y, top) {
      const make = (x0, y0, x1, y1, seg) => {
        const pts = [[x0, y0]];
        for (let i = 1; i < seg; i++) {
          const k = i / seg;
          pts.push([x0 + (x1 - x0) * k + rand(-16, 16), y0 + (y1 - y0) * k]);
        }
        pts.push([x1, y1]);
        return pts;
      };
      const main = make(x + rand(-60, 60), top, x, y - 24, 12);
      const branches = [];
      for (let i = 0; i < 3; i++) {
        const p = main[2 + Math.floor(Math.random() * 7)];
        branches.push(make(p[0], p[1], p[0] + rand(-60, 60), p[1] + rand(40, 90), 5));
      }
      bolts.push({ main, branches, age: 0, life: 0.45, x, y });
      rings.push({ x, y: y - 24, age: 0, life: 0.35, r: 50, color: '#fff6a0', w: 6, add: true });
      api.sparks(x, y - 24, '#fff6a0', 14);
    },
    ring(x, y, r, color, life = 0.35) { rings.push({ x, y, age: 0, life, r, color, w: 4 }); },
    text(x, y, str, color = '#ffffff') { if (str) texts.push({ x, y, str, color, age: 0, life: 1.1 }); },

    update(dt) {
      for (const p of parts) {
        p.age += dt;
        if (p.drag) { p.vx -= p.vx * Math.min(1, p.drag * dt); p.vy -= p.vy * Math.min(1, p.drag * 0.5 * dt); }
        p.vy += (p.g || 0) * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.vr) p.rot += p.vr * dt;
      }
      for (const L of [bolts, rings, texts, bursts]) for (const e of L) e.age += dt;
      for (const L of [parts, bolts, rings, texts, bursts]) {
        let j = 0;
        for (let i = 0; i < L.length; i++) if (L[i].age < L[i].life) L[j++] = L[i];
        L.length = j;
      }
    },

    draw(ctx) {
      // Normal particles.
      for (const p of parts) {
        if (p.add) continue;
        const k = p.age / p.life;
        const a = 1 - k;
        if (p.k === 'puff') {
          const r = p.r * (0.7 + k * 0.9);
          if (p.soft) {
            flat(ctx, circle(p.x, p.y, r), p.color, a * 0.7);
          } else {
            ctx.globalAlpha = Math.min(1, a * 1.6) * 0.95;
            blob(ctx, circle(p.x, p.y, r), p.color, { ow: 1.3, ink: 'rgba(42,27,23,0.45)', depth: r * 0.3, shade: darker(p.color, 0.18), light: false });
            ctx.globalAlpha = 1;
          }
        } else if (p.k === 'shard') {
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.globalAlpha = Math.min(1, a * 2);
          blob(ctx, poly([[-p.r, -p.r * 0.6], [p.r, -p.r * 0.3], [p.r * 0.2, p.r]]), p.color, { ow: 1.2, depth: 1 });
          ctx.restore();
        } else if (p.k === 'star') {
          ctx.globalAlpha = Math.min(1, a * 1.5);
          blob(ctx, star(p.x, p.y, p.r, p.r * 0.45, 5, p.rot || 0), p.color, { ow: 1.3, depth: 0.8 });
          ctx.globalAlpha = 1;
        } else if (p.k === 'conf') {
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.scale(1, Math.cos(p.rot * 2));
          ctx.globalAlpha = Math.min(1, a * 3);
          ctx.fillStyle = p.color; ctx.fillRect(-p.r, -p.r * 0.5, p.r * 2, p.r);
          ctx.restore();
        } else if (p.k === 'pawp') {
          // A blue paw print left on the ground.
          ctx.globalAlpha = Math.min(1, a * 1.6) * 0.85;
          ctx.save();
          ctx.translate(p.x, p.y - 2);
          ctx.rotate(p.rot);
          ctx.scale(1, 0.55);
          flat(ctx, ellipse(0, 0, p.r, p.r * 0.85), p.color);
          for (let i = 0; i < 4; i++) flat(ctx, circle(-p.r * 0.95 + i * p.r * 0.63, -p.r * 1.25 + (i === 0 || i === 3 ? p.r * 0.35 : 0), p.r * 0.36), p.color);
          ctx.restore();
          ctx.globalAlpha = 1;
        } else if (p.k === 'line') {
          ctx.globalAlpha = a * 0.75;
          line(ctx, (c) => { c.moveTo(p.x, p.y); c.lineTo(p.x + p.r, p.y); }, p.color, 2.2);
          ctx.globalAlpha = 1;
        }
      }
      for (const b of bursts) {
        const k = b.age / b.life;
        const r = b.r * (0.5 + k * 0.8);
        ctx.globalAlpha = 1 - k * k;
        const path = (c) => {
          for (let i = 0; i < b.spikes * 2; i++) {
            const rr = i % 2 ? r * 0.5 : r * (0.9 + ((i * 37) % 7) / 20);
            const ang = (i / (b.spikes * 2)) * TAU + 0.2;
            if (i === 0) c.moveTo(b.x + Math.cos(ang) * rr, b.y + Math.sin(ang) * rr);
            else c.lineTo(b.x + Math.cos(ang) * rr, b.y + Math.sin(ang) * rr);
          }
          c.closePath();
        };
        if (b.outline) blob(ctx, path, b.color, { ow: 2.2, depth: 3, shade: '#ffb02e', light: '#ffffff' });
        else flat(ctx, path, b.color, 0.9);
        ctx.globalAlpha = 1;
      }
      for (const t of texts) {
        const k = t.age / t.life;
        ctx.globalAlpha = Math.min(1, (1 - k) * 2);
        const s = k < 0.15 ? 1 + (0.15 - k) * 4 : 1;
        ctx.save();
        ctx.translate(t.x, t.y - k * 34);
        ctx.scale(s, s);
        ctx.font = '19px "Lilita One", sans-serif';
        ctx.textAlign = 'center';
        ctx.lineWidth = 5;
        ctx.lineJoin = 'round';
        ctx.strokeStyle = INK;
        ctx.strokeText(t.str, 0, 0);
        ctx.fillStyle = t.color;
        ctx.fillText(t.str, 0, 0);
        ctx.restore();
        ctx.globalAlpha = 1;
      }

      // Additive glow pass: sparks, twinkles, glowing rings, lightning.
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const p of parts) {
        if (!p.add) continue;
        const k = p.age / p.life;
        const a = 1 - k;
        if (p.k === 'spark') {
          ctx.globalAlpha = a;
          line(ctx, (c) => { c.moveTo(p.x, p.y); c.lineTo(p.x - p.vx * 0.035, p.y - p.vy * 0.035); }, p.color, p.r * 1.3);
          glow(ctx, p.x, p.y, 7, p.color, 0.5 * a);
        } else if (p.k === 'twinkle') {
          ctx.globalAlpha = Math.min(1, a * 1.5);
          flat(ctx, star(p.x, p.y, p.r, p.r * 0.3, 4, p.rot), p.color);
          glow(ctx, p.x, p.y, p.r * 2.2, p.color, 0.4 * a);
        }
      }
      ctx.globalAlpha = 1;
      for (const r of rings) {
        const k = r.age / r.life;
        const ease = 1 - (1 - k) * (1 - k);
        ctx.globalAlpha = (1 - k) * (r.add ? 1 : 0.9);
        line(ctx, circle(r.x, r.y, r.r * (0.3 + ease * 0.9)), r.color, (r.w || 4) * (1 - k) + 1);
      }
      ctx.globalAlpha = 1;
      for (const b of bolts) {
        const k = b.age / b.life;
        const flick = Math.random() < 0.35 ? 0.35 : 1;
        ctx.globalAlpha = (1 - k) * flick;
        glow(ctx, b.x, b.y - 30, 80, '#fff6a0', 0.7);
        const path = (pts) => (c) => { c.moveTo(pts[0][0], pts[0][1]); for (const [x, y] of pts) c.lineTo(x, y); };
        for (const br of b.branches) {
          line(ctx, path(br), '#8ad8ff', 5);
          line(ctx, path(br), '#ffffff', 1.6);
        }
        line(ctx, path(b.main), '#5ab4ff', 16);
        line(ctx, path(b.main), '#ffe066', 8);
        line(ctx, path(b.main), '#ffffff', 3.5);
      }
      ctx.restore();
    },
    clear() { for (const L of [parts, bolts, rings, texts, bursts]) L.length = 0; },
  };
  return api;
}

// Item badges: a colored disc with a white rim and the item's symbol (HUD button, help screen).
const BADGE = {
  lightning: ['#2f6fe0', '#1d4fb0'],
  shield: ['#3fb36b', '#2a8a4e'],
  saw: ['#ef4b3f', '#b8302a'],
  trap: ['#f29a2e', '#c4741a'],
  speed: ['#f5c400', '#c99a00'],
  anvil: ['#7a5bd6', '#5a3fb0'],
};

export function drawItemIcon(ctx, id, t = 0) {
  if (!BADGE[id]) return;
  const [c1, c2] = BADGE[id];
  blob(ctx, circle(0, 0, 24), c1, { ow: 2.4, depth: 4, shade: c2, light: lighter(c1, 0.35) });
  line(ctx, circle(0, 0, 20.5), 'rgba(255,255,255,0.75)', 2.2);
  const W = '#ffffff';
  const S = { ow: 2, depth: 1.5, shade: '#d8e0ea', light: false };
  switch (id) {
    case 'lightning':
      blob(ctx, poly([[4, -15], [-9, 2], [-1, 2], [-4, 15], [9, -3], [1, -3]]), W, S);
      break;
    case 'shield':
      blob(ctx, (c) => { c.moveTo(0, -14); c.quadraticCurveTo(7, -10, 12, -11); c.quadraticCurveTo(12, 6, 0, 14); c.quadraticCurveTo(-12, 6, -12, -11); c.quadraticCurveTo(-7, -10, 0, -14); c.closePath(); }, W, S);
      flat(ctx, (c) => { c.moveTo(0, -9); c.lineTo(0, 9); c.quadraticCurveTo(7, 4, 7, -7); c.quadraticCurveTo(3, -7, 0, -9); c.closePath(); }, c1, 0.35);
      break;
    case 'saw':
      drawSaw(ctx, 0, 0, 14, t * 6, W);
      break;
    case 'trap':
      ctx.save();
      ctx.translate(0, 5);
      blob(ctx, roundRect(-13, 0, 26, 5, 2.5), W, S);
      for (let i = -2; i <= 2; i++) blob(ctx, poly([[i * 5 - 2.4, 1], [i * 5, -11 + Math.abs(i) * 2], [i * 5 + 2.4, 1]]), W, { ow: 1.4, depth: 0, shade: false, light: false });
      ctx.restore();
      break;
    case 'speed':
      for (const dx of [-7, 5]) blob(ctx, poly([[dx - 6, -12], [dx + 6, 0], [dx - 6, 12], [dx - 2, 0]]), W, S);
      break;
    case 'anvil':
      drawAnvil(ctx, 0, 7, 0.7, W);
      break;
    default:
  }
}

export function drawSaw(ctx, x, y, r, rot, color = '#c9d2dc') {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  blob(ctx, star(0, 0, r, r * 0.72, 10, 0), color, { ow: 2, depth: 2.5, shade: color === '#ffffff' ? '#d8e0ea' : '#8a96a3', light: '#f2f6fa' });
  blob(ctx, circle(0, 0, r * 0.34), '#5d6672', { ow: 1.6, depth: 1 });
  flat(ctx, circle(0, 0, r * 0.12), '#c9d2dc');
  ctx.restore();
}

export function drawAnvil(ctx, x, y, s = 1, color = '#5d6672') {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  blob(ctx, poly([[-20, -18], [16, -18], [24, -13], [10, -9], [7, 0], [12, 6], [-12, 6], [-7, 0], [-10, -9], [-20, -11]]), color, { ow: 2.2, depth: 3, shade: color === '#ffffff' ? '#d8e0ea' : '#3c434d', light: color === '#ffffff' ? false : '#8e98a5' });
  ctx.restore();
}

export { glow, rgba };
