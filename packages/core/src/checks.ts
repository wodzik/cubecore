/**
 * Stage checks, written for the CANONICAL frame (run them on
 * `view(state, frame)`). Canonical conventions:
 *   - CFOP / LBL / ZZ / Petrus: first layer on D, last layer on U.
 *   - Roux: first block on L, second on R, both on the bottom (D) layer.
 *   - Petrus: 2×2×2 at D-B-L, extended to 2×2×3 along the left-bottom.
 *   - EO: edge orientation for the F/B axis (ZZ, Petrus) or relative to the
 *     top/bottom colours (Roux LSE).
 *
 * "Solved" pieces show the colour of the centre of the face they sit on —
 * except where the method moves centres (Roux M slices), where pieces are
 * compared to each other instead. No absolute colours anywhere.
 */

import { CUBIES, type Cubie, FACELETS, FACES, type Face, type Vec3 } from "./geometry";
import { parseAlg } from "./notation";
import { type State, applyMoves, colorAt, isSolved } from "./state";

// ─── helpers ───

const faceIndex = (face: Face) => FACES.indexOf(face);
const centerIdx = (face: Face) => faceIndex(face) * 9 + 4;
export const opposite = (color: number) => (color + 3) % 6;

function cubieAt(x: number, y: number, z: number): Cubie {
  return CUBIES.find((c) => c.pos[0] === x && c.pos[1] === y && c.pos[2] === z)!;
}
const cubiesWhere = (pred: (p: Vec3) => boolean) => CUBIES.filter((c) => pred(c.pos));

/** Facelet of `cubie` that faces `face`, or undefined. */
function faceletOn(cubie: Cubie, face: Face): number | undefined {
  return cubie.facelets.find((f) => FACELETS[f].face === face);
}

const matchesCenter = (s: State, facelet: number) => colorAt(s, facelet) === colorAt(s, centerIdx(FACELETS[facelet].face));
const cubieSolved = (s: State, c: Cubie) => c.facelets.every((f) => matchesCenter(s, f));
const allSolved = (s: State, cubies: readonly Cubie[]) => cubies.every((c) => cubieSolved(s, c));

/** True if some U-layer turn (none, U, U2, U') makes `pred` hold. */
const U_TURNS = [[], parseAlg("U"), parseAlg("U2"), parseAlg("U'")];
function upToAuf(s: State, pred: (s: State) => boolean): boolean {
  return U_TURNS.some((t) => pred(t.length ? applyMoves(s, t) : s));
}

// ─── F2L-slot geometry (canonical: D bottom) ───

export type Slot = "FR" | "FL" | "BR" | "BL";
export const SLOTS: readonly Slot[] = ["FR", "FL", "BR", "BL"];
const SLOT_XZ: Record<Slot, [number, number]> = { FR: [1, 1], FL: [-1, 1], BR: [1, -1], BL: [-1, -1] };

const slotCorner = (slot: Slot) => cubieAt(SLOT_XZ[slot][0], -1, SLOT_XZ[slot][1]);
const slotEdge = (slot: Slot) => cubieAt(SLOT_XZ[slot][0], 0, SLOT_XZ[slot][1]);

// ─── CFOP / LBL ───

const CROSS = cubiesWhere((p) => p[1] === -1 && p.filter((v) => v !== 0).length === 2);
const FIRST_LAYER = cubiesWhere((p) => p[1] === -1);
const F2L = cubiesWhere((p) => p[1] <= 0);
const U_CORNERS = cubiesWhere((p) => p[1] === 1 && p[0] !== 0 && p[2] !== 0);
const U_EDGES = cubiesWhere((p) => p[1] === 1 && (p[0] === 0) !== (p[2] === 0));

export const crossSolved = (s: State) => allSolved(s, CROSS);
export const firstLayerSolved = (s: State) => allSolved(s, FIRST_LAYER);
export const f2lSolved = (s: State) => allSolved(s, F2L);
export const pairSolved = (s: State, slot: Slot) => cubieSolved(s, slotCorner(slot)) && cubieSolved(s, slotEdge(slot));
export const slotCornerSolved = (s: State, slot: Slot) => cubieSolved(s, slotCorner(slot));
export const slotEdgeSolved = (s: State, slot: Slot) => cubieSolved(s, slotEdge(slot));
export const solvedPairs = (s: State) => SLOTS.filter((slot) => pairSolved(s, slot));

