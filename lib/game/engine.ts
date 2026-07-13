import { aabb, moveAndCollide, type Rect } from "./physics";
import type {
  DifficultyConfig,
  Enemy,
  Flyer,
  Gate,
  Level,
  MovingPlatform,
  Spike,
  Spring,
} from "./types";

/* ------------------------------------------------------------------ tuning */

const LOGICAL_W = 960;
const LOGICAL_H = 540;

const GRAVITY = 2000; // px/s^2
const MOVE_SPEED = 240; // px/s, before playerSpeedMul
// Jump reach budget for level design (with GRAVITY/MOVE_SPEED above):
//   peak height ≈ 160px, air time ≈ 0.8s, horizontal reach ≈ 192px.
// So keep landable blocks ≤ ~130px above their approach surface and gaps ≤ 150px.
const JUMP_VELOCITY = -800;
const MAX_FALL = 1300;
const JUMP_CUT = 0.45; // release-to-cut factor for variable jump height

// Fixed-timestep integration: physics always advance in FIXED chunks so the
// simulation is identical at any refresh rate, and each chunk is tiny enough
// that the player can never move far enough to skip a platform (no tunnelling).
const FIXED = 1 / 120;
const MAX_FRAME_DT = 0.1; // clamp spikes (tab-switch, GC pause) to 100ms
const MAX_STEPS = 12; // and cap steps/frame so we never spiral

const COIN_VALUE = 100;
const COIN_R = 13;
const INVULN_S = 1.3; // i-frames after a hit so one spike ≠ instant death
const DEATH_Y = 640; // fall past this = pit death

const PLAYER = { w: 44, h: 52 };

// Sprite sheet: 8-frame run cycle. INSET trims the dashed export border baked
// into the PNG so it never shows on screen.
const SHEET = { w: 2128, h: 280, frames: 8, inset: 14 };
const FRAME_W = (SHEET.w - 2 * SHEET.inset) / SHEET.frames;
const JUMP_FRAME = 3; // a leg-tucked pose from the run cycle, held while airborne
const DRAW_H = 66; // on-screen kiwi height (bigger than the hitbox, feet-aligned)
const SPRING_V = -1180; // bounce-pad launch (~350px, far higher than a normal jump)
const GROUND_DIRT = "#84563a"; // sampled from Platform_Grass dirt, fills below the grass cap
const PLATFORM_GRASS_TOP = 23 / 427; // opaque grass surface offset in Platform_Grass.png

/* ---------------------------------------------------------- theme palettes */

type Palette = {
  sky: [string, string];
  far: string;
  near: string;
  ground: string;
  grass: string;
  orb: string | null; // null = no sun/moon (e.g. underground)
  cloud: string;
  stars: boolean;
  snow: boolean; // draw drifting snow
};

const THEMES: Record<Level["theme"], Palette> = {
  day: {
    sky: ["#7ec8f0", "#d7f1ff"],
    far: "#8fd28a",
    near: "#5cae61",
    ground: "#7a5230",
    grass: "#4a9a44",
    orb: "#fff2a8",
    cloud: "rgba(255,255,255,0.85)",
    stars: false,
    snow: false,
  },
  sunset: {
    sky: ["#ff9e5e", "#ffe0b0"],
    far: "#7a6ba8",
    near: "#4e4372",
    ground: "#5a3d2b",
    grass: "#c9773e",
    orb: "#fff0c0",
    cloud: "rgba(255,225,195,0.7)",
    stars: false,
    snow: false,
  },
  dusk: {
    sky: ["#241d47", "#5a4a86"],
    far: "#3a2f5e",
    near: "#241d40",
    ground: "#3a2b45",
    grass: "#6b5a88",
    orb: "#eef2ff",
    cloud: "rgba(200,200,230,0.30)",
    stars: true,
    snow: false,
  },
  cave: {
    sky: ["#150f24", "#2c2140"],
    far: "#33264d",
    near: "#211838",
    ground: "#2f2438",
    grass: "#5b4a73",
    orb: null,
    cloud: "rgba(120,90,160,0.10)",
    stars: false,
    snow: false,
  },
  snow: {
    sky: ["#a9c9e6", "#e9f3fb"],
    far: "#cfe0ee",
    near: "#aec6db",
    ground: "#7f93a8",
    grass: "#eaf3fb",
    orb: "#fdf6e3",
    cloud: "rgba(255,255,255,0.8)",
    stars: false,
    snow: true,
  },
  night: {
    sky: ["#0d1430", "#26305e"],
    far: "#28305a",
    near: "#1a2142",
    ground: "#2a2f4a",
    grass: "#4a5480",
    orb: "#eef2ff",
    cloud: "rgba(200,205,235,0.22)",
    stars: true,
    snow: false,
  },
};

/* ------------------------------------------------------------- public API */

export type HudState = {
  level: number;
  levelName: string;
  lives: number;
  coins: number; // total across the run
  score: number;
  timeLeft: number | null; // seconds remaining, or null if untimed
  levelCoins: number; // collected in the current level (for the flag gate)
  minCoins: number; // 0 = no gate
  keysHave: number; // keys collected this level
  keysNeed: number; // 0 = no gate/key puzzle
};

export type Outcome = "levelComplete" | "gameOver" | "victory";

export type GameCallbacks = {
  onHud: (h: HudState) => void;
  onOutcome: (
    o: Outcome,
    summary: { level: number; coins: number; score: number },
  ) => void;
  onHint: (msg: string | null) => void;
  onPauseRequest: () => void;
};

/** Processed sprite canvas plus the kiwi's measured vertical content bounds, so
 *  the engine can align the kiwi's feet to the ground instead of the frame's
 *  padded bottom edge. */
