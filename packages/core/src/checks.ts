/**
 * Check primitives, written for the CANONICAL frame (run them on
 * `view(state, frame)`): first layer on D, last layer on U. Method packages
 * (@cubecore/cfop, roux, zz, petrus, lbl) build their stages from these, so
 * every method is colour neutral by construction.
 *
 * "Solved" pieces show the colour of the centre of the face they sit on. No
 * absolute colours anywhere — methods that move centres (Roux M slices)
 * compare pieces to each other with the helpers below instead.
 */

import { CUBIES, type Cubie, FACELETS, FACES, type Face, type Vec3 } from "./geometry";
import { parseAlg } from "./notation";
import { type State, applyMoves, colorAt, isSolved } from "./state";

// ─── helpers ───

const faceIndex = (face: Face) => FACES.indexOf(face);
/** Facelet index of a face's centre. */
export const centerIdx = (face: Face) => faceIndex(face) * 9 + 4;
/** Colour class of the opposite face (U↔D, R↔L, F↔B). */
export const opposite = (color: number) => (color + 3) % 6;

export function cubieAt(x: number, y: number, z: number): Cubie {
  return CUBIES.find((c) => c.pos[0] === x && c.pos[1] === y && c.pos[2] === z)!;
}
export const cubiesWhere = (pred: (p: Vec3) => boolean) => CUBIES.filter((c) => pred(c.pos));

/** Facelet of `cubie` that faces `face`, or undefined. */
export function faceletOn(cubie: Cubie, face: Face): number | undefined {
  return cubie.facelets.find((f) => FACELETS[f].face === face);
}

export const matchesCenter = (s: State, facelet: number) => colorAt(s, facelet) === colorAt(s, centerIdx(FACELETS[facelet].face));
export const cubieSolved = (s: State, c: Cubie) => c.facelets.every((f) => matchesCenter(s, f));
export const allSolved = (s: State, cubies: readonly Cubie[]) => cubies.every((c) => cubieSolved(s, c));

/** True if some U-layer turn (none, U, U2, U') makes `pred` hold. */
const U_TURNS = [[], parseAlg("U"), parseAlg("U2"), parseAlg("U'")];
export function upToAuf(s: State, pred: (s: State) => boolean): boolean {
  return U_TURNS.some((t) => pred(t.length ? applyMoves(s, t) : s));
}

// ─── F2L-slot geometry (canonical: D bottom) ───

export type Slot = "FR" | "FL" | "BR" | "BL";
export const SLOTS: readonly Slot[] = ["FR", "FL", "BR", "BL"];
const SLOT_XZ: Record<Slot, [number, number]> = { FR: [1, 1], FL: [-1, 1], BR: [1, -1], BL: [-1, -1] };

const slotCorner = (slot: Slot) => cubieAt(SLOT_XZ[slot][0], -1, SLOT_XZ[slot][1]);
const slotEdge = (slot: Slot) => cubieAt(SLOT_XZ[slot][0], 0, SLOT_XZ[slot][1]);

// ─── layers (first layer on D) ───

const CROSS = cubiesWhere((p) => p[1] === -1 && p.filter((v) => v !== 0).length === 2);
const FIRST_LAYER = cubiesWhere((p) => p[1] === -1);
const F2L = cubiesWhere((p) => p[1] <= 0);
export const U_CORNERS = cubiesWhere((p) => p[1] === 1 && p[0] !== 0 && p[2] !== 0);
export const U_EDGES = cubiesWhere((p) => p[1] === 1 && (p[0] === 0) !== (p[2] === 0));

export const crossSolved = (s: State) => allSolved(s, CROSS);
export const firstLayerSolved = (s: State) => allSolved(s, FIRST_LAYER);
export const f2lSolved = (s: State) => allSolved(s, F2L);
export const pairSolved = (s: State, slot: Slot) => cubieSolved(s, slotCorner(slot)) && cubieSolved(s, slotEdge(slot));
export const slotCornerSolved = (s: State, slot: Slot) => cubieSolved(s, slotCorner(slot));
export const slotEdgeSolved = (s: State, slot: Slot) => cubieSolved(s, slotEdge(slot));
export const solvedPairs = (s: State) => SLOTS.filter((slot) => pairSolved(s, slot));

export const topColor = (s: State) => colorAt(s, centerIdx("U"));
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
 * EO for the F/B axis (ZZ, Petrus): an edge is good if it can be solved
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

export { isSolved };
