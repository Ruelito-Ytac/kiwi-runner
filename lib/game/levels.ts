import type { Level, Vec } from "./types";

/**
 * Level data. Everything the engine needs to build a level lives here — add a
 * new object to LEVELS and it just works, no engine changes.
 *
 * Coordinate system: logical 960x540 viewport, world scrolls right.
 * GROUND_Y is the top surface of the ground; ground blocks extend below the
 * screen so gaps between them read as bottomless pits (falling past the world
 * floor = death, handled by the engine).
 *
 * Reach budget: single jump ≈ 160px up / 192px across; a DOUBLE JUMP roughly
 * doubles the height, and an AIR DASH adds ~130px of level flight. Base routes
 * here stay jumpable WITHOUT those moves (gaps ≤150, blocks ≤120 up), so the
 * game is beatable by anyone; the new moves just make the long journeys smoother
 * and open bonus coin routes. Wide pits (>150) are always bridged by a mover.
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
/** A locked barrier — deliberately tall (top well above double-jump apex) so a
 *  key is genuinely required; it can't be jumped or dashed over. */
const gateAt = (x: number) => ({ x, y: 120, w: 24, h: GROUND_Y - 120 });

/* ---- environment-mechanic helpers (see engine.ts for behaviour) ---- */

/** A crumbling block: like a floating block, but it collapses ~0.4s after you
 *  land on it and reforms ~1.9s later. Keep a fallback route or it must be timed. */
const crumbler = (x: number, y: number, w = 96, h = 22) => ({ x, y, w, h });
/** A conveyor belt — a solid platform that drags the rider (`dir` +1 right / −1
 *  left). `speed` stays well below run speed (240) so you can always fight it. */
const belt = (x: number, y: number, w: number, dir: 1 | -1, speed = 120, h = 20) => ({
  x,
  y,
  w,
  h,
  dir,
  speed,
});
/** A slamming crusher over ground: raised top at `y` (high enough for a standing
 *  kiwi to pass beneath), drops `range` px each `period`s. Long raised window =
 *  always passable. `phase` (0..1) desyncs neighbours. */
const crusher = (
  x: number,
  y: number,
  range: number,
  period = 2.2,
  phase = 0,
  w = 90,
  h = 64,
) => ({ x, y, w, h, range, period, phase });
/** A falling rock parked overhead at (x, y); it lets go when you walk under it. */
const dropper = (x: number, y: number, w = 42, h = 40) => ({ x, y, w, h });
/** A slippery ice patch on a surface at height `y` (defaults to the ground). */
const ice = (x: number, w: number, y = GROUND_Y) => ({ x, y, w });
/** A wind gust zone; `push` signed px/s (+ right / − left), kept below run speed. */
const wind = (x: number, y: number, w: number, h: number, push: number) => ({
  x,
  y,
  w,
  h,
  push,
});
/** A pushable crate; defaults to resting on the ground. */
const box = (x: number, y = GROUND_Y - 44, w = 44, h = 44) => ({ x, y, w, h });
/** A steel barrier, opened by its switch (index-linked via a switch's `barrier`). */
const barrier = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });

/** A timed laser: ON `duty` of each `period`s cycle (offset by `phase`). A tall
 *  thin rect is a vertical gate beam (run the OFF window); wide + short is a
 *  horizontal beam (float/jump through when off). Tall enough that it can't be
 *  jumped over, so timing genuinely matters. */
const laser = (
  x: number,
  y: number,
  w: number,
  h: number,
  period: number,
  phase = 0,
  duty = 0.5,
) => ({ x, y, w, h, period, phase, duty });
/** A laser wired to `switches[link]`: ON only while that switch is INACTIVE, so
 *  a crate on a weight plate (or a thrown lever) cuts the beam. */
const linkedLaser = (x: number, y: number, w: number, h: number, link: number) => ({
  x,
  y,
  w,
  h,
  link,
});
/** A floor lever, tripped by touch. Opens `barrier`; with `openMs` the barrier
 *  re-closes that many ms after each throw (a timed door to race), otherwise it
 *  latches open for good. */
const lever = (x: number, barrier: number, openMs?: number, y = GROUND_Y) => ({
  x,
  y: y - 48,
  w: 24,
  h: 48,
  barrier,
  mode: "lever" as const,
  ...(openMs ? { openMs } : { latch: true }),
});
/** A hold-down weight plate: needs the kiwi or a crate resting on it to stay
 *  active. Drop a crate on it to hold a door open / a laser off while you cross
 *  (you can't stand on it AND be across — the crate is required). Omit `barrier`
 *  when it only drives a laser. */
const weightPlate = (x: number, barrier?: number, y = GROUND_Y, w = 56) => ({
  x,
  y,
  w,
  h: 10,
  latch: false,
  ...(barrier != null ? { barrier } : {}),
});
/** An updraft column: while inside, the kiwi is lifted and rises at up to `lift`
 *  px/s — ride it up a shaft. */
const fan = (x: number, y: number, w: number, h: number, lift = 500) => ({
  x,
  y,
  w,
  h,
  lift,
});

