# Kiwi Runner 🥝

A Super-Mario-style side-scrolling platformer starring a striped kiwi.
Standalone **Next.js 16** app — HTML5 Canvas + vanilla TypeScript, no game
framework, no backend, no accounts.

**12 levels** across two worlds (six themed backgrounds — day, sunset, dusk,
cave, snow, night — cycled twice, the second time meaner), each **longer and
harder than the last**. On top of ground enemies, **flying mobs**, spikes and
pits, every level layers in **2–3 environment mechanics**:

- **moving platforms**, **bounce springs**, **key + gate** puzzles (World 2 has a
  double-key gate)
- **crumbling platforms** (drop away after you land), **conveyor belts** (drag you
  along), **crushers** (slam down on a timer — mind the safe window)
- **falling rocks** (let go when you pass beneath), **ice** (slippery momentum),
  **wind gusts** (shove you mid-run and mid-jump)
- **weight-plate crate puzzles** (park the crate to hold a door open / a beam
  off — you can't stand on it *and* cross)
- **laser gates** (timed on/off, or cut by a switch/crate), **levers & timed
  doors** (race them, or jam open with a crate), and **updraft fans** (ride the
  column up a shaft)

Mobs are **stomped Mario-style** (land on a head to defeat it — any other touch
hurts), floating ledges are **jump-through** (leap up from below, land on top),
dying plays a **pop-and-tumble death** with a feather burst, jumps kick up
**dust / an air-burst effect**, and there's **sound + per-theme background
music** and a **fullscreen toggle** (both in the HUD). The windowed view scales
to fill most of the browser.

Some finish flags sit at the **top** of a climb, not on the ground. Four
difficulties from **Easy** to **Extreme** (1 life, 45s, double-speed mobs).

## Run

```bash
npm install
npm run dev
```

Open **http://localhost:3008** — the game is the whole app. Works offline once
loaded.

Other commands: `npm run build` / `npm run start` (production), `npm run test`
(collision unit tests), `npm run lint`.

## Controls

- **Desktop:** ← → or A/D to move, Space / ↑ / W to jump (hold for a higher
  jump), Shift / K to dash, Esc to pause. **Stomp** a mob by landing on its head;
  **jump up through** floating ledges and land on top. 🔊 in the HUD mutes audio.
- **Touch:** on-screen left / right / jump / dash buttons appear on
  coarse-pointer devices.

## Flow

`Menu → Difficulty select → (first-play controls card) → Playing → Level complete
→ … → Victory`, with `Game over → Retry / Menu` and a `Pause → Resume / Quit
(with confirm)` overlay. Assets preload behind a Loading screen.

## Project layout

| Concern | File |
| --- | --- |
| Level data (add/edit levels here) | `lib/game/levels.ts` |
| Difficulty tables (tune here) | `lib/game/difficulty.ts` |
| Shared data types | `lib/game/types.ts` |
| Collision core (pure, unit-tested) | `lib/game/physics.ts` (+ `physics.test.ts`) |
| Engine: loop, physics, animation, rendering | `lib/game/engine.ts` |
| Audio: Web-Audio sfx + looping music | `lib/game/audio.ts` |
| React shell: screens, HUD, input wiring | `app/_components/KiwiRunner.tsx` |
| Route entry | `app/page.tsx` · `app/layout.tsx` |
| Kiwi sprite sheet | `public/kiwi_animation.png` |
| Sound effects + music (+ credits) | `public/audio/` |

## Adding a level

Append an object to `LEVELS` in `lib/game/levels.ts`. Nothing in the engine
needs to change. Coordinates use a logical **960×540** viewport; the world
scrolls right. `GROUND_Y = 480` is the ground surface. Helpers are provided:

```ts
{
  id: 7,
  name: 'My Level',
  theme: 'day',        // day | sunset | dusk | cave | snow | night → parallax palette
  worldWidth: 3600,    // total scroll length
  spawn: { x: 80, y: GROUND_Y - PLAYER_H },
  platforms: [ ground(0, 800), ground(1000, 600), block(500, 360) ],  // gaps = pits
  coins: [ ...coinRow(300, 430, 3), ...coinArc(800, 360, 3) ],        // each collected once
  hazards: [ spikeOnGround(650, 60), enemyOnGround(1100, 240, 70), flyer(1400, 300, 260) ],
  finish: { x: 3500, y: GROUND_Y },   // put y up high for a top finish
  minCoins: 6,         // optional: gate the finish until you hold this many coins
  // optional mechanics:
  movers:   [ moverX(760, 470, 110), moverY(1650, 360, 120) ], // rideable platforms
  springs:  [ spring(360) ],                                   // bounce pad (~350px)
  keys:     [ keyAt(945, 250) ],                               // collect all to…
  gate:     { x: 2500, y: 300, w: 24, h: GROUND_Y - 300 },     // …open this barrier
  // environment mechanics:
  crumblers:[ crumbler(1200, 380) ],              // collapses ~0.4s after you land
  belts:    [ belt(2000, GROUND_Y, 300, 1, 120) ],// drags rider (dir ±1, speed < 240)
  crushers: [ crusher(2600, 168, 252, 2.2) ],     // slams down (raised y, range, period s)
  droppers: [ dropper(3000, 150) ],               // rock that drops when you pass under
  ice:      [ ice(3200, 300) ],                   // slippery patch (x, width, surface y)
  wind:     [ wind(3400, 300, 500, 180, -110) ],  // gust zone (push ±px/s, < 240)
  boxes:    [ box(3800) ],                         // pushable crate (settles by gravity)
  switches: [ weightPlate(4000, 0), lever(4600, 1, 2500) ], // hold-down plate / timed lever
  barriers: [ barrier(4300, 120, 24, GROUND_Y - 120), barrier(4800, 120, 24, GROUND_Y - 120) ],
  lasers:   [ laser(5000, 150, 10, 330, 2, 0, 0.5), linkedLaser(5200, 150, 10, 330, 0) ], // timed / switch-cut
  fans:     [ fan(5400, 140, 80, 300, 520) ],      // updraft column (ride up)
}
```

- **Platforms** are solid ground slabs and floating blocks. A gap between ground
  slabs is a bottomless pit (falling past the world floor costs a life).
- **Hazards:** `spikeOnGround` (static), `enemyOnGround` (walks `patrol` px), and
  `flyer` (flies + bobs) — all cost a life on contact.
- **Coins** are collected on overlap, counted once; `minCoins` optionally blocks
  the finish until enough are held.
- **`moverX` / `moverY`** are rideable platforms (carry the player); **`spring`**
  is a bounce pad; **`keys` + `gate`** form a lock puzzle (the gate is solid until
  every key is collected). Keys must be placed left of their gate.
- **`crumbler`** is a block that shakes and drops shortly after you stand on it,
  then reforms; **`belt`** is a conveyor floor that drags its rider (keep `speed`
  below the 240 run speed so it's escapable); **`crusher`** slams straight down on
  a `period`-second cycle and is lethal only during the slam (raised ~55% of the
  cycle — always passable), so its raised `y + h` must clear a standing kiwi.
- **`dropper`** is a rock that releases when the kiwi walks beneath it, falls
  lethally, and re-arms; **`ice`** swaps snappy control for momentum while you
  stand on it; **`wind`** adds a signed horizontal push inside its rectangle (in
  the air too — keep `|push|` below 240).
- **`box` + `weightPlate`/`barrier`:** shove a crate onto a `weightPlate` (a
  hold-down plate) to open the `barrier` it indexes — you can't stand on it *and*
  cross, so the crate is required. Place the plate just before the barrier so the
  crate stops on it against the closed door.
- **`lever` + `barrier`:** a `lever` trips on touch; it latches the barrier open,
  or with `openMs` re-closes it on a timer (race it, or jam it open with a crate).
- **`laser` / `linkedLaser`:** a lethal beam. `laser` blinks on/off on a `period`
  (run the OFF window — tall enough that it can't be jumped over); `linkedLaser`'s
  `link` is a switch index — it's ON only while that switch is inactive, so a
  crate on a plate (or a thrown lever) cuts it.
- **`fan`:** an updraft column — inside it the kiwi rides up at ~`lift` px/s; build
  a shaft up to a ledge. Its base sits just above the ground so you hop in.
- **Top finishes:** set `finish.y` high (e.g. `220`) and build a route up to it —
  the finish only triggers near the flag's height, so you must actually climb.
- Every level's `worldWidth` is **non-decreasing** by design (later levels are
  longer); `belt`/`wind`/`crusher` bounds and that ordering are asserted in
  `levels.test.ts`.

## Tuning difficulty

Edit the four config objects in `lib/game/difficulty.ts`. Layout is identical
across modes — only these values change:

| param | Easy | Medium | Hard | Extreme |
| --- | --- | --- | --- | --- |
| lives | 5 | 3 | 2 | 1 |
| enemySpeedMul | 0.6 | 1.0 | 1.6 | 2.0 |
| coyoteMs (ledge grace) | 150 | 100 | 60 | 40 |
| jumpBufferMs | 150 | 120 | 80 | 50 |
| timeLimitSec | none | 120 | 60 | 45 |
| restartLevelOnHit | no (−1 life) | no (−1 life) | **yes** | moot (1 life) |
| playerSpeedMul | 1.0 | 1.0 | 1.1 | 1.15 |

"Wider/tighter platforms" is expressed as landing forgiveness (coyote time +
jump buffer), not by mutating level geometry.

## How it works (non-obvious bits)

- **Frame-rate independence:** a fixed-timestep accumulator (1/120s steps, frame
  delta clamped to 100ms) drives physics, so behaviour is identical at any
  refresh rate and after a tab-switch. Small steps also prevent
  pass-through/tunnelling at speed.
- **Collision:** `physics.ts` resolves one axis at a time (horizontal then
  vertical) against solids — reliable ground detection, no clip-through. It's
  DOM-free and unit-tested (`npm run test`).
- **Animation state machine:** the 8-frame run sheet drives all states — `run`
  cycles the frames, `idle` holds frame 0 with a bob, `jump` holds a leg-tucked
  frame with a velocity-based tilt, plus a landing squash.
- **Moving platforms** are time-based (position = a sine of game time) so they
  never drift; each frame the player is carried by the platform's per-step delta
  if standing on it, then normal collision runs against all solids (static
  platforms + movers + a locked gate).

## Assumptions & placeholders

- **Kiwi art** is `public/kiwi_animation.png` — an **8-frame run cycle**. There's
  no dedicated idle or jump art, so those states are **derived** from the run
  sheet (bob for idle, single frame + tilt for jump). The sprite is color-keyed
  (near-white → transparent) at load and inset-sampled to trim the dashed export
  border baked into the PNG. If the image fails to load, the game falls back to a
  drawn brown blob and still runs.
- **Backgrounds** are mostly procedural (gradient sky + two parallax hill layers
  + theme extras — sun/moon, stars at night, drifting snow, a sunless cave), now
  with **tree sprites** tiled into the parallax: blue `Background tree_*` in the
  far layer, green `Middle Ground tree_*` in the middle layer (skipped on the cave
  theme). The `_03` solid fill tiles aren't used — the themed hill bands provide
  the colour fill so every theme stays coherent; trees draw in their native
  colours (tint them to `pal.far`/`pal.near` if dark themes need it).
- **Coins, keys, springs, movers, spikes, enemies, flyers, the gate, and the
  finish flag** — plus every environment mechanic (crumblers, belts, crushers,
  droppers, ice, wind, crates, plates, barriers, lasers, fans, levers) — are drawn
  procedurally on the
  canvas. The **jump VFX** are the only sprite-sheet effects: feet-anchored frame
  sequences in `public/Jump/take_off` (ground-jump dust), `public/Jump/land`
  (landing dust), and `public/Double Jump` (air-jump burst), loaded by
  `loadFrames` and played once at the kiwi's feet. Missing frames → the effect
  just doesn't draw.
- **Display:** the game frame is the largest 16:9 that fits `min(94vw, 86vh·16/9)`
  windowed, and the whole screen in fullscreen. `setupCanvas` sizes the canvas
  backing store to the displayed pixels × dpr (capped at 2), so it stays crisp at
  any size — and re-fits on resize / `fullscreenchange`. A **⛶ toggle** in the HUD
  enters/exits fullscreen (standard Fullscreen API; unsupported browsers stay
  windowed). In fullscreen the browser owns **Esc** (it exits fullscreen before it
  can pause) — use the on-screen ⏸ button to pause.
- **Enemies and flyers can be stomped** — land on the head while falling to
  defeat them (a bounce + score); any other contact costs a life. **Spikes,
  crushers, and falling rocks** are pure hazards (never stompable). A death plays
  a short pop-and-tumble animation with a feather burst before the outcome:
  Easy/Medium respawn you at the level start (coins/keys kept, mobs revived,
  other mechanics reset); Hard restarts the level.
- **Audio** (`lib/game/audio.ts`, Web Audio API): jump/coin/stomp/death SFX are
  Kenney's **CC0** "Digital Audio" pack (real downloads); the six per-theme
  background loops are **synthesized** for this project (see
  `public/audio/CREDITS.txt`). The context is unlocked on the first Play click
  (autoplay policy); a missing/blocked clip just plays silent. Swap in your own
  tracks by dropping same-named files into `public/audio/`.
