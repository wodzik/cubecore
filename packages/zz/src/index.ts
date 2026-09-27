/**
 * ZZ — EOLine (all edges oriented + DF/DB), two F2L blocks in either order,
 * then the last layer. Checks, method and masks; colour neutral.
 */

import { type Frame, IDENTITY_FRAME, LAST_LAYER_STAGES, type Mask, type MaskRule, type Method, PIECE, type StageDef, type State, buildMask, checks as C } from "@cubecore/core";
import { EOCROSS_SEEDS } from "./seeds";

const DF = C.cubieAt(0, -1, 1);
const DB = C.cubieAt(0, -1, -1);
const LEFT_BLOCK = C.cubiesWhere((p) => p[0] === -1 && p[1] <= 0);
const RIGHT_BLOCK = C.cubiesWhere((p) => p[0] === 1 && p[1] <= 0);

export const eoLine = (s: State) => C.edgesOrientedFB(s) && C.cubieSolved(s, DF) && C.cubieSolved(s, DB);
export const eoCross = (s: State) => C.edgesOrientedFB(s) && C.crossSolved(s);
export const leftBlockSolved = (s: State) => C.allSolved(s, LEFT_BLOCK);
export const rightBlockSolved = (s: State) => C.allSolved(s, RIGHT_BLOCK);

export const ZZ: Method = {
  id: "zz",
  name: "ZZ",
  stages: [
    { id: "eoline", label: "EOLine", done: eoLine },
    {
      id: "block-1",
      label: "First block",
      done: (s) => eoLine(s) && (leftBlockSolved(s) || rightBlockSolved(s)),
      detail: (s) => (leftBlockSolved(s) ? "left" : "right"),
    },
    { id: "block-2", label: "Second block", done: (s) => C.f2lSolved(s) && C.edgesOrientedFB(s) },
    ...LAST_LAYER_STAGES,
  ],
};

export type ZzMask = "eoline" | "eocross" | "f2l";

export const ZZ_MASKS: Record<ZzMask, MaskRule> = {
  // Every edge shown as good/bad orientation material, the line in colour.
  eoline: (f, c) =>
    c.kind === "edge" ? (c.pos[1] === -1 && c.pos[0] === 0 ? "regular" : "oriented") : c.kind === "center" ? "regular" : "ignored",
  // EOCross: the whole cross in colour, the other edges as orientation material.
  eocross: (f, c) => (c.kind === "edge" ? (c.pos[1] === -1 ? "regular" : "oriented") : c.kind === "center" ? "regular" : "ignored"),
  f2l: (f, c) => (c.pos[1] <= 0 || c.kind === "center" ? "regular" : "ignored"),
};

export const zzMask = (name: ZzMask, frame: Frame = IDENTITY_FRAME): Mask => buildMask(ZZ_MASKS[name], frame);

// ─── trainer stages (run them with @cubecore/solve) ───

export const ZZ_TRAINERS = {
  /**
   * EOCross: cross on D and every edge oriented (F/B axis). Level 10 is a
   * few in a million among random states — its cases come from a list found
   * offline (seeds.ts).
   */
  eocross: (): StageDef => ({
    name: "eocross",
    pieces: [PIECE.DR, PIECE.DF, PIECE.DL, PIECE.DB],
    eo: true,
    groups: [[0, 1, 2, 3]],
    seeds: { 10: EOCROSS_SEEDS },
  }),
  /** EOLine: every edge oriented (F/B axis) and DF + DB in place — classic ZZ's first step. */
  eoline: (): StageDef => ({ name: "eoline", pieces: [PIECE.DF, PIECE.DB], eo: true, groups: [[0, 1]] }),
  /**
   * ZZ blocks after EOLine, built with R U L only (edges stay oriented):
   * the left block (DL + the FL and BL pairs), then the right (DR + FR, BR);
   * `side` = which one this stage adds (the other may already be built).
   */
  block: (side: "left" | "right", other = false): StageDef => {
    const left = [PIECE.DL, PIECE.FL, PIECE.DLF, PIECE.BL, PIECE.DBL];
    const right = [PIECE.DR, PIECE.FR, PIECE.DFR, PIECE.BR, PIECE.DRB];
    const blocks = other ? [left, right] : [side === "left" ? left : right];
    const pieces = [PIECE.DF, PIECE.DB, ...blocks.flat()];
    // Tables: line + block edge + one pair, per pair.
    const groups = blocks.flatMap((_, b) => [[0, 1, 2 + 5 * b, 3 + 5 * b, 4 + 5 * b], [0, 1, 2 + 5 * b, 5 + 5 * b, 6 + 5 * b]]);
    return { name: `zz-${other ? "blocks" : `${side}-block`}`, pieces, groups, moves: ["R", "U", "L"] };
  },
} as const;