export type KiwiSprite = {
  canvas: HTMLCanvasElement;
  srcY: number;
  srcH: number;
};

/** Load and pre-process the kiwi sprite: color-key near-white to transparent
 *  so the run cycle composites cleanly over any background, and measure the
 *  kiwi's true top/bottom. Resolves to null (and warns) on any failure — the
 *  engine then falls back to a drawn shape. */
export function loadKiwiSprite(): Promise<KiwiSprite | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement("canvas");
        c.width = img.width;
        c.height = img.height;
        const g = c.getContext("2d");
        if (!g) return resolve(null);
        g.drawImage(img, 0, 0);
        const data = g.getImageData(0, 0, c.width, c.height);
        const px = data.data;
        for (let i = 0; i < px.length; i += 4) {
          if (px[i]! > 244 && px[i + 1]! > 244 && px[i + 2]! > 244)
            px[i + 3] = 0;
        }
        g.putImageData(data, 0, 0);
        // Measure the kiwi's actual vertical extent so we can rest its
        // feet on the ground, not the frame's transparent bottom edge.
        // Scan inside a margin to skip the dashed export border, which
        // is coloured (not white) and so survives the colour-key above.
        const W = c.width;
        const H = c.height;
        const M = 18;
        let minY = H;
        let maxY = -1;
        for (let y = M; y < H - M; y++) {
          for (let x = M; x < W - M; x++) {
            if (px[(y * W + x) * 4 + 3]! > 8) {
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
              break;
            }
          }
        }
        const bounded = maxY >= minY;
        resolve({
          canvas: c,
          srcY: bounded ? minY : SHEET.inset,
          srcH: bounded ? maxY - minY + 1 : SHEET.h - 2 * SHEET.inset,
        });
      } catch (e) {
        console.warn("Kiwi sprite could not be processed; using fallback.", e);
        resolve(null);
      }
    };
    img.onerror = () => {
      console.warn("Kiwi sprite failed to load; using fallback shape.");
      resolve(null);
    };
    img.src = "/kiwi_animation.png";
  });
}

/** A single-frame sprite plus the opaque bounding box measured in its source
 *  image, so it can be feet-aligned and centred without transparent padding. */
export type IdleSprite = {
  img: HTMLImageElement;
  sx: number;
  sy: number;
  sw: number;
  sh: number;
};

/** Scenery/character art with real alpha channels — no colour-keying needed,
 *  unlike the run sheet. Any field is null if that PNG failed to load; every
 *  draw path falls back to the procedural version when its asset is missing. */
export type GameAssets = {
  idle: IdleSprite | null;
  cloudBig: HTMLImageElement | null;
  cloudSmall: HTMLImageElement | null;
  thorns: HTMLImageElement | null;
  platform: HTMLImageElement | null;
};

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => {
      console.warn(`Asset ${src} failed to load; using fallback.`);
      resolve(null);
    };
    img.src = src;
  });
}

/** Load the idle kiwi and measure its opaque bounding box (alpha > 16) so the
 *  engine can rest its feet on the ground instead of the PNG's padded edge. */
async function loadIdleSprite(): Promise<IdleSprite | null> {
  const img = await loadImage("/Kiwi_Idle.png");
  if (!img) return null;
  const whole: IdleSprite = { img, sx: 0, sy: 0, sw: img.width, sh: img.height };
  try {
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext("2d");
    if (!g) return whole;
    g.drawImage(img, 0, 0);
    const px = g.getImageData(0, 0, c.width, c.height).data;
    let minX = c.width,
      minY = c.height,
      maxX = -1,
      maxY = -1;
    for (let y = 0; y < c.height; y++) {
      for (let x = 0; x < c.width; x++) {
        if (px[(y * c.width + x) * 4 + 3]! > 16) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < minX) return whole;
    return { img, sx: minX, sy: minY, sw: maxX - minX + 1, sh: maxY - minY + 1 };
  } catch {
    return whole;
  }
}

/** Preload the new scenery/character assets in parallel. */
export async function loadAssets(): Promise<GameAssets> {
  const [idle, cloudBig, cloudSmall, thorns, platform] = await Promise.all([
    loadIdleSprite(),
    loadImage("/Cloud_Big.png"),
    loadImage("/Cloud_Small.png"),
    loadImage("/Thorns.png"),
    loadImage("/Platform_Grass.png"),
  ]);
  return { idle, cloudBig, cloudSmall, thorns, platform };
}

/* ---------------------------------------------------------- internal state */

type PlayerState = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  onGround: boolean;
  coyote: number; // seconds of ledge-grace remaining
  jumpBuffer: number; // seconds of buffered jump-press remaining
  jumpHeld: boolean;
  invuln: number;
  animTime: number;
  squash: number; // landing squash timer
};

type Coin = { x: number; y: number; collected: boolean; phase: number };
type EnemyState = Enemy & { originX: number; dir: 1 | -1 };
type FlyerState = Flyer & { originX: number; y0: number; dir: 1 | -1 };
type MoverState = MovingPlatform & {
  baseX: number;
  baseY: number;
  phase: number;
};
type KeyItem = { x: number; y: number; taken: boolean };

export class KiwiGame {
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;

  private diff: DifficultyConfig;
  private levels: Level[];
  private cb: GameCallbacks;
  private sprite: KiwiSprite | null;
  private assets: GameAssets;

  // run-wide state
  private index = 0;
  private lives: number;
  private coins = 0; // total across run
  private score = 0;

