"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { AudioManager } from "@/lib/game/audio";
import { DIFFICULTIES } from "@/lib/game/difficulty";
import {
  KiwiGame,
  loadAssets,
  loadKiwiSprite,
  type GameAssets,
  type HudState,
  type KiwiSprite,
  type Outcome,
} from "@/lib/game/engine";
import { LEVELS } from "@/lib/game/levels";
import type { Difficulty } from "@/lib/game/types";

const MUTE_KEY = "kiwi-runner-muted";

type Screen =
  | "loading"
  | "menu"
  | "difficulty"
  | "controls"
  | "playing"
  | "paused"
  | "levelComplete"
  | "gameOver"
  | "victory";

type Summary = { level: number; coins: number; score: number };

const HINT_SEEN_KEY = "kiwi-runner-controls-seen";

// Load may still be in flight if a run somehow starts early; all-null means the
// engine draws every procedural fallback.
const EMPTY_ASSETS: GameAssets = {
  idle: null,
  cloudBig: null,
  cloudSmall: null,
  thorns: null,
  floorStart: null,
  floorMid: null,
  floorEnd: null,
  platform: null,
  jumpTakeoff: [],
  jumpLand: [],
  doubleJump: [],
  drySoil: null,
  bgTrees: [],
  midTrees: [],
  batSprite: null,
  ratWalk: null,
  deadKiwi: null,
};

