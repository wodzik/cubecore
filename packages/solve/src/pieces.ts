/**
 * The cube as pieces for the solvers: Kociemba corner / edge permutation +
 * orientation (core cubies.ts numbering), the 18 face turns as such piece
 * permutations (derived from cubecore's move geometry), and composition.
 */

import { type Move, applyMove, solvedState, toCubies } from "@cubecore/core";


export interface CC {
  cp: number[];
  co: number[];
  ep: number[];
  eo: number[];
}

const FACE_ORDER = ["U", "R", "F", "D", "L", "B"] as const;
/** The 18 face turns, index = face × 3 + (0: quarter, 1: half, 2: prime). */
export const MOVES: readonly Move[] = FACE_ORDER.flatMap((family) => ([1, 2, -1] as const).map((amount) => ({ family, amount })));

/** Pieces after `b` is applied to `a`. */
export function mul(a: CC, b: CC): CC {
  return {
    cp: b.cp.map((p) => a.cp[p]),
    co: b.cp.map((p, i) => (a.co[p] + b.co[i]) % 3),
    ep: b.ep.map((p) => a.ep[p]),
    eo: b.ep.map((p, i) => (a.eo[p] + b.eo[i]) % 2),
  };
}

export const SOLVED_CC: CC = { cp: [0, 1, 2, 3, 4, 5, 6, 7], co: new Array(8).fill(0), ep: Array.from({ length: 12 }, (_, i) => i), eo: new Array(12).fill(0) };
// Each move as pieces, derived from cubecore's own move geometry (no hand-typed tables).
export const MOVE_CC: CC[] = MOVES.map((m) => {
  const c = toCubies(applyMove(solvedState(), m))!;
  return { cp: c.cp, co: c.co, ep: c.ep, eo: c.eo };
});

