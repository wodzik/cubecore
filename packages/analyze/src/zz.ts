/**
 * Scramble analysis for ZZ: for each cross colour, EOCross (every edge
 * oriented, on the better of the two EO axes), then the four pairs with
 * R, U and L only — edges stay oriented — in the best order, then the last
 * layer: with the edges oriented the OLL is an OCLL case (or a skip), then
 * PLL.
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
  pairOrder: F2LSlot[];
}

export interface ZZAnalysisResult {
  byCross: ZZAnalysis[];
  best: ZZAnalysis;
}

const RUL = ["R", "U", "L"] as const;

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
  const byCross = faces.map((f) => analyzeZZCross(state, f, known)).sort((a, b) => a.length - b.length);
  return { byCross, best: byCross[0] };
}

export function zzFollowsThrough(scramble: State, a: ZZAnalysis): boolean {
  let s = reframe(scramble, a.frame);
  for (const st of a.steps) s = applyMoves(s, st.moves);
  return isSolved(s);
}
