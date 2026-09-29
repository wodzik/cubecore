/**
 * Following a scramble (or an algorithm) on a smart cube: which moves are
 * done, which one is under way, and — after a slip — what to undo.
 *
 * It matches CUBE STATES, not move strings, so everything that reaches the
 * same state counts:
 *   - a half turn done as two quarter turns, either way (half done = `partial`);
 *   - moves on one axis in any order, even interleaved (R2 L2 done as
 *     L R L R, or L2 R2): they commute — each face just has to get there;
 *   - an algorithm written with rotations, slices and wide moves (converted
 *     with toFaceTurns: what the smart cube will actually report).
 * Off the path, `undo` is the way back to the last matching point (the
 * slip, simplified: R R' cancels) and `needsReset` says it's too long.
 */

import { type TurnArrow, turnArrow } from "./arrows";
import type { Frame } from "./frames";
import { type Move, amountQuarters } from "./moves";
import { invert, parseAlg, simplify } from "./notation";
import { OrientationTracker } from "./physical";
import { type State, applyMove, statesEqual } from "./state";

export interface SequenceStep {
  /** The face turn the cube will report. */
  move: Move;
  /** Index of the written move (token) it belongs to — several steps for M, none for a rotation. */
  token: number;
}

/** "wrong-way": the move due, its face turned the wrong way (or too far) — turn it back / on, no real slip. */
export type TokenStatus = "done" | "partial" | "current" | "wrong-way" | "todo";

export interface SequenceProgress {
  /** Face-turn steps fully done. */
  done: number;
  total: number;
  /**
   * Part way through the next steps: half of a half turn, or moves on one
   * axis (R2 L2) done out of order / each part of the way.
   */
  partial: boolean;
  /** Status of each written move (for display). */
  tokens: TokenStatus[];
  /** Moves that bring the cube back to the last matching point (empty when on track). */
  undo: Move[];
  /** The slip is longer than `maxCorrection`: better to reset / solve and start over. */
  needsReset: boolean;
  /** The only slip is the move due turned the wrong way (or too far) — the right face, fix it with that face. */
  wrongWay: boolean;
  complete: boolean;
}

/** What to turn now — for arrows on a 3D cube (see arrows.ts). */
export interface NextTurn {
  /**
   * "next": the next move of the sequence; "finish": the rest of a half turn
   * already started (with R2 L2 both at once, when both are half done);
   * "undo": the first move back after a slip; "wrong-way": the same, when
   * the slip was the right face turned the wrong way (or too far) — worth a
   * colour of its own.
   */
  kind: "next" | "finish" | "undo" | "wrong-way";
  /** In the cube's own coordinates. Usually one; the rest of an M done half-way can be two. */
  arrows: TurnArrow[];
  /** The written move it belongs to (null for undo). */
  token: number | null;
}

export interface SequenceOptions {
  /** Longest undo worth showing (act's rule: 25). */
  maxCorrection?: number;
  /**
   * How the cube is held at the start (default: its own U on top, F in
   * front) — e.g. after an algorithm with a net rotation (M, wide moves) the
   * next one is written for the cube as now held.
   */
  frame?: Frame;
}

/** Consecutive steps on one axis (R2 L2, U D'): they commute, so they're done in any order, each face any part of the way. */
interface AxisGroup {
  /** Steps start…end-1. */
  start: number;
  end: number;
  faces: Move["family"][];
  /** Quarter turns (mod 4) each face has to get, clockwise. */
  target: number[];
}

type StepStatus = "done" | "partial" | "todo";

export class SequenceTracker {
  readonly written: Move[];
  readonly steps: SequenceStep[];
  /** How the cube is held before each written move (rotations and slices change it). */
  readonly frames: Frame[];
  private readonly path: State[]; // state after k steps
  private cur: State;
  private readonly groups: AxisGroup[] = [];
  private readonly groupOf: number[] = []; // step index → its group
  private anchor = 0; // last matching step index
  /** At the anchor, inside an axis group: how far each of its faces got (quarters). */
  private anchorGroup: { group: AxisGroup; got: number[] } | null = null;
  private offPath: Move[] = []; // moves since the last matching point
  private readonly maxCorrection: number;

