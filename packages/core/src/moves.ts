/**
 * Moves as facelet permutations, derived from geometry.ts.
 *
 * Families: face turns U R F D L B, slices M E S (M follows L, E follows D,
 * S follows F), wide turns u r f d l b (also written Uw, Rw…), and whole-cube
 * rotations x y z (x follows R, y follows U, z follows F).
 *
 * A permutation `p` is applied as `next[i] = prev[p[i]]`.
 */

import { type Axis, FACELETS, FACELET_COUNT, faceletAt, rotate } from "./geometry";

export type MoveFamily =
  | "U" | "R" | "F" | "D" | "L" | "B"
  | "u" | "r" | "f" | "d" | "l" | "b"
  | "M" | "E" | "S"
  | "x" | "y" | "z";

/** 1 = clockwise quarter, 2 = half, -1 = counter-clockwise (prime). */
export type Amount = 1 | 2 | -1;

export interface Move {
  family: MoveFamily;
  amount: Amount;
}

export type MoveKind = "face" | "wide" | "slice" | "rotation";

interface FamilyDef {
  axis: Axis;
  /** Counter-clockwise quarter turns about +axis for ONE clockwise turn of this family. */
  q: 1 | -1;
  /** Which layer coordinates along the axis turn. */
  layers: readonly number[];
  kind: MoveKind;
}

const ALL = [-1, 0, 1] as const;

export const FAMILY: Record<MoveFamily, FamilyDef> = {
  R: { axis: 0, q: -1, layers: [1], kind: "face" },
  L: { axis: 0, q: 1, layers: [-1], kind: "face" },
  U: { axis: 1, q: -1, layers: [1], kind: "face" },
  D: { axis: 1, q: 1, layers: [-1], kind: "face" },
  F: { axis: 2, q: -1, layers: [1], kind: "face" },
  B: { axis: 2, q: 1, layers: [-1], kind: "face" },
  r: { axis: 0, q: -1, layers: [1, 0], kind: "wide" },
  l: { axis: 0, q: 1, layers: [-1, 0], kind: "wide" },
  u: { axis: 1, q: -1, layers: [1, 0], kind: "wide" },
  d: { axis: 1, q: 1, layers: [-1, 0], kind: "wide" },
  f: { axis: 2, q: -1, layers: [1, 0], kind: "wide" },
  b: { axis: 2, q: 1, layers: [-1, 0], kind: "wide" },
  M: { axis: 0, q: 1, layers: [0], kind: "slice" },
  E: { axis: 1, q: 1, layers: [0], kind: "slice" },
  S: { axis: 2, q: -1, layers: [0], kind: "slice" },
  x: { axis: 0, q: -1, layers: ALL, kind: "rotation" },
  y: { axis: 1, q: -1, layers: ALL, kind: "rotation" },
  z: { axis: 2, q: -1, layers: ALL, kind: "rotation" },
};

export const MOVE_FAMILIES = Object.keys(FAMILY) as MoveFamily[];

export type Permutation = Uint8Array;

export function identityPermutation(): Permutation {
  return Uint8Array.from({ length: FACELET_COUNT }, (_, i) => i);
}

/** `a` then `b`. */
export function composePermutations(a: Permutation, b: Permutation): Permutation {
  const out = new Uint8Array(FACELET_COUNT);
  for (let i = 0; i < FACELET_COUNT; i++) out[i] = a[b[i]];
  return out;
}

function quarterPermutation(def: FamilyDef): Permutation {
  const perm = identityPermutation();
  for (const f of FACELETS) {
    if (!def.layers.includes(f.pos[def.axis])) continue;
    const dest = faceletAt(rotate(f.pos, def.axis, def.q), rotate(f.normal, def.axis, def.q));
    perm[dest] = f.index;
  }
  return perm;
}

const PERMS = new Map<string, Permutation>();
for (const family of MOVE_FAMILIES) {
  const q1 = quarterPermutation(FAMILY[family]);
  const q2 = composePermutations(q1, q1);
  const q3 = composePermutations(q2, q1);
  PERMS.set(`${family}1`, q1);
  PERMS.set(`${family}2`, q2);
  PERMS.set(`${family}-1`, q3);
}

export function movePermutation(move: Move): Permutation {
  return PERMS.get(`${move.family}${move.amount}`)!;
}

export function moveKind(move: Move): MoveKind {
  return FAMILY[move.family].kind;
}

export function invertMove(move: Move): Move {
  return { family: move.family, amount: move.amount === 2 ? 2 : (-move.amount as Amount) };
}

export function formatMove(move: Move): string {
  return move.family + (move.amount === 2 ? "2" : move.amount === -1 ? "'" : "");
}

/** Normalise a quarter-turn count to an Amount, or null for a full turn. */
export function toAmount(quarters: number): Amount | null {
  const n = ((quarters % 4) + 4) % 4;
  return n === 0 ? null : n === 1 ? 1 : n === 2 ? 2 : -1;
}

export const amountQuarters = (a: Amount): number => (a === -1 ? 3 : a);
