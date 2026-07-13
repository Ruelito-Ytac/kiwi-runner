import type { Difficulty, DifficultyConfig } from "./types";

/**
 * The three difficulty tables. Each is a single flat config object so values
 * are trivial to tune. Layout is identical across modes — "wider/tighter
 * platforms" is expressed as landing forgiveness (coyote + jump buffer),
 * NOT by mutating level geometry.
 */
export const DIFFICULTIES: Record<Difficulty, DifficultyConfig> = {
  easy: {
    label: "Easy",
    lives: 5,
    enemySpeedMul: 0.6,
    coyoteMs: 150,
    jumpBufferMs: 150,
    timeLimitSec: null,
    restartLevelOnHit: false,
    playerSpeedMul: 1.0,
  },
  medium: {
    label: "Medium",
    lives: 3,
    enemySpeedMul: 1.0,
    coyoteMs: 100,
    jumpBufferMs: 120,
    timeLimitSec: 120,
    restartLevelOnHit: false,
    playerSpeedMul: 1.0,
  },
  hard: {
    label: "Hard",
    lives: 2,
    enemySpeedMul: 1.6,
    coyoteMs: 60,
    jumpBufferMs: 80,
    timeLimitSec: 60,
    restartLevelOnHit: true, // any hit sends you back to the level start
    playerSpeedMul: 1.1,
  },
  extreme: {
    label: "Extreme",
    lives: 1, // one hit ends the run — restartLevelOnHit is moot at 1 life
    enemySpeedMul: 2.0, // mobs move twice as fast
    coyoteMs: 40, // almost no ledge grace
    jumpBufferMs: 50,
    timeLimitSec: 45, // brutal clock
    restartLevelOnHit: false,
    playerSpeedMul: 1.15,
  },
};
