/**
 * F2L case recognition — which of the 41 standard cases a slot's pair is
 * in, colour neutral and scheme-free (colours relative to the centres), for
 * a cube held with the cross on D. The pair counts when its corner and edge
 * are in the top layer or in their own slot (a piece stuck in another slot
 * is not one of the 41 — "advanced F2L").
 *
 *   recognizeF2L(state, "FR")   // { id: "F2L 7", group: "Connected Pairs", preAuf: "U'", alg: "U' R U2 R' U2 R U' R'" } | "solved" | null
 */

import { CORNER_FACELETS, EDGE_FACELETS, type State, applyMoves, colorAt, invert, parseAlg, solvedState } from "@cubecore/core";
import { type F2LCase, F2L_CASES } from "./f2lData";
import type { F2LSlot } from "./slots";

export { F2L_CASES, type F2LCase } from "./f2lData";

const AUFS = ["", "U", "U2", "U'"];
const CENTRE = { U: 4, R: 13, F: 22, D: 31, L: 40, B: 49 } as const;
const SIDES: Record<F2LSlot, readonly ["F" | "B", "R" | "L"]> = { FR: ["F", "R"], FL: ["F", "L"], BL: ["B", "L"], BR: ["B", "R"] };
/** Kociemba positions of each slot's corner and edge (DFR / FR…). */
const HOME: Record<F2LSlot, { corner: number; edge: number }> = {
  FR: { corner: 4, edge: 8 },
  FL: { corner: 5, edge: 9 },
  BL: { corner: 6, edge: 10 },
  BR: { corner: 7, edge: 11 },
};
const TOP_CORNERS = [0, 1, 2, 3], TOP_EDGES = [0, 1, 2, 3];

interface Pair {
  corner: number;
  cornerOri: number;
  edge: number;
  edgeOri: number;
}

/** Where the slot's pair is (Kociemba positions) and how it's turned, read by colour. */
function pairOf(s: State, slot: F2LSlot): Pair | null {
  const bottom = colorAt(s, CENTRE.D);
  const [a, b] = SIDES[slot].map((f) => colorAt(s, CENTRE[f]));
  const corner = CORNER_FACELETS.findIndex((fs) => [bottom, a, b].every((c) => fs.some((f) => colorAt(s, f) === c)));
  const edge = EDGE_FACELETS.findIndex((fs) => [a, b].every((c) => fs.some((f) => colorAt(s, f) === c)));
  if (corner < 0 || edge < 0) return null;
  return {
    corner,
    cornerOri: CORNER_FACELETS[corner].findIndex((f) => colorAt(s, f) === bottom),
    edge,
    edgeOri: EDGE_FACELETS[edge].findIndex((f) => colorAt(s, f) === a),
  };
}

const pairText = (p: Pair) => `${p.corner}.${p.cornerOri}|${p.edge}.${p.edgeOri}`;
/** Up to the angle (a U turn before the algorithm). */
function key(s: State, slot: F2LSlot): string | null {
  const texts = AUFS.map((u) => pairOf(u ? applyMoves(s, u) : s, slot)).map((p) => (p ? pairText(p) : ""));
  return texts.includes("") ? null : texts.sort()[0];
}

const tables = new Map<F2LSlot, Map<string, { kase: F2LCase; raw: string }>>();
function table(slot: F2LSlot) {
  let t = tables.get(slot);
  if (t) return t;
  t = new Map();
  for (const kase of F2L_CASES) {
    const s = applyMoves(solvedState(), invert(parseAlg(kase.algs[slot])));
    const k = key(s, slot)!;
    if (t.has(k)) throw new Error(`${slot} ${kase.id} looks like ${t.get(k)!.kase.id}`);
    t.set(k, { kase, raw: pairText(pairOf(s, slot)!) });
  }
  tables.set(slot, t);
  return t;
}

export interface F2LMatch {
  id: string;
  group: string;
  slot: F2LSlot;
  /** The U turn before the algorithm, as the cube is held (cross on D). */
  preAuf: string;
  alg: string;
}

/** Is the slot's pair in the top layer or its own slot (one of the 41 cases, or solved)? */
export function isStandardF2L(s: State, slot: F2LSlot): boolean {
  const p = pairOf(s, slot);
  return !!p && (TOP_CORNERS.includes(p.corner) || p.corner === HOME[slot].corner) && (TOP_EDGES.includes(p.edge) || p.edge === HOME[slot].edge);
}

/**
 * The F2L case of `slot` for a cube held with the cross on D: the case,
 * "solved" (pair in place), or null when a piece is in another slot
 * (not one of the 41).
 */
export function recognizeF2L(s: State, slot: F2LSlot): F2LMatch | "solved" | null {
  const p = pairOf(s, slot);
  if (!p) return null;
  if (p.corner === HOME[slot].corner && p.cornerOri === 0 && p.edge === HOME[slot].edge && p.edgeOri === 0) return "solved";
  if (!isStandardF2L(s, slot)) return null;
  const k = key(s, slot);
  const e = k ? table(slot).get(k) : undefined;
  if (!e) return null;
  const preAuf = AUFS.find((u) => {
    const q = pairOf(u ? applyMoves(s, u) : s, slot);
    return q !== null && pairText(q) === e.raw;
  }) ?? "";
  return { id: e.kase.id, group: e.kase.group, slot, preAuf, alg: e.kase.algs[slot] };
}
