// The aimed blue paw, sliding and climbing on a real generated track (the flat start area).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRace, stepRace, usePaw, useItem, predictItemPath } from '../js/game.js';
import { predictBurst, roofAbove } from '../js/physics.js';
import { STEP } from '../js/config.js';

const UP = Math.PI / 2;

function freshRace(seed = 7) {
  const race = createRace({ seed, theme: 'forest' });
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
  assert.ok(usePaw(pawRace, p, UP * 0.85));
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

test('the paw aims all the way round but never into the ground', () => {
  const race = freshRace();
  const p = race.player;
  usePaw(race, p, -0.8);
  assert.equal(p.burst.a, 0, 'on the ground a down-forward aim becomes forward');
  const race2 = freshRace();
  usePaw(race2, race2.player, -2.4);
  assert.equal(race2.player.burst.a, Math.PI, 'a down-back aim becomes backward');
  assert.ok(race2.player.burst.vx < 0, 'it really goes backward');
  const race3 = freshRace();
  const pts = predictBurst(race3.player, race3.T, UP, 580);
  assert.ok(pts.length > 5 && Math.min(...pts.map((q) => q[1])) < race3.player.y - 120, 'preview rises for a steep aim');
});

test('saws and traps can be thrown in any direction', () => {
  const race = freshRace();
  const p = race.player;
  p.item = 'saw';
  assert.ok(useItem(race, p, Math.PI));
  const saw = race.saws[0];
  assert.ok(saw.vx < 0 && saw.dir === -1, 'a saw thrown back flies back');
  for (let t = 0; t < 0.5; t += STEP) stepRace(race, STEP);
  if (race.saws.length) assert.ok(race.saws[0].x < p.x - 100, 'and keeps rolling back');

  const race2 = freshRace();
  const p2 = race2.player;
  p2.item = 'trap';
  const x0 = p2.x;
  assert.ok(useItem(race2, p2, 0.6));
  for (let t = 0; t < 1.2; t += STEP) stepRace(race2, STEP);
  const trap = race2.traps[0];
  assert.ok(trap && trap.grounded && trap.x > x0 + 150, `a trap thrown forward lands ahead (${trap && Math.round(trap.x - x0)})`);

  const path = predictItemPath(race2, p2, 'saw', 0.5);
  assert.ok(path.length > 5, 'the preview has a path');
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

// A race whose track has a stone wall, and its first wall.
function wallRace() {
  for (let seed = 1; seed < 200; seed++) {
    const race = freshRace(seed);
    const wall = race.T.solids.find((s) => s.kind === 'block' && s.x > 600 && s.h > 50);
    if (wall) return { race, wall };
  }
  throw new Error('no wall found');
}

// A runner placed against a wall in the air, for the climbing tests.
function atWall(race, wall) {
  const p = race.player;
  p.x = wall.x - p.w / 2 - 1;
  p.y = wall.y + wall.h - 20; // in the air, below the wall top
  p.vx = 300;
  p.vy = 0;
  p.grounded = false;
  return wall;
}

test('touching a wall in the air sticks to it and slides down slowly', () => {
  const { race, wall } = wallRace();
  const p = race.player;
  atWall(race, wall);
  stepRace(race, STEP);
  assert.ok(p.climb, 'clinging after touching the wall');
  const y0 = p.y;
  for (let t = 0; t < 0.25; t += STEP) stepRace(race, STEP);
  const slid = p.y - y0;
  assert.ok(p.climb || p.grounded, 'still on the wall or down at its foot');
  assert.ok(slid >= 0 && slid < 30, `slides slowly (${slid.toFixed(1)} units in 0.25 s)`);
});

test('each jump kicks a jump height up the wall and over the top', () => {
  const { race, wall } = wallRace();
  const p = race.player;
  atWall(race, wall);
  stepRace(race, STEP);
  let topped = false;
  for (let t = 0; t < 2.5 && !topped; t += STEP) {
    stepRace(race, STEP, { jump: p.climb && p.vy >= 0, hold: true });
    if (p.x > wall.x + 4 && p.y <= wall.y + 1) topped = true;
  }
  assert.ok(topped, 'climbed over the wall by jumping');
});

test('big saws bounce back off upright walls', () => {
  const { race, wall } = wallRace();
  const p = race.player;
  p.x = wall.x - 150;
  p.item = 'saw';
  useItem(race, p, 0);
  const saw = race.saws[0];
  assert.ok(saw.w > 50, 'the saw is big');
  saw.x = wall.x - 120;
  saw.y = wall.y + wall.h;
  let bounced = false;
  for (let t = 0; t < 1 && race.saws.length; t += STEP) {
    stepRace(race, STEP);
    if (race.saws[0] && race.saws[0].vx < 0) bounced = true;
  }
  assert.ok(bounced, 'it came back off the wall');
});

test('a trap catches every runner once, not just the first', () => {
  const race = createRace({ seed: 7, theme: 'forest', allBots: true });
  while (race.phase !== 'race') stepRace(race, STEP);
  const [owner, a, b] = race.runners;
  owner.item = 'trap';
  useItem(race, owner, null);
  const trap = race.traps[0];
  for (let t = 0; t < 0.3; t += STEP) stepRace(race, STEP); // let it settle
  for (const r of [a, b]) {
    r.x = trap.x;
    r.y = trap.y;
    r.vy = 0;
    r.grounded = true;
    r.shield = 0;
    stepRace(race, STEP);
  }
  assert.ok(trap.caught[a.id] !== undefined && trap.caught[b.id] !== undefined, 'both runners were caught');
  assert.equal(race.traps.length, 1, 'the trap is still there for the others');
  assert.equal(trap.caught[owner.id], undefined, 'never its owner');
});
