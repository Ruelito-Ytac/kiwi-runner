/** Shared data shapes for Kiwi Runner. Levels and difficulty are pure data. */

export type Difficulty = "easy" | "medium" | "hard";

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
};
