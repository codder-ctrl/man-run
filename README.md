# Man Run

A Fun Run–style animal race for the browser, built phone-first. Four chibi animals dash across hilly, layered 2.5D tracks; you jump, slide, climb and throw items from "?" boxes to reach the flag first, against bots or against your friends' phones. Plain HTML, CSS and JavaScript (ES modules), no build step and no dependencies. UI text is Turkish.

## ▶ [Play Man Run](https://codder-ctrl.github.io/man-run/)

**<https://codder-ctrl.github.io/man-run/>** (GitHub Pages; every push to `main` redeploys it).

On a phone, open the link in Chrome (Safari on iPhone) and tap **📲 Telefona Yükle** in the menu to add it to the home screen. It then opens full screen like an app and works offline.

## How it plays

Your animal runs by itself. You only decide when to jump, slide and use your items.

| Action | Phone | Keyboard |
|---|---|---|
| Jump (hold for higher) | left side of the screen or **ZIPLA** | `Space` / `↑` / `W` |
| Slide (one tap) | **EĞİL** | `↓` / `S` |
| Blue paw: aim and dash | hold **🐾**, drag to aim, let go (a tap dashes forward) | hold `Q`, aim with `↑`/`↓`, let go |
| Use item | hold the item button, let go (drag to aim a saw or a trap) | hold `E`, aim with `↑`/`↓`, let go |

- **Jumping and sliding cost speed:** in the air after a jump and while sliding, your top speed drops to 80%. Don't jump for nothing.
- **Slide:** one tap slides for a moment, then you stand up by yourself; under a low rock roof you stay down until you're out. Tapped in the air, it dives straight down and slides on landing.
- **Climb:** run into a wall and you grab it and climb; hold jump to climb twice as fast. Miss a ledge by a little and you hang on and pull yourself up. Low rock roofs can't be climbed, only slid under.
- **Blue paw, aimed like a Brawl Stars super:** the 🐾 button fills up over 15 seconds. When it glows, hold it and drag your thumb to aim, all the way round: an arrow and a dotted path show where you'll go (only on your screen), while everyone sees your animal raise a glowing paw in that direction. Let go and you burst that way, then keep the speed boost. Aim up to fly over walls and pits, forward for a ground dash, down in the air to dive. A quick tap dashes straight ahead. Each animal has its own dash:
  - Tilki: Tilki Atılışı, short but very fast
  - Ayı: Ayı Gücü, long and strong
  - Tavşan: Tavşan Sıçrayışı, nimble
  - Kurt: Kurt Koşusu, balanced
  - Kedi: Kedi Çevikliği, quick
  - Panda: Bambu Rüzgârı, long-winded
- **"?" boxes are your own:** each spot has one box, and taking it only hides it for you, so everyone gets their own box at the same place.
- **Items work the same way:** nothing happens until you let go of the button. The saw and the trap can be aimed in any direction while you hold it (with your own arrow and path); a tap rolls the saw forward or drops the trap behind you. The other items are used the moment you let go, and your animal holds them up while you wait.
- **Items** (the last runners get the strongest ones):
  - ⚡ Şimşek: zaps everyone (they turn into x-ray skeletons for a moment)
  - 🛡️ Kalkan: blocks attacks and spikes
  - 🪚 Testere: thrown any way you aim (even back at a chaser), then rolls along, hopping walls, and knocks down the first runner it hits
  - 🐻 Kapan: a bear trap dropped behind you, or thrown where you aim; it never catches its owner
  - 💨 Hız: a few seconds of top speed
  - 🔨 Örs: drops on the leader's head after a red "!" warning
- **Track:** speed pads speed you up, mud slows you down, spikes stun you. Fall into a pit and you continue a bit further back.

## Maps

Every race builds a new track from a random seed: rolling hills, valleys, pits, cliffs, stone walls, floating islands, upper ledge routes and low rock roofs. Pick a map in the menu, or 🎲 Karışık for a random one:

- **🌳 Orman:** cobbled earth, thick grass, falling leaves.
- **❄️ Karlı Dağ:** snow caps with icicles, ice blocks, snowmen, snowfall.
- **🏜️ Çöl:** sandstone, mesas, cacti, tumbleweeds, blowing sand.

## Playing with friends

Menu → **👫 Arkadaşla Oyna** → type your name.

1. One player taps **Oda Kur** and gets a 4-letter room code.
2. The others type the code and tap **Katıl** (up to 4 players).
3. In the lobby, tap your card to change your animal. The host picks the map, turns bots on or off for the empty seats and taps **BAŞLAT**.

The host's phone runs the race (items, hits, places), so the host's screen has to stay on. Everyone's own jumps and slides happen on their own phone, so controls never lag. A friend who leaves is replaced by a bot. The internet is only needed to connect: phones are introduced through the free PeerJS server, then game data flows phone to phone over WebRTC. Browsers can't link phones over Bluetooth, which is why it uses room codes.

## Getting started

Browsers won't load ES modules from a `file://` page, so serve the folder over HTTP:

```bash
python -m http.server 8004 --directory Man_Run
```

Then open <http://localhost:8004>. On a phone on the same Wi-Fi, open `http://<your-PC-IP>:8004`.

Run the tests (Node 18+):

```bash
npm test
```

The tests race four bots on generated tracks of every map, wire a host and a guest together in memory to check an online race stays in step, and check the offline cache list.

## Project layout

| File | Contents |
|---|---|
| `js/config.js` | Physics constants, animals, items, blue paw abilities, bot skills |
| `js/themes.js` | The three maps: colors, decorations, weather, music mood |
| `js/track.js` | Track generator: segments, rolling ground, boxes, back-wall profile |
| `js/physics.js` | Movement on sloped ground, jumping, sliding, climbing, the bots' what-if simulation |
| `js/ai.js` | Computer runners |
| `js/game.js` | Race rules: items, hits, boxes, places, finish; solo, host and guest roles |
| `js/netsync.js` | Keeping an online race in step (snapshots, reports, interpolation) |
| `js/net.js`, `js/online.js` | Room codes over PeerJS, and the lobby |
| `js/paint.js` | Drawing style: outlined, shaded shapes and path helpers |
| `js/animals.js` | The six animals and their poses |
| `js/scenery.js` | Parallax backdrops, cached terrain chunks, foreground, weather, boxes, finish arch |
| `js/fx.js` | Particles, lightning, bursts, paw prints, item badges |
| `js/render.js` | Camera and drawing of the race, adaptive quality |
| `js/sound.js` | Sound effects and music (WebAudio) |
| `js/main.js` | Menu, HUD, input, online screens, install guide, game loop |
| `tools/pose-lab.html` | Development view of every animal in every pose |
| `tools/icon-server.js`, `tools/icons.html` | App icon generator |
