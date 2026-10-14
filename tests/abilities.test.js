// The aimed blue paw, sliding and climbing on a real generated track (the flat start area).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRace, stepRace, usePaw } from '../js/game.js';
import { predictBurst, roofAbove } from '../js/physics.js';
import { STEP, AIM_MAX, AIM_MIN } from '../js/config.js';

function freshRace() {
  const race = createRace({ seed: 7, theme: 'forest' });
  while (race.phase !== 'race') stepRace(race, STEP);
  const p = race.player;
  for (let i = 0; i < 120; i++) stepRace(race, STEP); // get running
  p.paw = 1;
  return race;
}

function track(race, seconds, input = {}) {
  const p = race.player;
  let minY = p.y;
  const x0 = p.x;
  for (let t = 0; t < seconds; t += STEP) {
    stepRace(race, STEP, input);
    race.events.length = 0;
    minY = Math.min(minY, p.y);
  }
  return { dx: p.x - x0, rise: race.player.y0 - minY };
}

test('aiming up launches higher than a full jump', () => {
  const jumpRace = freshRace();
  const p0 = jumpRace.player;
  p0.y0 = p0.y;
  stepRace(jumpRace, STEP, { jump: true, hold: true });
  const jump = track(jumpRace, 0.8, { hold: true });

  const pawRace = freshRace();
  const p = pawRace.player;
  p.y0 = p.y;
  assert.ok(usePaw(pawRace, p, AIM_MAX * 0.85));
  const up = track(pawRace, 0.8);
  console.log(`full jump rises ${jump.rise.toFixed(0)}, steep paw rises ${up.rise.toFixed(0)}`);
  assert.ok(up.rise > jump.rise * 1.3, 'the steep paw clears much more than a jump');
});

test('aiming forward covers more ground than running', () => {
  const runRace = freshRace();
  const run = track(runRace, 0.6);
  const pawRace = freshRace();
  assert.ok(usePaw(pawRace, pawRace.player, 0));
  const dash = track(pawRace, 0.6);
  console.log(`0.6 s: running ${run.dx.toFixed(0)}, forward paw ${dash.dx.toFixed(0)}`);
  assert.ok(dash.dx > run.dx * 1.4);
});

test('aim is clamped, cannot point into the ground, and the preview follows the burst', () => {
  const race = freshRace();
  const p = race.player;
  usePaw(race, p, -3);
  assert.equal(p.burst.a, 0, 'on the ground a downward aim becomes forward');
  const race2 = freshRace();
  const pts = predictBurst(race2.player, race2.T, AIM_MAX, 520);
  assert.ok(pts.length > 5 && Math.min(...pts.map((q) => q[1])) < race2.player.y - 120, 'preview rises for a steep aim');
  assert.ok(AIM_MIN < 0 && AIM_MAX <= Math.PI / 2);
});

test('a paw press is ignored until the paw is charged', () => {
  const race = freshRace();
  race.player.paw = 0.5;
  assert.equal(usePaw(race, race.player, 0.5), false);
});

test('EĞİL is a tap: the slide ends by itself', () => {
  const race = freshRace();
  const p = race.player;
  stepRace(race, STEP, { duck: true });
  assert.ok(p.duck, 'sliding right after the tap');
  for (let t = 0; t < 1; t += STEP) stepRace(race, STEP);
  assert.ok(!p.duck || roofAbove(p, race.T), 'standing again after a second (unless under a roof)');
});
