/** Shared data shapes for Kiwi Runner. Levels and difficulty are pure data. */

export type Difficulty = "easy" | "medium" | "hard" | "extreme";

/** One tunable knob-set per difficulty. Values only — never layout logic. */
export type DifficultyConfig = {
  label: string;
  lives: number;
  enemySpeedMul: number; // multiplies each enemy/flyer's base speed
  coyoteMs: number; // grace window to still jump just after leaving a ledge
  jumpBufferMs: number; // grace window when jump is pressed just before landing
  timeLimitSec: number | null; // per-level countdown; null = untimed
  restartLevelOnHit: boolean; // true = a hit restarts the whole level (Hard)
  playerSpeedMul: number;
};

export type Vec = { x: number; y: number };

/** A solid the player stands on / bumps into. Ground segments AND floating blocks. */
export type Platform = { x: number; y: number; w: number; h: number };

export type Spike = {
  type: "spike";
  x: number;
  y: number;
  w: number;
  h: number;
};

/** Ground-walking enemy: patrols back and forth on its platform. */
export type Enemy = {
  type: "enemy";
  x: number; // starting/left bound of patrol
  y: number;
  w: number;
  h: number;
  patrol: number; // horizontal distance it walks back and forth
  speed: number; // base px/s, scaled by difficulty.enemySpeedMul
};

/** Flying mob: patrols horizontally while bobbing on a sine wave. */
export type Flyer = {
  type: "flyer";
  x: number;
  y: number;
  w: number;
  h: number;
  patrol: number; // horizontal patrol distance
  speed: number; // base px/s, scaled by difficulty.enemySpeedMul
  amp: number; // vertical bob amplitude
};

export type Hazard = Spike | Enemy | Flyer;

/** A solid platform that slides back and forth on one axis; the player rides it. */
export type MovingPlatform = {
  x: number;
  y: number;
  w: number;
  h: number;
  axis: "x" | "y";
  range: number; // travel distance from the base position
  speed: number; // angular speed of the sine sweep (higher = faster)
};

/** A bounce pad sitting on a surface; standing on it launches the kiwi high. */
export type Spring = { x: number; y: number; w: number };

/** A collectible key. Collecting every key in a level opens its gate. */
export type Key = { x: number; y: number };

/** A solid barrier that blocks the path until all keys are collected. */
export type Gate = { x: number; y: number; w: number; h: number };

/** A crate the player can push horizontally; it falls with gravity and can be
 *  stood on. Push it onto a switch or use it as a step. */
export type PushBox = { x: number; y: number; w: number; h: number };

/** A pressure plate / lever. A `plate` (default) is pressed while the player or a
 *  box rests on it; a `lever` trips when the player touches it. While active it
 *  opens the `Barrier` at index `barrier` (optional — a switch may drive only a
 *  laser). `latch` keeps it on for good once first triggered; `openMs` makes it a
 *  timed door that re-closes that many ms after each trigger. */
export type Switch = {
  x: number;
  y: number; // top surface the plate sits on (or the lever's top)
  w: number;
  h: number;
  barrier?: number; // index into the level's `barriers`
  latch?: boolean; // stays on for good once first triggered
  mode?: "plate" | "lever"; // plate = weight underfoot (default); lever = trip on touch
  openMs?: number; // timed door: stay active this many ms after each trigger, then reset
};

/** A solid barrier that is passable only while its switch is active. */
export type Barrier = { x: number; y: number; w: number; h: number };

/** A lethal light beam. Timed (`period` set): ON during `duty` of each `period`s
 *  cycle, offset by `phase` — dash through in the OFF window. Switch-linked
 *  (`link` set): ON while `switches[link]` is NOT active, so a plate/crate turns
 *  it off. A wide/short rect reads as a horizontal beam, a tall/thin one as
 *  vertical (orientation is inferred from the rect in the renderer). */
export type Laser = {
  x: number;
  y: number;
  w: number;
  h: number;
  period?: number; // seconds per on/off cycle (timed lasers)
  phase?: number; // 0..1 cycle offset so neighbours desync
  duty?: number; // 0..1 fraction of the cycle spent ON (default 0.5)
  link?: number; // index into `switches`; ON while that switch is inactive
};

/** An updraft column. While the kiwi's centre is inside, it is pushed upward and
 *  rises at up to `lift` px/s — ride it up a shaft. The vertical twin of `Wind`. */
export type Fan = { x: number; y: number; w: number; h: number; lift: number };

/** A floating block that collapses shortly after the kiwi lands on it, then
 *  respawns after a beat. Solid until it falls away — forces you to keep moving. */
export type Crumbler = { x: number; y: number; w: number; h: number };

/** A solid platform whose surface drags whatever stands on it along one axis.
 *  `dir` is the push direction, `speed` its strength (kept below run speed so
 *  the kiwi can always walk against it). */
export type Belt = {
  x: number;
  y: number;
  w: number;
  h: number;
  dir: 1 | -1;
  speed: number; // px/s of horizontal drag; must be < player run speed
};

/** A heavy block that slams straight down on a timer and retracts. Pure hazard
 *  (not a solid): lethal only during the slam + the bottom hold, safe while
 *  raised (the passing window) and while retracting. `range` is the drop
 *  distance from its raised top, `period` the seconds of one full cycle. */
export type Crusher = {
  x: number;
  y: number; // raised top (safe height — must clear a standing kiwi below)
  w: number;
  h: number;
  range: number; // vertical slam distance
  period: number; // seconds per full raise→slam→retract cycle
  phase?: number; // 0..1 cycle offset so neighbours desync
};

/** A rock/icicle parked overhead that lets go when the kiwi walks beneath it,
 *  falls (lethal), shatters on the ground, and re-arms after a pause. */
export type Dropper = { x: number; y: number; w: number; h: number };

/** A slippery surface patch (sits on a platform top like a spring). Standing on
 *  it swaps the kiwi's snappy control for momentum — you accelerate and skid. */
export type Ice = { x: number; y: number; w: number };

/** A rectangular gust zone. While the kiwi's centre is inside, `push` (signed
 *  px/s) is added to its horizontal velocity — in the air too. Magnitude kept
 *  below run speed so forward progress against it is always possible. */
export type Wind = { x: number; y: number; w: number; h: number; push: number };

export type Level = {
  id: number;
  name: string;
  /** Palette key that drives the procedural parallax background (see engine). */
  theme: "day" | "sunset" | "dusk" | "cave" | "snow" | "night";
  worldWidth: number;
  spawn: Vec;
  platforms: Platform[];
  coins: Vec[];
  hazards: Hazard[];
  finish: Vec; // bottom of the flag pole — may be up high, not just at ground level
  minCoins?: number; // optional gate: must hold >= this many to pass the finish
  movers?: MovingPlatform[]; // rideable moving platforms
  springs?: Spring[]; // bounce pads
  keys?: Key[]; // collect all to open the gate
  gate?: Gate; // locked barrier (needs keys)
  boxes?: PushBox[]; // pushable crates
  switches?: Switch[]; // pressure plates / levers that open barriers
  barriers?: Barrier[]; // solids opened by a switch (index-linked from Switch.barrier)
  crumblers?: Crumbler[]; // blocks that collapse after you stand on them
  belts?: Belt[]; // conveyor platforms that drag the rider sideways
  crushers?: Crusher[]; // timed slamming hazards
  droppers?: Dropper[]; // falling rocks triggered by passing underneath
  ice?: Ice[]; // slippery surface patches
  wind?: Wind[]; // horizontal gust zones
  lasers?: Laser[]; // timed / switch-linked light-beam hazards
  fans?: Fan[]; // updraft columns you ride upward
};
