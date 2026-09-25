/**
 * Scramble analysis for CFOP (in the spirit of speedcubedb.com/analyze):
 * for each cross colour, a good way through — the cross (or XCross…), the
 * F2L pairs in the best order, the last layer with its cases — so an app
 * can show the optimal cross, the recommended first pair, the pair order,
 * which cases come up, and how much of it the solver's own algorithms
 * cover.
 *
 *   const a = analyzeScramble("R U2 F' …", { f2l: "optimal", start: "cross" });
 *   a.best                 // the shortest analysis over the six cross colours
 *   a.byCross[0].steps     // [{ step: "cross", moves }, { step: "pair", slot: "FL", moves, case? }, … { step: "oll", case } …]
 *   a.byCross[0].rotation  // "x2" — hold like this (cross on the bottom), then do the moves as written
 *
 * F2L modes:
 *   "optimal"     each pair the fewest moves that keep the cross and the pairs
 *                 already in (StageSolver), over all 24 pair orders;
 *   "algorithms"  each pair its F2L case's algorithm (pre-AUF + alg), over all
 *                 orders; a pair not in one of the 41 cases (a piece stuck in
 *                 another slot) falls back to the fewest-moves insertion.
 * The last layer always goes by OLL + PLL algorithms (+ AUF).
 */

import {
  FRAMES,
  type Face,
  type Frame,
  type Move,
  PIECE,
  type Piece,
  type StageDef,
  type State,
  applyMoves,
  checks,
  isSolved,
  moveCount,
  parseAlg,
  reframe,
  simplify,
  solvedState,
  toFaceTurns,
} from "@cubecore/core";
import { type F2LSlot, recognizeF2L, recognizeOll, recognizePll } from "@cubecore/cfop";
import { stageSolver } from "@cubecore/solve";

export type AnalysisStart = "cross" | "xcross" | "xxcross" | "xxxcross";

export interface AnalyzeOptions {
  /** Physical faces to put the cross on (default: all six — colour neutral). */
  crosses?: readonly Face[];
  /** Begin with the cross, or cross + 1 / 2 / 3 pairs solved optimally together ("Cross+1…3"). Default "cross". */
  start?: AnalysisStart;
  /** How the pairs are solved. Default "optimal". */
  f2l?: "optimal" | "algorithms";
  /** Case ids the solver knows ("F2L 7", "OLL 27", "T"…) — steps are marked `known`. */
  known?: Iterable<string>;
}

export type AnalysisStep =
  | { step: "cross"; moves: Move[]; slots?: F2LSlot[] }
  | {
      step: "pair";
      slot: F2LSlot;
      moves: Move[];
      /** F2L case the pair was in ("solved" when it came in by itself). */
      case?: string;
      alg?: string;
      /** "algorithm": the case's algorithm; "optimal": fewest moves (optimal mode, or a pair outside the 41 cases). */
      how: "algorithm" | "optimal";
      known?: boolean;
    }
  | { step: "oll"; moves: Move[]; case: string; alg?: string; known?: boolean }
  | { step: "pll"; moves: Move[]; case: string; alg?: string; known?: boolean }
  | { step: "auf"; moves: Move[] };

export interface CrossAnalysis {
  /** Physical face the cross goes on. */
  face: Face;
  /** The rotation to hold the cube with the cross on the bottom; the steps' moves are written for that grip. */
  rotation: string;
  frame: Frame;
  steps: AnalysisStep[];
  /** Face turns in all (HTM). */
  length: number;
  /** Order the pairs go in (after any solved with the cross). */
  pairOrder: F2LSlot[];
}

export interface Analysis {
  byCross: CrossAnalysis[];
  /** The shortest. */
  best: CrossAnalysis;
}

const SLOTS: F2LSlot[] = ["FR", "FL", "BL", "BR"];
const CROSS: Piece[] = [PIECE.DR, PIECE.DF, PIECE.DL, PIECE.DB];
const SLOT_PIECES: Record<F2LSlot, [Piece, Piece]> = { FR: [PIECE.FR, PIECE.DFR], FL: [PIECE.FL, PIECE.DLF], BL: [PIECE.BL, PIECE.DBL], BR: [PIECE.BR, PIECE.DRB] };

