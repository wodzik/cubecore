/**
 * CFOP — cross, F2L (four pairs, any order), OLL, PLL, AUF — and its masks.
 * Built only from @cubecore/core check primitives, so it is colour and
 * orientation neutral: the cross can be on any face, in any colour scheme.
 *
 * Later here: OLL / PLL / COLL case recognition and alg sets as data.
 */

import { type Frame, IDENTITY_FRAME, LAST_LAYER_STAGES, type Mask, type MaskRule, type Method, PIECE, type Piece, type Stage, type StageDef, type State, buildMask, checks as C, checks, countedStages } from "@cubecore/core";
import { recognizeOll, recognizePll } from "./cases";

export const CFOP: Method = {
  id: "cfop",
  name: "CFOP",
  stages: [
    { id: "cross", label: "Cross", done: C.crossSolved },
    ...countedStages("f2l", "F2L", C.solvedPairs, C.crossSolved),
    ...withLastLayerCases(LAST_LAYER_STAGES),
  ],
};

// ─── masks (canonical: cross on D, last layer on U) ───

export type CfopMask =
  | "cross" | "f2l" | "oll" | "pll" | "coll" | "ocll" | "ell" | "cll"
  | "ls" | "els" | "cls" | "vls" | "zbls" | "epll" | "cpll" | "zbll";

export const CFOP_MASKS: Record<CfopMask, MaskRule> = {
  cross: (f, c) => (c.kind === "center" || (c.kind === "edge" && c.pos[1] === -1) ? "regular" : "ignored"),
  f2l: (f, c) => (c.pos[1] <= 0 || c.kind === "center" ? "regular" : "ignored"),
  // Orientation: last-layer pieces show only their top-facing colour; centres stay in colour.
  oll: (f, c) => (c.kind === "center" ? "regular" : lastLayer(c) ? (f.face === "U" ? "regular" : "ignored") : "dim"),
  // Permutation: everything in colour, the first two layers dimmed.
  pll: (f, c) => (lastLayer(c) || c.kind === "center" ? "regular" : "dim"),
  coll: (f, c) => (c.kind === "center" ? "regular" : lastLayer(c) ? (c.kind === "corner" || f.face === "U" ? "regular" : "ignored") : "dim"),
  ocll: (f, c) => (c.kind === "center" ? "regular" : lastLayer(c) ? (c.kind === "corner" && f.face === "U" ? "regular" : "ignored") : "dim"),
  cll: (f, c) => (c.kind === "center" ? "regular" : lastLayer(c) ? (c.kind === "corner" ? "regular" : "ignored") : "dim"),
  ell: (f, c) => (c.kind === "center" ? "regular" : lastLayer(c) ? (c.kind === "edge" ? "regular" : "ignored") : "dim"),
  // PLL parts: the pieces being permuted in colour, the others dimmed (EPLL) or hidden (CPLL).
  epll: (f, c) => (c.kind === "center" || (lastLayer(c) && c.kind === "edge") ? "regular" : "dim"),
  cpll: (f, c) => (c.kind === "center" || (lastLayer(c) && c.kind === "corner") ? "regular" : lastLayer(c) ? "ignored" : "dim"),
  zbll: (f, c) => (lastLayer(c) || c.kind === "center" ? "regular" : "dim"),
  // Last slot (canonical FR): the pair in colour, the rest of F2L dimmed, the last layer by variant.
  ls: (f, c) => (c.kind === "center" || inSlot(c) ? "regular" : c.pos[1] <= 0 ? "dim" : "ignored"),
  // ZBLS / ELS orient the last-layer edges while inserting: show them as orientation material.
  zbls: (f, c) => (c.kind === "center" || inSlot(c) ? "regular" : c.pos[1] <= 0 ? "dim" : c.kind === "edge" && f.face === "U" ? "oriented" : "ignored"),
  els: (f, c) => (c.kind === "center" || (inSlot(c) && c.kind === "edge") ? "regular" : c.pos[1] <= 0 ? (inSlot(c) ? "ignored" : "dim") : c.kind === "edge" && f.face === "U" ? "oriented" : "ignored"),
  // CLS / VLS / WVLS orient the last-layer corners while inserting: their top stickers matter.
  cls: (f, c) => (c.kind === "center" || inSlot(c) ? "regular" : c.pos[1] <= 0 ? "dim" : f.face === "U" ? "regular" : "ignored"),
  vls: (f, c) => (c.kind === "center" || inSlot(c) ? "regular" : c.pos[1] <= 0 ? "dim" : f.face === "U" ? "regular" : "ignored"),
};

