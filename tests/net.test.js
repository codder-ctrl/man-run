// A host and a guest wired together in memory with a little latency: both runners must finish
// on the host, the guest must hear about the end of the race, and the host's view of the
// guest's runner must stay close to where the guest really is.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRace, stepRace } from '../js/game.js';
import { createHostSync, createGuestSync } from '../js/netsync.js';

const DT = 1 / 60;
const LAG = 3; // frames each way (~50 ms)

test('host and guest stay in step through a whole race', () => {
  const seed = 4242;
  const roster = [
    { animal: 'fox', name: 'Ali', ctrl: 'bot' }, // the host's own runner, driven by a bot here
    { animal: 'bear', name: 'Ece', ctrl: 'remote' },
    { animal: 'cat', ctrl: 'bot' },
    { animal: 'wolf', ctrl: 'bot' },
  ];
  const host = createRace({ seed, theme: 'forest', role: 'host', roster, me: 0 });
  const guestRoster = roster.map((p, i) => ({ ...p, ctrl: i === 1 ? 'bot' : 'remote' }));
  const guest = createRace({ seed, theme: 'forest', role: 'guest', roster: guestRoster, me: 1 });

  const toGuest = [];
  const toHost = [];
  let frame = 0;
  const hostSync = createHostSync(host, new Map([['g1', 1]]), (to, msg) => toGuest.push([frame + LAG, JSON.parse(JSON.stringify(msg))]));
  const guestSync = createGuestSync(guest, (msg) => toHost.push([frame + LAG, JSON.parse(JSON.stringify(msg))]));

  let guestDone = false;
  let maxGap = 0;
  let hits = 0;
  while (frame < 60 * 140 && !guestDone) {
    frame++;
    while (toHost.length && toHost[0][0] <= frame) hostSync.receive('g1', toHost.shift()[1]);
    stepRace(host, DT);
    for (const e of host.events) hostSync.event(e);
    host.events.length = 0;
    hostSync.tick(DT);

    while (toGuest.length && toGuest[0][0] <= frame) guestSync.receive(toGuest.shift()[1]);
    stepRace(guest, DT);
    guest.events.length = 0;
    guestSync.tick(DT);
    for (const e of guestSync.takeEvents()) {
      if (e.type === 'done') guestDone = true;
      if (e.type === 'hit' && e.id === 1) hits++;
    }
    const hg = host.runners[1];
    const gg = guest.player;
    if (host.phase === 'race' && hg.dead <= 0 && gg.dead <= 0 && !gg.finished) maxGap = Math.max(maxGap, Math.abs(hg.x - gg.x));
  }
  console.log(`frames ${frame}, host phase ${host.phase}, guest done ${guestDone}, max gap ${maxGap.toFixed(1)}, guest hit ${hits}x`);
  console.log('host places', host.order.map((r) => `${r.name || r.animal}:${r.finished ? r.finishTime.toFixed(1) : '-'}`).join(' '));
  assert.ok(host.runners[1].finished, 'guest runner finished on the host');
  assert.ok(guestDone, 'guest heard the race end');
  assert.ok(guest.player.finished, 'guest knows it finished');
  assert.ok(maxGap < 80, `host view of the guest drifted ${maxGap}`);
});
