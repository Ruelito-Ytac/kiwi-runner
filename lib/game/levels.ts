import type { Level, Vec } from "./types";

/**
 * Level data. Everything the engine needs to build a level lives here — add a
 * new object to LEVELS and it just works, no engine changes.
 *
 * Coordinate system: logical 960x540 viewport, world scrolls right.
 * GROUND_Y is the top surface of the ground; ground blocks extend below the
 * screen so gaps between them read as bottomless pits (falling past the world
 * floor = death, handled by the engine).
 */
const GROUND_Y = 480;
const GROUND_H = 160; // extends well below the 540 viewport
const PLAYER_H = 52; // keep in sync with engine PLAYER.h for spawn placement

/** Ground segment helper — a solid slab from the surface down past the screen. */
const ground = (x: number, w: number) => ({ x, y: GROUND_Y, w, h: GROUND_H });
/** A floating block the player can stand on. */
const block = (x: number, y: number, w = 110, h = 24) => ({ x, y, w, h });
/** A short horizontal run of coins. */
const coinRow = (x: number, y: number, n: number, gap = 44): Vec[] =>
  Array.from({ length: n }, (_, i) => ({ x: x + i * gap, y }));
/** A jump-arc of coins. */
const coinArc = (x: number, y: number, n: number, gap = 44, rise = 26): Vec[] =>
  Array.from({ length: n }, (_, i) => ({
    x: x + i * gap,
    y: y - Math.round(rise * Math.sin((Math.PI * i) / (n - 1))),
  }));

const spikeOnGround = (x: number, w: number) =>
  ({ type: "spike", x, y: GROUND_Y - 26, w, h: 26 }) as const;
const enemyOnGround = (x: number, patrol: number, speed = 60) =>
  ({
    type: "enemy",
    x,
    y: GROUND_Y - 40,
    w: 40,
    h: 40,
    patrol,
    speed,
  }) as const;
/** A flying mob patrolling horizontally at height `y`, bobbing by `amp`. */
const flyer = (x: number, y: number, patrol: number, speed = 70, amp = 26) =>
  ({ type: "flyer", x, y, w: 40, h: 34, patrol, speed, amp }) as const;

/** Horizontally/vertically sliding rideable platform. */
const moverX = (x: number, y: number, range: number, speed = 1.2, w = 120) => ({
  x,
  y,
  w,
  h: 22,
  axis: "x" as const,
  range,
  speed,
});
const moverY = (x: number, y: number, range: number, speed = 1.2, w = 120) => ({
  x,
  y,
  w,
  h: 22,
  axis: "y" as const,
  range,
  speed,
});
/** A bounce pad; `y` is the surface it sits on (defaults to the ground). */
const spring = (x: number, y = GROUND_Y, w = 46) => ({ x, y, w });
const keyAt = (x: number, y: number) => ({ x, y });

