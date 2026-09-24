/**
 * Petrus — 2×2×2 block (canonical: at D-B-L), extended to 2×2×3 along the
 * left-bottom, EO, F2L, last layer. Checks, method and masks; colour neutral.
 */

import { type Frame, IDENTITY_FRAME, LAST_LAYER_STAGES, type Mask, type MaskRule, type Method, type State, buildMask, checks as C } from "@cubecore/core";

const inBlock222 = (p: readonly number[]) => p[0] <= 0 && p[1] <= 0 && p[2] <= 0;
const inBlock223 = (p: readonly number[]) => p[0] <= 0 && p[1] <= 0;
const BLOCK_222 = C.cubiesWhere((p) => inBlock222(p) && p.some((v) => v !== 0));
const BLOCK_223 = C.cubiesWhere((p) => inBlock223(p) && p.some((v) => v !== 0));

export const block222Solved = (s: State) => C.allSolved(s, BLOCK_222);
export const block223Solved = (s: State) => C.allSolved(s, BLOCK_223);

export const PETRUS: Method = {
  id: "petrus",
  name: "Petrus",
  stages: [
    { id: "2x2x2", label: "2×2×2 block", done: block222Solved },
    { id: "2x2x3", label: "2×2×3 block", done: block223Solved },
    { id: "eo", label: "EO", done: (s) => block223Solved(s) && C.edgesOrientedFB(s) },
    { id: "f2l", label: "F2L", done: C.f2lSolved },
    ...LAST_LAYER_STAGES,
  ],
};

export type PetrusMask = "2x2x2" | "2x2x3";

export const PETRUS_MASKS: Record<PetrusMask, MaskRule> = {
  "2x2x2": (f, c) => (c.kind === "center" || inBlock222(c.pos) ? "regular" : "ignored"),
  "2x2x3": (f, c) => (c.kind === "center" || inBlock223(c.pos) ? "regular" : "ignored"),
};

export const petrusMask = (name: PetrusMask, frame: Frame = IDENTITY_FRAME): Mask => buildMask(PETRUS_MASKS[name], frame);
