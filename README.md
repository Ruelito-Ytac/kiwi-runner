# Kiwi Runner 🥝

A Super-Mario-style side-scrolling platformer starring a striped kiwi.
Standalone **Next.js 16** app — HTML5 Canvas + vanilla TypeScript, no game
framework, no backend, no accounts.

**6 levels** across 6 themed backgrounds (day, sunset, dusk, cave, snow, night),
with ground enemies, **flying mobs**, spikes and pits, plus mechanics — **moving
platforms**, **bounce springs**, and a **key + gate** puzzle. Some finish flags
sit at the **top** of a climb, not on the ground.

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
  jump), Esc to pause.
- **Touch:** on-screen left / right / jump buttons appear on coarse-pointer
  devices.

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
| React shell: screens, HUD, input wiring | `app/_components/KiwiRunner.tsx` |
| Route entry | `app/page.tsx` · `app/layout.tsx` |
| Kiwi sprite sheet | `public/kiwi_animation.png` |

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
  movers:  [ moverX(760, 470, 110), moverY(1650, 360, 120) ], // rideable platforms
  springs: [ spring(360) ],                                   // bounce pad (~350px)
  keys:    [ keyAt(945, 250) ],                               // collect all to…
  gate:    { x: 2500, y: 300, w: 24, h: GROUND_Y - 300 },     // …open this barrier
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
- **Top finishes:** set `finish.y` high (e.g. `220`) and build a route up to it —
  the finish only triggers near the flag's height, so you must actually climb.

## Tuning difficulty

Edit the three config objects in `lib/game/difficulty.ts`. Layout is identical
across modes — only these values change:

| param | Easy | Medium | Hard |
| --- | --- | --- | --- |
| lives | 5 | 3 | 2 |
| enemySpeedMul | 0.6 | 1.0 | 1.6 |
| coyoteMs (ledge grace) | 150 | 100 | 60 |
| jumpBufferMs | 150 | 120 | 80 |
| timeLimitSec | none | 120 | 60 |
| restartLevelOnHit | no (−1 life) | no (−1 life) | **yes** |
| playerSpeedMul | 1.0 | 1.0 | 1.1 |

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
- **Backgrounds** are all generated procedurally in code (gradient sky + two
  parallax hill layers + theme extras — sun/moon, stars at night, drifting snow,
  a sunless cave) — no background image files were supplied, so none are shipped.
- **Coins, keys, springs, movers, spikes, enemies, flyers, the gate, and the
  finish flag** are all drawn procedurally on the canvas.
- **Enemies and flyers are pure hazards** (no stomp-to-defeat) — contact costs a
  life. Easy/Medium respawn you at the level start (coins/keys kept); Hard
  restarts the level.
