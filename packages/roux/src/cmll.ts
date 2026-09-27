/**
 * CMLL recognition — the last-layer corners with both blocks built, colour
 * neutral and scheme-free. Read relative to the BLOCKS (the M slice may be
 * off): L / R colours from the side centres, front / back / bottom from the
 * first block's own stickers, the top colour is the one left. Corners only
 * (the edges are LSE), compared up to the angle (pre-AUF) and a final U turn.
 *
 *   recognizeCmll(state)   // { id: "Sune Left Bar", group: "Sune", preAuf: "U", alg } | null (skip) — cube held blocks L/R, bottom D
 */

import { CORNER_FACELETS, FRAMES, type State, applyMoves, colorAt, fromCubies, invert, parseAlg, solvedState, view } from "@cubecore/core";
import { CMLL_CASES, type CmllCase } from "./cmllData";

export { CMLL_CASES, type CmllCase } from "./cmllData";

/** Last-layer corners in turning order: URF UFL ULB UBR (U sticker first, then clockwise). */
const U_CORNERS = [0, 1, 2, 3].map((i) => CORNER_FACELETS[i]);
const AUFS = ["", "U", "U2", "U'"];
// Reference stickers: side centres L and R; the first block's DL edge (bottom), FL edge (front), BL edge (back).
const L_CENTRE = 40, R_CENTRE = 13, DL_BOTTOM = 30, FL_FRONT = 21, BL_BACK = 50;

interface Corners {
  /** Which home corner (URF UFL ULB UBR = 0..3) sits at each position, or -1 if it isn't a top corner. */
  cp: number[];
  /** Where the top colour faces (0 = up, 1 / 2 clockwise). */
  co: number[];
}

function corners(s: State): Corners | null {
  const L = colorAt(s, L_CENTRE), R = colorAt(s, R_CENTRE);
  const front = colorAt(s, FL_FRONT), back = colorAt(s, BL_BACK), bottom = colorAt(s, DL_BOTTOM);
  const top = [0, 1, 2, 3, 4, 5].find((c) => ![L, R, front, back, bottom].includes(c));
  if (top === undefined) return null;
  // Home corners by their two side colours.
  const HOME = [
    [R, front],
    [front, L],
    [L, back],
    [back, R],
  ];
  const cp: number[] = [], co: number[] = [];
  for (const fs of U_CORNERS) {
    const cols = fs.map((f) => colorAt(s, f));
    const o = cols.indexOf(top);
    if (o < 0) return null;
    const sides = cols.filter((_, i) => i !== o);
    cp.push(HOME.findIndex((h) => h.every((c) => sides.includes(c))));
    co.push(o);
  }
  return cp.includes(-1) ? null : { cp, co };
}

const shift = <T>(a: readonly T[], k: number) => a.map((_, i) => a[(i + k) % a.length]);
const text = (c: Corners, k: number, b: number) => `${shift(c.cp, k).map((v) => (v + b) % 4).join("")}|${shift(c.co, k).join("")}`;
/** Up to a final U turn. */
const raw = (c: Corners) => [0, 1, 2, 3].map((b) => text(c, 0, b)).sort()[0];
/** …and up to the angle. */
const key = (c: Corners) => [0, 1, 2, 3].flatMap((k) => [0, 1, 2, 3].map((b) => text(c, k, b))).sort()[0];

let TABLE: Map<string, { kase: CmllCase; raw: string }> | null = null;
function table() {
  if (TABLE) return TABLE;
  TABLE = new Map();
  for (const kase of CMLL_CASES) {
    const c = corners(applyMoves(solvedState(), invert(parseAlg(kase.alg))))!;
    const k = key(c);
    if (TABLE.has(k)) throw new Error(`${kase.id} looks like ${TABLE.get(k)!.kase.id}`);
    TABLE.set(k, { kase, raw: raw(c) });
  }
  return TABLE;
}
const SOLVED = key(corners(solvedState())!);

export interface CmllMatch {
  id: string;
  group: string;
  /** The U turn before the case's algorithm, as the cube is held now. */
  preAuf: string;
  alg: string;
}

/**
 * The CMLL case of a cube held with the blocks on L / R and their bottom
 * on D (both blocks solved) — null when the corners are already solved (up
 * to AUF) or it isn't a CMLL state.
 */
export function recognizeCmll(s: State): CmllMatch | null {
  const c = corners(s);
  if (!c) return null;
  const k = key(c);
  if (k === SOLVED) return null;
  const e = table().get(k);
  if (!e) return null;
  const preAuf = AUFS.find((a) => {
    const t = corners(a ? applyMoves(s, a) : s);
    return t !== null && raw(t) === e.raw;
  }) ?? "";
  return { id: e.kase.id, group: e.kase.group, preAuf, alg: e.kase.alg };
}

/** CMLL of a cube with both Roux blocks built in any orientation (colour neutral): the frame, or null. */
export function recognizeCmllAnywhere(state: State, blocksBuilt: (s: State) => boolean): { match: CmllMatch | "skip"; frame: (typeof FRAMES)[number] } | null {
  for (const frame of FRAMES) {
    const s = view(state, frame);
    if (!blocksBuilt(s)) continue;
    return { match: recognizeCmll(s) ?? "skip", frame };
  }
  return null;
}

/**
 * A cube to practise one CMLL case on: both blocks solved, the corners in
 * the case (from a random angle), the last six edges random. Make a
 * scramble to it with @cubecore/solve `scrambleTo(state, { from })`.
 */
export function cmllCaseState(id: string, random: () => number = Math.random): State {
  const kase = CMLL_CASES.find((c) => c.id === id);
  if (!kase) throw new Error(`Unknown CMLL case: ${id}`);
  const c = corners(applyMoves(solvedState(), invert(parseAlg(kase.alg))))!;
  // Last six edges (UR UF UL UB DF DB = 0 1 2 3 5 7): any order and flips the corners' parity allows.
  const lse = [0, 1, 2, 3, 5, 7];
  const parity = (p: number[]) => p.reduce((acc, v, i) => acc + p.slice(i + 1).filter((w) => w < v).length, 0) % 2;
  let order: number[];
  do order = [...lse].sort(() => random() - 0.5);
  while (parity(order) !== parity(c.cp));
  const ep = Array.from({ length: 12 }, (_, i) => i);
  lse.forEach((pos, i) => (ep[pos] = order[i]));
  const eo = new Array(12).fill(0);
  let flips = 0;
  for (const pos of lse.slice(1)) flips += eo[pos] = random() < 0.5 ? 1 : 0;
  eo[lse[0]] = flips % 2;
  const state = fromCubies({ frame: FRAMES[0], cp: [...c.cp, 4, 5, 6, 7], co: [...c.co, 0, 0, 0, 0], ep, eo });
  return applyMoves(state, AUFS[Math.floor(random() * 4)] || []);
}
