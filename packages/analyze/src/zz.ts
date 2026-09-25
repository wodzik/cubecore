/**
 * Scramble analysis for ZZ, either way in:
 *   "eocross" — EOCross (every edge oriented, on the better of the two EO
 *               axes), then the four pairs with R, U and L only in the best order;
 *   "eoline"  — EOLine (edges oriented, DF + DB), then the left and right
 *               blocks with R U L (the better order);
 * then the last layer: with the edges oriented the OLL is an OCLL case (or a
 * skip), then PLL.
 *
 *   const z = analyzeZZ(scramble);
 *   z.best.steps       // eocross, pair ×4 (R U L), oll (OCLL), pll, auf
 *   z.best.eoAxis      // the physical faces EO is judged against, e.g. ["F", "B"]
 */

import { FRAMES, type Face, type Frame, type Move, type State, applyMoves, isSolved, moveCount, parseAlg, reframe, solvedState } from "@cubecore/core";
import type { F2LSlot } from "@cubecore/cfop";
import { ZZ_TRAINERS } from "@cubecore/zz";
import { stageSolver } from "@cubecore/solve";
import { type AnalysisStep, lastLayer, planPairs } from "./index";
import { rotationFor } from "./rotations";

export interface ZZAnalyzeOptions {
  /** "eocross" (default) or classic "eoline" + blocks. */
  start?: "eocross" | "eoline";
  /** Physical faces to put the cross on (default all six). */
  crosses?: readonly Face[];
  /** Case ids the solver knows ("OLL 27", "T"…). */
  known?: Iterable<string>;
}

export interface ZZAnalysis {
  face: Face;
  /** The physical faces the edges are oriented against (the front / back as held). */
  eoAxis: [Face, Face];
  rotation: string;
  frame: Frame;
  /** "cross" is the EOCross; pairs are R / U / L only. */
  steps: AnalysisStep[];
  length: number;
  /** EOCross: the order of the pairs; EOLine: empty (see blockOrder). */
  pairOrder: F2LSlot[];
  /** EOLine: which block went first. */
  blockOrder?: ("left" | "right")[];
}

export interface ZZAnalysisResult {
  byCross: ZZAnalysis[];
  best: ZZAnalysis;
}

const RUL = ["R", "U", "L"] as const;

/** EOLine, then the two blocks (R U L) in the better order. */
export function analyzeZZLine(scrambled: State, face: Face, known: Set<string> | null = null): ZZAnalysis {
  const line = stageSolver(ZZ_TRAINERS.eoline());
  let best: { frame: Frame; moves: Move[] } | null = null;
  for (const frame of FRAMES.filter((f) => f.face.D === face)) {
    const sol = line.solve(reframe(scrambled, frame), { maxDepth: 10 })[0];
    if (sol && (!best || sol.length < best.moves.length)) best = { frame, moves: sol };
  }
  const { frame } = best!;
  const afterLine = applyMoves(reframe(scrambled, frame), best!.moves);
  const both = stageSolver(ZZ_TRAINERS.block("right", true));
  let blocks: { order: ("left" | "right")[]; first: Move[]; second: Move[] } | null = null;
  for (const first of ["left", "right"] as const) {
    const a = stageSolver(ZZ_TRAINERS.block(first)).solve(afterLine, { maxDepth: 18 })[0];
    if (!a) continue;
    const b = both.solve(applyMoves(afterLine, a), { maxDepth: 18 })[0];
    if (!b) continue;
    if (!blocks || a.length + b.length < blocks.first.length + blocks.second.length) {
      blocks = { order: [first, first === "left" ? "right" : "left"], first: a, second: b };
    }
  }
  const steps: AnalysisStep[] = [
    { step: "eoline", moves: best!.moves },
    { step: "block", side: blocks!.order[0], moves: blocks!.first },
    { step: "block", side: blocks!.order[1], moves: blocks!.second },
  ];
  const ll = lastLayer(applyMoves(afterLine, [...blocks!.first, ...blocks!.second]), known);
  steps.push(...ll.steps);
  return {
    face,
    eoAxis: [frame.face.F, frame.face.B],
    rotation: rotationFor(frame),
    frame,
    steps,
    length: steps.reduce((n, st) => n + moveCount(st.moves), 0),
    pairOrder: [],
    blockOrder: blocks!.order,
  };
}

export function analyzeZZCross(scrambled: State, face: Face, known: Set<string> | null = null): ZZAnalysis {
  // EOCross on the better axis: frames with this bottom differ in which faces are front / back.
  const eo = stageSolver(ZZ_TRAINERS.eocross());
  let best: { frame: Frame; moves: Move[] } | null = null;
  for (const frame of FRAMES.filter((f) => f.face.D === face)) {
    const sol = eo.solve(reframe(scrambled, frame), { maxDepth: 12 })[0];
    if (sol && (!best || sol.length < best.moves.length)) best = { frame, moves: sol };
  }
  const { frame } = best!;
  const steps: AnalysisStep[] = [{ step: "cross", moves: best!.moves }];
  let s = applyMoves(reframe(scrambled, frame), best!.moves);
  const pairs = planPairs(s, [], "optimal", known, [...RUL]);
  steps.push(...pairs.steps);
  s = pairs.state;
  const ll = lastLayer(s, known);
  steps.push(...ll.steps);
  return {
    face,
    eoAxis: [frame.face.F, frame.face.B],
    rotation: rotationFor(frame),
    frame,
    steps,
    length: steps.reduce((n, st) => n + moveCount(st.moves), 0),
    pairOrder: pairs.order,
  };
}

export function analyzeZZ(scramble: string | readonly Move[] | State, options: ZZAnalyzeOptions = {}): ZZAnalysisResult {
  const state = scramble instanceof Uint8Array ? scramble : applyMoves(solvedState(), typeof scramble === "string" ? parseAlg(scramble) : scramble);
  const known = options.known ? new Set(options.known) : null;
  const faces = options.crosses ?? (["D", "U", "F", "B", "L", "R"] as Face[]);
  const analyse = options.start === "eoline" ? analyzeZZLine : analyzeZZCross;
  const byCross = faces.map((f) => analyse(state, f, known)).sort((a, b) => a.length - b.length);
  return { byCross, best: byCross[0] };
}

export function zzFollowsThrough(scramble: State, a: ZZAnalysis): boolean {
  let s = reframe(scramble, a.frame);
  for (const st of a.steps) s = applyMoves(s, st.moves);
  return isSolved(s);
}
