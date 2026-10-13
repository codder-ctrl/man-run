# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Man Run: a Fun Run–style side-scrolling race in the browser. Four chibi animals (the player and three bots) auto-run to a finish flag; the player only jumps and fires items from "?" boxes. The user wants it as close to Fun Run as possible and plays it locally with friends; the next phase they asked for is multiplayer over Bluetooth (not started). `index.html`, `styles.css`, native ES modules in `js/`. No build step, no npm dependencies; the only external resources are the Lilita One and Fredoka fonts. UI text is Turkish. Landscape, phone first.

## Workflow with the user

The user doesn't read code. Big steps go: plan → build → present with a 1–10 rating request plus Claude's own scores (akıcılık, grafik, efektler, ses, oynanış) → adjust. Explain changes in Turkish, in player terms. Push only when the user says "yükle". Keep `DEVAM-OZETI.md` up to date for the next session.

## Releases

Bump `VERSION` in `js/config.js` and `package.json` together (`tests/pwa.test.js` checks). New feature = minor, fix = patch. There is no changelog screen yet.

## Deploying

Repo: `codder-ctrl/man-run` (public). GitHub Pages serves the repo root of `main` at https://codder-ctrl.github.io/man-run/, so every push to `main` is a release; run `npm test` first and push only when the user says "yükle". `.nojekyll` keeps Pages from running Jekyll. The site lives under `/man-run/`, so keep every path in the page, manifest and `sw.js` relative.

## Running and testing

- Serve over HTTP: the `man-run` entry in the parent `.claude/launch.json` (port 8004), or `python -m http.server 8004`.
- `npm test` (`node --test`): `tests/race.test.js` races four bots on several seeds headless and fails if anyone can't finish; run it after any change to track generation, physics or the AI. `tests/pwa.test.js` checks the service worker shell and relative paths.
- `tools/pose-lab.html?cell=160&ids=fox,panda` shows every animal in every pose.
- `?auto=1` makes the player a bot too. On localhost `window.manrun` has `{ race, startRace, renderer, input, advance(seconds), useItem(id) }`. The browser pane throttles animation frames when hidden, so drive tests with `manrun.advance(s)` (steps and draws synchronously, consumes queued input) and take two screenshots (the first can be stale). Synthetic `PointerEvent`s work on `#touch-jump`, `#btn-jump`, `#btn-item`. For an auto player, `useItem` is ignored (the bot brain drives it); call `race.useItem(race.player)` instead.
- Icons: `node tools/icon-server.js`, then open http://localhost:8091/tools/icons.html; it writes `icons/*.png` and exits.

## Architecture

`config`, `themes` → `track` → `physics` → `ai` → `game` (rules, no DOM); `paint` → `animals`, `scenery`, `fx` → `render`; `sound`; everything → `main`.