  // level state
  private level!: Level;
  private platforms: Rect[] = [];
  private coinList: Coin[] = [];
  private enemies: EnemyState[] = [];
  private flyers: FlyerState[] = [];
  private spikes: Spike[] = [];
  private movers: MoverState[] = [];
  private springs: Spring[] = [];
  private keyItems: KeyItem[] = [];
  private gate: Gate | null = null;
  private gateOpen = false;
  private finish = { x: 0, y: 0 };
  private levelCoins = 0;
  private timeLeft: number | null = null;

  private player: PlayerState = blankPlayer();
  private camX = 0;
  private time = 0;

  private status: "idle" | "playing" | "over" = "idle";
  private running = false;
  private raf = 0;
  private last = 0;
  private acc = 0;
  private lastHud = "";

  private input = { left: false, right: false };
  private keyHandler: (e: KeyboardEvent) => void;
  private keyUpHandler: (e: KeyboardEvent) => void;
  private resizeHandler: () => void;

  constructor(
    canvas: HTMLCanvasElement,
    sprite: KiwiSprite | null,
    assets: GameAssets,
    diff: DifficultyConfig,
    levels: Level[],
    cb: GameCallbacks,
  ) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas context unavailable");
    this.ctx = ctx;
    this.sprite = sprite;
    this.assets = assets;
    this.diff = diff;
    this.levels = levels;
    this.cb = cb;
    this.lives = diff.lives;

    this.setupCanvas(canvas);
    this.resizeHandler = () => this.setupCanvas(canvas);
    window.addEventListener("resize", this.resizeHandler);