/** Cross plus the given pairs solved — one stage (tables: cross + each piece). */
export function f2lStage(slots: readonly F2LSlot[]): StageDef {
  const pieces = [...CROSS, ...slots.flatMap((s) => SLOT_PIECES[s])];
  const groups = slots.flatMap((_, i) => [[0, 1, 2, 3, 4 + 2 * i], [0, 1, 2, 3, 5 + 2 * i]]);
  return { name: `cross+${[...slots].sort().join("+")}`, pieces, groups: groups.length ? groups : [[0, 1, 2, 3]] };
}

/** A rotation for each frame ("x2", "z y'"…): hold the cube like this to have the frame's D at the bottom. */
const ROTATIONS: Map<number, string> = (() => {
  const out = new Map<number, string>();
  const base = ["", "y", "y2", "y'"];
  for (const tilt of ["", "x", "x2", "x'", "z", "z'"]) {
    for (const turn of base) {
      const alg = `${tilt} ${turn}`.trim();
      const frame = toFaceTurns(alg).frame;
      if (!out.has(frame.id)) out.set(frame.id, alg);
    }
  }
  return out;
})();

const combos = <T>(items: readonly T[], k: number): T[][] =>
  k === 0 ? [[]] : items.flatMap((x, i) => combos(items.slice(i + 1), k - 1).map((c) => [x, ...c]));

interface F2LPlan {
  steps: AnalysisStep[];
  length: number;
  order: F2LSlot[];
  state: State;
}

/** The best way through the remaining pairs (all orders). */
function planPairs(state: State, done: F2LSlot[], mode: "optimal" | "algorithms", known: Set<string> | null): F2LPlan {
  const left = SLOTS.filter((s) => !done.includes(s));
  if (!left.length) return { steps: [], length: 0, order: [], state };
  let best: F2LPlan | null = null;
  for (const slot of left) {
    const step = pairStep(state, done, slot, mode, known);
    if (!step) continue;
    const after = applyMoves(state, step.moves);
    const rest = planPairs(after, [...done, slot], mode, known);
    const length = step.moves.length + rest.length;
    if (!best || length < best.length) best = { steps: [step, ...rest.steps], length, order: [slot, ...rest.order], state: rest.state };
  }
  return best!;
}

function pairStep(state: State, done: F2LSlot[], slot: F2LSlot, mode: "optimal" | "algorithms", known: Set<string> | null): AnalysisStep | null {
  if (mode === "algorithms") {
    const r = recognizeF2L(state, slot);
    if (r === "solved") return { step: "pair", slot, moves: [], case: "solved", how: "algorithm" };
    if (r) {
      const moves = simplify(parseAlg(`${r.preAuf} ${r.alg}`));
      // The case's algorithm must leave the cross and the pairs already in untouched.
      if (stageSolver(f2lStage([...done, slot])).distance(applyMoves(state, moves), { maxDepth: 0 }) === 0) {
        const alg = `${r.preAuf} ${r.alg}`.trim();
        return { step: "pair", slot, moves: simplify(toFaceTurns(moves).moves), case: r.id, alg, how: "algorithm", ...(known ? { known: known.has(r.id) } : {}) };
      }
    }
  }
  const sol = stageSolver(f2lStage([...done, slot])).solve(state, { maxDepth: 14 })[0];
  if (!sol) return null;
  const r = recognizeF2L(state, slot);
  return { step: "pair", slot, moves: sol, ...(r ? { case: r === "solved" ? "solved" : r.id } : {}), how: "optimal" };
}

