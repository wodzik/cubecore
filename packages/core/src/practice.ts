/**
 * Practising an algorithm on a smart cube — SequenceTracker plus what a
 * practice session needs: moves hidden until done (memory check), hints,
 * mistakes, time and TPS, and noticing a different algorithm that solves
 * the case all the same.
 *
 * reveal: "all"  — every move shown (learning)
 *         "done" — dots, each move shown once it's done (default)
 *         "none" — dots to the end (test)
 * `hint()` shows the next move; a slip shows it too unless hintOnMistake is off.
 */

import type { Move } from "./moves";
import { SequenceTracker, type SequenceOptions, type SequenceProgress, type TokenStatus } from "./sequence";
import type { State } from "./state";

export type Reveal = "all" | "done" | "none";

export interface PracticeOptions extends SequenceOptions {
  reveal?: Reveal;
  /** Show the next move after a slip. Default true. */
  hintOnMistake?: boolean;
}

export interface PracticeToken {
  /** The move as written. */
  move: Move;
  status: TokenStatus;
  /** Show it (else a dot). */
  visible: boolean;
}

export interface PracticeProgress extends SequenceProgress {
  practice: {
    tokens: PracticeToken[];
    mistakes: number;
    /** Face turns made so far. */
    turns: number;
    /** ms from the first turn to the last one (or to completion). */
    elapsedMs: number;
    /** Turns per second over the attempt. */
    tps: number;
    /** Solved, but not with the written algorithm (the same end state another way). */
    differentAlg: boolean;
  };
}

export class PracticeTracker {
  private readonly tracker: SequenceTracker;
  private readonly revealed = new Set<number>();
  private reveal: Reveal;
  private readonly hintOnMistake: boolean;
  private mistakes = 0;
  private turns: Move[] = [];
  private firstTime: number | null = null;
  private lastTime = 0;
  private wasOff = false;
  private solvedDifferently = false;

  constructor(alg: string | readonly Move[], start: State, options: PracticeOptions = {}) {
    this.tracker = new SequenceTracker(alg, start, options);
    this.reveal = options.reveal ?? "done";
    this.hintOnMistake = options.hintOnMistake ?? true;
  }

  get written(): readonly Move[] {
    return this.tracker.written;
  }

  setReveal(reveal: Reveal): PracticeProgress {
    this.reveal = reveal;
    return this.progress;
  }

  /** Show the next move (the current one). */
  hint(): PracticeProgress {
    const next = this.progress.tokens.findIndex((s) => s === "current" || s === "partial");
    if (next >= 0) this.revealed.add(next);
    return this.progress;
  }

  push(move: Move, time: number = Date.now()): PracticeProgress {
    this.firstTime ??= time;
    this.lastTime = time;
    this.turns.push(move);
    const p = this.tracker.push(move);
    // Reaching the end straight from off the path = the case solved another way.
    if (p.complete && this.wasOff) this.solvedDifferently = true;
    const off = p.undo.length > 0;
    if (off && !this.wasOff) {
      this.mistakes++;
      if (this.hintOnMistake) this.hint();
    }
    this.wasOff = off;
    return this.progress;
  }

  get progress(): PracticeProgress {
    const p = this.tracker.progress;
    const tokens = this.tracker.written.map((move, i) => {
      const status = p.tokens[i];
      const visible = this.reveal === "all" || this.revealed.has(i) || (this.reveal === "done" && (status === "done" || status === "partial"));
      return { move, status, visible };
    });
    const elapsedMs = this.firstTime === null ? 0 : this.lastTime - this.firstTime;
    return {
      ...p,
      practice: {
        tokens,
        mistakes: this.mistakes,
        turns: this.turns.length,
        elapsedMs,
        tps: elapsedMs > 0 ? this.turns.length / (elapsedMs / 1000) : 0,
        differentAlg: p.complete && this.solvedDifferently,
      },
    };
  }
}
