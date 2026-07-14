# Kiwi Runner — Interactive Mechanics & Puzzle Retrofit

**Date:** 2026-07-14
**Goal:** Shift the game from "dodge obstacles while running right + collect coins"
to "systems you manipulate." Add four interactive mechanics and weave one
signature puzzle set-piece into each of the existing 12 levels. Keep the current
themes, difficulty curve, and data-driven level format.

## Diagnosis (why it feels flat today)

1. Every level is the same left-to-right corridor; no branching / verticality / rooms.
2. Mechanics are dodge-obstacles (time the crusher, endure the wind), never things you *use*.
3. The one interactive system (box + plate + barrier) is defanged: crates are
   "shove aside or hop," plates are `latch` you walk over yourself — the box is
   never actually required (L7, L10, L12).
4. Crumblers/droppers have zero stakes by design.
5. Coins are the only goal.

## The four new mechanics

All reuse existing engine patterns (switch→barrier state, box-presses-plate,
timed-crusher cycle, wind-in-a-rect). New engine code is additive — the core
fixed-step loop and `solids()`/`checkHazards()` structure don't change shape.

### 1. Lasers (new hazard)

- **Data:** `Laser = { x, y, w, h, period?, phase?, duty?, link? }`. A wide/short
  rect is a horizontal beam; tall/thin is vertical (inferred in the renderer).
- **Timed** (`period` set): ON during `duty` fraction of each `period`s cycle,
  offset by `phase` — same timing shape as crushers. Dash through in the OFF window.
- **Switch-linked** (`link` = switch index): ON while `switches[link]` is NOT
  active. A hold-down plate + crate turns it off → the crate finally matters.
- **Engine:** `lasers: LaserState[]` (`Laser & {on}`); `updateLasers()` after
  `updateSwitches()`; one overlap test added to `checkHazards()`; `drawLasers()`
  (bright beam on, faint emitter nubs off). Rebuilt on load + respawn.

### 2. Real box puzzles (make the crate required)

Mostly level design + the laser/door wiring above. Reuses existing box physics
(gravity, push, presses plates) unchanged.

- **Weight plate:** hold-down plate (`latch=false`); park the crate on it to hold
  a door open / a laser off while you cross. Required because you can't stand on
  the plate *and* be across.
- **Box-as-step:** a one-way ledge placed above jump reach; push a crate under it
  and stand on the crate to get up. No engine change (crates are already solids).
- Fix the three dead crates (L7, L10, L12) to use these.

### 3. Levers & timed doors

- **Extend `Switch`:** optional `mode: 'plate' | 'lever'` (default `plate`) and
  optional `openMs`. Make `barrier` optional (a switch may drive only a laser).
- **Lever:** triggers on player *overlap* (body-height touch), not foot weight.
- **Timed door:** `openMs` set → the switch stays active for `openMs` after each
  trigger, then resets. Throw the lever and race the closing door — or jam it open
  with a crate on a hold-down plate.
- **Engine:** `updateSwitches()` gains the lever-overlap trigger + the `openMs`
  timer. Barriers already open from switch state; lasers read the same state.

### 4. Fans & updraft shafts

- **Data:** `Fan = { x, y, w, h, lift }`. The vertical analog of `wind`.
- **Behavior:** inside the rect, apply upward acceleration capped at a float speed
  so you ride the column up a shaft; jumping/dashing still works.
- **Engine:** `fans: Fan[]`; apply in the movement step next to wind; `drawFans()`
  (translucent column + rising chevrons). Enables vertical set-pieces.

## Engine change surface (scoped)

- `types.ts`: add `Laser`, `Fan`; extend `Switch` (`mode?`, `openMs?`, `barrier?`
  optional); add `lasers?`, `fans?` to `Level`.
- `levels.ts`: helpers `laser()`, `linkedLaser()`, `lever()`, `weightPlate()`,
  `fan()`; retrofit the 12 levels.
- `engine.ts`: laser state + `updateLasers()` + `drawLasers()` + one hazard test;
  `updateSwitches()` lever/timer; fan apply + `drawFans()`; reset wiring.
- `levels.test.ts`: extend the hazard-overlap guard to include laser rects (when
  a laser can be on where a coin sits); assert every `link`/`barrier` index and
  every laser's OFF window is actually passable.

## Per-level set-piece plan (teach early, combine late)

| Lv | Theme | Signature set-piece | Mechanics |
| -- | ----- | ------------------- | --------- |
| 1 | day | Throw a lever, a short door opens — gentle intro, no timer | lever/door |
| 2 | sunset | Push a crate onto a weight plate to hold a door open, cross | box puzzle |
| 3 | dusk | Timed laser gate across the path — run the OFF window | laser (timed) |
| 4 | cave | Updraft shaft lifts you to the crusher route / a coin vault | fan |
| 5 | snow | Crate onto a plate kills a laser blocking the gated run (on ice) | laser + box |
| 6 | night | Race a timed door (or jam it with a crate) past a laser — W1 finale | lever+door+box |
| 7 | day | Fix the dead crate → box-step up to a high coin vault; timed laser on the belt | box-step + laser |
| 8 | sunset | Two out-of-phase timed lasers to thread; a crate holds one off | lasers |
| 9 | cave | Updraft past a vertical laser | fan + laser |
| 10 | snow | Fix the walk-over plate → crate *required* to open the barrier; lever-timed door | box + lever |
| 11 | dusk | Short timed-laser maze; a lever opens a shortcut past the double-key run | lasers + lever |
| 12 | night | Mini puzzle-gauntlet: crate-plate kills a laser, ride a fan up, race a timed door | all four |

Each set-piece is added *alongside* the existing route so base difficulty stays
beatable; the puzzle is the interesting path (often gating bonus coins or the main
route where noted). Introduce each mechanic in an early level, then combine.

## Build order (each step: `tsc && lint && test && build` green)

1. Types + level helpers (no behavior yet).
2. Lasers (engine + render + hazard + test) — highest-impact, unblocks box combos.
3. Levers/timed doors + weight-plate wiring (extend `updateSwitches`).
4. Fans (movement + render).
5. Retrofit levels in batches (L1–4, L5–8, L9–12), re-running the reachability +
   hazard-overlap guards after each batch.

## Non-goals (YAGNI for now)

Teleporters, colored keys/locks, rotating/moving lasers, box-blocks-beam shields,
branching multi-route levels. Can follow later if the retrofit lands well.
