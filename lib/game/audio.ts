/**
 * Tiny Web-Audio manager: gapless looping music + low-latency, overlapping SFX.
 *
 * Web Audio (not <audio>) is used so music loops seamlessly and SFX can
 * retrigger instantly without cloning DOM nodes. Every clip is decoded to an
 * AudioBuffer up front; all files live same-origin under /audio, so the game
 * still works offline once loaded. If Web Audio is unavailable or a file fails
 * to load, the game runs silently — audio is never load-bearing.
 *
 * The AudioContext must be created inside a user gesture (browser autoplay
 * policy), so `init()` is called from the Play button, not on mount.
 */
import type { SfxName } from "./engine";
import type { Level } from "./types";

export type MusicName = Level["theme"];

const SFX_FILES: Record<SfxName, string> = {
  jump: "/audio/jump.mp3",
  coin: "/audio/coin.mp3",
  stomp: "/audio/stomp.mp3",
  death: "/audio/death.mp3",
};

const MUSIC_FILES: Record<MusicName, string> = {
  day: "/audio/music-day.mp3",
  sunset: "/audio/music-sunset.mp3",
  dusk: "/audio/music-dusk.mp3",
  cave: "/audio/music-cave.mp3",
  snow: "/audio/music-snow.mp3",
  night: "/audio/music-night.mp3",
};

export class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private musicSrc: AudioBufferSourceNode | null = null;
  private current: MusicName | null = null; // what is actually playing
  private desired: MusicName | null = null; // what we want playing (may await load)
  private muted = false;

  /** Create the context (inside a user gesture) and preload every clip. Safe to
   *  call again — later calls just resume a suspended context. */
  async init(): Promise<void> {
    if (this.ctx) {
      await this.ctx.resume().catch(() => {});
      return;
    }
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return; // no Web Audio → silent
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 1;
    this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.45; // music sits under the SFX
    this.musicGain.connect(this.master);
    await this.ctx.resume().catch(() => {});
    const all = [...Object.values(SFX_FILES), ...Object.values(MUSIC_FILES)];
    await Promise.all(all.map((u) => this.load(u)));
    this.startDesired(); // start any music requested while we were loading
  }

  private async load(url: string): Promise<void> {
    if (!this.ctx || this.buffers.has(url)) return;
    try {
      const res = await fetch(url);
      const bytes = await res.arrayBuffer();
      this.buffers.set(url, await this.ctx.decodeAudioData(bytes));
    } catch {
      // missing/undecodable clip → stays silent
    }
  }

  /** Fire a one-shot sound effect (overlaps freely). */
  sfx(name: SfxName): void {
    const buf = this.buffers.get(SFX_FILES[name]);
    if (!this.ctx || !this.master || !buf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.master);
    src.start();
  }

  /** Loop a theme's music, swapping out whatever is currently playing. */
  music(name: MusicName): void {
    this.desired = name;
    this.startDesired();
  }

  private startDesired(): void {
    if (!this.ctx || !this.musicGain || !this.desired) return;
    if (this.current === this.desired && this.musicSrc) return; // already on
    const buf = this.buffers.get(MUSIC_FILES[this.desired]);
    if (!buf) return; // not loaded yet — init() will retry when it finishes
    this.stopSource();
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.connect(this.musicGain);
    src.start();
    this.musicSrc = src;
    this.current = this.desired;
  }

  private stopSource(): void {
    if (!this.musicSrc) return;
    try {
      this.musicSrc.stop();
    } catch {
      // already stopped
    }
    this.musicSrc.disconnect();
    this.musicSrc = null;
    this.current = null;
  }

  /** Stop music entirely (menu / game over). */
  stopMusic(): void {
    this.desired = null;
    this.stopSource();
  }

  /** Suspend/resume the whole context — used for the pause overlay. */
  pause(): void {
    this.ctx?.suspend().catch(() => {});
  }
  resume(): void {
    this.ctx?.resume().catch(() => {});
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 1;
  }
  isMuted(): boolean {
    return this.muted;
  }
}