- **World units**: y grows downward, a runner is ~60 tall, the camera shows `VIEW_H` (430) units vertically (a bit less on short screens). Physics runs at a fixed 1/120 s step (`STEP`).
- **`track.js`**: `buildTrack(seed, { theme })` chains segments (flat, rolling bumps, hill up/down, valley, slope into a pit, pit, double pit, step up/down, stairs, wall, wall+spikes, floating island, upper ledge route, mud, speed pad, pad before a wide pit, drop, box row) with difficulty rising along the track; a box row is forced every ~950 units. Ground strips (`kind: 'ground'`) carry a height profile `ys` every `DX` (8) units; `surfaceAt`/`slopeAt` read it. Slopes are capped at 0.5 by the segment builder. `undulate` then lays a gentle roll over everything except flat zones (spikes, mud, pads, walls, under ledges, 50 units at each strip end, start/finish), so heights there stay as designed. `T.back` is the decorative back-wall profile (a raised, smoothed copy of the ground, continuous over pits). Other output: `block` walls, `plat` one-way ledges, `spikes`, `mud`, `pads`, `boxes`, `respawns`, `deco` (theme's `decoSet`), `finishX`. Spatial buckets for `solidsNear`.
- **`physics.js`**: `moveBody` (AABB vs solids; inside a ground strip any slope is walkable: rising slopes lift the feet, going downhill snaps to the ground; only strip ends are walls, step-up ≤10; one-way ledges; ceilings only for blocks), `stepRunner` (accel to top speed, uphill −20%/downhill +20%, coyote time, jump buffer, variable jump with a minimum hold so quick taps still clear walls), `simulate` (bots' what-if runs).
- **`themes.js`**: `THEMES` (forest, snow, desert): sky, layers, back wall, grass/snow/sand cap, dirt cobbles, blocks (ice in snow), foreground colors, weather, decoration set, tree type, music mood. A new map is a new entry.
- **`ai.js`**: every 1/30 s a bot simulates "keep running" 0.4 s ahead; on danger (pit, wall, spikes) it simulates "jump now" and jumps with its skill's reaction chance (always when urgent). Occasional hesitation (`slip`) makes them fall sometimes. Mild rubber-banding against the player via `speedMul`. Item rules per item after a short delay.
- **`game.js`**: race state, countdown, items (`ITEMS` weights by place: leaders get shields/traps, the last get lightning/anvil), hits/stuns, saws (hop walls), traps, anvils (warning, then drop on the leader), falls/respawns, places, finish. Emits events (`jump`, `box`, `use`, `hit`, `lightning`, `finish`, `done`…) drained by `main.js` into `render.onEvent` and sounds.
- **`animals.js`**: `poseFor(runner, t)` → pose (run cycle by distance, jump, fall, dazed, zapped, trapped, cheer); `drawAnimal` draws in the house style (stroked limbs, big head, scarf in the accent color). A lightning hit flickers the body to a dark x-ray silhouette with white bones and a skull (Fun Run's look). Animal look data lives in `ANIMALS` (config); a new animal is a config entry (`ears`, `tail`, colors, `snout`, `patches`).
- **`scenery.js`**: the depth layers. Backdrop: sky+sun+rays pre-rendered once per screen size, then clouds, far mountains/mesas (blurred), hills, treeline as cropped tiling canvases with parallax. Terrain: `createTerrain` paints the static track into 512-unit chunk canvases (cached at the base scale, one chunk warmed ahead per frame, only the visible part blitted): back wall (hazy, pushed back), trees, ground strips (cobblestone **pattern** fill, depth bands following the surface, grass/snow/sand lip with tufts, icicles or pebbles), stone/ice blocks, earthen ledges, spikes, static deco. Never draw stones one by one: a chunk with hundreds of paths took 100–1300 ms to rasterize and froze the game. Live: mud, pads, red "?" boxes, swaying deco, finish arch. `createForeground`: blurred plant sprites at parallax 1.4 along the bottom. `createWeather`: leaves, snow or sand streaks in screen space.
- **`fx.js`**: particles (soft and outlined dust puffs, shards, additive sparks and twinkles, stars, comic POW bursts, confetti, fireworks, smoke, speed lines), branching lightning bolts, shockwave rings, floating text. Glowing things draw in an additive pass. `drawItemIcon` draws Fun Run–style colored round badges.
- **`render.js`**: camera (x locked to the player at 30% across with a lead when boosted, y on a spring, slight zoom-out when boosted, zoom punch on hits), shake/flash, all layers in order, runners leaning into slopes, boost afterimages, shield bubble, x-ray glow, name tags, anvil warning, pre-rendered vignette. Adaptive quality: if frames stay slower than 45 fps for 1.5 s it steps the canvas DPR down (1.75 → 1.4 → 1.15 → 1) and turns off the vignette, then weather and foreground. Debug: `globalThis.__prof = {}` collects per-layer JS time, `globalThis.__skip = { backdrop, terrain, weather, fore }` skips layers.
- **`sound.js`**: soft Web Audio synth effects (sine/triangle, filtered noise, bells) through a low-pass, a generated room reverb and a compressor; a mellow 8-bar loop (soft keys, round bass, light drums, pentatonic lead) whose key, tempo and lead come from the theme's `music` mood. Starts on the first tap.
- **`main.js`**: menu (animal picker, map chips: Orman / Karlı Dağ / Çöl / Karışık, preview), HUD (place, progress heads, item button roulette, banners, countdown), results, pause, help, input (left 62% of the screen or the jump button = jump, hold for higher; item button; keyboard Space/↑/W and E/Enter), fullscreen + landscape lock on phones, rotate hint, save (animal, map, toggles, races/wins) in `localStorage` key `man-run`. The loop splits each frame into equal sub-steps of at most `STEP` (no judder on any refresh rate); big hits freeze the sim for 50–80 ms (hit-stop). `?map=snow` forces a map.
