/**
 * Following an Old Pochmann execution on a smart cube, letter by letter.
 *
 * A letter counts as done when that kind of piece is exactly where the swap
 * leaves it: edges after an edge letter, corners after a corner letter. Only
 * one kind is compared — the swap algorithms move a couple of pieces of the
 * other kind on the side (T-perm two corners, Y-perm two edges), which the
 * next letters / parity put back. Any algorithm doing the same swap counts.
 *
 * Parity (odd edge letters): after the edges the two corners the T-perms
 * moved are still swapped; the parity step is done when the corners are back
 * as they were at the start.
 *
 * A swap with a different letter than the one due is reported (`wrong`).
 */

import { type Move, type State, applyMove, applyMoves, isSolved, solvedState } from "@cubecore/core";
import { asHeld } from "./memo";
import { CORNER_BUFFER, CORNER_POSITIONS, EDGE_BUFFER, EDGE_POSITIONS, type Memo, samePiece as sameKindPiece, type MemoOptions, memo, samePieces, swapToTarget } from "./memo";
import { RUWIX } from "./scheme";

export type BldStepKind = "edge" | "parity" | "corner";

export interface BldStep {
  kind: BldStepKind;
  /** The letter ("" for parity). */
  letter: string;
  /** Sticker position shot to (-1 for parity). */
  target: number;
}

export interface BldProgress {
  steps: BldStep[];
  /** Steps done (the next one to do is steps[done]). */
  done: number;
  status: ("done" | "current" | "todo")[];
  /** The last finished swap went to another letter than the one due. */
  wrong: { expected: string; got: string; kind: BldStepKind } | null;
  /** Every letter done. */
  complete: boolean;
  /** The cube is solved. */
  solved: boolean;
}

interface Checkpoint {
  positions: readonly number[];
  state: State;
}

export class BldTracker {
  readonly memo: Memo;
  readonly steps: BldStep[];
  private readonly checkpoints: Checkpoint[];
  private readonly start: State;
  private readonly held: State;
  private readonly toHeld: (m: Move) => Move;
  private readonly options: MemoOptions;
  private cur: State;
  private doneCount = 0;
  private wrong: BldProgress["wrong"] = null;

  constructor(start: State, options: MemoOptions = {}) {
    const scheme = options.scheme ?? RUWIX;
    // Work as held: moves are turned into the held frame as they come.
    this.held = asHeld(start, options.rotation);
    this.memo = memo(this.held);
    this.start = this.held;
    this.cur = new Uint8Array(this.held);
    this.toHeld = heldMoveMap(options.rotation);
    this.steps = [];
    this.checkpoints = [];
    let s: State = new Uint8Array(this.held);
    this.memo.edgeTargets.forEach((t, i) => {
      s = swapToTarget(s, "edge", t, options.edgeBuffer);
      this.steps.push({ kind: "edge", letter: this.memo.edges[i], target: t });
      this.checkpoints.push({ positions: EDGE_POSITIONS, state: s });
    });
    if (this.memo.parity) {
      this.steps.push({ kind: "parity", letter: "", target: -1 });
      this.checkpoints.push({ positions: CORNER_POSITIONS, state: new Uint8Array(this.held) });
    }
    let c: State = new Uint8Array(this.held);
    this.memo.cornerTargets.forEach((t, i) => {
      c = swapToTarget(c, "corner", t, options.cornerBuffer);
      this.steps.push({ kind: "corner", letter: this.memo.corners[i], target: t });
      this.checkpoints.push({ positions: CORNER_POSITIONS, state: c });
    });
    this.options = { ...options, scheme };
  }

  get state(): State {
    return this.cur;
  }

  /** A face turn from the cube. */
  push(move: Move): BldProgress {
    this.cur = applyMove(this.cur, this.toHeld(move));
    // Done with the next step (or several: e.g. parity needs nothing when the corners came back on their own).
    while (this.doneCount < this.steps.length) {
      const cp = this.checkpoints[this.doneCount];
      if (!samePieces(this.cur, cp.state, cp.positions)) break;
      this.doneCount++;
      this.wrong = null;
    }
    this.wrong = this.doneCount < this.steps.length ? this.wrongSwap() : null;
    return this.progress;
  }

  /** A swap with another letter than the due one, just finished? */
  private wrongSwap(): BldProgress["wrong"] {
    const step = this.steps[this.doneCount];
    if (step.kind === "parity") return null;
    const prev = this.previousOfKind(step.kind);
    const positions = step.kind === "edge" ? EDGE_POSITIONS : CORNER_POSITIONS;
    const letters = step.kind === "edge" ? this.options.scheme!.edges : this.options.scheme!.corners;
    for (const [pos, letter] of Object.entries(letters)) {
      const t = Number(pos);
      if (t === step.target || sameKindPiece(step.kind, t, step.kind === "edge" ? (this.options.edgeBuffer ?? EDGE_BUFFER) : (this.options.cornerBuffer ?? CORNER_BUFFER))) continue;
      const buffer = step.kind === "edge" ? this.options.edgeBuffer : this.options.cornerBuffer;
      const after = swapToTarget(prev, step.kind, t, buffer);
      if (samePieces(this.cur, after, positions) && !samePieces(after, prev, positions)) return { expected: step.letter, got: letter, kind: step.kind };
    }
    return null;
  }

  /** Where that kind of piece should be before the due step. */
  private previousOfKind(kind: BldStepKind): State {
    for (let i = this.doneCount - 1; i >= 0; i--) if (this.steps[i].kind === kind) return this.checkpoints[i].state;
    return this.start;
  }

  get progress(): BldProgress {
    return {
      steps: this.steps,
      done: this.doneCount,
      status: this.steps.map((_, i) => (i < this.doneCount ? "done" : i === this.doneCount ? "current" : "todo")),
      wrong: this.wrong,
      complete: this.doneCount === this.steps.length,
      solved: isSolved(this.cur),
    };
  }
}

/**
 * A face turn of the cube (its own faces) as the face it is for the holder:
 * the cube's R is the held L after y2, and so on.
 */
function heldMoveMap(rotation?: string | readonly Move[]): (m: Move) => Move {
  if (!rotation) return (m) => m;
  const rot = applyMoves(solvedState(), rotation);
  const faceAt = new Map<string, Move["family"]>();
  for (let pos = 0; pos < 6; pos++) faceAt.set(FACE_NAMES[(rot[pos * 9 + 4] / 9) | 0], FACE_NAMES[pos] as Move["family"]);
  return (m) => (faceAt.has(m.family) ? { ...m, family: faceAt.get(m.family)! } : m);
}

const FACE_NAMES = "URFDLB";
