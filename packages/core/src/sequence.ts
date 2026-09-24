/**
 * Following a scramble (or an algorithm) on a smart cube: which moves are
 * done, which one is under way, and — after a slip — what to undo.
 *
 * It matches CUBE STATES, not move strings, so everything that reaches the
 * same state counts:
 *   - a half turn done as two quarter turns, either way (half done = `partial`);
 *   - opposite faces in the other order (R L done as L R);
 *   - an algorithm written with rotations, slices and wide moves (converted
 *     with toFaceTurns: what the smart cube will actually report).
 * Off the path, `undo` is the way back to the last matching point (the
 * slip, simplified: R R' cancels) and `needsReset` says it's too long.
 */

import type { Move } from "./moves";
import { invert, parseAlg, simplify } from "./notation";
import { OrientationTracker } from "./physical";
import { type State, applyMove, statesEqual } from "./state";

export interface SequenceStep {
  /** The face turn the cube will report. */
  move: Move;
  /** Index of the written move (token) it belongs to — several steps for M, none for a rotation. */
  token: number;
}

export type TokenStatus = "done" | "partial" | "current" | "todo";

export interface SequenceProgress {
  /** Face-turn steps fully done. */
  done: number;
  total: number;
  /** The next step is a half turn and half of it is done. */
  partial: boolean;
  /** Status of each written move (for display). */
  tokens: TokenStatus[];
  /** Moves that bring the cube back to the last matching point (empty when on track). */
  undo: Move[];
  /** The slip is longer than `maxCorrection`: better to reset / solve and start over. */
  needsReset: boolean;
  complete: boolean;
}

export interface SequenceOptions {
  /** Longest undo worth showing (act's rule: 25). */
  maxCorrection?: number;
}

export class SequenceTracker {
  readonly written: Move[];
  readonly steps: SequenceStep[];
  private readonly path: State[]; // state after k steps
  private cur: State;
  private anchor = 0; // last matching step index
  private anchorPartial = false;
  private offPath: Move[] = []; // moves since the last matching point
  private readonly maxCorrection: number;

  constructor(target: string | readonly Move[], start: State, options: SequenceOptions = {}) {
    this.written = typeof target === "string" ? parseAlg(target) : [...target];
    this.maxCorrection = options.maxCorrection ?? 25;
    const grip = new OrientationTracker();
    this.steps = this.written.flatMap((m, token) => grip.push(m).map((move) => ({ move, token })));
    this.path = [new Uint8Array(start)];
    for (const s of this.steps) this.path.push(applyMove(this.path[this.path.length - 1], s.move));
    this.cur = new Uint8Array(start);
  }

  get state(): State {
    return this.cur;
  }

  /** A face turn reported by the cube. */
  push(move: Move): SequenceProgress {
    this.cur = applyMove(this.cur, move);
    const on = this.locate();
    if (on) {
      this.anchor = on.done;
      this.anchorPartial = on.partial;
      this.offPath = [];
    } else {
      this.offPath.push(move);
    }
    return this.progress;
  }

  get progress(): SequenceProgress {
    const total = this.steps.length;
    const undo = this.offPath.length ? invert(simplify(this.offPath)) : [];
    const done = this.anchor;
    const partial = this.anchorPartial && !this.offPath.length;
    const next = done < total ? this.steps[done].token : this.written.length;
    const tokens: TokenStatus[] = this.written.map((_, t) => {
      const idx = this.steps.map((s, i) => (s.token === t ? i : -1)).filter((i) => i >= 0);
      if (!idx.length) return t < next ? "done" : "todo"; // a rotation: done once the cube gets past it
      const first = idx[0], last = idx[idx.length - 1];
      if (last < done) return "done";
      if (first < done || (first === done && partial)) return "partial"; // M half done, or half of an R2
      return first === done ? "current" : "todo";
    });
    return { done, total, partial, tokens, undo, needsReset: undo.length > this.maxCorrection, complete: done === total && !this.offPath.length };
  }

  /** Where the current state is on the path, if anywhere: after `done` steps (+ half of the next one). */
  private locate(): { done: number; partial: boolean } | null {
    for (let k = this.path.length - 1; k >= 0; k--) if (statesEqual(this.path[k], this.cur)) return { done: k, partial: false };
    for (let k = 0; k < this.steps.length; k++) {
      const s = this.steps[k].move;
      // Half of a half turn, either way.
      if (s.amount === 2) {
        for (const amount of [1, -1] as const) {
          if (statesEqual(applyMove(this.path[k], { family: s.family, amount }), this.cur)) return { done: k, partial: true };
        }
      }
      // The next step on the opposite face done first (R L done as L R): count as progress on k.
      const n = this.steps[k + 1];
      if (n && opposite(s, n.move)) {
        if (statesEqual(applyMove(this.path[k], n.move), this.cur)) return { done: k, partial: true };
      }
    }
    return null;
  }
}

const AXIS: Record<string, number> = { U: 1, D: 1, R: 0, L: 0, F: 2, B: 2 };
function opposite(a: Move, b: Move): boolean {
  return a.family !== b.family && AXIS[a.family] !== undefined && AXIS[a.family] === AXIS[b.family];
}