export const LEVELS: Level[] = [
  // ---------------------------------------------------------------- Level 1
  // Fernland Flats (day): a gentle warm-up that also teaches the two softest
  // mechanics — crumbling steps (over solid ground, so a slip costs nothing) and
  // a helpful right-moving walkway. [+crumblers, +belt]
  {
    id: 1,
    name: "Fernland Flats",
    theme: "day",
    worldWidth: 4900,
    spawn: { x: 80, y: GROUND_Y - PLAYER_H },
    platforms: [
      ground(0, 860), // gap 150
      ground(1010, 700), // gap 150
      ground(1860, 640), // gap 150
      ground(2650, 700), // gap 150
      ground(3500, 640), // gap 150
      ground(4290, 560),
      block(500, 384),
      block(1300, 372),
      block(2050, 368),
      block(2850, 376),
      block(3650, 364),
      block(4400, 372),
    ],
    // crumbling steps over solid ground — a free place to learn them
    crumblers: [crumbler(1440, 372), crumbler(1600, 356)],
    // a gentle right-moving walkway: first taste of a conveyor
    belts: [belt(2740, GROUND_Y, 300, 1, 110)],
    // throw the lever to open a door across the path — the gentlest intro
    switches: [lever(1120, 0)],
    barriers: [barrier(1230, 120, 22, GROUND_Y - 120)],
    coins: [
      ...coinRow(300, 430, 3),
      { x: 500, y: 344 },
      ...coinArc(900, 405, 3),
      { x: 1300, y: 332 },
      { x: 1440, y: 332 },
      { x: 1600, y: 316 },
      ...coinRow(1950, 430, 3),
      { x: 2050, y: 328 },
      ...coinArc(2510, 405, 3),
      ...coinRow(2700, 430, 3),
      { x: 2850, y: 336 },
      ...coinArc(3360, 405, 3),
      { x: 3650, y: 324 },
      ...coinArc(4150, 405, 3),
      ...coinRow(4450, 430, 3),
    ],
    hazards: [
      spikeOnGround(650, 60),
      spikeOnGround(2250, 60),
      enemyOnGround(1100, 240, 60),
      enemyOnGround(3600, 240, 60),
      flyer(2650, 300, 260, 60, 26),
    ],
    finish: { x: 4780, y: GROUND_Y },
  },

  // ---------------------------------------------------------------- Level 2
  // Kauri Canopy (sunset): more gaps and walkers, now with crumbling shortcuts
  // hanging over the pits and a moving walkway to ride. Needs 6. [+crumblers, +belt]
  {
    id: 2,
    name: "Kauri Canopy",
    theme: "sunset",
    worldWidth: 5300,
    spawn: { x: 80, y: GROUND_Y - PLAYER_H },
    platforms: [
      ground(0, 640), // gap 150
      ground(790, 460), // gap 150
      ground(1400, 400), // gap 150
      ground(1950, 640), // gap 150
      ground(2740, 500), // gap 150
      ground(3390, 620), // gap 150
      ground(4160, 500), // gap 150
      ground(4810, 500),
      block(560, 380),
      block(1050, 368),
      block(1500, 360),
      block(2150, 372),
      block(2900, 368),
      block(3500, 372),
      block(4250, 360),
      block(4900, 372),
    ],
    // crumbling coin-shortcuts float over the first two pits — grab it or play safe
    crumblers: [crumbler(700, 405, 90), crumbler(1310, 405, 90)],
    // a right-moving walkway carries you across the mid stretch
    belts: [belt(2130, GROUND_Y, 300, 1, 120)],
    // shove the crate onto the weight plate (it stops against the door) to hold
    // the door open — the crate is required, then hop it and carry on
    boxes: [box(2820)],
    switches: [weightPlate(3000, 0)],
    barriers: [barrier(3050, 120, 22, GROUND_Y - 120)],
    coins: [
      ...coinArc(300, 400, 3),
      { x: 560, y: 340 },
      { x: 720, y: 380 },
      ...coinArc(690, 405, 3),
      { x: 1050, y: 328 },
      { x: 1330, y: 380 },
      ...coinArc(1250, 405, 3),
      { x: 1500, y: 324 },
      ...coinRow(2000, 430, 3),
      { x: 2150, y: 332 },
      ...coinArc(2610, 405, 3),
      { x: 2900, y: 328 },
      ...coinArc(3260, 405, 3),
      ...coinRow(3450, 430, 3),
      { x: 4250, y: 324 },
      ...coinRow(4900, 430, 3),
    ],
    hazards: [
      spikeOnGround(2000, 70),
      spikeOnGround(3600, 60),
      enemyOnGround(300, 220, 70),
      enemyOnGround(2800, 320, 70),
      enemyOnGround(4300, 300, 70),
      flyer(1200, 300, 260, 60, 28),
      flyer(3400, 300, 280, 70, 30),
    ],
    finish: { x: 5180, y: GROUND_Y },
    minCoins: 6,
  },

  // ---------------------------------------------------------------- Level 3
  // Volcano Verge (dusk): the tight pit-gauntlet, now swept by a headwind that
  // drags on your run and stalked by rockfall that lets go as you pass beneath.
  // Wind zones sit over slabs (never the pit jumps), so gaps stay clearable.
  // Needs 8. [+wind, +droppers]
  {
    id: 3,
    name: "Volcano Verge",
    theme: "dusk",
    worldWidth: 5600,
    spawn: { x: 80, y: GROUND_Y - PLAYER_H },
    platforms: [
      ground(0, 540), // gap 150
      ground(690, 260), // gap 150
      ground(1100, 260), // gap 150
      ground(1510, 260), // gap 150
      ground(1920, 560), // gap 150
      ground(2630, 300), // gap 150
      ground(3080, 560), // gap 150
      ground(3790, 260), // gap 150
      ground(4200, 260), // gap 150
      ground(4610, 900),
      block(300, 372),
      block(1200, 360),
      block(2100, 366),
      block(2760, 360),
      block(3300, 372),
      block(3920, 360),
      block(4750, 372),
      block(5100, 360),
    ],
    // headwinds over the wide slabs (not the pits) — you push through them slowed
    wind: [wind(1920, 300, 560, 180, -120), wind(4610, 300, 620, 180, -120)],
    // rockfall parked over clear columns; it drops when you run underneath
    droppers: [dropper(2300, 150), dropper(3450, 150), dropper(4900, 150)],
    // a twin timed-laser gate — thread the OFF windows (too tall to jump over)
    lasers: [
      laser(3250, 150, 10, 330, 2.0, 0, 0.45),
      laser(3420, 150, 10, 330, 2.0, 0.5, 0.45),
    ],
    coins: [
      { x: 300, y: 336 },
      ...coinArc(590, 405, 3),
      ...coinArc(1000, 405, 3),
      { x: 1200, y: 324 },
      ...coinArc(1410, 405, 3),
      ...coinArc(1820, 405, 3),
      { x: 2100, y: 330 },
      ...coinArc(2530, 405, 3),
      { x: 2760, y: 324 },
      ...coinArc(2980, 405, 3),
      { x: 3300, y: 336 },
      ...coinArc(3690, 405, 3),
      ...coinRow(4700, 430, 4),
    ],
    hazards: [
      spikeOnGround(2100, 60),
      spikeOnGround(3300, 60),
      enemyOnGround(1950, 260, 90),
      enemyOnGround(3120, 300, 90),
      enemyOnGround(4650, 340, 90),
      flyer(650, 300, 320, 80, 34),
      flyer(2600, 280, 240, 80, 30),
      flyer(4000, 290, 300, 90, 34),
    ],
    finish: { x: 5480, y: GROUND_Y },
    minCoins: 8,
  },

  // ---------------------------------------------------------------- Level 4
  // Glow Cavern (cave): the mover-and-spring cave, now guarded by a phase-offset
  // rhythm of slamming crushers and crumbling ledges before a longer climb to the
  // flag. Needs 6. [+crushers, +crumblers, · movers/springs]
  {
    id: 4,
    name: "Glow Cavern",
    theme: "cave",
    worldWidth: 5700,
    spawn: { x: 80, y: GROUND_Y - PLAYER_H },
    platforms: [
      ground(0, 720), // gap 260 → mover
      ground(980, 300), // gap 150
      ground(1430, 400), // gap 150
      ground(1980, 300), // gap 280 → mover
      ground(2560, 900), // crusher gauntlet slab
      block(2560, 150, 150, 20), // fan-lift bonus ledge (one-way)
      ground(3610, 700), // gap 150
      ground(4460, 1240), // staircase base + climb
      block(4600, 380), // staircase up to the top finish (first step on ground, 60px steps)
      block(4760, 320),
      block(4920, 260),
      block(5080, 200),
      block(5240, 140, 240, 24), // finish ledge (top at 140)
    ],
    movers: [moverX(760, 470, 110, 1.0), moverX(2360, 470, 120, 1.0)],
    springs: [spring(360), spring(1550)],
    // a rhythm of crushers with safe standing room between each — time your run
    crushers: [
      crusher(2760, 168, 252, 2.2, 0),
      crusher(3080, 168, 252, 2.2, 0.5),
      crusher(3820, 168, 252, 2.0, 0.25),
    ],
    // crumbling ledges over solid ground — a timed bonus route, safe to miss
    crumblers: [crumbler(2620, 372), crumbler(3320, 360), crumbler(3980, 372)],
    // an updraft shaft lifts you to the bonus ledge above the crusher slab
    fans: [fan(2600, 150, 70, 330, 500)],
    coins: [
      { x: 360, y: 300 },
      { x: 360, y: 200 },
      ...coinArc(1050, 405, 3),
      { x: 1550, y: 300 }, // bonus column over the second spring
      { x: 1550, y: 180 },
      ...coinArc(1700, 405, 3),
      { x: 2620, y: 344 },
      { x: 2620, y: 128 }, // bonus coins on the fan-lift ledge
      { x: 2680, y: 128 },
      ...coinRow(2890, 440, 2),
      { x: 3320, y: 332 },
      ...coinArc(3650, 405, 3),
      { x: 3980, y: 344 },
      { x: 4600, y: 344 },
      { x: 4760, y: 284 },
      { x: 4920, y: 224 },
      { x: 5080, y: 164 },
    ],
    hazards: [
      enemyOnGround(1450, 180, 70),
      enemyOnGround(3650, 300, 80),
      flyer(1950, 300, 380, 80, 40),
      flyer(3000, 250, 300, 90, 40),
      flyer(4400, 260, 320, 90, 40),
    ],
    finish: { x: 5340, y: 140 },
    minCoins: 6,
  },

  // ---------------------------------------------------------------- Level 5
  // Frostpeak (snow): the key-and-gate climb, now genuinely frozen — slick ice
  // patches steal your grip (all set well back from the pits) and an icy conveyor
  // drags you back on the long run past the gate. The key on the spring is still
  // mandatory. Needs 7. [+ice, +belt, · key/gate/mover/spring]
  {
    id: 5,
    name: "Frostpeak",
    theme: "snow",
    worldWidth: 5900,
    spawn: { x: 80, y: GROUND_Y - PLAYER_H },
    platforms: [
      ground(0, 640), // gap 150
      ground(790, 520), // gap 150
      ground(1460, 700), // gap 150
      ground(2310, 600), // gap 150
      ground(3060, 700), // gap 150
      ground(3910, 1990), // long icy gated run to the finish
    ],
    movers: [moverY(1650, 360, 120, 1.1)],
    springs: [spring(920)],
    keys: [keyAt(945, 250)],
    gate: gateAt(4000),
    // slick ice, kept clear of the pit edges; the post-gate run is solid so skids
    // there are safe
    ice: [ice(2400, 240), ice(4180, 360), ice(4820, 380), ice(5360, 360)],
    // an icy conveyor between the patches drags you back toward the gate
    belts: [belt(4600, GROUND_Y, 200, -1, 130)],
    // past the gate: shove the crate onto the plate (it stops against the door)
    // to open the door AND cut the laser beyond it — both fall to one crate
    boxes: [box(4300)],
    switches: [weightPlate(4520, 0)],
    barriers: [barrier(4570, 150, 22, 330)],
    lasers: [linkedLaser(4700, 150, 10, 330, 0)],
    coins: [
      ...coinArc(300, 400, 3),
      { x: 945, y: 310 },
      { x: 945, y: 200 },
      ...coinArc(1180, 405, 3),
      { x: 1710, y: 250 }, // top of the elevator
      { x: 1710, y: 340 },
      ...coinArc(2000, 405, 3),
      ...coinRow(2650, 440, 3),
      ...coinRow(3200, 440, 3),
      ...coinRow(4200, 440, 3),
      ...coinRow(4900, 440, 3),
      ...coinRow(5450, 440, 3),
    ],
    hazards: [
      spikeOnGround(2760, 70),
      enemyOnGround(2380, 300, 80),
      enemyOnGround(4100, 340, 80),
      enemyOnGround(5000, 320, 80),
      flyer(400, 300, 300, 80, 34),
      flyer(2750, 280, 320, 90, 30),
      flyer(3500, 290, 300, 90, 34),
      flyer(5100, 300, 360, 90, 34),
    ],
    finish: { x: 5780, y: GROUND_Y },
    minCoins: 7,
  },

  // ---------------------------------------------------------------- Level 6
  // Starfall Summit (night): World 1's finale — the two mover bridges and springs,
  // then a long wind-blown gauntlet of crumbling ledges and night rockfall before
  // the key-gate and the climb to a flag high in the sky. Needs 6.
  // [+wind, +crumblers, +dropper, · movers/springs/key-gate]
  {
    id: 6,
    name: "Starfall Summit",
    theme: "night",
    worldWidth: 6000,
    spawn: { x: 80, y: GROUND_Y - PLAYER_H },
    platforms: [
      ground(0, 560), // gap 280 → mover
      ground(840, 400), // gap 150
      ground(1390, 360), // gap 300 → mover
      ground(2050, 560), // gap 150
      ground(2760, 700), // wind gauntlet slab
      ground(3610, 700), // gap 150
      ground(4460, 1540), // gated summit base + climb
      block(4830, 380), // summit staircase (past the gate, 60px steps)
      block(4990, 320),
      block(5150, 260),
      block(5310, 200),
      block(5470, 140, 240, 24), // summit ledge (top at 140)
    ],
    movers: [moverX(600, 470, 130, 1.0), moverX(1770, 470, 130, 1.0)],
    springs: [spring(300), spring(1520)],
    keys: [keyAt(1560, 250)],
    gate: gateAt(4750),
    // a headwind then a tailwind sweep the gauntlet slabs
    wind: [wind(2760, 280, 700, 200, -110), wind(3610, 280, 700, 200, 110)],
    // crumbling ledges (bonus, safe fall) and falling rocks over the gauntlet
    crumblers: [crumbler(2900, 372), crumbler(3700, 360)],
    droppers: [dropper(3200, 150), dropper(3980, 150)],
    // a timed laser in the headwind, then a lever-timed door to race — the
    // tailwind on the next slab helps you beat it. World 1's send-off
    lasers: [laser(3050, 150, 10, 330, 1.8, 0, 0.5)],
    switches: [lever(3650, 0, 2200)],
    barriers: [barrier(3900, 120, 22, GROUND_Y - 120)],
    coins: [
      { x: 300, y: 300 },
      { x: 300, y: 200 },
      ...coinArc(680, 405, 3),
      ...coinArc(1770, 405, 3),
      { x: 1560, y: 320 },
      { x: 1560, y: 200 },
      { x: 2400, y: 250 },
      { x: 2900, y: 344 },
      ...coinRow(3140, 440, 2),
      { x: 3700, y: 332 },
      ...coinRow(4060, 440, 2),
      { x: 4830, y: 344 },
      { x: 4990, y: 284 },
      { x: 5150, y: 224 },
      { x: 5310, y: 164 },
    ],
    hazards: [
      spikeOnGround(2200, 80),
      enemyOnGround(880, 300, 90),
      enemyOnGround(2850, 260, 100),
      enemyOnGround(3650, 300, 90),
      flyer(1000, 300, 300, 90, 40),
      flyer(1450, 280, 300, 100, 44),
      flyer(2900, 250, 380, 110, 44),
      flyer(4000, 260, 360, 100, 44),
    ],
    finish: { x: 5570, y: 140 },
    minCoins: 6,
  },

  // ============================================================ WORLD 2
  // The gauntlet: longer worlds, denser hazards, and every mechanic pushed
  // harder. Base routes still obey the jump budget; movers bridge the wide pits.

  // ---------------------------------------------------------------- Level 7
  // Fernland Rush (day): World 2 opens flat-out — two belt speedways fling you
  // forward, crumbling shortcuts hang over the early pits, and a crate waits on
  // the sprint to the flag. Needs 8. [+belts, +crumblers, +box, · mover/spring]
  {
    id: 7,
    name: "Fernland Rush",
    theme: "day",
    worldWidth: 6200,
    spawn: { x: 80, y: GROUND_Y - PLAYER_H },
    platforms: [
      ground(0, 620), // gap 150
      ground(770, 460), // gap 150
      ground(1380, 380), // gap 150
      ground(1910, 300), // gap 260 → mover
      ground(2470, 560), // gap 150
      ground(3180, 480), // gap 150
      ground(3810, 640), // gap 150
      ground(4600, 520), // gap 150
      ground(5270, 460), // gap 150
      ground(5880, 320), // final stretch to the flag
      block(560, 380),
      block(1050, 368),
      block(1500, 372),
      block(2600, 360),
      block(3300, 372),
      block(3900, 360),
      block(4700, 372),
      block(5350, 360),
    ],
    movers: [moverX(2270, 470, 120)],
    springs: [spring(300)],
    // two fast right-moving belt speedways — mind the walkers waiting past them
    belts: [belt(2500, GROUND_Y, 400, 1, 150), belt(3850, GROUND_Y, 380, 1, 150)],
    // crumbling coin-shortcuts over the first two pits
    crumblers: [crumbler(700, 405, 90), crumbler(1305, 405, 90)],
    // a timed laser mid-belt (the belt flings you — time the OFF window)
    lasers: [laser(2700, 150, 10, 330, 1.5, 0, 0.5)],
    // a crate that finally MATTERS: shove it onto the plate (it stops against
    // the door) to open the door blocking the way on
    boxes: [box(4700)],
    switches: [weightPlate(4950, 0)],
    barriers: [barrier(5000, 120, 22, GROUND_Y - 120)],
    coins: [
      { x: 300, y: 300 },
      { x: 300, y: 240 },
      { x: 300, y: 180 },
      { x: 560, y: 340 },
      { x: 720, y: 380 },
      ...coinArc(690, 405, 3),
      { x: 1325, y: 380 },
      ...coinArc(1250, 405, 3),
      { x: 1500, y: 332 },
      ...coinArc(2230, 405, 3),
      { x: 2600, y: 324 },
      ...coinRow(3350, 440, 3),
      { x: 3900, y: 324 },
      ...coinRow(4400, 440, 3),
      { x: 5350, y: 324 },
      ...coinRow(5950, 440, 2),
    ],
    hazards: [
      spikeOnGround(900, 70),
      spikeOnGround(2980, 60),
      spikeOnGround(4350, 60),
      enemyOnGround(850, 240, 80),
      enemyOnGround(3300, 320, 80),
      enemyOnGround(4800, 300, 80),
      flyer(1400, 300, 300, 80, 30),
      flyer(3200, 290, 340, 90, 34),
      flyer(4600, 290, 300, 90, 34),
    ],
    finish: { x: 6080, y: GROUND_Y },
    minCoins: 8,
  },

  // ---------------------------------------------------------------- Level 8
  // Emberfall Gauntlet (sunset): the spike-strewn run, now raining rockfall and
  // punctuated by slamming crushers, with a belt that drags you backward on the
  // gated home stretch. The key still gates the end. Needs 9.
  // [+droppers, +crushers, +belt, · spring/key-gate]
  {
    id: 8,
    name: "Emberfall Gauntlet",
    theme: "sunset",
    worldWidth: 6400,
    spawn: { x: 80, y: GROUND_Y - PLAYER_H },
    platforms: [
      ground(0, 560), // gap 150
      ground(710, 520), // gap 150
      ground(1380, 600), // gap 150
      ground(2130, 560), // gap 150
      ground(2840, 520), // gap 150
      ground(3510, 560), // gap 150
      ground(4220, 520), // gap 150
      ground(4890, 1510), // gated final stretch
      block(560, 372),
      block(1450, 360),
      block(2200, 368),
      block(2950, 360),
      block(3600, 372),
      block(4300, 360),
      block(5000, 372),
    ],
    springs: [spring(1520)],
    keys: [keyAt(1560, 250)],
    gate: gateAt(4980),
    // rockfall over clear columns, crushers to time, and a belt that shoves you
    // back toward the gate on the run home
    droppers: [dropper(1600, 150), dropper(2400, 150), dropper(3200, 150)],
    crushers: [crusher(3800, 168, 252, 2.0, 0), crusher(5200, 168, 252, 1.9, 0.5)],
    belts: [belt(5500, GROUND_Y, 300, -1, 140)],
    // two out-of-phase laser gates to thread early; a crate cuts a third on the
    // home stretch (shove it onto the plate against the door)
    lasers: [
      laser(2300, 150, 10, 330, 1.8, 0, 0.45),
      laser(2500, 150, 10, 330, 1.8, 0.5, 0.45),
      linkedLaser(6120, 150, 10, 330, 0),
    ],
    boxes: [box(5820)],
    switches: [weightPlate(5980, 0)],
    barriers: [barrier(6030, 150, 22, 330)],
    coins: [
      ...coinArc(300, 400, 3),
      { x: 560, y: 336 },
      { x: 1560, y: 320 },
      { x: 1560, y: 200 },
      ...coinArc(760, 405, 3),
      { x: 1450, y: 324 },
      ...coinArc(2000, 405, 3),
      { x: 2200, y: 332 },
      ...coinArc(2610, 405, 3),
      { x: 2950, y: 324 },
      ...coinRow(3650, 440, 3),
      ...coinRow(4300, 440, 3),
      ...coinRow(5040, 440, 3),
      ...coinRow(5650, 440, 3),
      ...coinRow(6150, 440, 2),
    ],
    hazards: [
      spikeOnGround(300, 70),
      spikeOnGround(900, 80),
      spikeOnGround(1650, 70),
      spikeOnGround(2350, 80),
      spikeOnGround(3050, 70),
      spikeOnGround(3720, 70),
      spikeOnGround(4420, 70),
      enemyOnGround(950, 300, 80),
      enemyOnGround(2250, 300, 80),
      enemyOnGround(3750, 340, 90),
      enemyOnGround(5900, 300, 90),
      flyer(1300, 300, 320, 90, 34),
      flyer(3550, 280, 360, 100, 40),
      flyer(4600, 290, 320, 90, 34),
    ],
    finish: { x: 6280, y: GROUND_Y },
    minCoins: 9,
  },

  // ---------------------------------------------------------------- Level 9
  // Deepdark Descent (cave): the mover-bridge chasm run, now with a crusher
  // rhythm across the mid slabs, crumbling stepping-stones over the pits, and
  // rockfall in the dark. Needs 9. [+crushers, +crumblers, +droppers, · movers/spring]
  {
    id: 9,
    name: "Deepdark Descent",
    theme: "cave",
    worldWidth: 6600,
    spawn: { x: 80, y: GROUND_Y - PLAYER_H },
    platforms: [
      ground(0, 640), // gap 260 → mover
      ground(900, 300), // gap 150
      ground(1350, 360), // gap 300 → mover
      ground(2010, 560), // gap 150
      ground(2720, 520), // gap 150
      ground(3390, 520), // gap 150
      ground(4060, 560), // gap 150
      ground(4770, 520), // gap 150
      ground(5440, 1160), // long final descent to the flag
      block(2200, 360),
      block(3500, 360),
      block(4300, 368),
      block(5000, 360),
      block(5550, 372),
      block(4380, 130, 110, 20), // fan-lift bonus ledge (one-way)
    ],
    movers: [
      moverX(720, 470, 120),
      moverX(1780, 470, 130),
      moverY(2900, 360, 120),
    ],
    springs: [spring(300)],
    // a crusher rhythm across the mid slabs
    crushers: [
      crusher(2760, 168, 252, 2.0, 0),
      crusher(3430, 168, 252, 2.0, 0.5),
      crusher(4820, 168, 252, 1.9, 0.25),
    ],
    // crumbling stones tempt you over the pits; rockfall waits on clear columns
    crumblers: [crumbler(2600, 405, 90), crumbler(4650, 405, 90)],
    droppers: [dropper(4100, 150), dropper(5750, 150)],
    // a timed laser gate on the ground, and an updraft shaft (hop into it) up to
    // a bonus ledge in the dark
    lasers: [laser(4200, 150, 10, 330, 1.9, 0, 0.5)],
    fans: [fan(4400, 140, 80, 300, 520)],
    coins: [
      { x: 300, y: 300 },
      { x: 300, y: 200 },
      ...coinArc(720, 405, 3),
      ...coinArc(1780, 405, 3),
      { x: 2200, y: 324 },
      { x: 2600, y: 380 },
      { x: 2900, y: 250 },
      { x: 2900, y: 340 },
      { x: 3560, y: 324 },
      { x: 4650, y: 380 },
      { x: 4420, y: 108 }, // bonus coins on the fan-lift ledge
      { x: 4460, y: 108 },
      { x: 5000, y: 324 },
      ...coinRow(5590, 440, 3),
      ...coinRow(6200, 440, 3),
    ],
    hazards: [
      enemyOnGround(2100, 300, 80),
      enemyOnGround(3450, 300, 80),
      enemyOnGround(4200, 340, 90),
      enemyOnGround(6000, 300, 90),
      flyer(950, 300, 260, 90, 30),
      flyer(2300, 290, 340, 100, 40),
      flyer(3600, 280, 360, 100, 40),
      flyer(4800, 290, 320, 90, 34),
    ],
    finish: { x: 6480, y: GROUND_Y },
    minCoins: 9,
  },

  // ---------------------------------------------------------------- Level 10
  // Frostbite Climb (snow): a longer frozen approach — slick ice and an icy
  // conveyor, then a plate you touch to lift a steel barrier — before the key-gate
  // and the staircase to the sky flag. Needs 10.
  // [+ice, +belt, +switch/barrier, · key-gate/mover/spring]
  {
    id: 10,
    name: "Frostbite Climb",
    theme: "snow",
    worldWidth: 6800,
    spawn: { x: 80, y: GROUND_Y - PLAYER_H },
    platforms: [
      ground(0, 600), // gap 150
      ground(750, 520), // gap 150
      ground(1420, 700), // gap 150
      ground(2270, 560), // gap 150
      ground(2980, 560), // gap 150
      ground(3690, 700), // icy gauntlet, gap 150
      ground(4540, 700), // plate-gate slab, gap 150
      ground(5390, 1410), // gated summit base + climb
      block(5680, 380), // staircase (past the gate, 60px steps)
      block(5840, 320),
      block(6000, 260),
      block(6160, 200),
      block(6320, 140, 240, 24), // finish ledge (top at 140)
    ],
    movers: [moverY(1650, 360, 120)],
    springs: [spring(1000)],
    keys: [keyAt(1030, 250)],
    gate: gateAt(5560),
    // slick ice (clear of the pit edges) and a left-dragging icy conveyor
    ice: [ice(3750, 300), ice(4600, 320)],
    belts: [belt(4100, GROUND_Y, 240, -1, 130)],
    // FIX: a hold-down plate now — you can't stand on it AND cross, so the crate
    // is required to hold the door (it stops against the door on the plate); plus
    // a lever-timed door to race on the icy gauntlet
    boxes: [box(4700)],
    switches: [weightPlate(4900, 0), lever(3750, 1, 3000)],
    barriers: [
      barrier(4980, 120, 24, GROUND_Y - 120),
      barrier(3950, 120, 22, GROUND_Y - 120),
    ],
    coins: [
      ...coinArc(300, 400, 3),
      { x: 1030, y: 320 },
      { x: 1030, y: 200 },
      { x: 1710, y: 250 },
      { x: 1710, y: 340 },
      ...coinArc(1180, 405, 3),
      ...coinRow(2400, 440, 3),
      ...coinRow(3000, 440, 3),
      ...coinRow(3780, 440, 3),
      ...coinRow(5150, 440, 2),
      { x: 5680, y: 344 },
      { x: 5840, y: 284 },
      { x: 6000, y: 224 },
      { x: 6160, y: 164 },
    ],
    hazards: [
      spikeOnGround(2400, 70),
      enemyOnGround(800, 300, 80),
      enemyOnGround(2350, 300, 90),
      enemyOnGround(3050, 260, 90),
      enemyOnGround(3760, 300, 90),
      flyer(500, 300, 320, 90, 34),
      flyer(1600, 290, 340, 100, 40),
      flyer(3900, 250, 400, 110, 44),
      flyer(5000, 270, 360, 100, 44),
    ],
    finish: { x: 6420, y: 140 },
    minCoins: 10,
  },

  // ---------------------------------------------------------------- Level 11
  // Twilight Terror (dusk): the hazard maze at its worst — spike beds and swarming
  // flyers, now with slamming crushers, rockfall, and gusts that drag on the run,
  // plus the DOUBLE-key gate. Needs 10. [+crushers, +droppers, +wind, · double-key]
  {
    id: 11,
    name: "Twilight Terror",
    theme: "dusk",
    worldWidth: 7000,
    spawn: { x: 80, y: GROUND_Y - PLAYER_H },
    platforms: [
      ground(0, 560), // gap 150
      ground(710, 420), // gap 150
      ground(1280, 420), // gap 150
      ground(1850, 420), // gap 150
      ground(2420, 560), // gap 150
      ground(3130, 520), // gap 150
      ground(3800, 420), // gap 150
      ground(4370, 520), // gap 150
      ground(5040, 460), // gap 150
      ground(5650, 1350), // long final maze to the flag
      block(960, 368), // first key sits here
      block(1450, 360),
      block(2050, 368),
      block(2900, 360),
      block(3400, 372),
      block(4500, 360),
      block(5200, 372),
    ],
    springs: [spring(2460)],
    keys: [keyAt(985, 340), keyAt(2500, 250)], // BOTH open the gate
    gate: gateAt(3300),
    // crushers on the wide slabs, rockfall over clear columns, headwind + tailwind
    crushers: [
      crusher(2650, 168, 252, 1.9, 0),
      crusher(4400, 168, 252, 1.9, 0.5),
      crusher(5850, 168, 252, 1.8, 0.25),
    ],
    droppers: [dropper(1300, 150), dropper(3850, 150), dropper(6400, 150)],
    wind: [wind(3130, 280, 520, 180, -110), wind(5040, 280, 460, 180, 110)],
    // a short timed-laser maze woven through the spikes and gusts
    lasers: [
      laser(4000, 150, 10, 330, 1.6, 0, 0.45),
      laser(4130, 150, 10, 330, 1.6, 0.5, 0.45),
      laser(5250, 150, 10, 330, 1.7, 0.25, 0.45),
    ],
    coins: [
      ...coinArc(300, 400, 3),
      { x: 2500, y: 320 },
      { x: 2500, y: 200 },
      ...coinArc(760, 405, 3),
      { x: 1450, y: 324 },
      ...coinArc(1950, 405, 3),
      { x: 2050, y: 332 },
      ...coinRow(4050, 440, 2),
      { x: 4540, y: 324 },
      ...coinRow(5100, 440, 3),
      ...coinRow(5700, 440, 3),
      ...coinRow(6250, 440, 3),
      ...coinRow(6800, 440, 2),
    ],
    hazards: [
      spikeOnGround(300, 70),
      spikeOnGround(1450, 80),
      spikeOnGround(2000, 70),
      spikeOnGround(3300, 80),
      spikeOnGround(3950, 70),
      spikeOnGround(4650, 70),
      enemyOnGround(750, 240, 90),
      enemyOnGround(1950, 300, 90),
      enemyOnGround(3250, 300, 90),
      enemyOnGround(4550, 340, 100),
      enemyOnGround(6100, 300, 90),
      flyer(400, 300, 300, 90, 34),
      flyer(1200, 280, 340, 100, 40),
      flyer(3500, 270, 380, 110, 44),
      flyer(4800, 290, 340, 100, 40),
    ],
    finish: { x: 6880, y: GROUND_Y },
    minCoins: 10,
  },

  // ---------------------------------------------------------------- Level 12
  // Starfall Finale (night): the grand finale and the longest run — the mover
  // bridges and elevator, then a sprawling gauntlet of everything at once
  // (crushers, gusts, crumbling ledges, rockfall, a crate, a plate-gate) before
  // the key-gate and a six-step climb to a flag high in the night sky. Needs 12.
  // [+crushers, +wind, +crumblers, +droppers, +box, +switch/barrier, · movers/springs/key-gate]
  {
    id: 12,
    name: "Starfall Finale",
    theme: "night",
    worldWidth: 7200,
    spawn: { x: 80, y: GROUND_Y - PLAYER_H },
    platforms: [
      ground(0, 560), // gap 280 → mover
      ground(840, 400), // gap 150
      ground(1390, 360), // gap 300 → mover
      ground(2050, 520), // gap 150
      ground(2720, 560), // gap 150
      ground(3430, 700), // crusher gauntlet, gap 150
      ground(4280, 700), // wind + crumble gauntlet, gap 150
      ground(5130, 700), // crate + plate-gate + rockfall, gap 150
      block(5580, 130, 110, 20), // fan-lift bonus ledge (one-way)
      ground(5980, 1220), // gated summit base + climb
      block(6270, 380), // summit staircase (past the gate, 60px steps)
      block(6430, 320),
      block(6590, 260),
      block(6750, 200),
      block(6910, 140),
      block(7020, 100, 180, 24), // summit ledge (top at 100)
    ],
    movers: [
      moverX(680, 470, 130),
      moverX(1770, 470, 130),
      moverY(2450, 360, 130),
    ],
    springs: [spring(300), spring(2760)],
    keys: [keyAt(2790, 240)],
    gate: gateAt(6050),
    // the finale showcase: a crusher pair, a headwind over crumbling ledges,
    // a crate to shove, a latch plate that lifts a barrier, and rockfall
    crushers: [crusher(3500, 168, 252, 1.9, 0), crusher(3820, 168, 252, 1.9, 0.5)],
    wind: [wind(4280, 280, 700, 200, -110)],
    crumblers: [crumbler(4400, 372), crumbler(4650, 356)],
    boxes: [box(5150)],
    // finale puzzle-gauntlet: shove the crate onto the plate (it stops against
    // the door) to open the door AND cut the laser past it; then an updraft over
    // the rockfall; then a lever-timed door to race before the summit gate
    switches: [weightPlate(5300, 0), lever(5790, 1, 2500)],
    barriers: [
      barrier(5350, 150, 22, 330),
      barrier(5960, 120, 22, GROUND_Y - 120),
    ],
    lasers: [
      laser(3700, 150, 10, 330, 1.6, 0, 0.5),
      linkedLaser(5470, 150, 10, 330, 0),
    ],
    fans: [fan(5600, 140, 80, 300, 520)],
    droppers: [dropper(5720, 150)],
    coins: [
      { x: 300, y: 300 },
      { x: 300, y: 240 },
      ...coinArc(680, 405, 3),
      ...coinArc(1770, 405, 3),
      { x: 2450, y: 250 },
      { x: 2790, y: 320 },
      { x: 2790, y: 200 },
      ...coinRow(3640, 440, 2),
      { x: 4400, y: 344 },
      { x: 4650, y: 328 },
      { x: 5172, y: 400 },
      { x: 5620, y: 108 }, // bonus coins on the fan-lift ledge
      { x: 5660, y: 108 },
      ...coinRow(5620, 440, 2),
      { x: 6270, y: 344 },
      { x: 6430, y: 284 },
      { x: 6590, y: 224 },
      { x: 6750, y: 164 },
      { x: 6910, y: 104 },
    ],
    hazards: [
      spikeOnGround(2200, 80),
      enemyOnGround(900, 300, 90),
      enemyOnGround(2150, 300, 90),
      enemyOnGround(2850, 260, 100),
      enemyOnGround(3480, 200, 100),
      enemyOnGround(4350, 300, 100),
      enemyOnGround(5620, 200, 100),
      flyer(850, 300, 320, 100, 40),
      flyer(1400, 280, 360, 110, 44),
      flyer(2250, 300, 380, 110, 44),
      flyer(3600, 240, 420, 120, 48),
      flyer(5000, 250, 380, 120, 48),
    ],
    finish: { x: 7100, y: 100 },
    minCoins: 12,
  },
];
