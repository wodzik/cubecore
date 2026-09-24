/**
 * Time-accurate replay. A move's animation ENDS at its recorded time (smart
 * cubes report a move when it completes) and lasts at most `maxAnimMs`, never
 * overlapping the previous move — so fast triggers stay fast and pauses stay
 * pauses, unlike a fixed-tempo player.
 */

import type { Recording } from "./recording";

export interface ReplayOptions {
  /** Longest a single move animates (ms of recording time). Default 150. */
  maxAnimMs?: number;
}

export interface Position {
  /** Moves fully done at this time. */
  applied: number;
  /** The move animating right now, if any, with progress 0..1. */
  active?: { index: number; progress: number };
}

/** Animation window [start, end] of every move. */
export function moveWindows(rec: Recording, options: ReplayOptions = {}): [number, number][] {
  const max = options.maxAnimMs ?? 150;
  let prevEnd = 0;
  return rec.moves.map(({ t }) => {
    const start = Math.max(t - max, prevEnd);
    prevEnd = t;
    return [start, t];
  });
}

export function positionAt(rec: Recording, timeMs: number, options: ReplayOptions = {}): Position {
  const windows = moveWindows(rec, options);
  let applied = 0;
  while (applied < windows.length && windows[applied][1] <= timeMs) applied++;
  const next = windows[applied];
  if (next && timeMs > next[0]) {
    const span = next[1] - next[0];
    return { applied, active: { index: applied, progress: span > 0 ? (timeMs - next[0]) / span : 1 } };
  }
  return { applied };
}

export interface ClockHost {
  now(): number;
  /** Ask for a callback on the next frame; returns a cancel function. */
  frame(cb: () => void): () => void;
}

const browserHost: ClockHost = {
  now: () => performance.now(),
  frame: (cb) => {
    const id = requestAnimationFrame(() => cb());
    return () => cancelAnimationFrame(id);
  },
};

type Listener = (time: number, position: Position) => void;

/**
 * Drives a replay in real time. `rate` scales playback (2 = twice as fast)
 * keeping the proportions of pauses. Listeners get the recording time and
 * the position on every frame and after every seek.
 */
export class ReplayClock {
  private time = 0;
  private playing = false;
  private anchorReal = 0;
  private anchorTime = 0;
  private cancel: (() => void) | null = null;
  private listeners = new Set<Listener>();
  private _rate = 1;

  constructor(readonly recording: Recording, private readonly options: ReplayOptions = {}, private readonly host: ClockHost = browserHost) {}

  get currentTime() {
    return this.time;
  }
  get isPlaying() {
    return this.playing;
  }
  get rate() {
    return this._rate;
  }
  set rate(r: number) {
    this.rebase();
    this._rate = r;
  }

  onChange(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  play(): void {
    if (this.playing) return;
    if (this.time >= this.recording.totalMs) this.time = 0;
    this.playing = true;
    this.rebase();
    this.loop();
  }

  pause(): void {
    this.tick();
    this.playing = false;
    this.cancel?.();
    this.cancel = null;
  }

  seek(timeMs: number): void {
    this.time = Math.min(Math.max(0, timeMs), this.recording.totalMs);
    this.rebase();
    this.emit();
  }

  /** Jump to the moment move `index` completed (−1 = start). */
  seekToMove(index: number): void {
    this.seek(index < 0 ? 0 : this.recording.moves[Math.min(index, this.recording.moves.length - 1)].t);
  }

  private rebase() {
    this.anchorReal = this.host.now();
    this.anchorTime = this.time;
  }

  private tick() {
    if (!this.playing) return;
    this.time = Math.min(this.anchorTime + (this.host.now() - this.anchorReal) * this._rate, this.recording.totalMs);
    this.emit();
    if (this.time >= this.recording.totalMs) {
      this.playing = false;
      this.cancel?.();
      this.cancel = null;
    }
  }

  private loop() {
    this.cancel = this.host.frame(() => {
      this.tick();
      if (this.playing) this.loop();
    });
  }

  private emit() {
    const pos = positionAt(this.recording, this.time, this.options);
    for (const l of this.listeners) l(this.time, pos);
  }
}