const topColor = (s: State) => colorAt(s, centerIdx("U"));
const onTop = (s: State, cubies: readonly Cubie[]) => cubies.every((c) => colorAt(s, faceletOn(c, "U")!) === topColor(s));

/** OLL: the whole top face shows the top centre's colour. */
export const topOriented = (s: State) => onTop(s, U_CORNERS) && onTop(s, U_EDGES);
export const topCornersOriented = (s: State) => onTop(s, U_CORNERS);
export const topEdgesOriented = (s: State) => onTop(s, U_EDGES);
/** PLL done, possibly short of the final U turn (AUF). */
export const solvedUpToAuf = (s: State) => upToAuf(s, isSolved);
/** Last-layer corners in place (relative to each other and F2L), up to AUF. */
export const llCornersPermuted = (s: State) => upToAuf(s, (t) => allSolved(t, U_CORNERS));

// ─── Edge orientation ───

/**
 * ZZ / Petrus EO for the F/B axis: an edge is good if it can be solved
 * without F/B quarter turns. Look at its sticker on U/D (or, for an E-slice
 * edge, on F/B): U/D colour → good, L/R colour → bad, F/B colour → bad only
 * if the other sticker is a U/D colour.
 */
export function edgeOrientedFB(s: State, edge: Cubie): boolean {
  const ud = [colorAt(s, centerIdx("U")), colorAt(s, centerIdx("D"))];
  const lr = [colorAt(s, centerIdx("L")), colorAt(s, centerIdx("R"))];
  const primaryFaces: Face[] = edge.pos[1] !== 0 ? ["U", "D"] : ["F", "B"];
  const primary = edge.facelets.find((f) => primaryFaces.includes(FACELETS[f].face))!;
  const other = edge.facelets.find((f) => f !== primary)!;
  const c = colorAt(s, primary);
  if (ud.includes(c)) return true;
  if (lr.includes(c)) return false;
  return !ud.includes(colorAt(s, other));
}

const EDGES = CUBIES.filter((c) => c.kind === "edge");
export const edgesOrientedFB = (s: State) => EDGES.every((e) => edgeOrientedFB(s, e));

// ─── ZZ ───

const DF = cubieAt(0, -1, 1);
const DB = cubieAt(0, -1, -1);
const LEFT_BLOCK = cubiesWhere((p) => p[0] === -1 && p[1] <= 0);
const RIGHT_BLOCK = cubiesWhere((p) => p[0] === 1 && p[1] <= 0);

export const eoLine = (s: State) => edgesOrientedFB(s) && cubieSolved(s, DF) && cubieSolved(s, DB);
export const eoCross = (s: State) => edgesOrientedFB(s) && crossSolved(s);
export const leftBlockSolved = (s: State) => allSolved(s, LEFT_BLOCK);
export const rightBlockSolved = (s: State) => allSolved(s, RIGHT_BLOCK);

// ─── Petrus ───

const BLOCK_222 = cubiesWhere((p) => p[0] <= 0 && p[1] <= 0 && p[2] <= 0 && p.some((v) => v !== 0));
const BLOCK_223 = cubiesWhere((p) => p[0] <= 0 && p[1] <= 0 && p.some((v) => v !== 0));
export const block222Solved = (s: State) => allSolved(s, BLOCK_222);
export const block223Solved = (s: State) => allSolved(s, BLOCK_223);

// ─── Roux (M slices move the U/F/D/B centres: compare pieces to each other) ───

const FB = { dl: cubieAt(-1, -1, 0), fl: cubieAt(-1, 0, 1), bl: cubieAt(-1, 0, -1), dfl: cubieAt(-1, -1, 1), dbl: cubieAt(-1, -1, -1) };
const SB = { dr: cubieAt(1, -1, 0), fr: cubieAt(1, 0, 1), br: cubieAt(1, 0, -1), dfr: cubieAt(1, -1, 1), dbr: cubieAt(1, -1, -1) };

function uniformOn(s: State, cubies: readonly Cubie[], face: Face): number | null {
  const colors = cubies.map((c) => faceletOn(c, face)).filter((f): f is number => f !== undefined).map((f) => colorAt(s, f));
  return colors.every((c) => c === colors[0]) ? colors[0] : null;
}

