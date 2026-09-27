/**
 * OLL / PLL recognition — colour neutral, any colour scheme.
 *
 * Works on colours relative to the centres, like a solver looking at the
 * cube: OLL is where the top colour faces on the eight last-layer pieces;
 * PLL is the colours of the top rows on the four sides, relative to their
 * centres. Both are compared up to the angle you look from (pre-AUF) and,
 * for PLL, up to a final U turn. The patterns are built from the cases'
 * algorithms (caseData.ts), so every pattern is exactly one case — the
 * tests check all 216 orientations and 288 permutations.
 *
 *   recognizeLastLayer(cube.state)
 *   // { face: "U", oll: { id: "OLL 27", preAuf: "U'" } | "skip", pll: null }   (null until OLL is done)
 */

import { CORNER_FACELETS, EDGE_FACELETS, FRAMES, type Face, type State, applyMoves, colorAt, checks, invert, parseAlg, solvedState, view } from "@cubecore/core";
import { type LastLayerCase, OLL_CASES, PLL_CASES } from "./caseData";

export { OLL_CASES, PLL_CASES, type LastLayerCase } from "./caseData";

/** Last-layer pieces in turning order (index + 1 = the next one round the top): corners URF UFL ULB UBR, edges UF UL UB UR. */
const LL_CORNERS = [0, 1, 2, 3].map((i) => CORNER_FACELETS[i]); // U sticker first, then clockwise
const LL_EDGES = [1, 2, 3, 0].map((i) => EDGE_FACELETS[i]); // U sticker first
/** Top rows of the side faces in the same turning order as the pieces (F, L, B, R), each left to right. */
const SIDE_ROWS = [[18, 19, 20], [36, 37, 38], [45, 46, 47], [9, 10, 11]];
const SIDE_CENTRES = [22, 40, 49, 13];
const U_CENTRE = 4;
const AUFS = ["", "U", "U2", "U'"];

const shift = <T>(a: readonly T[], k: number) => a.map((_, i) => a[(i + k) % a.length]);

/** Where the top colour faces on each last-layer piece (corners 0–2 clockwise from U, edges 0–1), in turning order. */
function orientation(s: State): { corners: number[]; edges: number[] } {
  const top = colorAt(s, U_CENTRE);
  return {
    corners: LL_CORNERS.map((fs) => fs.findIndex((f) => colorAt(s, f) === top)),
    edges: LL_EDGES.map((fs) => fs.findIndex((f) => colorAt(s, f) === top)),
  };
}

const ollRaw = (s: State) => {
  const o = orientation(s);
  return `${o.corners.join("")}|${o.edges.join("")}`;
};
/** The same up to the angle it's seen from. */
const ollKey = (s: State) => {
  const o = orientation(s);
  return [0, 1, 2, 3].map((k) => `${shift(o.corners, k).join("")}|${shift(o.edges, k).join("")}`).sort()[0];
};

/** Each top-row sticker's colour as a step round the sides from its own face (0 = the face's centre colour). */
function sideOffsets(s: State): number[][] {
  const ring = SIDE_CENTRES.map((c) => colorAt(s, c));
  return SIDE_ROWS.map((row, face) => row.map((f) => (ring.indexOf(colorAt(s, f)) - face + 4) % 4));
}
const pllText = (rows: number[][], add: number) => rows.map((r) => r.map((v) => (v + add) % 4).join("")).join("|");
/** Up to a final U turn (all offsets move together). */
const pllRaw = (s: State) => {
  const rows = sideOffsets(s);
  return [0, 1, 2, 3].map((a) => pllText(rows, a)).sort()[0];
};
/** …and up to the angle it's seen from. */
const pllKey = (s: State) => {
  const rows = sideOffsets(s);
  return [0, 1, 2, 3].flatMap((k) => [0, 1, 2, 3].map((a) => pllText(shift(rows, k), a))).sort()[0];
};

interface Entry {
  kase: LastLayerCase;
  /** Pattern of the case as its algorithm expects it (no pre-AUF). */
  raw: string;
}

function table(cases: readonly LastLayerCase[], key: (s: State) => string, raw: (s: State) => string): Map<string, Entry> {
  const map = new Map<string, Entry>();
  for (const kase of cases) {
    const s = applyMoves(solvedState(), invert(parseAlg(kase.alg)));
    const k = key(s);
    if (map.has(k)) throw new Error(`${kase.id} looks like ${map.get(k)!.kase.id}`);
    map.set(k, { kase, raw: raw(s) });
  }
  return map;
}

let ollTable: Map<string, Entry> | null = null;
let pllTable: Map<string, Entry> | null = null;
const SOLVED_OLL = ollKey(solvedState());
const SOLVED_PLL = pllKey(solvedState());

export interface CaseMatch {
  /** "OLL 27", "T"… */
  id: string;
  group: string;
  /** The U turn before the case's algorithm, as the cube is held now ("" = none). */
  preAuf: string;
  alg: string;
}

/** The OLL case of a cube held with the last layer on U (F2L solved) — null for an OLL skip. */
export function recognizeOll(s: State): CaseMatch | null {
  ollTable ??= table(OLL_CASES, ollKey, ollRaw);
  const k = ollKey(s);
  if (k === SOLVED_OLL) return null;
  const e = ollTable.get(k);
  if (!e) throw new Error("Not a last-layer orientation");
  const preAuf = AUFS.find((a) => ollRaw(a ? applyMoves(s, a) : s) === e.raw) ?? "";
  return { id: e.kase.id, group: e.kase.group, preAuf, alg: e.kase.alg };
}

/** The PLL case of a cube held with the last layer on U (oriented) — null when it's solved up to AUF. */
export function recognizePll(s: State): CaseMatch | null {
  pllTable ??= table(PLL_CASES, pllKey, pllRaw);
  const k = pllKey(s);
  if (k === SOLVED_PLL) return null;
  const e = pllTable.get(k);
  if (!e) throw new Error("Not a last-layer permutation");
  const preAuf = AUFS.find((a) => pllRaw(a ? applyMoves(s, a) : s) === e.raw) ?? "";
  return { id: e.kase.id, group: e.kase.group, preAuf, alg: e.kase.alg };
}

export interface LastLayer {
  /** Physical face the last layer is on. */
  face: Face;
  /** The OLL case, or "skip" (already oriented). */
  oll: CaseMatch | "skip";
  /** The PLL case once oriented ("skip": solved up to AUF); null while OLL isn't done. */
  pll: CaseMatch | "skip" | null;
}

/** One frame per bottom face — which one has F2L solved tells where the last layer is. */
const BY_BOTTOM = (["U", "R", "F", "D", "L", "B"] as Face[]).map((d) => FRAMES.find((f) => f.face.D === d)!);

/**
 * OLL and PLL of a cube with F2L solved on any face (colour neutral), or null
 * if no F2L is solved. `preAuf` is said as the cube is held with the last
 * layer on top and that frame's front in front.
 */
export function recognizeLastLayer(state: State): LastLayer | null {
  for (const frame of BY_BOTTOM) {
    const s = view(state, frame);
    if (!checks.f2lSolved(s)) continue;
    const oll = recognizeOll(s);
    const pll = oll ? null : recognizePll(s);
    return { face: frame.face.U, oll: oll ?? "skip", pll: oll ? null : (pll ?? "skip") };
  }
  return null;
}
