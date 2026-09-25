/**
 * Scramble analysis for Roux: for each side the first block can go on,
 * the best way through — first block (with the best bottom colour),
 * second square and the rest of the second block, CMLL (case named), LSE
 * (M / U, split into EO, UL/UR and the last four edges).
 *
 *   const a = analyzeRoux("R U2 F' …");
 *   a.best.rotation    // hold like this: the first block goes on the left, its bottom down
 *   a.best.steps       // fb, ss (front / back), sb, cmll, lse
 *
 * Blocks by fewest face turns (optimal FB; second square, then the last
 * pair of the second block, each optimal keeping what's built); CMLL by
 * its algorithm; LSE optimal in M and U (exact table). Lengths in STM
 * (a slice counts one).
 */

import { FRAMES, type Face, type Frame, type Move, type State, applyMoves, isSolved, moveCount, parseAlg, reframe, simplify, solvedState, toFaceTurns } from "@cubecore/core";
import { ROUX_TRAINERS, type RouxSide, cmll as cmllDone, lseEo, recognizeCmll, ulUr } from "@cubecore/roux";
import { STAGES, lseSolver, stageSolver } from "@cubecore/solve";
import { rotationFor } from "./rotations";

export interface RouxAnalyzeOptions {
  /** Physical faces the first block may go on (its left side); default all six. */
  sides?: readonly Face[];
  /** Case ids the solver knows ("Sune Left Bar"…) — the CMLL step gets `known`. */
  known?: Iterable<string>;
}

export type RouxStep =
  | { step: "fb"; moves: Move[] }
  | { step: "ss"; side: RouxSide; moves: Move[] }
  | { step: "sb"; moves: Move[] }
  | { step: "cmll"; moves: Move[]; case: string; alg?: string; known?: boolean }
  | { step: "lse"; moves: Move[]; eo: number; ulur: number; l4e: number };

export interface RouxAnalysis {
  /** Physical face the first block is built against (left side as held). */
  side: Face;
  /** Physical face its bottom is on. */
  bottom: Face;
  rotation: string;
  frame: Frame;
  steps: RouxStep[];
  /** STM. */
  length: number;
}

export interface RouxAnalysisResult {
  bySide: RouxAnalysis[];
  best: RouxAnalysis;
}

const FB_FIXED = { ...ROUX_TRAINERS.fb(), name: "roux-fb-fixed", neutral: undefined };
const SIDES: RouxSide[] = ["front", "back"];

/** One side (and its best bottom): the whole way through, as held. */
export function analyzeRouxSide(scrambled: State, side: Face, known: Set<string> | null = null): RouxAnalysis {
  // The best bottom colour for the first block on this side.
  const fb = stageSolver(FB_FIXED);
  let best: { frame: Frame; moves: Move[] } | null = null;
  for (const frame of FRAMES.filter((f) => f.face.L === side)) {
    const sol = fb.solve(reframe(scrambled, frame), { maxDepth: 12 })[0];
    if (sol && (!best || sol.length < best.moves.length)) best = { frame, moves: sol };
  }
  const { frame } = best!;
  const steps: RouxStep[] = [{ step: "fb", moves: best!.moves }];
  let s = applyMoves(reframe(scrambled, frame), best!.moves);

  // Second square (the better side), then the rest of the second block.
  let ss: { side: RouxSide; moves: Move[] } | null = null;
  for (const sq of SIDES) {
    const sol = stageSolver(ROUX_TRAINERS.ss(sq)).solve(s, { maxDepth: 14 })[0];
    if (sol && (!ss || sol.length < ss.moves.length)) ss = { side: sq, moves: sol };
  }
  steps.push({ step: "ss", side: ss!.side, moves: ss!.moves });
  s = applyMoves(s, ss!.moves);
  const sb = stageSolver(STAGES["roux-blocks"]()).solve(s, { maxDepth: 14 })[0];
  steps.push({ step: "sb", moves: sb });
  s = applyMoves(s, sb);

  // CMLL by its algorithm.
  const c = recognizeCmll(s);
  if (c) {
    const moves = simplify(toFaceTurns(`${c.preAuf} ${c.alg}`).moves);
    s = applyMoves(s, moves);
    if (!cmllDone(s)) throw new Error(`CMLL ${c.id} didn't solve the corners`);
    steps.push({ step: "cmll", moves, case: c.id, alg: `${c.preAuf} ${c.alg}`.trim(), ...(known ? { known: known.has(c.id) } : {}) });
  } else steps.push({ step: "cmll", moves: [], case: "CMLL skip" });

  // LSE, optimal in M / U; where EO and UL/UR were done along the way.
  const lse = lseSolver(ROUX_TRAINERS.lse()).solve(s)[0] ?? [];
  let eo = -1, ulur = -1;
  let t = s;
  for (let i = 0; i <= lse.length; i++) {
    if (eo < 0 && lseEo(t)) eo = i;
    if (ulur < 0 && ulUr(t)) ulur = i;
    if (i < lse.length) t = applyMoves(t, [lse[i]]);
  }
  const eoLen = Math.max(eo, 0), ulurLen = Math.max(ulur, eoLen) - eoLen;
  steps.push({ step: "lse", moves: lse, eo: eoLen, ulur: ulurLen, l4e: lse.length - eoLen - ulurLen });
  return {
    side,
    bottom: frame.face.D,
    rotation: rotationFor(frame),
    frame,
    steps,
    length: steps.reduce((n, st) => n + moveCount(st.moves, "stm"), 0),
  };
}

/** Analyse a scramble for Roux, for each side the first block can go on. */
export function analyzeRoux(scramble: string | readonly Move[] | State, options: RouxAnalyzeOptions = {}): RouxAnalysisResult {
  const state = scramble instanceof Uint8Array ? scramble : applyMoves(solvedState(), typeof scramble === "string" ? parseAlg(scramble) : scramble);
  const known = options.known ? new Set(options.known) : null;
  const sides = options.sides ?? (["L", "R", "F", "B", "U", "D"] as Face[]);
  const bySide = sides.map((side) => analyzeRouxSide(state, side, known)).sort((a, b) => a.length - b.length);
  return { bySide, best: bySide[0] };
}

/** Does following it (as held) solve the cube? */
export function rouxFollowsThrough(scramble: State, a: RouxAnalysis): boolean {
  let s = reframe(scramble, a.frame);
  for (const st of a.steps) s = applyMoves(s, st.moves);
  return isSolved(s);
}
