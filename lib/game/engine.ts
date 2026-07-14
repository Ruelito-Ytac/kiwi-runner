import { aabb, crusherOffset, moveAndCollide, type Rect } from "./physics";
import type {
  Barrier,
  Belt,
  Crumbler,
  Crusher,
  DifficultyConfig,
  Dropper,
  Enemy,
  Flyer,
  Gate,
  Ice,
  Level,
  MovingPlatform,
  PushBox,
  Spike,
  Spring,
  Switch,
  Wind,
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
const AIR_JUMPS = 1; // extra mid-air jumps beyond the ground jump (double jump)
const DASH_SPEED = 720; // px/s horizontal dash burst
const DASH_TIME = 0.18; // dash duration → ~130px of travel
const DASH_CD = 0.45; // dash cooldown so it can't be spammed
const FLOOR_DIRT = "#845639"; // sampled from the floor tiles' dirt — solid fill behind the tiles
const FLOOR_GRASS_TOP = 45 / 1040; // opaque grass-tip offset in the floor tiles (align tips to the walk line)
const FLOOR_OVERLAP = 2; // px each floor tile extends over its right neighbour so seams never show
const PLATFORM_GRASS_TOP = 23 / 427; // opaque grass surface offset in Platform_Grass.png

// Environment-mechanic tuning.
const CRUMBLE_SHAKE = 0.4; // seconds a crumbler shakes underfoot before it drops
const CRUMBLE_RESPAWN = 1.9; // seconds a fallen crumbler stays gone before reforming
const ICE_ACCEL = 620; // px/s^2 grip on ice — low, so you accelerate and skid
const CRUSH_LETHAL_FROM = 0.55; // cycle fraction where the slam starts (see crusherOffset)
const CRUSH_LETHAL_TO = 0.8; // …and where the retract begins (safe again after this)
const DROP_TELEGRAPH = 0.32; // seconds a rock shakes in place before it lets go
const DROP_RESET = 2.4; // seconds a shattered rock waits before re-arming
const SURF_EPS = 8; // px tolerance for "feet resting on this surface"
const ONEWAY_MAX_H = 60; // platforms this thin or thinner are jump-through (blocks, not ground)

// Stomp (jump on a mob's head, Mario-style) + death sequence tuning.
const STOMP_BOUNCE = -560; // upward pop after a successful stomp
const STOMP_SCORE = 200; // points per defeated mob
const STOMP_TOP_FRAC = 0.6; // feet must land in the upper 60% of the mob to stomp
const DEATH_TIME = 1.1; // seconds the death animation plays before resolving
const DEATH_HOP_V = -720; // the classic pop-up before the fall (skipped for pit deaths)
const PARTICLE_GRAVITY = 900; // px/s^2 on feather/puff particles

// Jump VFX (feet-anchored animated sprites) — on-screen widths + play durations.
const FX_TAKEOFF_W = 104;
const FX_TAKEOFF_DUR = 0.34; // ground-jump dust
const FX_LAND_W = 104;
const FX_LAND_DUR = 0.36; // landing dust
const FX_DJUMP_W = 118;
const FX_DJUMP_DUR = 0.3; // air/double-jump burst

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

/** One-shot sound cues the engine emits; the host plays the matching clip. */
export type SfxName = "jump" | "coin" | "stomp" | "death";

export type GameCallbacks = {
  onHud: (h: HudState) => void;
  onOutcome: (
    o: Outcome,
    summary: { level: number; coins: number; score: number },
  ) => void;
  onHint: (msg: string | null) => void;
  onPauseRequest: () => void;
  onSfx?: (name: SfxName) => void; // optional: host plays the sound
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
  floorStart: HTMLImageElement | null; // Floor_01_start — left cap (grass drapes left)
  floorMid: HTMLImageElement | null; // Floor_02_middle_reusable — seamless tile
  floorEnd: HTMLImageElement | null; // Floor_03_end — right cap (grass drapes right)
  platform: HTMLImageElement | null; // Platform_Grass — rounded floating platforms/ledges
  // Jump VFX frame sequences (empty array = missing → the effect just doesn't draw)
  jumpTakeoff: HTMLImageElement[]; // ground-jump dust (Jump/take_off)
  jumpLand: HTMLImageElement[]; // landing dust (Jump/land)
  doubleJump: HTMLImageElement[]; // air-jump burst (Double Jump)
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

/** Load a numbered frame sequence (e.g. `${prefix}01.png`..). Missing frames are
 *  dropped, so a partly-missing effect still plays with whatever loaded. */
async function loadFrames(
  prefix: string,
  count: number,
  pad = 2,
): Promise<HTMLImageElement[]> {
  const imgs = await Promise.all(
    Array.from({ length: count }, (_, i) =>
      loadImage(`${prefix}${String(i + 1).padStart(pad, "0")}.png`),
    ),
  );
  return imgs.filter((x): x is HTMLImageElement => x !== null);
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
  const [
    idle,
    cloudBig,
    cloudSmall,
    thorns,
    floorStart,
    floorMid,
    floorEnd,
    platform,
    jumpTakeoff,
    jumpLand,
    doubleJump,
  ] = await Promise.all([
    loadIdleSprite(),
    loadImage("/Cloud_Big.png"),
    loadImage("/Cloud_Small.png"),
    loadImage("/Thorns.png"),
    loadImage("/Floor_01_start.png"),
    loadImage("/Floor_02_middle_reusable.png"),
    loadImage("/Floor_03_end.png"),
    loadImage("/Platform_Grass.png"),
    loadFrames("/Jump/take_off/take_off_", 7),
    loadFrames("/Jump/land/land_", 8),
    loadFrames("/Double Jump/", 4),
  ]);
  return {
    idle,
    cloudBig,
    cloudSmall,
    thorns,
    floorStart,
    floorMid,
    floorEnd,
    platform,
    jumpTakeoff,
    jumpLand,
    doubleJump,
  };
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
  airJumpsLeft: number; // mid-air jumps remaining (refilled on landing)
  dashTime: number; // remaining dash duration (0 = not dashing)
  dashCd: number; // dash cooldown remaining
  dashDir: 1 | -1; // locked direction of the current dash
  dashAir: boolean; // an air-dash was already spent this airtime
  invuln: number;
  animTime: number;
  squash: number; // landing squash timer
};

type Coin = { x: number; y: number; collected: boolean; phase: number };
type EnemyState = Enemy & { originX: number; dir: 1 | -1; dead: boolean };
type FlyerState = Flyer & {
  originX: number;
  y0: number;
  dir: 1 | -1;
  dead: boolean;
};
/** An animated sprite effect that plays its frames once (jump dust / air burst).
 *  Placed at a feet anchor in world coordinates so it stays put as the world
 *  scrolls. */
type SpriteFx = {
  frames: HTMLImageElement[];
  x: number; // feet centre (world x)
  y: number; // feet line (world y)
  t: number;
  dur: number;
  w: number; // on-screen width; height follows the frame aspect
  anchor: "bottom" | "center";
};

/** A short-lived visual particle (death feathers, stomp puff). */
type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  spin: number;
};
type MoverState = MovingPlatform & {
  baseX: number;
  baseY: number;
  phase: number;
};
type KeyItem = { x: number; y: number; taken: boolean };
type BoxState = PushBox & { vy: number };
type SwitchState = Switch & { latchedOn: boolean; active: boolean };
type BarrierState = Barrier & { open: boolean };
type CrumblerState = Crumbler & {
  stage: "solid" | "shaking" | "gone";
  timer: number;
};
type CrusherState = Crusher & {
  baseY: number; // raised top (immutable); `y` is mutated to the current top
  cyclePos: number; // 0..1 position in the slam cycle (for the lethal window)
};
type DropperState = Dropper & {
  baseY: number;
  curY: number; // current top while falling
  vy: number;
  restY: number; // top position where the rock shatters on the ground below
  stage: "armed" | "shaking" | "falling" | "gone";
  timer: number;
};

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
  private boxes: BoxState[] = [];
  private switches: SwitchState[] = [];
  private barriers: BarrierState[] = [];
  private crumblers: CrumblerState[] = [];
  private belts: Belt[] = [];
  private crushers: CrusherState[] = [];
  private droppers: DropperState[] = [];
  private iceList: Ice[] = [];
  private windZones: Wind[] = [];
  private finish = { x: 0, y: 0 };
  private levelCoins = 0;
  private timeLeft: number | null = null;

  private player: PlayerState = blankPlayer();
  private camX = 0;
  private time = 0;
  private particles: Particle[] = [];
  private effects: SpriteFx[] = []; // active jump/land VFX sprites
  private deathT = 0; // >0 = the death animation is playing (world frozen)
  private deathHop = false; // true = pop-up death; false = pit death (already fell)

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
  private fsHandler: () => void;

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
    // Re-measure after a fullscreen change; wait one frame so the new layout is
    // settled before we read the canvas's displayed size.
    this.fsHandler = () =>
      requestAnimationFrame(() => this.setupCanvas(canvas));
    document.addEventListener("fullscreenchange", this.fsHandler);

    this.keyHandler = (e) => this.onKeyDown(e);
    this.keyUpHandler = (e) => this.onKeyUp(e);
    window.addEventListener("keydown", this.keyHandler);
    window.addEventListener("keyup", this.keyUpHandler);
  }

  /** Fit the largest 16:9 box inside the frame, use it as the canvas's CSS size,
   *  and match the backing store to it × the device pixel ratio. This keeps the
   *  render 1:1 with the screen (crisp at any size, windowed or fullscreen),
   *  undistorted, and letterboxed on black when the frame isn't 16:9. We always
   *  draw in logical 960×540 coordinates, scaled uniformly onto the backing. */
  private setupCanvas(canvas: HTMLCanvasElement) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.dpr = dpr;
    const frame = canvas.parentElement;
    const fw = frame?.clientWidth || LOGICAL_W; // fall back before first layout
    const fh = frame?.clientHeight || LOGICAL_H;
    let cssW = fw;
    let cssH = (fw * LOGICAL_H) / LOGICAL_W;
    if (cssH > fh) {
      cssH = fh;
      cssW = (fh * LOGICAL_W) / LOGICAL_H;
    }
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    canvas.width = Math.max(1, Math.round(cssW * dpr));
    canvas.height = Math.max(1, Math.round(cssH * dpr));
    this.ctx.setTransform(
      canvas.width / LOGICAL_W,
      0,
      0,
      canvas.height / LOGICAL_H,
      0,
      0,
    );
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
    document.removeEventListener("fullscreenchange", this.fsHandler);
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

  /** Trigger a horizontal dash in the facing direction. One air-dash per
   *  airtime; on the ground it's limited only by the cooldown. */
  dashDown() {
    const p = this.player;
    if (p.dashCd > 0 || p.dashTime > 0) return;
    if (!p.onGround && p.dashAir) return;
    p.dashTime = DASH_TIME;
    p.dashDir = p.facing;
    p.dashCd = DASH_CD;
    if (!p.onGround) p.dashAir = true;
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
      case "ShiftLeft":
      case "ShiftRight":
      case "KeyK":
        if (!e.repeat) this.dashDown();
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
      .map((e) => ({ ...e, originX: e.x, dir: 1 as const, dead: false }));
    this.flyers = lv.hazards
      .filter((h): h is Flyer => h.type === "flyer")
      .map((f) => ({ ...f, originX: f.x, y0: f.y, dir: 1 as const, dead: false }));
    // Copy spikes (so clamping never mutates the shared level data) and pull
    // any thorn off the start/end floor caps into the flat middle of its slab,
    // so it never renders hanging over a ledge.
    this.spikes = lv.hazards
      .filter((h): h is Spike => h.type === "spike")
      .map((sp) => ({ ...sp }));
    const CAP = 150; // world px reserved at each end of a ground slab
    for (const sp of this.spikes) {
      const g = this.platforms.find(
        (p) => p.h > 60 && sp.x + sp.w > p.x && sp.x < p.x + p.w,
      );
      if (!g) continue;
      const lo = g.x + CAP;
      const hi = g.x + g.w - CAP - sp.w;
      sp.x = hi >= lo ? clamp(sp.x, lo, hi) : g.x + (g.w - sp.w) / 2;
    }
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
    this.boxes = (lv.boxes ?? []).map((b) => ({ ...b, vy: 0 }));
    this.switches = (lv.switches ?? []).map((s) => ({
      ...s,
      latchedOn: false,
      active: false,
    }));
    this.barriers = (lv.barriers ?? []).map((b) => ({ ...b, open: false }));
    this.crumblers = (lv.crumblers ?? []).map((c) => ({
      ...c,
      stage: "solid" as const,
      timer: 0,
    }));
    this.belts = (lv.belts ?? []).map((b) => ({ ...b }));
    this.crushers = (lv.crushers ?? []).map((c) => ({
      ...c,
      baseY: c.y,
      cyclePos: 0,
    }));
    this.droppers = (lv.droppers ?? []).map((d) => ({
      ...d,
      baseY: d.y,
      curY: d.y,
      vy: 0,
      restY: this.surfaceUnder(d.x, d.w, d.y + d.h) - d.h,
      stage: "armed" as const,
      timer: 0,
    }));
    this.iceList = (lv.ice ?? []).map((i) => ({ ...i }));
    this.windZones = (lv.wind ?? []).map((w) => ({ ...w }));
    this.finish = { ...lv.finish };
    this.levelCoins = 0;
    this.timeLeft = this.diff.timeLimitSec;
    this.player = blankPlayer();
    this.player.x = lv.spawn.x;
    this.player.y = lv.spawn.y;
    this.camX = 0;
    this.particles = [];
    this.effects = [];
    this.deathT = 0;
    this.deathHop = false;
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
    if (this.deathT > 0) return this.updateDeath(dt); // world frozen mid-death
    const p = this.player;

    // timers
    if (p.invuln > 0) p.invuln -= dt;
    if (p.squash > 0) p.squash -= dt;
    if (p.jumpBuffer > 0) p.jumpBuffer -= dt;
    if (p.dashCd > 0) p.dashCd -= dt;

    if (p.dashTime > 0) {
      // Dash: a fixed horizontal burst with vertical motion frozen, so it
      // reliably crosses gaps. Overrides normal movement + gravity while active.
      p.dashTime -= dt;
      p.vx = p.dashDir * DASH_SPEED;
      p.vy = 0;
    } else {
      // horizontal intent — snappy by default, momentum while on ice
      const speed = MOVE_SPEED * this.diff.playerSpeedMul;
      const target = (Number(this.input.right) - Number(this.input.left)) * speed;
      if (this.onIce()) {
        // icy grip: ease toward the target so the kiwi accelerates and skids
        p.vx += clamp(target - p.vx, -ICE_ACCEL * dt, ICE_ACCEL * dt);
      } else {
        p.vx = target;
      }
      // environmental drag: conveyor belts (while riding) + wind gusts (airborne too)
      p.vx += this.beltPush() + this.windPush();
      // face where you steer, not where the wind/belt shoves you
      if (target > 0) p.facing = 1;
      else if (target < 0) p.facing = -1;

      // jump: a ground/coyote jump if available, otherwise a mid-air jump
      if (p.jumpBuffer > 0 && p.coyote > 0) {
        p.vy = JUMP_VELOCITY;
        p.onGround = false;
        p.coyote = 0;
        p.jumpBuffer = 0;
        this.cb.onSfx?.("jump");
        this.spawnFx(
          this.assets.jumpTakeoff,
          FX_TAKEOFF_W,
          FX_TAKEOFF_DUR,
          "bottom",
        );
      } else if (p.jumpBuffer > 0 && !p.onGround && p.airJumpsLeft > 0) {
        p.vy = JUMP_VELOCITY; // double jump — crisp reset of vertical velocity
        p.airJumpsLeft--;
        p.jumpBuffer = 0;
        p.squash = 0.1;
        this.cb.onSfx?.("jump");
        this.spawnFx(this.assets.doubleJump, FX_DJUMP_W, FX_DJUMP_DUR, "center");
      }

      // gravity
      p.vy = Math.min(p.vy + GRAVITY * dt, MAX_FALL);
    }

    // moving platforms advance first and carry a rider along with them
    const wasOnGround = p.onGround;
    this.updateSwitches(); // set barriers open/closed before this frame's collisions
    this.updateMovers();
    this.updateCrumblers(dt); // collapse timers → may remove a solid before we collide
    this.updateCrushers(); // advance slam cycles (position + lethal window)
    this.updateDroppers(dt); // arm/drop/reset falling rocks
    this.updateBoxes(p.vx * dt, dt); // push crates the player walks into, + box gravity

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

    // coyote refresh + landing squash; landing refills the air jumps + air-dash
    if (p.onGround) {
      p.coyote = this.diff.coyoteMs / 1000;
      p.airJumpsLeft = AIR_JUMPS;
      p.dashAir = false;
      if (!wasOnGround) {
        p.squash = 0.12;
        this.spawnFx(this.assets.jumpLand, FX_LAND_W, FX_LAND_DUR, "bottom");
      }
    } else {
      p.coyote = Math.max(0, p.coyote - dt);
    }

    this.springBounce();

    // run-cycle animation clock
    if (p.onGround && Math.abs(p.vx) > 5) p.animTime += dt;

    // enemies patrol
    for (const e of this.enemies) {
      if (e.dead) continue;
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
      if (f.dead) continue;
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
    if (this.checkHazards()) return; // a hit may start the death sequence
    this.checkFinish();

    this.updateParticles(dt);
    this.updateEffects(dt);
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
        this.cb.onSfx?.("coin");
      }
    }
  }

  /** Everything the player collides with: static platforms, moving platforms,
   *  conveyor belts, intact crumblers, the gate while it's still locked,
   *  pushable boxes, and closed barriers. Crushers are NOT here — they are pure
   *  timed hazards you pass under, not surfaces you ride. */
  private solids(): Rect[] {
    // Floating blocks (thin platforms) are one-way: you jump up through them and
    // land on top, Mario-style. Thick ground slabs stay fully solid.
    const s: Rect[] = this.platforms.map((p) =>
      p.h <= ONEWAY_MAX_H ? { ...p, oneWay: true } : { ...p },
    );
    for (const m of this.movers) s.push({ x: m.x, y: m.y, w: m.w, h: m.h });
    for (const b of this.belts) s.push({ x: b.x, y: b.y, w: b.w, h: b.h });
    for (const c of this.crumblers)
      if (c.stage !== "gone") s.push({ x: c.x, y: c.y, w: c.w, h: c.h });
    if (this.gate && !this.gateOpen) s.push({ ...this.gate });
    for (const b of this.boxes) s.push({ x: b.x, y: b.y, w: b.w, h: b.h });
    for (const bar of this.barriers)
      if (!bar.open) s.push({ x: bar.x, y: bar.y, w: bar.w, h: bar.h });
    return s;
  }

  /** Solids a box collides with: the world, closed barriers, and OTHER boxes —
   *  but not itself or the player (the player push is resolved separately). */
  private solidsForBox(self: BoxState): Rect[] {
    const s: Rect[] = this.platforms.slice();
    for (const m of this.movers) s.push({ x: m.x, y: m.y, w: m.w, h: m.h });
    if (this.gate && !this.gateOpen) s.push({ ...this.gate });
    for (const bar of this.barriers)
      if (!bar.open) s.push({ x: bar.x, y: bar.y, w: bar.w, h: bar.h });
    for (const b of this.boxes)
      if (b !== self) s.push({ x: b.x, y: b.y, w: b.w, h: b.h });
    return s;
  }

  /** Push any box the grounded player is walking into (before the player's own
   *  collision resolves against it), and advance box gravity. */
  private updateBoxes(dx: number, dt: number) {
    const p = this.player;
    if (p.onGround && dx !== 0) {
      const dir = dx > 0 ? 1 : -1;
      const pr = this.playerRect();
      for (const b of this.boxes) {
        const vOverlap = pr.y + pr.h > b.y + 6 && pr.y < b.y + b.h - 6;
        if (!vOverlap) continue;
        // only push from the correct side, and only when about to make contact
        const gap = dir > 0 ? b.x - (pr.x + pr.w) : pr.x - (b.x + b.w);
        if (gap > Math.abs(dx) + 2 || gap < -6) continue;
        const res = moveAndCollide(
          { x: b.x, y: b.y, w: b.w, h: b.h },
          dx,
          0,
          this.solidsForBox(b),
        );
        b.x = res.x;
      }
    }
    for (const b of this.boxes) {
      b.vy = Math.min(b.vy + GRAVITY * dt, MAX_FALL);
      const res = moveAndCollide(
        { x: b.x, y: b.y, w: b.w, h: b.h },
        0,
        b.vy * dt,
        this.solidsForBox(b),
      );
      b.y = res.y;
      if (res.onGround) b.vy = 0;
    }
    this.boxes = this.boxes.filter((b) => b.y <= DEATH_Y); // lost down a pit
  }

  /** A plate is pressed while the player's feet or a box's base rest on it;
   *  a `latch` plate stays on once first pressed. Barriers open while any of
   *  their switches is active. */
  private updateSwitches() {
    const pr = this.playerRect();
    for (const bar of this.barriers) bar.open = false;
    const on = (bx: number, bw: number, by: number, bh: number, s: Switch) =>
      bx + bw > s.x && bx < s.x + s.w && by + bh >= s.y - 8 && by + bh <= s.y + 12;
    for (const s of this.switches) {
      const pressed =
        on(pr.x, pr.w, pr.y, pr.h, s) ||
        this.boxes.some((b) => on(b.x, b.w, b.y, b.h, s));
      if (pressed) s.latchedOn = true;
      s.active = s.latch ? s.latchedOn : pressed;
      const bar = this.barriers[s.barrier];
      if (s.active && bar) bar.open = true;
    }
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
        this.cb.onSfx?.("jump");
        this.spawnFx(this.assets.jumpTakeoff, FX_TAKEOFF_W, FX_TAKEOFF_DUR, "bottom");
        break;
      }
    }
  }

  /** True while the kiwi's feet rest on an ice patch (grounded only — ice never
   *  touches your airborne control, which keeps it forgiving near pits). */
  private onIce(): boolean {
    const p = this.player;
    if (!p.onGround) return false;
    const foot = p.y + PLAYER.h;
    for (const ice of this.iceList) {
      if (
        p.x + PLAYER.w > ice.x &&
        p.x < ice.x + ice.w &&
        Math.abs(foot - ice.y) <= SURF_EPS
      )
        return true;
    }
    return false;
  }

  /** Horizontal drag from any conveyor belt the grounded kiwi is standing on. */
  private beltPush(): number {
    const p = this.player;
    if (!p.onGround) return 0;
    const foot = p.y + PLAYER.h;
    let push = 0;
    for (const b of this.belts) {
      if (
        p.x + PLAYER.w > b.x &&
        p.x < b.x + b.w &&
        Math.abs(foot - b.y) <= SURF_EPS
      )
        push += b.dir * b.speed;
    }
    return push;
  }

  /** Horizontal push from any wind zone the kiwi's centre is inside (airborne
   *  too — being blown mid-jump is the whole point). */
  private windPush(): number {
    const p = this.player;
    const cx = p.x + PLAYER.w / 2;
    const cy = p.y + PLAYER.h / 2;
    let push = 0;
    for (const z of this.windZones) {
      if (cx > z.x && cx < z.x + z.w && cy > z.y && cy < z.y + z.h)
        push += z.push;
    }
    return push;
  }

  /** Topmost solid surface strictly below `fromY` in the column [x, x+w] — where
   *  a dropped rock shatters. DEATH_Y if nothing is below (it falls into a pit). */
  private surfaceUnder(x: number, w: number, fromY: number): number {
    let best = DEATH_Y;
    for (const p of this.platforms) {
      if (p.x < x + w && p.x + p.w > x && p.y >= fromY && p.y < best) best = p.y;
    }
    return best;
  }

  /** Restore per-attempt mechanic state on an Easy/Medium respawn. Coins/keys are
   *  intentionally kept; everything positional resets for a fair retry. */
  private resetMechanicsForRespawn() {
    for (const c of this.crumblers) {
      c.stage = "solid";
      c.timer = 0;
    }
    for (const d of this.droppers) {
      d.stage = "armed";
      d.curY = d.baseY;
      d.vy = 0;
      d.timer = 0;
    }
    this.boxes = (this.level.boxes ?? []).map((b) => ({ ...b, vy: 0 }));
    for (const s of this.switches) {
      s.latchedOn = false;
      s.active = false;
    }
    for (const bar of this.barriers) bar.open = false;
  }

  /** Crumbling blocks: once the kiwi lands on one it shakes, then drops away and
   *  reforms after a pause (but never back inside the player). */
  private updateCrumblers(dt: number) {
    const p = this.player;
    const foot = p.y + PLAYER.h;
    for (const c of this.crumblers) {
      if (c.stage === "solid") {
        const standing =
          p.onGround &&
          p.x + PLAYER.w > c.x &&
          p.x < c.x + c.w &&
          Math.abs(foot - c.y) <= SURF_EPS;
        if (standing) {
          c.stage = "shaking";
          c.timer = CRUMBLE_SHAKE;
        }
      } else if (c.stage === "shaking") {
        c.timer -= dt;
        if (c.timer <= 0) {
          c.stage = "gone";
          c.timer = CRUMBLE_RESPAWN;
        }
      } else {
        c.timer -= dt;
        const clear = !aabb(this.playerRect(), {
          x: c.x,
          y: c.y,
          w: c.w,
          h: c.h,
        });
        if (c.timer <= 0 && clear) c.stage = "solid";
      }
    }
  }

  /** Advance each crusher's slam cycle: set its current top (`y`) and cycle
   *  position (which `checkHazards` reads for the lethal window). */
  private updateCrushers() {
    for (const c of this.crushers) {
      c.cyclePos = mod(this.time / c.period + (c.phase ?? 0), 1);
      c.y = c.baseY + crusherOffset(c.cyclePos) * c.range;
    }
  }

  /** Falling rocks: arm → shake (telegraph) → fall (lethal) → shatter → re-arm. */
  private updateDroppers(dt: number) {
    const p = this.player;
    const pr = this.playerRect();
    for (const d of this.droppers) {
      switch (d.stage) {
        case "armed": {
          const under = pr.x + pr.w > d.x && pr.x < d.x + d.w && p.y > d.baseY;
          if (under) {
            d.stage = "shaking";
            d.timer = DROP_TELEGRAPH;
          }
          break;
        }
        case "shaking":
          d.timer -= dt;
          if (d.timer <= 0) {
            d.stage = "falling";
            d.vy = 0;
          }
          break;
        case "falling":
          d.vy = Math.min(d.vy + GRAVITY * dt, MAX_FALL);
          d.curY += d.vy * dt;
          if (d.curY >= d.restY) {
            d.curY = d.restY;
            d.stage = "gone";
            d.timer = DROP_RESET;
          }
          break;
        case "gone":
          d.timer -= dt;
          if (d.timer <= 0) {
            d.curY = d.baseY;
            d.stage = "armed";
          }
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

  /** @returns true if the step should bail — a hit started the death sequence. */
  private checkHazards(): boolean {
    const p = this.player;
    // pit
    if (p.y > DEATH_Y) return this.startDeath(true);
    if (p.invuln > 0) return false;

    const pr = this.playerRect();
    for (const s of this.spikes) {
      // slightly forgiving spike hitbox
      if (aabb(pr, { x: s.x + 4, y: s.y + 6, w: s.w - 8, h: s.h - 6 }))
        return this.startDeath(false);
    }
    // enemies + flyers: a descending landing on the head is a STOMP (kill +
    // bounce); any other contact costs a life.
    for (const e of this.enemies) {
      if (e.dead) continue;
      if (!aabb(pr, { x: e.x + 4, y: e.y + 4, w: e.w - 8, h: e.h - 6 })) continue;
      if (this.isStomp(e.y, e.h)) this.stompMob(e);
      else return this.startDeath(false);
    }
    for (const f of this.flyers) {
      if (f.dead) continue;
      if (!aabb(pr, { x: f.x + 4, y: f.y + 4, w: f.w - 8, h: f.h - 8 })) continue;
      if (this.isStomp(f.y, f.h)) this.stompMob(f);
      else return this.startDeath(false);
    }
    for (const c of this.crushers) {
      // lethal only during the slam + bottom hold (safe while raised/retracting)
      if (c.cyclePos < CRUSH_LETHAL_FROM || c.cyclePos > CRUSH_LETHAL_TO) continue;
      if (aabb(pr, { x: c.x + 3, y: c.y + 3, w: c.w - 6, h: c.h - 3 }))
        return this.startDeath(false);
    }
    for (const d of this.droppers) {
      if (d.stage !== "falling") continue;
      if (aabb(pr, { x: d.x + 4, y: d.curY + 4, w: d.w - 8, h: d.h - 6 }))
        return this.startDeath(false);
    }
    return false;
  }

  /** True when the kiwi is descending onto the upper part of a mob (head-bop). */
  private isStomp(topY: number, h: number): boolean {
    const p = this.player;
    return p.vy > 0 && p.y + PLAYER.h <= topY + h * STOMP_TOP_FRAC;
  }

  /** Defeat the mob under the kiwi's feet: kill it, bounce, score, puff + sfx. */
  private stompMob(m: { dead: boolean; x: number; y: number; w: number; h: number }) {
    m.dead = true;
    const p = this.player;
    p.vy = STOMP_BOUNCE;
    p.onGround = false;
    p.airJumpsLeft = AIR_JUMPS; // refill so stomps chain into more stomps
    p.dashAir = false;
    p.squash = 0.14;
    this.score += STOMP_SCORE;
    this.emitPuff(m.x + m.w / 2, m.y + m.h / 2);
    this.cb.onSfx?.("stomp");
  }

  /** Begin the death animation (a pop-up + feather burst, or just a burst for a
   *  pit fall). @returns true so `checkHazards` bails the rest of the step. */
  private startDeath(isPit: boolean): boolean {
    if (this.deathT > 0) return true; // already dying
    this.lives--;
    this.cb.onSfx?.("death");
    this.emitDeathBurst();
    this.deathHop = !isPit;
    if (this.deathHop) {
      const p = this.player;
      p.vy = DEATH_HOP_V; // the classic pop before the fall
      p.vx = 0;
      p.onGround = false;
    }
    this.deathT = DEATH_TIME;
    this.pushHud(true);
    return true;
  }

  /** Play out the death animation, then resolve it (world stays frozen). */
  private updateDeath(dt: number) {
    this.deathT -= dt;
    if (this.deathHop) {
      const p = this.player;
      p.vy = Math.min(p.vy + GRAVITY * dt, MAX_FALL);
      p.y += p.vy * dt; // free fall off-screen — no collision during death
    }
    this.updateParticles(dt);
    this.updateEffects(dt);
    this.pushHud();
    if (this.deathT <= 0) this.resolveDeath();
  }

  /** Apply the consequence once the death animation has finished. */
  private resolveDeath() {
    this.deathT = 0;
    this.particles = [];
    if (this.lives <= 0) {
      this.gameOver();
      return;
    }
    if (this.diff.restartLevelOnHit) {
      // Hard: a hit sends you back to the start of the level.
      this.dropLevelCoins();
      this.buildLevel(this.index);
    } else {
      // Easy/Medium: respawn at the start; mobs reset + revived, coins kept.
      for (const e of this.enemies) {
        e.x = e.originX;
        e.dir = 1;
        e.dead = false;
      }
      for (const f of this.flyers) {
        f.x = f.originX;
        f.dir = 1;
        f.dead = false;
      }
      this.resetMechanicsForRespawn();
      this.player = blankPlayer();
      this.player.x = this.level.spawn.x;
      this.player.y = this.level.spawn.y;
    }
    this.player.invuln = INVULN_S;
    this.pushHud(true);
  }

  /* ------------------------------------------------------------- particles */

  /** A burst of kiwi feathers where the kiwi died. */
  private emitDeathBurst() {
    const cx = this.player.x + PLAYER.w / 2;
    const cy = this.player.y + PLAYER.h / 2;
    const colors = ["#7a4a2b", "#a9743f", "#e8dcc0", "#ffffff"];
    for (let i = 0; i < 16; i++) {
      const a = (Math.PI * 2 * i) / 16 + Math.random() * 0.4;
      const sp = 120 + Math.random() * 160;
      this.particles.push({
        x: cx,
        y: cy,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 120,
        life: 0.9 + Math.random() * 0.5,
        maxLife: 1.4,
        size: 4 + Math.random() * 4,
        color: colors[i % colors.length]!,
        spin: (Math.random() - 0.5) * 12,
      });
    }
  }

  /** A small dust puff where a mob was stomped. */
  private emitPuff(cx: number, cy: number) {
    for (let i = 0; i < 8; i++) {
      const a = (Math.PI * 2 * i) / 8;
      const sp = 60 + Math.random() * 90;
      this.particles.push({
        x: cx,
        y: cy,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 40,
        life: 0.35 + Math.random() * 0.25,
        maxLife: 0.6,
        size: 3 + Math.random() * 3,
        color: i % 2 ? "#ffffff" : "#ffe6a8",
        spin: 0,
      });
    }
  }

  private updateParticles(dt: number) {
    if (this.particles.length === 0) return;
    for (const pt of this.particles) {
      pt.vy += PARTICLE_GRAVITY * dt;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.life -= dt;
    }
    this.particles = this.particles.filter((pt) => pt.life > 0);
  }

  /* ------------------------------------------------------- jump VFX sprites */

  private feetX(): number {
    return this.player.x + PLAYER.w / 2;
  }
  private feetY(): number {
    return this.player.y + PLAYER.h;
  }

  /** Play a one-shot animated effect at the kiwi's feet. */
  private spawnFx(
    frames: HTMLImageElement[],
    w: number,
    dur: number,
    anchor: "bottom" | "center",
  ) {
    if (frames.length === 0) return; // art missing → no effect, game unaffected
    this.effects.push({
      frames,
      x: this.feetX(),
      y: this.feetY(),
      t: 0,
      dur,
      w,
      anchor,
    });
  }

  private updateEffects(dt: number) {
    if (this.effects.length === 0) return;
    for (const e of this.effects) e.t += dt;
    this.effects = this.effects.filter((e) => e.t < e.dur);
  }

  private drawEffects() {
    const ctx = this.ctx;
    for (const e of this.effects) {
      const idx = Math.min(
        e.frames.length - 1,
        Math.floor((e.t / e.dur) * e.frames.length),
      );
      const img = e.frames[idx]!;
      if (e.x + e.w < this.camX || e.x - e.w > this.camX + LOGICAL_W) continue;
      const h = e.w * (img.height / img.width);
      const dx = e.x - e.w / 2;
      const dy = e.anchor === "bottom" ? e.y - h : e.y - h / 2;
      ctx.drawImage(img, dx, dy, e.w, h);
    }
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
    this.drawIce();
    this.drawMovers();
    this.drawBelts();
    this.drawCrumblers();
    this.drawSprings();
    this.drawGate();
    this.drawSwitches();
    this.drawBarriers();
    this.drawCoins();
    this.drawKeys();
    this.drawSpikes();
    this.drawBoxes();
    this.drawCrushers();
    this.drawDroppers();
    this.drawEnemies();
    this.drawFlyers();
    this.drawWind();
    this.drawFinish();
    this.drawEffects();
    this.drawPlayer();
    this.drawParticles();
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
    const { floorStart: s, floorMid: m, floorEnd: e } = this.assets;
    for (const p of this.platforms) {
      // cull off-screen
      if (p.x + p.w < this.camX || p.x > this.camX + LOGICAL_W) continue;
      if (!m) {
        ctx.fillStyle = pal.ground;
        ctx.fillRect(p.x, p.y, p.w, p.h);
        ctx.fillStyle = pal.grass;
        ctx.fillRect(p.x, p.y, p.w, 10);
      } else if (p.h > 60) {
        // Ground: solid dirt fill (never shows background through seams/overhang)
        // with the floor tileset laid start | middle… | end. Tiles are scaled to
        // the rect height and shifted up so the grass tips sit on the walk line.
        // Each tile is drawn a hair wider than its slot (FLOOR_OVERLAP) so the
        // next tile paints over it — no sub-pixel seam ever shows through.
        const scale = p.h / m.height;
        const top = p.y - m.height * FLOOR_GRASS_TOP * scale;
        const sW = (s?.width ?? 0) * scale;
        const eW = (e?.width ?? 0) * scale;
        const mW = m.width * scale;
        const ov = FLOOR_OVERLAP;
        ctx.fillStyle = FLOOR_DIRT;
        // Back only the region behind the OPAQUE middle tiles, NOT the caps. The start/end cap
        // tiles have rounded grass edges with transparent corners; a full-width square fill pokes
        // brown out past that rounded overhang. Insetting the backing to [sW, w-eW] lets the caps'
        // rounded ends show the sky behind them (the intended platform-end look), not a brown block.
        ctx.fillRect(p.x + sW, p.y, Math.max(0, p.w - sW - eW), p.h);
        if (s) ctx.drawImage(s, p.x, top, sW + ov, p.h);
        const midEnd = p.x + p.w - eW;
        for (let x = p.x + sW; x < midEnd; x += mW) {
          const w = Math.min(mW, midEnd - x);
          const sw = (m.width * w) / mW; // crop the last middle tile clean
          ctx.drawImage(m, 0, 0, sw, m.height, x, top, w + ov, p.h);
        }
        if (e) ctx.drawImage(e, p.x + p.w - eW, top, eW, p.h);
      } else if (this.assets.platform) {
        // Floating block/ledge: the rounded Platform_Grass piece at natural
        // aspect (a proper floating platform, not a cut-out floor chunk). Grass
        // surface anchored to the walk line; dirt hangs below the thin rect.
        const plat = this.assets.platform;
        const dh = p.w * (plat.height / plat.width);
        ctx.drawImage(plat, p.x, p.y - dh * PLATFORM_GRASS_TOP, p.w, dh);
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
      if (e.dead) continue;
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
      if (f.dead) continue;
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

  /** A frosty crust on the surface line so ice patches read as slippery. */
  private drawIce() {
    const ctx = this.ctx;
    for (const ice of this.iceList) {
      if (ice.x + ice.w < this.camX || ice.x > this.camX + LOGICAL_W) continue;
      ctx.fillStyle = "rgba(205,238,255,0.9)";
      ctx.fillRect(ice.x, ice.y, ice.w, 7);
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.fillRect(ice.x, ice.y, ice.w, 2); // bright sheen on the walk line
      ctx.fillStyle = "rgba(120,180,220,0.5)";
      ctx.fillRect(ice.x, ice.y + 6, ice.w, 2);
    }
  }

  /** Conveyor belts: a rubber slab with tread arrows scrolling toward `dir`. */
  private drawBelts() {
    const ctx = this.ctx;
    for (const b of this.belts) {
      if (b.x + b.w < this.camX || b.x > this.camX + LOGICAL_W) continue;
      ctx.fillStyle = "#3a3f4b";
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = "rgba(255,255,255,0.15)";
      ctx.fillRect(b.x, b.y, b.w, 3);
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      ctx.fillRect(b.x, b.y + b.h - 3, b.w, 3);
      ctx.save();
      ctx.beginPath();
      ctx.rect(b.x, b.y, b.w, b.h);
      ctx.clip();
      ctx.fillStyle = "rgba(255,210,90,0.9)";
      const spacing = 26;
      const my = b.y + b.h / 2;
      const scroll = mod(this.time * b.speed * b.dir * 0.25, spacing);
      for (let x = b.x - spacing + scroll; x < b.x + b.w + spacing; x += spacing) {
        ctx.beginPath();
        if (b.dir > 0) {
          ctx.moveTo(x, my - 5);
          ctx.lineTo(x + 7, my);
          ctx.lineTo(x, my + 5);
        } else {
          ctx.moveTo(x + 7, my - 5);
          ctx.lineTo(x, my);
          ctx.lineTo(x + 7, my + 5);
        }
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }
  }

  /** Crumbling blocks: earthy and cracked, jittering while shaking, gone once
   *  they drop. */
  private drawCrumblers() {
    const ctx = this.ctx;
    for (const c of this.crumblers) {
      if (c.stage === "gone") continue;
      if (c.x + c.w < this.camX || c.x > this.camX + LOGICAL_W) continue;
      const shake = c.stage === "shaking" ? Math.sin(this.time * 60) * 2 : 0;
      ctx.save();
      ctx.translate(shake, 0);
      ctx.fillStyle = "#8a6a4a";
      ctx.fillRect(c.x, c.y, c.w, c.h);
      ctx.fillStyle = "#6f5238";
      ctx.fillRect(c.x, c.y, c.w, 5);
      ctx.strokeStyle = "rgba(30,20,10,0.6)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(c.x + c.w * 0.3, c.y);
      ctx.lineTo(c.x + c.w * 0.42, c.y + c.h);
      ctx.moveTo(c.x + c.w * 0.72, c.y);
      ctx.lineTo(c.x + c.w * 0.6, c.y + c.h);
      ctx.moveTo(c.x + c.w * 0.5, c.y + c.h * 0.45);
      ctx.lineTo(c.x + c.w * 0.5, c.y + c.h);
      ctx.stroke();
      ctx.restore();
    }
  }

  /** Slamming crushers: a studded block on a guide rail with a spiked underside,
   *  tinted red while its strike is lethal. */
  private drawCrushers() {
    const ctx = this.ctx;
    for (const c of this.crushers) {
      if (c.x + c.w < this.camX || c.x > this.camX + LOGICAL_W) continue;
      const lethal =
        c.cyclePos >= CRUSH_LETHAL_FROM && c.cyclePos <= CRUSH_LETHAL_TO;
      // guide rail from the top of the view down to the block
      ctx.fillStyle = "rgba(40,44,52,0.45)";
      ctx.fillRect(c.x + c.w / 2 - 3, 0, 6, Math.max(0, c.y));
      ctx.fillStyle = lethal ? "#7a3b3b" : "#555b66";
      ctx.fillRect(c.x, c.y, c.w, c.h);
      ctx.fillStyle = "rgba(255,255,255,0.12)";
      ctx.fillRect(c.x, c.y, c.w, 5);
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      for (let sx = c.x + 9; sx < c.x + c.w - 6; sx += 18) {
        ctx.beginPath();
        ctx.arc(sx, c.y + 11, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      // spiked bottom face — the business end
      ctx.fillStyle = "#c9ccd4";
      const teeth = Math.max(2, Math.round(c.w / 16));
      const tw = c.w / teeth;
      for (let i = 0; i < teeth; i++) {
        const x = c.x + i * tw;
        ctx.beginPath();
        ctx.moveTo(x, c.y + c.h);
        ctx.lineTo(x + tw / 2, c.y + c.h + 10);
        ctx.lineTo(x + tw, c.y + c.h);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  /** Falling rocks: a chunky boulder that jitters as it lets go, then plummets. */
  private drawDroppers() {
    const ctx = this.ctx;
    for (const d of this.droppers) {
      if (d.stage === "gone") continue;
      if (d.x + d.w < this.camX || d.x > this.camX + LOGICAL_W) continue;
      const jit = d.stage === "shaking" ? Math.sin(this.time * 70) * 2 : 0;
      const x = d.x + jit;
      const y = d.curY;
      ctx.fillStyle = "#6b6e73";
      ctx.beginPath();
      ctx.moveTo(x + d.w * 0.5, y);
      ctx.lineTo(x + d.w, y + d.h * 0.4);
      ctx.lineTo(x + d.w * 0.82, y + d.h);
      ctx.lineTo(x + d.w * 0.18, y + d.h);
      ctx.lineTo(x, y + d.h * 0.4);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.14)";
      ctx.beginPath();
      ctx.moveTo(x + d.w * 0.5, y);
      ctx.lineTo(x + d.w, y + d.h * 0.4);
      ctx.lineTo(x + d.w * 0.55, y + d.h * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.4)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  /** Wind zones: a faint tint plus streaks scrolling toward the push direction,
   *  so a gust is always visible before it shoves you. */
  private drawWind() {
    const ctx = this.ctx;
    for (const z of this.windZones) {
      if (z.x + z.w < this.camX || z.x > this.camX + LOGICAL_W) continue;
      const dir = z.push >= 0 ? 1 : -1;
      ctx.save();
      ctx.beginPath();
      ctx.rect(z.x, z.y, z.w, z.h);
      ctx.clip();
      ctx.fillStyle =
        dir > 0 ? "rgba(180,220,255,0.08)" : "rgba(255,224,190,0.08)";
      ctx.fillRect(z.x, z.y, z.w, z.h);
      ctx.strokeStyle = "rgba(255,255,255,0.32)";
      ctx.lineWidth = 2;
      const spacing = 48;
      const speed = Math.abs(z.push) * 1.4 + 60;
      const scroll = mod(this.time * speed * dir, spacing);
      const rows = 6;
      for (let r = 0; r < rows; r++) {
        const yy = z.y + 14 + (r * (z.h - 28)) / rows + (r % 2) * 7;
        for (let x = z.x - spacing + scroll; x < z.x + z.w + spacing; x += spacing) {
          ctx.beginPath();
          ctx.moveTo(x, yy);
          ctx.lineTo(x + dir * 22, yy);
          ctx.stroke();
        }
      }
      ctx.restore();
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

  private drawBoxes() {
    const ctx = this.ctx;
    for (const b of this.boxes) {
      if (b.x + b.w < this.camX || b.x > this.camX + LOGICAL_W) continue;
      ctx.fillStyle = "#a9743f"; // crate
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = "#c48a52";
      ctx.fillRect(b.x + 3, b.y + 3, b.w - 6, b.h - 6); // face
      ctx.strokeStyle = "#5e3c1e";
      ctx.lineWidth = 3;
      ctx.strokeRect(b.x + 1.5, b.y + 1.5, b.w - 3, b.h - 3);
      // diagonal planks
      ctx.beginPath();
      ctx.moveTo(b.x + 3, b.y + 3);
      ctx.lineTo(b.x + b.w - 3, b.y + b.h - 3);
      ctx.moveTo(b.x + b.w - 3, b.y + 3);
      ctx.lineTo(b.x + 3, b.y + b.h - 3);
      ctx.stroke();
    }
  }

  private drawSwitches() {
    const ctx = this.ctx;
    for (const s of this.switches) {
      if (s.x + s.w < this.camX || s.x > this.camX + LOGICAL_W) continue;
      const down = s.active ? 4 : 0; // plate presses down when active
      // base
      ctx.fillStyle = "#33404a";
      ctx.fillRect(s.x, s.y - 4, s.w, s.h + 4);
      // plate
      ctx.fillStyle = s.active ? "#39d98a" : "#e06a5a";
      ctx.fillRect(s.x + 3, s.y - 10 + down, s.w - 6, 10 - down);
      // a lever nub for latch switches, a flat plate otherwise
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.fillRect(s.x + 3, s.y - 10 + down, s.w - 6, 2);
    }
  }

  private drawBarriers() {
    const ctx = this.ctx;
    for (const bar of this.barriers) {
      if (bar.open) continue; // open = passable = invisible
      if (bar.x + bar.w < this.camX || bar.x > this.camX + LOGICAL_W) continue;
      ctx.fillStyle = "#4a5560"; // steel barrier
      ctx.fillRect(bar.x, bar.y, bar.w, bar.h);
      ctx.fillStyle = "#6b7784";
      for (let y = bar.y + 5; y < bar.y + bar.h; y += 16) {
        ctx.fillRect(bar.x + 2, y, bar.w - 4, 4);
      }
      ctx.strokeStyle = "#2b333a";
      ctx.lineWidth = 2;
      ctx.strokeRect(bar.x + 1, bar.y + 1, bar.w - 2, bar.h - 2);
    }
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
    const dashK = p.dashTime > 0 ? 1 : 0; // stretch into the dash for motion feel
    const sy = (1 - 0.18 * squashK) * (1 - 0.12 * dashK);
    const sx = (1 + 0.12 * squashK) * (1 + 0.22 * dashK);

    const cx = p.x + PLAYER.w / 2;
    const footY = p.y + PLAYER.h + bob;
    // death: tumble faster as the animation plays out
    const spin = this.deathT > 0 ? (DEATH_TIME - this.deathT) * 14 : 0;

    ctx.save();
    ctx.translate(cx, footY);
    ctx.scale(p.facing * sx, sy);
    ctx.rotate((p.facing === 1 ? tilt : -tilt) + spin);

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

  /** Death feathers (spinning flecks) and stomp puffs (round dust), fading out. */
  private drawParticles() {
    const ctx = this.ctx;
    for (const pt of this.particles) {
      ctx.globalAlpha = clamp(pt.life / pt.maxLife, 0, 1);
      ctx.fillStyle = pt.color;
      if (pt.spin) {
        ctx.save();
        ctx.translate(pt.x, pt.y);
        ctx.rotate(pt.life * pt.spin);
        ctx.fillRect(-pt.size / 2, -pt.size / 4, pt.size, pt.size / 2); // feather
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2); // dust puff
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
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
    airJumpsLeft: AIR_JUMPS,
    dashTime: 0,
    dashCd: 0,
    dashDir: 1,
    dashAir: false,
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