export function KiwiRunner() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<KiwiGame | null>(null);
  const spriteRef = useRef<KiwiSprite | null>(null);
  const assetsRef = useRef<GameAssets | null>(null);
  const audioRef = useRef<AudioManager | null>(null);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [screen, setScreen] = useState<Screen>("loading");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [hud, setHud] = useState<HudState | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [confirmQuit, setConfirmQuit] = useState(false);
  const [locked, setLocked] = useState(false); // disables overlay buttons mid-transition
  const [muted, setMuted] = useState(
    () =>
      typeof localStorage !== "undefined" &&
      localStorage.getItem(MUTE_KEY) === "1",
  );
  const [isFullscreen, setIsFullscreen] = useState(false);
  // Coarse pointer = touch device → show on-screen controls. Read lazily so it
  // is correct on first client render without a setState-in-effect.
  const [isTouch] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(pointer: coarse)").matches,
  );

  /* ---- preload art once, then reveal the menu ---- */
  useEffect(() => {
    let alive = true;
    Promise.all([loadKiwiSprite(), loadAssets()]).then(([sprite, assets]) => {
      if (!alive) return;
      spriteRef.current = sprite; // null is fine — engine falls back
      assetsRef.current = assets; // per-asset nulls fall back too
      setScreen("menu");
    });
    return () => {
      alive = false;
      gameRef.current?.destroy();
      audioRef.current?.stopMusic();
      if (hintTimer.current) clearTimeout(hintTimer.current);
    };
  }, []);

  /* ---- engine → UI callbacks ---- */
  const showOutcome = useCallback((o: Outcome, s: Summary) => {
    setSummary(s);
    setScreen(o);
  }, []);

  const showHint = useCallback((msg: string | null) => {
    setHint(msg);
    if (hintTimer.current) clearTimeout(hintTimer.current);
    if (msg) hintTimer.current = setTimeout(() => setHint(null), 2500);
  }, []);

  const requestPause = useCallback(() => {
    gameRef.current?.pause();
    setScreen("paused");
  }, []);

  /* ---- transitions ---- */
  const withLock = (fn: () => void) => {
    if (locked) return;
    setLocked(true);
    fn();
    setTimeout(() => setLocked(false), 300);
  };

  const startRun = useCallback(
    (diff: Difficulty) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      gameRef.current?.destroy();
      // Unlock + preload audio inside this click gesture (browser autoplay rule).
      if (!audioRef.current) audioRef.current = new AudioManager();
      audioRef.current.setMuted(muted);
      void audioRef.current.init();
      const game = new KiwiGame(
        canvas,
        spriteRef.current,
        assetsRef.current ?? EMPTY_ASSETS,
        DIFFICULTIES[diff],
        LEVELS,
        {
          onHud: setHud,
          onOutcome: showOutcome,
          onHint: showHint,
          onPauseRequest: requestPause,
          onSfx: (name) => audioRef.current?.sfx(name),
        },
      );
      gameRef.current = game;
      game.startRun();

      // First-ever play: pause on the controls card before anything moves.
      const seen =
        typeof localStorage !== "undefined" &&
        localStorage.getItem(HINT_SEEN_KEY);
      if (!seen) {
        game.pause();
        setScreen("controls");
      } else {
        setScreen("playing");
      }
    },
    [showOutcome, showHint, requestPause, muted],
  );

  const dismissControls = () => {
    localStorage.setItem(HINT_SEEN_KEY, "1");
    gameRef.current?.resume();
    setScreen("playing");
  };

  const resume = useCallback(() => {
    setConfirmQuit(false);
    gameRef.current?.resume();
    setScreen("playing");
  }, []);

  // Fullscreen the game frame (must be called inside a click gesture).
  const exitFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  };
  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      exitFullscreen();
    } else {
      const el = frameRef.current;
      el?.requestFullscreen?.().catch(() => {}); // unsupported / denied → stay windowed
    }
  };

  const quitToMenu = () => {
    gameRef.current?.destroy();
    gameRef.current = null;
    setConfirmQuit(false);
    exitFullscreen();
    setScreen("menu");
  };

  const nextLevel = () =>
    withLock(() => {
      gameRef.current?.nextLevel();
      setScreen("playing");
    });

  // Game over = run over: restart the whole journey from Level 1.
  const retry = () =>
    withLock(() => {
      gameRef.current?.startRun();
      setScreen("playing");
    });

  const playAgain = () =>
    withLock(() => {
      gameRef.current?.startRun();
      setScreen("playing");
    });

  /* ---- Esc resumes from pause (engine emits pause; React owns resume) ---- */
  useEffect(() => {
    if (screen !== "paused") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Escape" && !confirmQuit) resume();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [screen, confirmQuit, resume]);

  /* ---- audio: per-level music + pause, driven by the current screen ---- */
  const level = hud?.level;
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.setMuted(muted);
    if (screen === "playing") {
      audio.resume();
      const theme =
        level != null ? LEVELS.find((l) => l.id === level)?.theme : undefined;
      if (theme) audio.music(theme);
    } else if (screen === "paused" || screen === "controls") {
      audio.pause(); // hold music silent under the overlay, keep its position
    } else if (screen !== "levelComplete") {
      // menu / difficulty / gameOver / victory / loading — stop the music
      audio.stopMusic();
      audio.resume();
    }
  }, [screen, level, muted]);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      audioRef.current?.setMuted(next);
      if (typeof localStorage !== "undefined")
        localStorage.setItem(MUTE_KEY, next ? "1" : "0");
      return next;
    });
  }, []);

  /* ---- track fullscreen so the toggle button shows the right icon ---- */
  useEffect(() => {
    const onFs = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  /* ---- touch button helpers ---- */
  const move = (dir: "left" | "right", on: boolean) =>
    gameRef.current?.setMove(dir, on);
  const jump = (down: boolean) =>
    down ? gameRef.current?.jumpDown() : gameRef.current?.jumpUp();
  const dash = () => gameRef.current?.dashDown();

  const playing =
    screen === "playing" || screen === "paused" || screen === "controls";

  return (
    <div className="flex min-h-dvh w-full flex-col items-center justify-center gap-3 bg-gradient-to-b from-sky-300 to-emerald-200 p-3">
      <div
        ref={frameRef}
        className="relative aspect-video w-[min(94vw,calc(86vh*16/9))] overflow-hidden rounded-2xl border-4 border-white/70 bg-sky-200 shadow-2xl [&:fullscreen]:aspect-auto [&:fullscreen]:h-screen [&:fullscreen]:w-screen [&:fullscreen]:rounded-none [&:fullscreen]:border-0 [&:fullscreen]:bg-black"
      >
        {/* game canvas — the engine keeps it a centred 16:9 box (letterboxes on
            black in fullscreen); its CSS size is set in setupCanvas */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 m-auto"
          aria-label="Kiwi Runner game canvas"
        />

          {/* HUD */}
          {playing && hud && (
            <Hud
              hud={hud}
              muted={muted}
              isFullscreen={isFullscreen}
              onPause={requestPause}
              onToggleMute={toggleMute}
              onToggleFullscreen={toggleFullscreen}
            />
          )}

          {/* transient hint (min-coin gate, etc.) */}
          {hint && screen === "playing" && (
            <div className="pointer-events-none absolute top-16 left-1/2 -translate-x-1/2 rounded-full bg-black/70 px-4 py-2 text-sm font-semibold text-white">
              {hint}
            </div>
          )}

          {/* touch controls */}
          {screen === "playing" && isTouch && (
            <TouchControls move={move} jump={jump} dash={dash} />
          )}

          {/* screens */}
          {screen === "loading" && (
            <Overlay>
              <p className="animate-pulse text-lg font-semibold text-white">
                Loading…
              </p>
            </Overlay>
          )}

          {screen === "menu" && (
            <Overlay>
              <h1 className="text-5xl font-black tracking-tight text-white drop-shadow-[0_3px_0_rgba(0,0,0,0.3)]">
                🥝 Kiwi Runner
              </h1>
              <p className="mt-2 text-white/90">
                Run, jump, grab coins, reach the flag.
              </p>
              <GameButton
                className="mt-8"
                onClick={() => setScreen("difficulty")}
              >
                Start
              </GameButton>
            </Overlay>
          )}

          {screen === "difficulty" && (
            <Overlay>
              <h2 className="text-3xl font-black text-white">
                Choose difficulty
              </h2>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                {(Object.keys(DIFFICULTIES) as Difficulty[]).map((d) => (
                  <button
                    key={d}
                    onClick={() => setDifficulty(d)}
                    aria-pressed={difficulty === d}
                    className={`min-w-[120px] rounded-xl border-2 px-5 py-4 text-center font-bold transition ${
                      difficulty === d
                        ? "border-amber-300 bg-amber-400 text-amber-950 shadow-lg"
                        : "border-white/40 bg-white/15 text-white hover:bg-white/25"
                    }`}
                  >
                    <span className="block text-lg">
                      {DIFFICULTIES[d].label}
                    </span>
                    <span className="mt-1 block text-xs font-medium opacity-90">
                      {DIFFICULTIES[d].lives} lives
                      {DIFFICULTIES[d].timeLimitSec
                        ? ` · ${DIFFICULTIES[d].timeLimitSec}s`
                        : " · no timer"}
                    </span>
                  </button>
                ))}
              </div>
              <div className="mt-8 flex gap-3">
                <GameButton variant="ghost" onClick={() => setScreen("menu")}>
                  Back
                </GameButton>
                <GameButton
                  onClick={() => withLock(() => startRun(difficulty))}
                  disabled={locked}
                >
                  Play {DIFFICULTIES[difficulty].label}
                </GameButton>
              </div>
            </Overlay>
          )}

          {screen === "controls" && (
            <Overlay>
              <h2 className="text-2xl font-black text-white">How to play</h2>
              <ul className="mt-4 space-y-1 text-center text-white/90">
                <li>← → or A D — move</li>
                <li>Space / ↑ / W — jump (hold higher, tap again to double-jump)</li>
                <li>Shift / K — dash (a burst across gaps)</li>
                <li>Jump on a mob&apos;s head to stomp it — any other touch hurts</li>
                <li>Leap up through floating ledges; land on top</li>
                <li>Esc — pause · 🔊 mute · ⛶ fullscreen</li>
                {isTouch && <li>On-screen buttons on touch devices</li>}
              </ul>
              <GameButton className="mt-6" onClick={dismissControls}>
                Got it!
              </GameButton>
            </Overlay>
          )}

          {screen === "paused" && !confirmQuit && (
            <Overlay>
              <h2 className="text-3xl font-black text-white">Paused</h2>
              <div className="mt-6 flex flex-col gap-3">
                <GameButton onClick={resume}>Resume</GameButton>
                <GameButton
                  variant="ghost"
                  onClick={() => setConfirmQuit(true)}
                >
                  Quit to menu
                </GameButton>
              </div>
            </Overlay>
          )}

          {screen === "paused" && confirmQuit && (
            <Overlay>
              <h2 className="text-2xl font-black text-white">Quit this run?</h2>
              <p className="mt-2 text-white/90">
                Your progress this run will be lost.
              </p>
              <div className="mt-6 flex gap-3">
                <GameButton
                  variant="ghost"
                  onClick={() => setConfirmQuit(false)}
                >
                  Keep playing
                </GameButton>
                <GameButton variant="danger" onClick={quitToMenu}>
                  Quit
                </GameButton>
              </div>
            </Overlay>
          )}

          {screen === "levelComplete" && summary && (
            <Overlay>
              <h2 className="text-3xl font-black text-white">
                Level {summary.level} clear! 🎉
              </h2>
              <p className="mt-2 text-white/90">
                Coins {summary.coins} · Score {summary.score}
              </p>
              <GameButton
                className="mt-6"
                onClick={nextLevel}
                disabled={locked}
              >
                Next level
              </GameButton>
            </Overlay>
          )}

          {screen === "gameOver" && summary && (
            <Overlay>
              <h2 className="text-3xl font-black text-white">Game Over</h2>
              <p className="mt-2 text-white/90">
                Coins {summary.coins} · Score {summary.score}
              </p>
              <p className="mt-1 text-sm text-white/70">
                Out of lives — the journey restarts at Level 1.
              </p>
              <div className="mt-6 flex gap-3">
                <GameButton onClick={retry} disabled={locked}>
                  Restart from Level 1
                </GameButton>
                <GameButton variant="ghost" onClick={quitToMenu}>
                  Menu
                </GameButton>
              </div>
            </Overlay>
          )}

          {screen === "victory" && summary && (
            <Overlay>
              <h1 className="text-4xl font-black text-white drop-shadow-[0_3px_0_rgba(0,0,0,0.3)]">
                🏆 You win!
              </h1>
              <p className="mt-3 text-lg text-white/90">
                Total coins {summary.coins} · Score {summary.score}
              </p>
              <GameButton
                className="mt-6"
                onClick={playAgain}
                disabled={locked}
              >
                Play again
              </GameButton>
            </Overlay>
          )}
      </div>

      <p className="text-center text-sm text-emerald-900/70">
        Desktop: arrows / WASD to move, Space to jump, Esc to pause. Use the ⛶
        button in the HUD for fullscreen.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ pieces */

function Hud({
  hud,
  muted,
  isFullscreen,
  onPause,
  onToggleMute,
  onToggleFullscreen,
}: {
  hud: HudState;
  muted: boolean;
  isFullscreen: boolean;
  onPause: () => void;
  onToggleMute: () => void;
  onToggleFullscreen: () => void;
}) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-3 text-sm font-bold text-white">
      <div className="flex flex-col gap-1 rounded-lg bg-black/40 px-3 py-1.5">
        <span>
          L{hud.level} · {hud.levelName}
        </span>
        <span className="flex gap-3">
          <span>{"❤️".repeat(Math.max(0, hud.lives))}</span>
          <span>🪙 {hud.coins}</span>
          <span>★ {hud.score}</span>
        </span>
        {hud.minCoins > 0 && (
          <span className="text-xs font-medium text-amber-200">
            flag needs {hud.levelCoins}/{hud.minCoins} coins
          </span>
        )}
        {hud.keysNeed > 0 && (
          <span className="text-xs font-medium text-amber-200">
            🔑 {hud.keysHave}/{hud.keysNeed}
            {hud.keysHave >= hud.keysNeed ? " — gate open" : ""}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        {hud.timeLeft !== null && (
          <span
            className={`rounded-lg bg-black/40 px-3 py-1.5 tabular-nums ${
              hud.timeLeft <= 10 ? "text-red-300" : ""
            }`}
          >
            ⏱️ {hud.timeLeft}
          </span>
        )}
        <button
          onClick={onToggleMute}
          className="pointer-events-auto rounded-lg bg-black/40 px-3 py-1.5 hover:bg-black/60 focus-visible:ring-2 focus-visible:ring-white"
          aria-label={muted ? "Unmute" : "Mute"}
          aria-pressed={muted}
        >
          {muted ? "🔇" : "🔊"}
        </button>
        <button
          onClick={onToggleFullscreen}
          className="pointer-events-auto rounded-lg bg-black/40 px-3 py-1.5 hover:bg-black/60 focus-visible:ring-2 focus-visible:ring-white"
          aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          aria-pressed={isFullscreen}
        >
          {isFullscreen ? "🗗" : "⛶"}
        </button>
        <button
          onClick={onPause}
          className="pointer-events-auto rounded-lg bg-black/40 px-3 py-1.5 hover:bg-black/60 focus-visible:ring-2 focus-visible:ring-white"
          aria-label="Pause"
        >
          ⏸
        </button>
      </div>
    </div>
  );
}

function TouchControls({
  move,
  jump,
  dash,
}: {
  move: (dir: "left" | "right", on: boolean) => void;
  jump: (down: boolean) => void;
  dash: () => void;
}) {
  const pad =
    "pointer-events-auto flex h-16 w-16 select-none items-center justify-center rounded-full bg-white/30 text-2xl font-black text-white backdrop-blur active:bg-white/50";
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between p-4">
      <div className="flex gap-3">
        <button
          className={pad}
          aria-label="Move left"
          onPointerDown={(e) => {
            e.preventDefault();
            move("left", true);
          }}
          onPointerUp={() => move("left", false)}
          onPointerLeave={() => move("left", false)}
          onPointerCancel={() => move("left", false)}
        >
          ◀
        </button>
        <button
          className={pad}
          aria-label="Move right"
          onPointerDown={(e) => {
            e.preventDefault();
            move("right", true);
          }}
          onPointerUp={() => move("right", false)}
          onPointerLeave={() => move("right", false)}
          onPointerCancel={() => move("right", false)}
        >
          ▶
        </button>
      </div>
      <div className="flex items-end gap-3">
        <button
          className={pad}
          aria-label="Dash"
          onPointerDown={(e) => {
            e.preventDefault();
            dash();
          }}
        >
          »
        </button>
        <button
          className={pad}
          aria-label="Jump"
          onPointerDown={(e) => {
            e.preventDefault();
            jump(true);
          }}
          onPointerUp={() => jump(false)}
          onPointerCancel={() => jump(false)}
        >
          ⤒
        </button>
      </div>
    </div>
  );
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/45 px-6 text-center backdrop-blur-sm">
      {children}
    </div>
  );
}

function GameButton({
  children,
  onClick,
  className = "",
  disabled = false,
  variant = "primary",
}: {
  children: React.ReactNode;
  onClick: () => void;
  className?: string;
  disabled?: boolean;
  variant?: "primary" | "ghost" | "danger";
}) {
  const variants = {
    primary: "bg-amber-400 text-amber-950 hover:bg-amber-300",
    ghost: "bg-white/15 text-white hover:bg-white/25",
    danger: "bg-red-500 text-white hover:bg-red-600",
  };
  const styles = variants[variant];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-xl px-6 py-3 text-lg font-black shadow-lg transition focus-visible:ring-4 focus-visible:ring-white/70 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${styles} ${className}`}
    >
      {children}
    </button>
  );
}