  constructor(target: string | readonly Move[], start: State, options: SequenceOptions = {}) {
    this.written = typeof target === "string" ? parseAlg(target) : [...target];
    this.maxCorrection = options.maxCorrection ?? 25;
    const grip = new OrientationTracker(options.frame);
    this.frames = [];
    this.steps = this.written.flatMap((m, token) => {
      this.frames.push(grip.frame);
      return grip.push(m).map((move) => ({ move, token }));
    });
    this.path = [new Uint8Array(start)];
    for (const s of this.steps) this.path.push(applyMove(this.path[this.path.length - 1], s.move));
    this.cur = new Uint8Array(start);
    for (let i = 0; i < this.steps.length; ) {
      let j = i + 1;
      while (j < this.steps.length && sameAxis(this.steps[i].move, this.steps[j].move)) j++;
      const group: AxisGroup = { start: i, end: j, faces: [], target: [] };
      for (let k = i; k < j; k++) {
        const { family, amount } = this.steps[k].move;
        let f = group.faces.indexOf(family);
        if (f < 0) f = group.faces.push(family) - 1;
        group.target[f] = ((group.target[f] ?? 0) + amountQuarters(amount)) % 4;
        this.groupOf[k] = this.groups.length;
      }
      this.groups.push(group);
      i = j;
    }
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
      this.anchorGroup = on.group;
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
    const partial = this.anchorGroup !== null && !this.offPath.length;
    const next = done < total ? this.steps[done].token : this.written.length;
    const ww = this.wrongWayStep(undo);
    const status = (i: number): StepStatus => (this.offPath.length ? (i < done ? "done" : "todo") : this.stepStatus(i));
    const tokens: TokenStatus[] = this.written.map((_, t) => {
      const idx = this.steps.map((s, i) => (s.token === t ? i : -1)).filter((i) => i >= 0);
      if (!idx.length) return t < next ? "done" : "todo"; // a rotation: done once the cube gets past it
      const st = idx.map(status);
      if (st.every((x) => x === "done")) return "done";
      if (ww !== null && idx.includes(ww)) return "wrong-way";
      if (st.some((x) => x !== "todo")) return "partial"; // half of an R2, R2 L2 started either way, M half done
      return idx[0] === done ? "current" : "todo";
    });
    return { done, total, partial, tokens, undo, needsReset: undo.length > this.maxCorrection, wrongWay: ww !== null, complete: done === total && !this.offPath.length };
  }

  /** A step at the anchor: done, part way (half of a half turn), or not started. */
  private stepStatus(i: number): StepStatus {
    const g = this.anchorGroup;
    if (g && i >= g.group.start && i < g.group.end) {
      const f = g.group.faces.indexOf(this.steps[i].move.family);
      return g.got[f] === g.group.target[f] ? "done" : g.got[f] === 0 ? "todo" : "partial";
    }
    return i < this.anchor ? "done" : "todo";
  }

  /**
   * The only slip is a face due (the next step, or one on its axis still to
   * do) turned the wrong way or too far — the step it belongs to, else null.
   */
  private wrongWayStep(undo: readonly Move[]): number | null {
    if (undo.length !== 1 || this.anchor >= this.steps.length) return null;
    const end = this.groups[this.groupOf[this.anchor]].end;
    for (let i = this.anchor; i < end; i++) if (this.steps[i].move.family === undo[0].family && this.stepStatus(i) !== "done") return i;
    return null;
  }