function lastLayer(state: State, known: Set<string> | null): { steps: AnalysisStep[]; state: State } {
  const steps: AnalysisStep[] = [];
  let s = state;
  const oll = recognizeOll(s);
  if (oll) {
    const moves = simplify(toFaceTurns(`${oll.preAuf} ${oll.alg}`).moves);
    steps.push({ step: "oll", moves, case: oll.id, alg: `${oll.preAuf} ${oll.alg}`.trim(), ...(known ? { known: known.has(oll.id) } : {}) });
    s = applyMoves(s, moves);
  } else steps.push({ step: "oll", moves: [], case: "OLL skip" });
  const pll = recognizePll(s);
  if (pll) {
    const moves = simplify(toFaceTurns(`${pll.preAuf} ${pll.alg}`).moves);
    steps.push({ step: "pll", moves, case: pll.id, alg: `${pll.preAuf} ${pll.alg}`.trim(), ...(known ? { known: known.has(pll.id) } : {}) });
    s = applyMoves(s, moves);
  } else steps.push({ step: "pll", moves: [], case: "PLL skip" });
  const auf = ["", "U", "U2", "U'"].find((a) => isSolved(a ? applyMoves(s, a) : s)) ?? "";
  if (auf) {
    steps.push({ step: "auf", moves: parseAlg(auf) });
    s = applyMoves(s, auf);
  }
  return { steps, state: s };
}

/** One cross colour: the whole way through, as held with the cross on the bottom. */
export function analyzeCross(scrambled: State, face: Face, options: AnalyzeOptions = {}): CrossAnalysis {
  const frame = FRAMES.find((f) => f.face.D === face && ROTATIONS.has(f.id))!;
  const known = options.known ? new Set(options.known) : null;
  const mode = options.f2l ?? "optimal";
  // As held: sticker names renamed so the cross face is D (colour logic is unaffected).
  let s = reframe(scrambled, frame);
  const steps: AnalysisStep[] = [];
  const first = { cross: 0, xcross: 1, xxcross: 2, xxxcross: 3 }[options.start ?? "cross"];
  let done: F2LSlot[] = [];
  // Cross (+ pairs): the best choice of slots for Cross+N.
  let crossBest: { moves: Move[]; slots: F2LSlot[] } | null = null;
  for (const slots of combos(SLOTS, first)) {
    const sol = stageSolver(f2lStage(slots)).solve(s, { maxDepth: 16 })[0];
    if (sol && (!crossBest || sol.length < crossBest.moves.length)) crossBest = { moves: sol, slots };
  }
  steps.push({ step: "cross", moves: crossBest!.moves, ...(first ? { slots: crossBest!.slots } : {}) });
  s = applyMoves(s, crossBest!.moves);
  done = crossBest!.slots;
  const pairs = planPairs(s, done, mode, known);
  steps.push(...pairs.steps);
  s = pairs.state;
  const ll = lastLayer(s, known);
  steps.push(...ll.steps);
  return {
    face,
    rotation: ROTATIONS.get(frame.id)!,
    frame,
    steps,
    length: steps.reduce((n, st) => n + moveCount(st.moves), 0),
    pairOrder: pairs.order,
  };
}

/** Analyse a scramble (moves from solved, or a state) for each cross colour. */
export function analyzeScramble(scramble: string | readonly Move[] | State, options: AnalyzeOptions = {}): Analysis {
  const state = scramble instanceof Uint8Array ? scramble : applyMoves(solvedState(), typeof scramble === "string" ? parseAlg(scramble) : scramble);
  const faces = options.crosses ?? (["D", "U", "F", "B", "L", "R"] as Face[]);
  const byCross = faces.map((face) => analyzeCross(state, face, options)).sort((a, b) => a.length - b.length);
  return { byCross, best: byCross[0] };
}

/** Does following the analysis (rotation, then every step) solve the cube? — for tests / sanity checks. */
export function followsThrough(scramble: State, a: CrossAnalysis): boolean {
  let s = reframe(scramble, a.frame);
  for (const st of a.steps) s = applyMoves(s, st.moves);
  return isSolved(s) && checks.f2lSolved(s);
}
export * from "./client";