    this.keyHandler = (e) => this.onKeyDown(e);
    this.keyUpHandler = (e) => this.onKeyUp(e);
    window.addEventListener("keydown", this.keyHandler);
    window.addEventListener("keyup", this.keyUpHandler);
  }

  /** Size the drawing buffer for the device pixel ratio; we always draw in
   *  logical 960x540 coordinates and let CSS scale the element to fit. */
  private setupCanvas(canvas: HTMLCanvasElement) {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = LOGICAL_W * this.dpr;
    canvas.height = LOGICAL_H * this.dpr;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (this.status !== "idle") this.render();
  }

  /* ------------------------------------------------------------ lifecycle */

  /** Begin a fresh run at the first level (menu Start / Play again). */
  startRun() {
    this.index = 0;
    this.lives = this.diff.lives;
    this.coins = 0;
    this.score = 0;
    this.buildLevel(0);
    this.begin();
  }

  /** Advance to the next level after a Level Complete. */
  nextLevel() {
    this.buildLevel(this.index + 1);
    this.begin();
  }

  /** Retry the current level after a Game Over (fresh lives, coins from earlier
   *  levels retained). */
  retry() {
    this.lives = this.diff.lives;
    this.dropLevelCoins();
    this.buildLevel(this.index);
    this.begin();
  }

  pause() {
    if (!this.running) return;
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  resume() {
    if (this.running || this.status !== "playing") return;
    this.running = true;
    this.last = performance.now();
    this.acc = 0; // discard the paused gap so no dt spike leaks in
    this.raf = requestAnimationFrame((t) => this.loop(t));
  }

  /** Tear down all listeners and stop the loop. */
  destroy() {
    this.pause();
    this.status = "idle";
    window.removeEventListener("resize", this.resizeHandler);
    window.removeEventListener("keydown", this.keyHandler);
    window.removeEventListener("keyup", this.keyUpHandler);
  }

  /* --------------------------------------------------------------- input */

  setMove(dir: "left" | "right", on: boolean) {
    this.input[dir] = on;
  }

  jumpDown() {
    this.player.jumpBuffer = this.diff.jumpBufferMs / 1000;
    this.player.jumpHeld = true;
  }

  jumpUp() {
    this.player.jumpHeld = false;
    if (this.player.vy < 0) this.player.vy *= JUMP_CUT; // variable jump height
  }

  private onKeyDown(e: KeyboardEvent) {
    if (this.status !== "playing" || !this.running) return;
    switch (e.code) {
      case "ArrowLeft":
      case "KeyA":
        this.input.left = true;
        break;
      case "ArrowRight":
      case "KeyD":
        this.input.right = true;
        break;
      case "ArrowUp":
      case "KeyW":
      case "Space":
        if (!e.repeat) this.jumpDown();
        e.preventDefault();
        break;
      case "Escape":
        this.cb.onPauseRequest();
        break;
      default:
        break;
    }
  }

  private onKeyUp(e: KeyboardEvent) {
    switch (e.code) {
      case "ArrowLeft":
      case "KeyA":
        this.input.left = false;
        break;
      case "ArrowRight":
      case "KeyD":
        this.input.right = false;
        break;
      case "ArrowUp":
      case "KeyW":
      case "Space":
        this.jumpUp();
        break;
      default:
        break;
    }
  }

  /* ---------------------------------------------------------- level build */

  private buildLevel(i: number) {
    const lv = this.levels[i];
    if (!lv) throw new Error(`No level at index ${i}`);
    this.index = i;
    this.level = lv;
    this.platforms = lv.platforms.map((p) => ({ ...p }));
    this.coinList = lv.coins.map((c, idx) => ({
      x: c.x,
      y: c.y,
      collected: false,
      phase: idx * 0.7,
    }));
    this.enemies = lv.hazards
      .filter((h): h is Enemy => h.type === "enemy")
      .map((e) => ({ ...e, originX: e.x, dir: 1 }));
    this.flyers = lv.hazards
      .filter((h): h is Flyer => h.type === "flyer")
      .map((f) => ({ ...f, originX: f.x, y0: f.y, dir: 1 }));
    this.spikes = lv.hazards.filter((h): h is Spike => h.type === "spike");
    this.movers = (lv.movers ?? []).map((m, idx) => ({
      ...m,
      baseX: m.x,
      baseY: m.y,
      phase: idx * 1.7,
    }));
    this.springs = (lv.springs ?? []).map((s) => ({ ...s }));
    this.keyItems = (lv.keys ?? []).map((k) => ({ ...k, taken: false }));
    this.gate = lv.gate ? { ...lv.gate } : null;
    this.gateOpen = this.keyItems.length === 0; // no keys → nothing to unlock
    this.finish = { ...lv.finish };
    this.levelCoins = 0;
    this.timeLeft = this.diff.timeLimitSec;
    this.player = blankPlayer();
    this.player.x = lv.spawn.x;
    this.player.y = lv.spawn.y;
    this.camX = 0;
    this.input.left = false;
    this.input.right = false;
    this.cb.onHint(null);
  }

  /** Un-count coins collected in the current attempt (used before a full level
   *  reset so totals never inflate). */
  private dropLevelCoins() {
    this.coins -= this.levelCoins;
    this.score -= this.levelCoins * COIN_VALUE;
    this.levelCoins = 0;
  }

  private begin() {
    this.status = "playing";
    this.running = true;
    this.pushHud(true);
    this.render();
    this.last = performance.now();
    this.acc = 0;
    this.raf = requestAnimationFrame((t) => this.loop(t));
  }

  /* ----------------------------------------------------------- main loop */

  private loop(now: number) {
    if (!this.running) return;
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt > MAX_FRAME_DT) dt = MAX_FRAME_DT; // clamp spikes
    this.acc += dt;

    let steps = 0;
    while (this.acc >= FIXED && steps < MAX_STEPS) {
      this.step(FIXED);
      if (!this.running) return; // step may have ended the level/run
      this.acc -= FIXED;
      steps++;
    }
    if (steps === MAX_STEPS) this.acc = 0; // shed backlog

    this.render();
    this.raf = requestAnimationFrame((t) => this.loop(t));
  }

  private step(dt: number) {
    this.time += dt;
    const p = this.player;

    // timers
    if (p.invuln > 0) p.invuln -= dt;
    if (p.squash > 0) p.squash -= dt;
    if (p.jumpBuffer > 0) p.jumpBuffer -= dt;

    // horizontal intent
    const speed = MOVE_SPEED * this.diff.playerSpeedMul;
    p.vx = (Number(this.input.right) - Number(this.input.left)) * speed;
    if (p.vx > 0) p.facing = 1;
    else if (p.vx < 0) p.facing = -1;

    // jump: buffered press + within coyote window
    if (p.jumpBuffer > 0 && p.coyote > 0) {
      p.vy = JUMP_VELOCITY;
      p.onGround = false;
      p.coyote = 0;
      p.jumpBuffer = 0;
    }

    // gravity
    p.vy = Math.min(p.vy + GRAVITY * dt, MAX_FALL);

    // moving platforms advance first and carry a rider along with them
    const wasOnGround = p.onGround;
    this.updateMovers();

    // integrate + resolve against all solids (per-axis, no clip-through)
    const res = moveAndCollide(
      { x: p.x, y: p.y, w: PLAYER.w, h: PLAYER.h },
      p.vx * dt,
      p.vy * dt,
      this.solids(),
    );
    p.x = Math.max(0, res.x); // world left wall
    p.y = res.y;
    if (res.onGround) p.vy = 0;
    if (res.hitHead) p.vy = 0;
    p.onGround = res.onGround;

    // coyote refresh + landing squash
    if (p.onGround) {
      p.coyote = this.diff.coyoteMs / 1000;
      if (!wasOnGround) p.squash = 0.12;
    } else {
      p.coyote = Math.max(0, p.coyote - dt);
    }

    this.springBounce();

    // run-cycle animation clock
    if (p.onGround && Math.abs(p.vx) > 5) p.animTime += dt;

    // enemies patrol
    for (const e of this.enemies) {
      e.x += e.dir * e.speed * this.diff.enemySpeedMul * dt;
      if (e.x >= e.originX + e.patrol) {
        e.x = e.originX + e.patrol;
        e.dir = -1;
      } else if (e.x <= e.originX) {
        e.x = e.originX;
        e.dir = 1;
      }
    }

    // flyers patrol horizontally and bob on a sine wave
    for (const f of this.flyers) {
      f.x += f.dir * f.speed * this.diff.enemySpeedMul * dt;
      if (f.x >= f.originX + f.patrol) {
        f.x = f.originX + f.patrol;
        f.dir = -1;
      } else if (f.x <= f.originX) {
        f.x = f.originX;
        f.dir = 1;
      }
      f.y = f.y0 + Math.sin(this.time * 3 + f.originX) * f.amp;
    }

    // camera follows, clamped to the world
    const maxCam = Math.max(0, this.level.worldWidth - LOGICAL_W);
    this.camX = clamp(p.x + PLAYER.w / 2 - LOGICAL_W / 2, 0, maxCam);

    // timer
    if (this.timeLeft !== null) {
      this.timeLeft = Math.max(0, this.timeLeft - dt);
      if (this.timeLeft === 0) return this.gameOver();
    }

    this.collectCoins();
    this.collectKeys();
    if (this.checkHazards()) return; // a hit may end the run
    this.checkFinish();

    this.pushHud();
  }

  /* --------------------------------------------------------- interactions */

  private playerRect(): Rect {
    return { x: this.player.x, y: this.player.y, w: PLAYER.w, h: PLAYER.h };
  }

  private collectCoins() {
    const pr = this.playerRect();
    for (const c of this.coinList) {
      if (c.collected) continue;
      const cr = {
        x: c.x - COIN_R,
        y: c.y - COIN_R,
        w: COIN_R * 2,
        h: COIN_R * 2,
      };
      if (aabb(pr, cr)) {
        c.collected = true; // flagged once → can never be counted twice
        this.levelCoins++;
        this.coins++;
        this.score += COIN_VALUE;
      }
    }
  }

  /** Everything the player collides with: static platforms, moving platforms,
   *  and the gate while it's still locked. */
  private solids(): Rect[] {
    const s: Rect[] = this.platforms.slice();
    for (const m of this.movers) s.push({ x: m.x, y: m.y, w: m.w, h: m.h });
    if (this.gate && !this.gateOpen) {
      s.push({ ...this.gate });
    }
    return s;
  }

  /** Advance each moving platform along its sine path and, if the player is
   *  standing on one, translate the player by the same delta so they ride it.
   *  Uses the platform's pre-move position for the "am I standing on it?" test. */
  private updateMovers() {
    const p = this.player;
    for (const m of this.movers) {
      const oldX = m.x;
      const oldY = m.y;
      const off = Math.sin(this.time * m.speed + m.phase) * m.range;
      if (m.axis === "x") m.x = m.baseX + off;
      else m.y = m.baseY + off;
      const riding =
        p.onGround &&
        p.x + PLAYER.w > oldX &&
        p.x < oldX + m.w &&
        Math.abs(p.y + PLAYER.h - oldY) <= 6;
      if (riding) {
        p.x += m.x - oldX;
        p.y += m.y - oldY;
      }
    }
  }

  /** Launch the player if they're resting on a bounce pad. Runs every grounded
   *  frame; the bounce clears onGround so it won't fire again until they land. */
  private springBounce() {
    const p = this.player;
    if (!p.onGround) return;
    const foot = p.y + PLAYER.h;
    for (const s of this.springs) {
      if (
        p.x + PLAYER.w > s.x &&
        p.x < s.x + s.w &&
        Math.abs(foot - s.y) <= 6
      ) {
        p.vy = SPRING_V;
        p.onGround = false;
        p.coyote = 0;
        p.squash = 0.14;
        break;
      }
    }
  }

  private collectKeys() {
    if (this.keyItems.length === 0) return;
    const pr = this.playerRect();
    for (const k of this.keyItems) {
      if (k.taken) continue;
      if (aabb(pr, { x: k.x - 14, y: k.y - 14, w: 28, h: 28 })) {
        k.taken = true;
        if (this.keyItems.every((x) => x.taken)) {
          this.gateOpen = true;
          this.cb.onHint("Gate unlocked!");
        }
      }
    }
  }

  /** @returns true if the run/level ended as a result of a hit. */
  private checkHazards(): boolean {
    const p = this.player;
    // pit
    if (p.y > DEATH_Y) return this.takeHit();
    if (p.invuln > 0) return false;

    const pr = this.playerRect();
    for (const s of this.spikes) {
      // slightly forgiving spike hitbox
      if (aabb(pr, { x: s.x + 4, y: s.y + 6, w: s.w - 8, h: s.h - 6 }))
        return this.takeHit();
    }
    for (const e of this.enemies) {
      if (aabb(pr, { x: e.x + 4, y: e.y + 4, w: e.w - 8, h: e.h - 6 }))
        return this.takeHit();
    }
    for (const f of this.flyers) {
      if (aabb(pr, { x: f.x + 4, y: f.y + 4, w: f.w - 8, h: f.h - 8 }))
        return this.takeHit();
    }
    return false;
  }

  /** Apply one hit. @returns true if the loop was stopped (game over). */
  private takeHit(): boolean {
    this.lives--;
    if (this.lives <= 0) {
      this.gameOver();
      return true;
    }
    if (this.diff.restartLevelOnHit) {
      // Hard: a hit sends you back to the start of the level.
      this.dropLevelCoins();
      this.buildLevel(this.index);
    } else {
      // Easy/Medium: respawn at the level start, mobs reset, coins kept.
      for (const e of this.enemies) {
        e.x = e.originX;
        e.dir = 1;
      }
      for (const f of this.flyers) {
        f.x = f.originX;
        f.dir = 1;
      }
      this.player.x = this.level.spawn.x;
      this.player.y = this.level.spawn.y;
      this.player.vx = 0;
      this.player.vy = 0;
    }
    this.player.invuln = INVULN_S;
    this.pushHud(true);
    return false;
  }

  private checkFinish() {
    // Trigger zone hugs the flag's height so an elevated finish must actually
    // be climbed to — you can't complete it by standing under it on the ground.
    const zone = {
      x: this.finish.x - 14,
      y: this.finish.y - 160,
      w: 46,
      h: 180,
    };
    if (!aabb(this.playerRect(), zone)) return;

    const need = this.level.minCoins ?? 0;
    if (this.levelCoins < need) {
      this.cb.onHint(
        `Collect ${need} coins to raise the flag! (${this.levelCoins}/${need})`,
      );
      return;
    }
    this.completeLevel();
  }

  private completeLevel() {
    this.stopLoop();
    const summary = {
      level: this.level.id,
      coins: this.coins,
      score: this.score,
    };
    if (this.index >= this.levels.length - 1) {
      this.cb.onOutcome("victory", summary);
    } else {
      this.cb.onOutcome("levelComplete", summary);
    }
  }

  private gameOver() {
    this.stopLoop();
    this.cb.onOutcome("gameOver", {
      level: this.level.id,
      coins: this.coins,
      score: this.score,
    });
  }

  private stopLoop() {
    this.status = "over";
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private pushHud(force = false) {
    const secs = this.timeLeft === null ? null : Math.ceil(this.timeLeft);
    const keysHave = this.keyItems.filter((k) => k.taken).length;
    const key = `${this.index}|${this.lives}|${this.coins}|${this.score}|${secs}|${this.levelCoins}|${keysHave}`;
    if (!force && key === this.lastHud) return;
    this.lastHud = key;
    this.cb.onHud({
      level: this.level.id,
      levelName: this.level.name,
      lives: this.lives,
      coins: this.coins,
      score: this.score,
      timeLeft: secs,
      levelCoins: this.levelCoins,
      minCoins: this.level.minCoins ?? 0,
      keysHave,
      keysNeed: this.keyItems.length,
    });
  }

  /* ------------------------------------------------------------- rendering */

  private render() {
    const ctx = this.ctx;
    const pal = THEMES[this.level.theme];
    this.drawBackground(pal);

    ctx.save();
    ctx.translate(-this.camX, 0);
    this.drawPlatforms(pal);
    this.drawMovers();
    this.drawSprings();
    this.drawGate();
    this.drawCoins();
    this.drawKeys();
    this.drawSpikes();
    this.drawEnemies();
    this.drawFlyers();
    this.drawFinish();
    this.drawPlayer();
    ctx.restore();
  }

  private drawBackground(pal: Palette) {
    const ctx = this.ctx;
    const g = ctx.createLinearGradient(0, 0, 0, LOGICAL_H);
    g.addColorStop(0, pal.sky[0]);
    g.addColorStop(1, pal.sky[1]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);

    if (pal.stars) {
      ctx.fillStyle = "#ffffff";
      // deterministic starfield (no per-frame randomness)
      for (let i = 0; i < 40; i++) {
        const x = (i * 137.5) % LOGICAL_W;
        const y = (i * 53.3) % 260;
        ctx.globalAlpha = 0.4 + ((i * 7) % 5) / 10;
        ctx.fillRect(x, y, 2, 2);
      }
      ctx.globalAlpha = 1;
    }

    // sun / moon, barely parallaxing (skipped underground)
    if (pal.orb) {
      ctx.fillStyle = pal.orb;
      ctx.beginPath();
      ctx.arc(LOGICAL_W - 140 - this.camX * 0.05, 110, 46, 0, Math.PI * 2);
      ctx.fill();
    }

    // clouds — real art, faded on dark/underground themes so white koru swirls
    // don't glare against a night sky
    const cloudAlpha = pal.stars || !pal.orb ? 0.3 : 0.9;
    for (let i = 0; i < 5; i++) {
      const big = i % 2 === 0;
      const img = big ? this.assets.cloudBig : this.assets.cloudSmall;
      const w = big ? 260 : 180;
      const base = i * 260;
      const x = mod(base - this.camX * 0.1, LOGICAL_W + 260) - 130;
      const y = 50 + ((i * 40) % 110);
      if (img) {
        ctx.globalAlpha = cloudAlpha;
        ctx.drawImage(img, x, y, w, w * (img.height / img.width));
        ctx.globalAlpha = 1;
      } else {
        ctx.fillStyle = pal.cloud;
        cloud(ctx, x, y);
      }
    }

    // two parallax hill layers; bands fill down so pits show scenery, not black
    this.hills(pal.far, 360, 90, 300, 0.2);
    this.hills(pal.near, 415, 120, 360, 0.45);

    // drifting snow (front of the hills, behind the world)
    if (pal.snow) {
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      for (let i = 0; i < 70; i++) {
        const x = mod(i * 97 - this.camX * 0.2 + this.time * 12, LOGICAL_W);
        const y = mod(i * 71 + this.time * (34 + (i % 5) * 10), LOGICAL_H);
        const s = 2 + (i % 2);
        ctx.fillRect(x, y, s, s);
      }
    }
  }

  private hills(
    color: string,
    baseY: number,
    r: number,
    spacing: number,
    factor: number,
  ) {
    const ctx = this.ctx;
    ctx.fillStyle = color;
    const off = mod(this.camX * factor, spacing);
    for (let x = -off - spacing; x < LOGICAL_W + spacing; x += spacing) {
      ctx.beginPath();
      ctx.arc(x + spacing / 2, baseY, r, Math.PI, 0);
      ctx.fill();
    }
    ctx.fillRect(0, baseY, LOGICAL_W, LOGICAL_H - baseY);
  }

  private drawPlatforms(pal: Palette) {
    const ctx = this.ctx;
    const img = this.assets.platform;
    for (const p of this.platforms) {
      // cull off-screen
      if (p.x + p.w < this.camX || p.x > this.camX + LOGICAL_W) continue;
      if (!img) {
        ctx.fillStyle = pal.ground;
        ctx.fillRect(p.x, p.y, p.w, p.h);
        ctx.fillStyle = pal.grass;
        ctx.fillRect(p.x, p.y, p.w, 10); // grassy top band
      } else if (p.h > 60) {
        // Ground slab: fill solid dirt from the surface down so the top is
        // opaque exactly at p.y (nothing floats over the art's transparent top
        // padding), then tile the grass cap along the top at its natural aspect
        // for a continuous grassy surface with dirt clearly below it.
        ctx.fillStyle = GROUND_DIRT;
        ctx.fillRect(p.x, p.y, p.w, p.h);
        const capH = 58;
        const tileW = capH * (img.width / img.height);
        for (let x = p.x; x < p.x + p.w; x += tileW) {
          const w = Math.min(tileW, p.x + p.w - x);
          const sw = (img.width * w) / tileW; // crop the last partial tile clean
          ctx.drawImage(img, 0, 0, sw, img.height, x, p.y - 5, w, capH);
        }
      } else {
        // Floating block / ledge: draw the whole slab at its NATURAL aspect
        // (width = the platform width) so it isn't squashed flat. Anchor the
        // grass surface to p.y; the slab's dirt hangs a little below the thin
        // collision rect, which reads as a chunky floating platform.
        const dh = p.w * (img.height / img.width);
        ctx.drawImage(img, p.x, p.y - dh * PLATFORM_GRASS_TOP, p.w, dh);
      }
    }
  }

  private drawCoins() {
    const ctx = this.ctx;
    for (const c of this.coinList) {
      if (c.collected) continue;
      // spin: horizontal scale oscillates so the coin flashes edge-on
      const s = Math.abs(Math.cos(this.time * 6 + c.phase));
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.scale(s * 0.85 + 0.15, 1);
      ctx.fillStyle = "#f7c948";
      ctx.beginPath();
      ctx.arc(0, 0, COIN_R, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#c9971a";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = "#fff2b8";
      ctx.beginPath();
      ctx.arc(-3, -3, COIN_R * 0.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  private drawSpikes() {
    const ctx = this.ctx;
    const img = this.assets.thorns;
    if (img) {
      const ratio = img.height / img.width;
      for (const s of this.spikes) {
        // draw at natural aspect, notably wider than the hitbox so the bush
        // reads as a real hazard; bottom sits on the ground, tips ride above
        // the (forgiving) hitbox
        const w = s.w * 1.8;
        const h = w * ratio;
        ctx.drawImage(img, s.x - (w - s.w) / 2, s.y + s.h - h, w, h);
      }
      return;
    }
    for (const s of this.spikes) {
      const n = Math.max(1, Math.round(s.w / 20));
      const tw = s.w / n;
      ctx.fillStyle = "#8a8f99";
      for (let i = 0; i < n; i++) {
        const x = s.x + i * tw;
        ctx.beginPath();
        ctx.moveTo(x, s.y + s.h);
        ctx.lineTo(x + tw / 2, s.y);
        ctx.lineTo(x + tw, s.y + s.h);
        ctx.closePath();
        ctx.fill();
      }
      ctx.strokeStyle = "#5a5f68";
      ctx.lineWidth = 1;
      ctx.strokeRect(s.x, s.y + s.h - 1, s.w, 1);
    }
  }

  private drawEnemies() {
    const ctx = this.ctx;
    for (const e of this.enemies) {
      const bob = Math.sin(this.time * 6 + e.originX) * 2;
      const cx = e.x + e.w / 2;
      const cy = e.y + e.h / 2 + bob;
      ctx.fillStyle = "#c0392b";
      ctx.beginPath();
      ctx.arc(cx, cy, e.w / 2, 0, Math.PI * 2);
      ctx.fill();
      // eyes look the way it walks
      ctx.fillStyle = "#fff";
      const ex = cx + e.dir * 6;
      ctx.beginPath();
      ctx.arc(ex - 4, cy - 4, 4, 0, Math.PI * 2);
      ctx.arc(ex + 4, cy - 4, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#222";
      ctx.beginPath();
      ctx.arc(ex - 4 + e.dir * 1.5, cy - 4, 2, 0, Math.PI * 2);
      ctx.arc(ex + 4 + e.dir * 1.5, cy - 4, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawFlyers() {
    const ctx = this.ctx;
    for (const f of this.flyers) {
      if (f.x + f.w < this.camX || f.x > this.camX + LOGICAL_W) continue;
      const cx = f.x + f.w / 2;
      const cy = f.y + f.h / 2;
      const flap = Math.sin(this.time * 12 + f.originX) * 0.5;
      // wings
      ctx.fillStyle = "#4834b0";
      for (const dir of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + dir * f.w * 0.7, cy - 8 - flap * 14);
        ctx.lineTo(cx + dir * f.w * 0.5, cy + 5);
        ctx.closePath();
        ctx.fill();
      }
      // body
      ctx.fillStyle = "#6c5ce7";
      ctx.beginPath();
      ctx.arc(cx, cy, f.h / 2 - 2, 0, Math.PI * 2);
      ctx.fill();
      // eyes
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(cx - 4, cy - 2, 3, 0, Math.PI * 2);
      ctx.arc(cx + 4, cy - 2, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#111";
      ctx.beginPath();
      ctx.arc(cx - 4, cy - 2, 1.5, 0, Math.PI * 2);
      ctx.arc(cx + 4, cy - 2, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawMovers() {
    const ctx = this.ctx;
    for (const m of this.movers) {
      if (m.x + m.w < this.camX || m.x > this.camX + LOGICAL_W) continue;
      ctx.fillStyle = "#6b7a99"; // bluish stone, distinct from brown ground
      ctx.fillRect(m.x, m.y, m.w, m.h);
      ctx.fillStyle = "rgba(255,255,255,0.25)";
      ctx.fillRect(m.x, m.y, m.w, 4);
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      ctx.fillRect(m.x, m.y + m.h - 3, m.w, 3);
      // a chevron hinting the travel axis
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      const mid = m.x + m.w / 2;
      const my = m.y + m.h / 2;
      ctx.beginPath();
      if (m.axis === "x") {
        ctx.moveTo(mid - 6, my - 4);
        ctx.lineTo(mid + 2, my);
        ctx.lineTo(mid - 6, my + 4);
      } else {
        ctx.moveTo(mid - 4, my - 6);
        ctx.lineTo(mid, my + 2);
        ctx.lineTo(mid + 4, my - 6);
      }
      ctx.closePath();
      ctx.fill();
    }
  }

  private drawSprings() {
    const ctx = this.ctx;
    for (const s of this.springs) {
      if (s.x + s.w < this.camX || s.x > this.camX + LOGICAL_W) continue;
      // coil
      ctx.strokeStyle = "#c0392b";
      ctx.lineWidth = 3;
      ctx.beginPath();
      const coils = 4;
      for (let i = 0; i <= coils; i++) {
        const yy = s.y - 2 - i * 4;
        const xx = i % 2 === 0 ? s.x + 4 : s.x + s.w - 4;
        if (i === 0) ctx.moveTo(xx, yy);
        else ctx.lineTo(xx, yy);
      }
      ctx.stroke();
      // top pad
      ctx.fillStyle = "#e74c3c";
      ctx.fillRect(s.x - 2, s.y - 24, s.w + 4, 8);
    }
  }

  private drawKeys() {
    const ctx = this.ctx;
    for (const k of this.keyItems) {
      if (k.taken) continue;
      const bob = Math.sin(this.time * 3 + k.x) * 3;
      ctx.save();
      ctx.translate(k.x, k.y + bob);
      ctx.fillStyle = "#f1c40f";
      ctx.strokeStyle = "#b8860b";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, -6, 7, 0, Math.PI * 2); // bow (ring)
      ctx.fill();
      ctx.stroke();
      ctx.fillRect(-2, -2, 4, 16); // shaft
      ctx.fillRect(2, 6, 5, 3); // teeth
      ctx.fillRect(2, 11, 4, 3);
      ctx.restore();
    }
  }

  private drawGate() {
    if (!this.gate || this.gateOpen) return;
    const ctx = this.ctx;
    const g = this.gate;
    ctx.fillStyle = "#5d4037";
    ctx.fillRect(g.x, g.y, g.w, g.h);
    ctx.fillStyle = "#3e2723";
    for (let y = g.y + 6; y < g.y + g.h; y += 14) {
      ctx.fillRect(g.x, y, g.w, 3);
    }
    for (let x = g.x + 6; x < g.x + g.w; x += 14) {
      ctx.fillRect(x, g.y, 3, g.h);
    }
    // lock
    ctx.fillStyle = "#f1c40f";
    ctx.beginPath();
    ctx.arc(g.x + g.w / 2, g.y + g.h / 2, 7, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawFinish() {
    const ctx = this.ctx;
    const fx = this.finish.x;
    const topY = this.finish.y - 150;
    ctx.fillStyle = "#dfe6e9";
    ctx.fillRect(fx, topY, 6, 150); // pole
    // waving banner
    const wave = Math.sin(this.time * 4) * 6;
    ctx.fillStyle = "#27ae60";
    ctx.beginPath();
    ctx.moveTo(fx + 6, topY);
    ctx.lineTo(fx + 70 + wave, topY + 20);
    ctx.lineTo(fx + 6, topY + 40);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(fx + 30, topY + 20, 6, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawPlayer() {
    const ctx = this.ctx;
    const p = this.player;

    // blink while invulnerable
    if (p.invuln > 0 && Math.floor(this.time * 20) % 2 === 0) return;

    // choose animation frame from the run sheet
    let frame = 0;
    let bob = 0;
    let tilt = 0;
    const isIdle = p.onGround && Math.abs(p.vx) <= 5;
    if (!p.onGround) {
      frame = JUMP_FRAME;
      tilt = clamp(p.vy * 0.0004, -0.22, 0.22);
    } else if (Math.abs(p.vx) > 5) {
      const fps = Math.min(18, 8 + Math.abs(p.vx) / 22);
      frame = Math.floor(p.animTime * fps) % SHEET.frames;
    } else {
      frame = 0;
      bob = -Math.abs(Math.sin(this.time * 3)) * 3; // idle breathing
    }

    const drawH = DRAW_H;
    const squashK = p.squash > 0 ? p.squash / 0.12 : 0;
    const sy = 1 - 0.18 * squashK; // squash on landing
    const sx = 1 + 0.12 * squashK;

    const cx = p.x + PLAYER.w / 2;
    const footY = p.y + PLAYER.h + bob;

    ctx.save();
    ctx.translate(cx, footY);
    ctx.scale(p.facing * sx, sy);
    ctx.rotate(p.facing === 1 ? tilt : -tilt);

    if (isIdle && this.assets.idle) {
      const s = this.assets.idle;
      const dw = drawH * (s.sw / s.sh);
      ctx.drawImage(s.img, s.sx, s.sy, s.sw, s.sh, -dw / 2, -drawH, dw, drawH);
    } else if (this.sprite) {
      const { canvas, srcY, srcH } = this.sprite;
      const drawW = drawH * (FRAME_W / srcH);
      ctx.drawImage(
        canvas,
        SHEET.inset + frame * FRAME_W,
        srcY,
        FRAME_W,
        srcH,
        -drawW / 2,
        -drawH,
        drawW,
        drawH,
      );
    } else {
      // fallback: a kiwi-ish brown blob so the game still runs
      ctx.fillStyle = "#7a4a2b";
      ctx.beginPath();
      ctx.ellipse(
        0,
        -PLAYER.h / 2,
        PLAYER.w / 2,
        PLAYER.h / 2,
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
    ctx.restore();
  }
}

/* ------------------------------------------------------------------ utils */

function blankPlayer(): PlayerState {
  return {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    facing: 1,
    onGround: false,
    coyote: 0,
    jumpBuffer: 0,
    jumpHeld: false,
    invuln: 0,
    animTime: 0,
    squash: 0,
  };
}

function clamp(v: number, lo: number, hi: number) {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

/** Positive modulo (JS % keeps the sign of the dividend). */
function mod(a: number, n: number) {
  return ((a % n) + n) % n;
}

function cloud(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.beginPath();
  ctx.arc(x, y, 22, 0, Math.PI * 2);
  ctx.arc(x + 26, y + 6, 28, 0, Math.PI * 2);
  ctx.arc(x + 58, y, 20, 0, Math.PI * 2);
  ctx.fill();
}
