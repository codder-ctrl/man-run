import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRace, stepRace } from '../js/game.js';
import { STEP } from '../js/config.js';
import { THEME_IDS } from '../js/themes.js';

function runRace(seed, theme, maxTime = 150) {
  const race = createRace({ seed, allBots: true, theme });
  const falls = {};
  while (race.time < maxTime && race.finishedCount < 4) {
    stepRace(race, STEP);
    for (const e of race.events) if (e.type === 'fall') falls[e.id] = (falls[e.id] || 0) + 1;
    race.events.length = 0;
  }
  return { race, falls };
}

test('bots can finish generated tracks', () => {
  let i = 0;
  for (const seed of [1, 2, 3, 42, 777, 2026]) {
    const theme = THEME_IDS[i++ % THEME_IDS.length];
    const { race, falls } = runRace(seed, theme);
    const times = race.runners.map((r) => (r.finished ? r.finishTime.toFixed(1) : `DNF@${Math.round(r.x)}/${race.T.finishX}`));
    console.log(`seed ${seed} ${theme}: ${times.join(' ')} falls ${JSON.stringify(falls)}`);
    assert.equal(race.finishedCount, 4, `seed ${seed}: ${times}`);
  }
});

test('race steps of varying length still finish (variable frame time)', () => {
  const race = createRace({ seed: 9, allBots: true });
  let n = 0;
  while (race.time < 150 && race.finishedCount < 4) {
    const dt = [1 / 120, 1 / 144, 1 / 130, 1 / 125][n++ % 4];
    stepRace(race, dt);
    race.events.length = 0;
  }
  assert.equal(race.finishedCount, 4);
});