/**
 * A 1×2×3 Roux block on the `side` (L or R) of the bottom layer: its side
 * stickers match that side's centre, and its bottom / front / back stickers
 * are each one colour (the centres there may be off by M, so they aren't used).
 * Returns the block's bottom colour, or null if it isn't built.
 */
function rouxBlock(s: State, side: "L" | "R"): { bottom: number; front: number; back: number } | null {
  const b = side === "L" ? FB : SB;
  const pieces = Object.values(b);
  const sideColor = colorAt(s, centerIdx(side));
  if (!pieces.every((c) => colorAt(s, faceletOn(c, side)!) === sideColor)) return null;
  const bottom = uniformOn(s, pieces, "D");
  const front = uniformOn(s, pieces, "F");
  const back = uniformOn(s, pieces, "B");
  if (bottom === null || front === null || back === null) return null;
  // The three colours must form a real block (e.g. bottom ≠ front's opposite) — true for real pieces
  // once every sticker agrees, but guard against a colour appearing twice.
  if (new Set([bottom, front, back, sideColor]).size !== 4) return null;
  return { bottom, front, back };
}

export const rouxFirstBlock = (s: State) => rouxBlock(s, "L") !== null;

export function rouxSecondBlock(s: State): boolean {
  const fb = rouxBlock(s, "L");
  const sb = rouxBlock(s, "R");
  return fb !== null && sb !== null && fb.bottom === sb.bottom && fb.front === sb.front && fb.back === sb.back;
}

const CMLL_CORNERS = { ufl: cubieAt(-1, 1, 1), ubl: cubieAt(-1, 1, -1), ufr: cubieAt(1, 1, 1), ubr: cubieAt(1, 1, -1) };

function cmllAligned(s: State): boolean {
  const fb = rouxBlock(s, "L");
  if (!fb) return false;
  const top = opposite(fb.bottom);
  const { ufl, ubl, ufr, ubr } = CMLL_CORNERS;
  const col = (c: Cubie, face: Face) => colorAt(s, faceletOn(c, face)!);
  return (
    [ufl, ubl, ufr, ubr].every((c) => col(c, "U") === top) &&
    col(ufl, "L") === colorAt(s, centerIdx("L")) &&
    col(ubl, "L") === colorAt(s, centerIdx("L")) &&
    col(ufr, "R") === colorAt(s, centerIdx("R")) &&
    col(ubr, "R") === colorAt(s, centerIdx("R")) &&
    col(ufl, "F") === fb.front &&
    col(ufr, "F") === fb.front &&
    col(ubl, "B") === fb.back &&
    col(ubr, "B") === fb.back
  );
}

/** CMLL: both blocks, and the top corners solved relative to them (up to AUF). */
export const rouxCmll = (s: State) => rouxSecondBlock(s) && upToAuf(s, cmllAligned);

const LSE_EDGES = [cubieAt(0, 1, 1), cubieAt(0, 1, -1), cubieAt(-1, 1, 0), cubieAt(1, 1, 0), cubieAt(0, -1, 1), cubieAt(0, -1, -1)];

/** LSE edge orientation: every last-six edge has its top/bottom-coloured sticker on U or D. */
export function rouxEo(s: State): boolean {
  if (!rouxCmll(s)) return false;
  const bottom = rouxBlock(s, "L")!.bottom;
  const ud = [bottom, opposite(bottom)];
  return LSE_EDGES.every((e) => {
    const f = e.facelets.find((x) => ud.includes(colorAt(s, x)));
    return f !== undefined && (FACELETS[f].face === "U" || FACELETS[f].face === "D");
  });
}

/** LSE 4b: UL and UR edges in place, with the corners aligned. */
export function rouxUlUr(s: State): boolean {
  if (!rouxEo(s)) return false;
  return upToAuf(s, (t) => {
    if (!cmllAligned(t)) return false;
    const top = opposite(rouxBlock(t, "L")!.bottom);
    const ul = cubieAt(-1, 1, 0);
    const ur = cubieAt(1, 1, 0);
    return (
      colorAt(t, faceletOn(ul, "U")!) === top &&
      colorAt(t, faceletOn(ur, "U")!) === top &&
      colorAt(t, faceletOn(ul, "L")!) === colorAt(t, centerIdx("L")) &&
      colorAt(t, faceletOn(ur, "R")!) === colorAt(t, centerIdx("R"))
    );
  });
}

export { isSolved };
