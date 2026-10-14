// Draws the race: camera, layered world, runners, items and effects. Turns race events into
// effects (dust, shards, bolts, shake, hit-stop).

import { VIEW_H, ABILITIES, AIMED_ITEMS, ITEMS } from './config.js';
import { predictItemPath } from './game.js';
import { floorBelow } from './track.js';
import { predictBurst } from './physics.js';
import { drawAnimal, poseFor, drawTrap, ANIMAL } from './animals.js';
import { createBackdrop, createTerrain, createForeground, createWeather, drawMud, drawPad, drawBox, drawDeco, drawFinish, LIVE_DECO, THEMES } from './scenery.js';
import { createFx, drawSaw, drawAnvil, drawItemIcon } from './fx.js';
import { blob, line, flat, glow, shadow, circle, ellipse, roundRect, poly, INK, rgba, tint } from './paint.js';

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const fx = createFx();
  let W = 0;
  let H = 0;
  let dpr = 1;
  let scale = 1;
  let viewW = 800;
  let viewH = VIEW_H;
  const cam = { x: 0, y: -VIEW_H * 0.62, vy: 0, shake: 0, flash: 0, flashColor: '#ffffff', zoom: 1, punch: 0, look: 0 };
  let race = null;
  let theme = THEMES.forest;
  let world = null; // { backdrop, terrain, fore, weather }
  const trails = new Map(); // runner id → afterimages
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Quality steps: if frames stay slow the canvas resolution drops, then extras turn off.
  const QUALITY = [{ dpr: 1.75 }, { dpr: 1.4 }, { dpr: 1.15, noVignette: true }, { dpr: 1, noVignette: true, noWeather: true, noFore: true }];
  // Phones start one step down. A change rebuilds every cached layer, which itself hitches, so
  // mid-race it waits for the next race (only the countdown applies it at once).
  let quality = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches ? 1 : 0;
  let pendingQuality = quality;
  let slowT = 0;
  function reportFrame(dt) {
    if (dt > 0.1) return; // tab switches, hiccups
    if (dt > 1 / 45) slowT += dt;
    else slowT = Math.max(0, slowT - dt * 0.5);
    if (slowT > 1.5 && pendingQuality < QUALITY.length - 1) {
      pendingQuality++;
      slowT = 0;
      if (race && race.phase === 'countdown') applyQuality();
    }
  }
  function applyQuality() {
    if (pendingQuality === quality) return;
    quality = pendingQuality;
    resize();
    if (world) world.terrain.clear();
  }

  function resize() {
    dpr = Math.min(QUALITY[quality].dpr, window.devicePixelRatio || 1);
    const rect = canvas.getBoundingClientRect();
    W = Math.max(1, Math.round(rect.width * dpr));
    H = Math.max(1, Math.round(rect.height * dpr));
    canvas.width = W;
    canvas.height = H;
    viewH = rect.height < 420 && rect.height > 0 ? VIEW_H * 0.94 : VIEW_H;
    scale = H / viewH;
    viewW = W / scale;
  }

  function camTarget(r) {
    const x = (r.dead > 0 ? r.deathX : r.x) - viewW * 0.3 + cam.look;
    const y = (r.dead > 0 ? Math.min(r.y, floorBelow(race.T, r.deathX - 40, -Infinity)) - 30 : r.y) - viewH * 0.62;
    return { x, y };
  }

  function setRace(r) {
    race = r;
    applyQuality();
    theme = THEMES[r.T.theme] || THEMES.forest;
    world = {
      backdrop: createBackdrop(theme),
      terrain: createTerrain(r.T, theme),
      fore: createForeground(theme),
      weather: createWeather(theme),
    };
    fx.clear();
    trails.clear();
    cam.look = 0;
    const t = camTarget(r.player);
    cam.x = t.x;
    cam.y = t.y;
    cam.vy = 0;
    world.terrain.warm(cam.x - 100, cam.x + viewW + 600, scale);
  }

  function onEvent(e) {
    if (!race) return;
    const r = e.id !== undefined ? race.runners[e.id] : null;
    const me = r && r === race.player;
    const dust = theme.dust;
    switch (e.type) {
      case 'jump': fx.dust(r.x, r.y, 4, -1, dust); break;
      case 'land': fx.landing(r.x, r.y, dust, e.hard); if (me && e.hard) cam.shake = Math.max(cam.shake, 3); break;
      case 'box': if (me) fx.shards(e.x, e.y); break;
      case 'climb': fx.dust(r.x + 12, r.y - 10, 3, -1, dust); break;
      case 'topped': fx.dust(r.x, r.y, 4, 0, dust); break;
      case 'slide': fx.dust(r.x + 10, r.y, 5, 1, dust); break;
      case 'pad': fx.ring(r.x, r.y - 10, 34, '#ffd23f'); fx.twinkles(r.x, r.y - 10, 5, '#ffe066'); break;
      case 'hit':
        if (e.kind === 'spikes' || e.kind === 'saw' || e.kind === 'trap') fx.sparks(r.x, r.y - 25, '#ffffff', 12);
        if (e.kind === 'anvil') fx.smoke(r.x, r.y, 8, '#8a8290');
        if (e.kind !== 'lightning') fx.pow(r.x + 6, r.y - 32);
        fx.stars(r.x, r.y - 54);
        if (me) { cam.shake = Math.max(cam.shake, 10); cam.punch = 1; }
        break;
      case 'blocked': fx.ring(r.x, r.y - 26, 46, '#bff0ff', 0.4); fx.sparks(r.x, r.y - 26, '#bff0ff', 10); break;
      case 'lightning': {
        const top = cam.y - 60;
        for (const o of race.runners) if (o !== r && o.dead <= 0 && !o.finished) fx.bolt(o.x, o.y, top);
        cam.flash = 0.6;
        cam.flashColor = '#fff7c0';
        cam.shake = Math.max(cam.shake, 8);
        break;
      }
      case 'sawBreak': fx.sparks(e.x, e.y, '#ffffff', 16); fx.pow(e.x, e.y, '#ffffff'); break;
      case 'trap': fx.sparks(e.x, e.y - 6, '#e0e6ec', 12); break;
      case 'anvil': fx.landing(e.x, e.y, dust, true); if (race.runners[e.id] === race.player) cam.shake = 14; break;
      case 'fall': break;
      case 'respawn': fx.poof(r.x, r.y - 26); fx.text(r.x, r.y - 72, me ? 'Tekrar!' : '', '#ffffff'); break;
      case 'paw':
        fx.ring(r.x, r.y - 26, 44, '#4aa8ff');
        fx.twinkles(r.x, r.y - 26, 8, '#8fd0ff');
        fx.text(r.x, r.y - 78, ABILITIES[r.animal].name, '#8fd0ff');
        break;
      case 'use':
        if (e.item === 'speed') { fx.ring(r.x, r.y - 26, 40, '#ff9a4a'); fx.twinkles(r.x, r.y - 26, 6, '#ffb36b'); }
        if (e.item === 'shield') fx.ring(r.x, r.y - 26, 44, '#8ad8ff');
        if (e.item === 'saw') fx.sparks(r.x + 20, r.y - 10, '#ffd23f', 8);
        break;
      case 'finish':
        fx.confetti(race.T.finishX + 10, r.y - 150, me ? 100 : 30);
        if (me) for (let i = 0; i < 4; i++) setTimeout(() => fx.firework(race.T.finishX + 60 + Math.random() * 300, r.y - 200 - Math.random() * 120), 250 + i * 350);
        break;
      default:
    }
  }

  function draw(dt, t) {
    if (!race || !world) return;
    const p = race.player;
    const T = race.T;
    // Camera: x stays locked to the player (smooth lead when boosted), y eases with a little lag.
    const boosting = p.boost > 0 || p.pad > 0 || p.dash > 0;
    cam.look += ((boosting ? 70 : 0) - cam.look) * Math.min(1, dt * 2.5);
    const tgt = camTarget(p);
    cam.x += (tgt.x - cam.x) * Math.min(1, dt * 14);
    const dy = tgt.y - cam.y;
    cam.vy += (dy * 30 - cam.vy * 11) * dt;
    cam.y += cam.vy * dt;
    cam.shake = Math.max(0, cam.shake - dt * 30);
    cam.flash = Math.max(0, cam.flash - dt * 2.5);
    cam.punch = Math.max(0, cam.punch - dt * 5);
    cam.zoom += ((boosting ? 0.94 : 1) - cam.zoom) * Math.min(1, dt * 3);
    fx.update(dt);

    const z = cam.zoom * (1 + cam.punch * 0.035);
    const s = scale * z;
    const vw = W / s;
    const vh = H / s;
    // Zoom around the player's screen spot.
    const cx = cam.x + (viewW - vw) * 0.3;
    const cy = cam.y + (viewH - vh) * 0.62;
    const sx = reduced ? 0 : (Math.random() - 0.5) * cam.shake;
    const sy = reduced ? 0 : (Math.random() - 0.5) * cam.shake;

    const prof = globalThis.__prof;
    let pt = prof ? performance.now() : 0;
    const mark = (k) => { if (prof) { const n = performance.now(); prof[k] = (prof[k] || 0) + n - pt; pt = n; } };
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const skip = globalThis.__skip || {};
    if (!skip.backdrop) world.backdrop.draw(ctx, W, H, scale, cx, cy, t);
    mark('backdrop');
    const view = { x0: cx, x1: cx + vw, y0: cy, y1: cy + vh };
    if (!skip.terrain) world.terrain.draw(ctx, view, s, cx - sx, cy - sy, scale);
    mark('terrain');

    ctx.setTransform(s, 0, 0, s, (-cx + sx) * s, (-cy + sy) * s);
    const vis = (x, w = 0, m = 120) => x + w > view.x0 - m && x < view.x1 + m;

    if (vis(T.finishX, 70, 100)) drawFinish(ctx, T.finishX, floorBelow(T, T.finishX, -Infinity), t, false);
    for (const d of T.deco) if (LIVE_DECO.has(d.kind) && vis(d.x, 0, 60)) drawDeco(ctx, d, t, theme);
    for (const m of T.mud) if (vis(m.x, m.w)) drawMud(ctx, m, t);
    for (const pd of T.pads) if (vis(pd.x, pd.w)) drawPad(ctx, pd, t);
    // Boxes as this player sees them (each runner has its own).
    for (const b of T.boxes) {
      if (!vis(b.x)) continue;
      const tk = b.taken[p.id] || 0;
      const by = floorBelow(T, b.x, b.y);
      if (tk <= 0 && by - b.y < 120) shadow(ctx, b.x, by, 13, 0.22);
      drawBox(ctx, b, t, tk > 0 ? (tk < 0.35 ? 1 - tk / 0.35 : 0) : 1);
    }
    for (const tr of race.traps) if (vis(tr.x)) drawTrap(ctx, tr.x, tr.y, tr.snap > 0 ? Math.min(1, tr.snap * 12) : 0);
    mark('objects');

    // Name tags that would overlap stack upward.
    const byX = race.runners.filter((r) => r.dead <= 0).sort((a, b) => a.x - b.x);
    for (let i = 0; i < byX.length; i++) {
      let lift = 0;
      for (let j = 0; j < i; j++) if (byX[i].x - byX[j].x < 46 && Math.abs(byX[i].y - byX[j].y) < 40) lift = Math.max(lift, byX[j].tagLift + 18);
      byX[i].tagLift = lift;
    }
    const order = race.runners.slice().sort((a, b) => (a === p ? 1 : b === p ? -1 : b.id - a.id));
    for (const r of order) updateTrail(r, dt);
    for (const r of order) if (r.dead <= 0 && vis(r.x)) drawRunner(r, t, r === p, dt);

    for (const sw of race.saws) {
      for (let k = 3; k >= 1; k--) {
        ctx.globalAlpha = 0.18 * (4 - k) / 3;
        drawSaw(ctx, sw.x - k * 9, sw.y - 11, 12, sw.spin - k * 0.4);
      }
      ctx.globalAlpha = 1;
      drawSaw(ctx, sw.x, sw.y - 11, 12, sw.spin);
      if (sw.grounded) fx.grind(sw.x - 6, sw.y - 1, -1);
    }
    for (const a of race.anvils) drawAnvilDrop(a, t);
    // The aiming player's own arrow and predicted path: only on this screen.
    if (typeof p.aim === 'number' && p.dead <= 0) drawAimGuide(p, t);
    mark('runners');

    if (vis(T.finishX, 70, 100)) drawFinish(ctx, T.finishX, floorBelow(T, T.finishX, -Infinity), t, true);
    fx.draw(ctx);
    mark('fx');

    // Foreground and weather in screen space.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const Q = QUALITY[quality];
    if (!skip.weather && !Q.noWeather) world.weather.draw(ctx, W, H, s, cx, cy, dt, t);
    mark('weather');
    if (!skip.fore && !Q.noFore) world.fore.draw(ctx, W, H, scale, cx);
    mark('fore');

    if (cam.flash > 0) {
      ctx.fillStyle = rgba(cam.flashColor, cam.flash * 0.7);
      ctx.fillRect(0, 0, W, H);
    }
    // Soft vignette, warmer while boosted (pre-rendered per screen size).
    if (!Q.noVignette || boosting) ctx.drawImage(vignette(boosting), 0, 0);
    mark('overlay');
  }

  const vigCache = {};
  function vignette(warm) {
    const k = `${W}x${H}${warm}`;
    if (!vigCache[k]) {
      const c = document.createElement('canvas');
      c.width = W;
      c.height = H;
      const g = c.getContext('2d');
      const grad = g.createRadialGradient(W / 2, H * 0.55, H * 0.45, W / 2, H * 0.55, W * 0.72);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, warm ? 'rgba(255,130,40,0.3)' : 'rgba(20,10,40,0.2)');
      g.fillStyle = grad;
      g.fillRect(0, 0, W, H);
      vigCache[k] = c;
    }
    return vigCache[k];
  }

  // Afterimages while boosted.
  function updateTrail(r, dt) {
    let tr = trails.get(r.id);
    if (!tr) { tr = { list: [], acc: 0 }; trails.set(r.id, tr); }
    for (const g of tr.list) g.age += dt;
    tr.list = tr.list.filter((g) => g.age < 0.25);
    if ((r.boost > 0 || r.pad > 0 || r.dash > 0) && r.dead <= 0 && (r.burst || Math.hypot(r.vx, r.vy) > 200)) {
      tr.acc += dt;
      if (tr.acc > 0.045) {
        tr.acc = 0;
        tr.list.push({ x: r.x, y: r.y, rot: r.drawRot || 0, phase: r.runPhase, age: 0, grounded: r.grounded, vy: r.vy, duck: r.duck, color: r.dash > 0 ? '#4aa8ff' : r.boost > 0 ? '#ff8a3a' : '#ffd23f' });
      }
    }
  }

  function drawRunner(r, t, isPlayer, dt) {
    const a = ANIMAL[r.animal];
    // Lean into slopes.
    const target = r.grounded ? Math.atan(r.slope || 0) * 0.75 : 0;
    r.drawRot = (r.drawRot || 0) + (target - (r.drawRot || 0)) * Math.min(1, dt * 12);

    const tr = trails.get(r.id);
    if (tr && tr.list.length) {
      ctx.save();
      for (const g of tr.list) {
        ctx.globalAlpha = 0.35 * (1 - g.age / 0.25);
        ctx.save();
        ctx.translate(g.x, g.y);
        ctx.rotate(g.rot);
        const saved = { ...r, x: g.x, y: g.y, runPhase: g.phase, grounded: g.grounded, vy: g.vy, duck: g.duck };
        drawAnimalTinted(ctx, r.animal, poseFor(saved, t), t, g.color);
        ctx.restore();
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    if (r.invuln > 0 && r.stun <= 0 && Math.floor(t * 14) % 2 === 0) ctx.globalAlpha = 0.45;
    const fy = floorBelow(race.T, r.x, r.y - 2);
    if (fy < Infinity && fy - r.y < 240) shadow(ctx, r.x, fy, 19 * (1 - (fy - r.y) / 320), 0.32);
    if (r.boost > 0 || r.pad > 0 || r.dash > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, r.x - 10, r.y - 26, 40, r.dash > 0 ? '#4aa8ff' : r.boost > 0 ? '#ff8a3a' : '#ffd23f', 0.42);
      ctx.restore();
      if (Math.random() < 0.6) fx.speedLine(r.x - 34 - Math.random() * 24, r.y - 8 - Math.random() * 44);
    }
    // Aiming: everyone sees the raised paw pointing the way, with a glowing orb (blue paw) or the
    // item in it (saw, trap... or held up high for the items that aren't aimed).
    if (typeof r.aim === 'number' && r.stun <= 0 && r.dead <= 0 && !r.climb) {
      const hx = r.x + 2 + Math.cos(r.aim) * 15;
      const hy = r.y - 29 - Math.sin(r.aim) * 15;
      const pulse = 1 + Math.sin(t * 14) * 0.15;
      if (!r.aimKind || r.aimKind === 'paw') {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        glow(ctx, hx, hy, 22 * pulse, '#4aa8ff', 0.75);
        glow(ctx, r.x, r.y - 26, 40, '#4aa8ff', 0.25);
        ctx.restore();
        flat(ctx, circle(hx, hy, 5 * pulse), '#e8f6ff');
        for (let i = 0; i < 3; i++) {
          const a = t * 6 + (i * Math.PI * 2) / 3;
          flat(ctx, circle(hx + Math.cos(a) * 9, hy + Math.sin(a) * 9, 1.6), '#bfe4ff', 0.9);
        }
        if (Math.random() < dt * 20) fx.sparks(hx, hy, '#8fd0ff', 1, 0.3);
      } else {
        const color = (ITEMS[r.aimKind] || {}).color || '#ffd23f';
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        glow(ctx, hx, hy - 4, 24 * pulse, color, 0.55);
        ctx.restore();
        ctx.save();
        ctx.translate(hx, hy - 4);
        ctx.scale(0.42 * pulse, 0.42 * pulse);
        drawItemIcon(ctx, r.aimKind, t);
        ctx.restore();
      }
    }
    // A blue streak along the burst.
    if (r.burst) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const len = 46;
      const ang = Math.atan2(r.burst.vy, r.burst.vx);
      const g = ctx.createLinearGradient(r.x, r.y - 26, r.x - Math.cos(ang) * len, r.y - 26 - Math.sin(ang) * len);
      g.addColorStop(0, 'rgba(120,200,255,0.75)');
      g.addColorStop(1, 'rgba(120,200,255,0)');
      ctx.strokeStyle = g;
      ctx.lineWidth = 22;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(r.x, r.y - 26);
      ctx.lineTo(r.x - Math.cos(ang) * len, r.y - 26 - Math.sin(ang) * len);
      ctx.stroke();
      ctx.restore();
    }
    // Blue paw prints while dashing.
    if (r.dash > 0 && r.grounded) {
      if (r.pawX === undefined || Math.abs(r.x - r.pawX) > 34) { r.pawX = r.x; r.pawSide = !r.pawSide; fx.pawPrint(r.x - 6 + (r.pawSide ? 4 : -4), r.y); }
    } else r.pawX = undefined;
    if (r.duck && r.grounded && r.vx > 100 && Math.random() < dt * 25) fx.dust(r.x + 10, r.y, 1, -1, theme.dust);
    if (r.stunKind === 'lightning' && r.stun > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, r.x, r.y - 30, 44, '#8ad8ff', 0.35 + Math.random() * 0.25);
      ctx.restore();
      if (Math.random() < 0.25) fx.sparks(r.x + (Math.random() - 0.5) * 30, r.y - 30 + (Math.random() - 0.5) * 40, '#bfe8ff', 1, 0.5);
      if (Math.random() < 0.15) fx.smoke(r.x, r.y - 50, 1, '#3c3844');
    }
    if (r.grounded && r.vx > 150 && Math.random() < dt * 4) fx.dust(r.x - 8, r.y, 1, -1, theme.dust);
    if (r.inMud && r.vx > 60 && Math.random() < dt * 18) fx.dust(r.x, r.y, 1, -1, '#7a5236');

    ctx.save();
    ctx.translate(r.x, r.y);
    ctx.rotate(r.drawRot);
    drawAnimal(ctx, r.animal, poseFor(r, t), t);
    ctx.restore();
    ctx.globalAlpha = 1;

    if (r.shield > 0) {
      const fade = r.shield < 1.2 && Math.floor(t * 10) % 2 === 0 ? 0.35 : 1;
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, r.x, r.y - 30, 48, '#5ab8ff', 0.35);
      line(ctx, circle(r.x + 2, r.y - 30, 38), '#8ad8ff', 4);
      ctx.globalCompositeOperation = 'source-over';
      line(ctx, circle(r.x + 2, r.y - 30, 38), '#ffffff', 1.4, 0.7);
      flat(ctx, ellipse(r.x - 13, r.y - 50, 10, 5, -0.6), '#ffffff', 0.6);
      const ang = t * 3;
      flat(ctx, circle(r.x + 2 + Math.cos(ang) * 38, r.y - 30 + Math.sin(ang) * 38, 2.6), '#ffffff', 0.9);
      ctx.restore();
    }
    // Name tag.
    const label = isPlayer ? 'SEN' : r.name || a.name;
    const ly = r.y - 84 - (r.tagLift || 0);
    ctx.font = `${isPlayer ? 14 : 12}px "Lilita One", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const tw = ctx.measureText(label).width + 12;
    if (isPlayer) blob(ctx, roundRect(r.x - tw / 2, ly - 9, tw, 18, 9), '#ffd23f', { ow: 1.6, depth: 0, shade: false, light: false });
    else flat(ctx, roundRect(r.x - tw / 2, ly - 9, tw, 18, 9), '#1c1626', 0.5);
    if (isPlayer) flat(ctx, poly([[r.x - 5, ly + 8], [r.x + 5, ly + 8], [r.x, ly + 14]]), '#ffd23f');
    ctx.fillStyle = isPlayer ? '#4a2a10' : '#ffffff';
    ctx.fillText(label, r.x, ly + 0.5);
  }

  // The private aim guide (only on the aiming phone): a faint ring, the predicted path as dots and a
  // pulsing arrow, in blue for the paw and in the item's color for a saw or trap. Items that
  // aren't aimed just show a pulsing ring and "BIRAK!" (let go).
  function drawAimGuide(r, t) {
    const cx = r.x;
    const cy = r.y - 30;
    const kind = r.aimKind || 'paw';
    if (kind !== 'paw' && !AIMED_ITEMS.has(kind)) {
      const k = (t * 1.5) % 1;
      ctx.globalAlpha = 1 - k;
      line(ctx, circle(cx, cy, 30 + k * 30), (ITEMS[kind] || {}).color || '#ffd23f', 4);
      ctx.globalAlpha = 1;
      ctx.font = '16px "Lilita One", sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 4;
      ctx.strokeStyle = INK;
      ctx.strokeText('BIRAK!', cx, r.y - 104);
      ctx.fillStyle = '#ffffff';
      ctx.fillText('BIRAK!', cx, r.y - 104);
      return;
    }
    const color = kind === 'paw' ? '#4aa8ff' : kind === 'saw' ? '#ef4b3f' : '#f29a2e';
    const dot = kind === 'paw' ? '#bfe4ff' : kind === 'saw' ? '#ff8a7a' : '#ffc070';
    // The aim can go all the way round.
    ctx.save();
    ctx.globalAlpha = 0.3;
    line(ctx, circle(cx, cy, 58), '#ffffff', 5);
    ctx.restore();
    // Where it would go.
    const pts = kind === 'paw' ? predictBurst(r, race.T, r.aim, ABILITIES[r.animal].speed) : predictItemPath(race, r, kind, r.aimPlain ? null : r.aim);
    for (let i = 1; i < pts.length; i++) {
      const k = i / pts.length;
      const [x, y] = pts[i];
      const rad = 5 - k * 2.2;
      ctx.globalAlpha = 1 - k * 0.55;
      blob(ctx, circle(x, y, rad), dot, { ow: 1.8, ink: INK, depth: 0, shade: false, light: false });
    }
    ctx.globalAlpha = 1;
    // The arrow itself, breathing a little.
    const len = 84 + Math.sin(t * 9) * 5;
    const start = 30; // leave the glowing paw in the hand visible
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-r.aim);
    const shaft = (c) => { c.moveTo(start, -5); c.lineTo(len - 18, -5); c.lineTo(len - 18, -13); c.lineTo(len, 0); c.lineTo(len - 18, 13); c.lineTo(len - 18, 5); c.lineTo(start, 5); c.closePath(); };
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, len - 12, 0, 26, color, 0.5);
    ctx.globalCompositeOperation = 'source-over';
    blob(ctx, shaft, color, { ow: 2.4, depth: 2.5, light: dot });
    // A light running along the arrow shows it's live.
    const ph = (t * 1.8) % 1;
    flat(ctx, circle(start + (len - start - 14) * ph, 0, 3), '#ffffff', 1 - ph);
    ctx.restore();
  }

  function drawAnvilDrop(a, t) {
    const r = race.runners[a.target];
    if (a.t < a.warn) {
      const pulse = 1 + Math.sin(t * 20) * 0.12;
      const y = a.y - 124 - (r.tagLift || 0);
      blob(ctx, circle(a.x, y, 12 * pulse), '#ff4d5e', { ow: 2, depth: 1.5 });
      ctx.font = '18px "Lilita One", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff';
      ctx.fillText('!', a.x, y + 1);
      flat(ctx, ellipse(a.x, a.y, 24 * (a.t / a.warn), 5 * (a.t / a.warn)), '#000000', 0.28);
      return;
    }
    const k = Math.min(1, (a.t - a.warn) / a.fall);
    if (k < 1) {
      const y = a.y - 60 - (1 - k * k) * 380;
      for (let i = 1; i <= 3; i++) {
        ctx.globalAlpha = 0.15 * (4 - i) / 3;
        drawAnvil(ctx, a.x, y - i * 22 * (1 - k), 1.2);
      }
      ctx.globalAlpha = 1;
      drawAnvil(ctx, a.x, y, 1.2);
    } else {
      const after = a.t - a.warn - a.fall;
      ctx.globalAlpha = Math.max(0, 1 - after / 0.6);
      drawAnvil(ctx, a.x + after * 80, a.y - 60 - Math.sin(Math.min(1, after / 0.5) * Math.PI) * 40, 1.2);
      ctx.globalAlpha = 1;
    }
  }

  return { resize, setRace, onEvent, draw, fx, reportFrame, get scale() { return scale; }, get quality() { return quality; }, get debug() { return { trails, cam, race }; } };
}

// The animal drawn as a flat colored ghost (afterimages).
function drawAnimalTinted(ctx, id, pose, t, color) {
  const a = tint.amount;
  const c = tint.color;
  tint.amount = 0.75;
  tint.color = color;
  drawAnimal(ctx, id, pose, t);
  tint.amount = a;
  tint.color = c;
}

export { INK };