export const LEVELS: Level[] = [
  // ---------------------------------------------------------------- Level 1
  // Gentle intro: mostly flat, one enemy, one spike, three easy gaps.
  {
    id: 1,
    name: "Fernland Flats",
    theme: "day",
    worldWidth: 3200,
    spawn: { x: 80, y: GROUND_Y - PLAYER_H },
    platforms: [
      ground(0, 820),
      ground(960, 640),
      ground(1750, 700),
      ground(2580, 620),
      block(500, 380),
      block(1300, 356),
      block(2050, 368),
    ],
    coins: [
      ...coinRow(300, 430, 2),
      ...coinRow(500, 340, 2),
      ...coinArc(850, 360, 3),
      { x: 1320, y: 312 },
      ...coinRow(1420, 430, 2),
      ...coinArc(1640, 350, 3),
      { x: 2070, y: 324 },
      ...coinRow(2760, 430, 3),
    ],
    hazards: [spikeOnGround(660, 60), enemyOnGround(1050, 240)],
    finish: { x: 3060, y: GROUND_Y },
  },

  // ---------------------------------------------------------------- Level 2
  // More gaps, two enemies, blocks with coins. Needs 5 coins to pass.
  // All gaps ≤150px; every block ≤120px above the ground (reachable).
  {
    id: 2,
    name: "Kauri Canopy",
    theme: "sunset",
    worldWidth: 3600,
    spawn: { x: 80, y: GROUND_Y - PLAYER_H },
    platforms: [
      ground(0, 640), // gap 140
      ground(780, 420), // gap 150
      ground(1350, 360), // gap 140
      ground(1850, 640), // gap 150
      ground(2640, 960),
      block(560, 380), // 100px up
      block(1030, 366), // 114px up
      block(1500, 360), // 120px up
      block(2100, 372), // 108px up
      block(2350, 360), // 120px up
    ],
    coins: [
      ...coinArc(300, 400, 3),
      { x: 590, y: 344 }, // above block 560
      ...coinArc(690, 405, 3), // over the first gap
      { x: 1060, y: 330 }, // above block 1030
      ...coinArc(1240, 405, 3), // over the second gap
      { x: 1530, y: 324 }, // above block 1500
      ...coinRow(1900, 440, 2),
      { x: 2130, y: 336 }, // above block 2100
      { x: 2380, y: 324 }, // above block 2350
      ...coinRow(2900, 440, 3),
    ],
    hazards: [
      spikeOnGround(2000, 70),
      enemyOnGround(300, 220, 70),
      enemyOnGround(2760, 320, 70),
      flyer(1150, 300, 260, 60, 28), // patrols over the mid gaps
    ],
    finish: { x: 3460, y: GROUND_Y },
    minCoins: 5,
  },

  // ---------------------------------------------------------------- Level 3
  // Tightest layout: six 150px pits, three enemies, spike clusters. Needs 8.
  {
    id: 3,
    name: "Volcano Verge",
    theme: "dusk",
    worldWidth: 4000,
    spawn: { x: 80, y: GROUND_Y - PLAYER_H },
    platforms: [
      ground(0, 540), // gap 150
      ground(690, 250), // gap 150
      ground(1090, 240), // gap 150
      ground(1480, 250), // gap 150
      ground(1880, 620), // gap 150
      ground(2650, 300), // gap 150
      ground(3100, 940),
      block(300, 372), // 108px up
      block(1200, 360), // 120px up
      block(2100, 366), // 114px up
      block(2760, 360), // 120px up
      block(3300, 372), // 108px up
    ],
    coins: [
      { x: 300, y: 336 }, // above block 300
      ...coinArc(590, 405, 3), // over gaps
      ...coinArc(1000, 405, 3),
      { x: 1200, y: 324 }, // above block 1200
      ...coinArc(1380, 405, 3),
      ...coinArc(1780, 405, 3),
      { x: 2100, y: 330 }, // above block 2100
      { x: 2250, y: 440 }, // between the two spike clusters
      { x: 2790, y: 324 }, // above block 2760
      ...coinRow(3350, 440, 4),
    ],
    hazards: [
      spikeOnGround(2000, 60),
      spikeOnGround(2380, 60),
      enemyOnGround(1950, 260, 90),
      enemyOnGround(3150, 340, 90),
      enemyOnGround(3600, 300, 90),
      flyer(650, 300, 320, 80, 34),
      flyer(2600, 280, 240, 80, 30),
    ],
    finish: { x: 3900, y: GROUND_Y },
    minCoins: 8,
  },

  // ---------------------------------------------------------------- Level 4
  // Glow Cavern (cave): first taste of springs + a moving platform, and the
  // finish is UP at the top of a block staircase, not on the ground.
  {
    id: 4,
    name: "Glow Cavern",
    theme: "cave",
    worldWidth: 3100,
    spawn: { x: 80, y: GROUND_Y - PLAYER_H },
    platforms: [
      ground(0, 720), // [0-720]
      ground(980, 260), // gap 260 → bridged by the horizontal mover
      ground(1390, 300), // gap 150
      ground(1840, 560), // gap 150 — staircase launch pad
      block(2080, 380), // staircase up to the top finish (each step 60px)
      block(2240, 320),
      block(2400, 260),
      block(2560, 220, 240, 24), // finish ledge (top at 220) [2560-2800]
    ],
    movers: [moverX(760, 470, 110, 1.0)], // ferries across the 260px gap
    springs: [spring(360)], // bounce straight up to the coin column
    coins: [
      { x: 360, y: 300 }, // grabbed on the way up the spring bounce
      { x: 360, y: 240 },
      { x: 360, y: 180 },
      ...coinArc(1050, 405, 3),
      ...coinArc(1450, 405, 3),
      { x: 2080, y: 344 }, // one above each staircase block
      { x: 2240, y: 284 },
      { x: 2400, y: 224 },
      ...coinRow(1900, 440, 2),
    ],
    hazards: [
      enemyOnGround(1450, 180, 70),
      flyer(1950, 300, 380, 80, 40), // haunts the staircase climb
    ],
    finish: { x: 2650, y: 220 },
    minCoins: 6,
  },

  // ---------------------------------------------------------------- Level 5
  // Frostpeak (snow): a key-and-gate puzzle. Spring straight up to grab the
  // key; the gate is too tall to jump and blocks the run to the finish.
  {
    id: 5,
    name: "Frostpeak",
    theme: "snow",
    worldWidth: 3500,
    spawn: { x: 80, y: GROUND_Y - PLAYER_H },
    platforms: [
      ground(0, 640), // [0-640]
      ground(790, 520), // gap 150
      ground(1460, 700), // gap 150
      ground(2310, 1190), // gap 150 → run to the gated finish
    ],
    movers: [moverY(1650, 360, 120, 1.1)], // elevator to a bonus coin balcony
    springs: [spring(920)], // launches straight up to the key
    keys: [keyAt(945, 250)], // directly above the spring
    gate: { x: 2500, y: 300, w: 24, h: GROUND_Y - 300 }, // 180px — cannot be jumped
    coins: [
      ...coinArc(300, 400, 3),
      { x: 945, y: 310 }, // in the spring's path
      { x: 945, y: 200 },
      ...coinArc(1180, 405, 3),
      { x: 1710, y: 250 }, // top of the elevator
      { x: 1710, y: 320 },
      ...coinRow(2000, 440, 2),
      ...coinRow(2650, 440, 3),
      ...coinRow(3000, 440, 3),
    ],
    hazards: [
      enemyOnGround(2380, 300, 80),
      flyer(400, 300, 300, 80, 34),
      flyer(2750, 280, 320, 90, 30),
    ],
    finish: { x: 3380, y: GROUND_Y },
    minCoins: 7,
  },

  // ---------------------------------------------------------------- Level 6
  // Starfall Summit (night): everything at once — a mover bridge, a spring,
  // flyers, a spike, a key-gate, and a climb to a flag high in the night sky.
  {
    id: 6,
    name: "Starfall Summit",
    theme: "night",
    worldWidth: 3600,
    spawn: { x: 80, y: GROUND_Y - PLAYER_H },
    platforms: [
      ground(0, 560), // [0-560]
      ground(870, 400), // gap 310 → horizontal mover
      ground(1420, 320), // gap 150
      ground(1890, 560), // gap 150 — base of the summit climb
      block(2120, 380), // staircase (each step 60px up, 160px across)
      block(2280, 320),
      block(2440, 260),
      block(2600, 200, 220, 24), // summit ledge (finish, top at 200) [2600-2820]
    ],
    movers: [moverX(600, 470, 130, 1.0)], // ferries across the 310px gap
    springs: [spring(300), spring(1520)], // start bonus + the key spring
    keys: [keyAt(1545, 250)], // spring straight up over spring(1520)
    gate: { x: 2050, y: 300, w: 24, h: GROUND_Y - 300 }, // guards the summit stairs
    coins: [
      { x: 300, y: 300 }, // start spring bonus
      { x: 300, y: 240 },
      ...coinArc(1000, 405, 3),
      ...coinArc(1300, 405, 3),
      { x: 1545, y: 320 }, // in the key spring's path
      { x: 2120, y: 344 }, // staircase coins
      { x: 2280, y: 284 },
      { x: 2440, y: 224 },
    ],
    hazards: [
      spikeOnGround(1950, 70),
      enemyOnGround(1430, 250, 90),
      flyer(1000, 300, 300, 90, 40),
      flyer(2150, 250, 380, 100, 44), // dive-bombs the summit climb
    ],
    finish: { x: 2690, y: 200 },
    minCoins: 6,
  },
];