  /**
   * What to turn now, for an arrow: after a slip the first undo move; half way
   * through a half turn the remaining quarter (the way it was started); else
   * the next written move as written — a wide r stays two layers, an M the
   * middle one — placed where it is on the cube as now held. Null when complete.
   */
  get nextTurn(): NextTurn | null {
    const p = this.progress;
    if (p.complete) return null;
    const ww = this.wrongWayStep(p.undo);
    if (ww !== null) {
      // The face due went the wrong way (or too far): the turn to where it should be —
      // back and on in one go (U instead of U': a U2 the way U' goes).
      const expected = this.steps[ww].move;
      const back = p.undo[0];
      const signed = (m: Move) => (m.amount === 2 ? 2 * Math.sign(m.written ?? 2) : m.amount);
      let q = signed(back) + (expected.amount === 2 ? 2 * (Math.sign(signed(back)) || 1) : expected.amount);
      q = ((q % 4) + 4) % 4;
      const amount = (q === 3 ? -1 : q) as Move["amount"];
      const fix: Move = amount === 2 ? { family: expected.family, amount: 2, written: 2 * (Math.sign(signed(expected)) || 1) } : { family: expected.family, amount };
      return { kind: "wrong-way", arrows: [turnArrow(fix)], token: this.steps[ww].token };
    }
    if (p.undo.length) {
      return { kind: "undo", arrows: [turnArrow(p.undo[0])], token: null };
    }
    const k = p.done;
    const step = this.steps[k];
    if (!step) return null;
    const next = (moves: Move[]): NextTurn => ({ kind: "next", arrows: moves.map((m) => turnArrow(m)), token: step.token });
    const g = this.anchorGroup;
    if (g) {
      // Half turns started (R2 L2: one or both half done): the rest of each, the way it was started.
      const halves = g.group.faces.flatMap((family, f): Move[] => {
        const got = g.got[f];
        return got !== 0 && got !== g.group.target[f] ? [{ family, amount: got === 1 ? 1 : -1 }] : [];
      });
      if (halves.length) {
        const first = this.steps.findIndex((s, i) => i >= g.group.start && s.move.family === halves[0].family);
        return { kind: "finish", arrows: halves.map((m) => turnArrow(m)), token: this.steps[first].token };
      }
      // Else a face of the axis went first (R L done as L R): the next one left, as written.
    }
    const first = this.steps.findIndex((s) => s.token === step.token);
    if (first < k) {
      // A slice / wide move partly done (its face turns arrive one by one): what's left of it.
      return next(this.steps.slice(k).filter((s) => s.token === step.token).map((s) => s.move));
    }
    return { kind: "next", arrows: [turnArrow(this.written[step.token], this.frames[step.token])], token: step.token };
  }

  /**
   * Where the current state is on the path, if anywhere: after `done` steps —
   * or inside an axis group, each of its faces some way to its target (a
   * half turn: any part, either way; a quarter: not yet or done).
   */
  private locate(): { done: number; group: { group: AxisGroup; got: number[] } | null } | null {
    for (let k = this.path.length - 1; k >= 0; k--) if (statesEqual(this.path[k], this.cur)) return { done: k, group: null };
    for (let gi = this.groups.length - 1; gi >= 0; gi--) {
      const group = this.groups[gi];
      const options = group.target.map((t) => (t === 2 ? [0, 1, 2, 3] : t === 0 ? [0] : [0, t]));
      for (const got of combinations(options)) {
        if (got.every((q) => q === 0) || got.every((q, f) => q === group.target[f])) continue; // on the path: found above
        let s = this.path[group.start];
        got.forEach((q, f) => {
          if (q) s = applyMove(s, { family: group.faces[f], amount: q === 3 ? -1 : (q as 1 | 2) });
        });
        if (!statesEqual(s, this.cur)) continue;
        const at = { group, got };
        let done = group.start;
        while (done < group.end) {
          const f = group.faces.indexOf(this.steps[done].move.family);
          if (got[f] !== group.target[f]) break;
          done++;
        }
        return { done, group: at };
      }
    }
    return null;
  }
}

const AXIS: Record<string, number> = { U: 1, D: 1, R: 0, L: 0, F: 2, B: 2 };
const sameAxis = (a: Move, b: Move) => AXIS[a.family] !== undefined && AXIS[a.family] === AXIS[b.family];

/** Every pick of one value from each list. */
function combinations(options: number[][]): number[][] {
  return options.reduce<number[][]>((acc, xs) => acc.flatMap((a) => xs.map((x) => [...a, x])), [[]]);
}