/** The canonical last slot: the FR pair (front-right, bottom two layers). */
function inSlot(c: { pos: readonly number[] }): boolean {
  return c.pos[0] === 1 && c.pos[2] === 1 && c.pos[1] <= 0;
}

function lastLayer(c: { pos: readonly number[]; kind: string }): boolean {
  return c.pos[1] === 1 && c.kind !== "center";
}

/** A CFOP mask for a cube held in `frame` (e.g. the frame the tracker found the cross in). */
export const cfopMask = (name: CfopMask, frame: Frame = IDENTITY_FRAME): Mask => buildMask(CFOP_MASKS[name], frame);

// ─── trainer stages (run them with @cubecore/solve: stageSolver / stageScramble) ───

export type F2LSlot = "FR" | "FL" | "BL" | "BR";
const CROSS_PIECES = [PIECE.DR, PIECE.DF, PIECE.DL, PIECE.DB];
const SLOT_PIECES: Record<F2LSlot, { edge: Piece; corner: Piece }> = {
  FR: { edge: PIECE.FR, corner: PIECE.DFR },
  FL: { edge: PIECE.FL, corner: PIECE.DLF },
  BL: { edge: PIECE.BL, corner: PIECE.DBL },
  BR: { edge: PIECE.BR, corner: PIECE.DRB },
};
/** The four ways to take a paired slot out (the pair is then one insert away), per slot. */
const EXTRACTIONS: Record<F2LSlot, readonly string[]> = {
  FR: ["R U R'", "R U' R'", "F' U F", "F' U' F"],
  FL: ["L' U L", "L' U' L", "F U F'", "F U' F'"],
  BL: ["L U L'", "L U' L'", "B' U B", "B' U' B"],
  BR: ["R' U R", "R' U' R", "B U B'", "B U' B'"],
};

/**
 * CFOP trainer stages (canonical: cross on D). Each is a StageDef — plain
 * data; `stageSolver(def)` answers distance / optimal solutions / next moves
 * and `stageScramble({ stage: def, length })` draws a case at an exact level.
 */
export const CFOP_TRAINERS = {
  cross: (): StageDef => ({ name: "cross", pieces: CROSS_PIECES, groups: [[0, 1, 2, 3]] }),
  xcross: (slot: F2LSlot = "FR"): StageDef => ({
    name: `xcross-${slot}`,
    pieces: [...CROSS_PIECES, SLOT_PIECES[slot].edge, SLOT_PIECES[slot].corner],
    groups: [[0, 1, 2, 3, 4], [0, 1, 2, 3, 5]],
  }),
  /** Two slots: adjacent (FR + FL…) or opposite (FR + BL…). */
  xxcross: (a: F2LSlot = "FR", b: F2LSlot = "FL"): StageDef => ({
    name: `xxcross-${a}-${b}`,
    pieces: [...CROSS_PIECES, SLOT_PIECES[a].edge, SLOT_PIECES[a].corner, SLOT_PIECES[b].edge, SLOT_PIECES[b].corner],
    groups: [[0, 1, 2, 3, 4], [0, 1, 2, 3, 5], [0, 1, 2, 3, 6], [0, 1, 2, 3, 7]],
  }),
  /**
   * Free pair: cross solved and the slot's pair FORMED, one standard insert
   * away — the inserted state or any of the 4 extractions × 4 AUFs (17 goal
   * states, as in act's pairing trainer).
   */
  pair: (slot: F2LSlot = "FR"): StageDef => ({
    name: `pair-${slot}`,
    pieces: [...CROSS_PIECES, SLOT_PIECES[slot].edge, SLOT_PIECES[slot].corner],
    groups: [[0, 1, 2, 3, 4], [0, 1, 2, 3, 5]],
    goals: ["", ...EXTRACTIONS[slot].flatMap((x) => ["", " U", " U2", " U'"].map((auf) => x + auf))],
  }),
} as const;

export * from "./cases";

/**
 * Last-layer stages that also say which case came up: OLL gets the OLL case
 * after F2L ("OLL 27", "OLL skip"), PLL the PLL case after OLL ("T", "PLL
 * skip") — StageBoundary.case, MethodTracker.current.case. ZZ / Petrus can
 * use the same.
 */
export function withLastLayerCases(stages: readonly Stage[]): Stage[] {
  return stages.map((st) =>
    st.id === "oll"
      ? { ...st, recognize: (s: State) => (checks.f2lSolved(s) ? (recognizeOll(s)?.id ?? "OLL skip") : undefined) }
      : st.id === "pll"
        ? { ...st, recognize: (s: State) => (checks.f2lSolved(s) && checks.topOriented(s) ? (recognizePll(s)?.id ?? "PLL skip") : undefined) }
        : st,
  );
}
