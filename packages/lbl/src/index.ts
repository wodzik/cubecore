/**
 * Beginner layer-by-layer: cross, four first-layer corners, four middle-layer
 * edges, last layer orientation in two halves, then corner and edge
 * permutation. Colour and orientation neutral like every cubecore method.
 */

import { type Frame, IDENTITY_FRAME, type Mask, type MaskRule, type Method, buildMask, checks as C, countedStages } from "@cubecore/core";

export const LBL: Method = {
  id: "lbl",
  name: "Layer by layer",
  stages: [
    { id: "cross", label: "Cross", done: C.crossSolved },
    ...countedStages("corner", "Corner", (s) => C.SLOTS.filter((x) => C.slotCornerSolved(s, x)), C.crossSolved),
    ...countedStages("edge", "Edge", (s) => C.SLOTS.filter((x) => C.slotEdgeSolved(s, x)), C.firstLayerSolved),
    {
      id: "oll-1",
      label: "Orient (1st half)",
      done: (s) => C.f2lSolved(s) && (C.topCornersOriented(s) || C.topEdgesOriented(s)),
      detail: (s) => (C.topEdgesOriented(s) ? "edges" : "corners"),
    },
    { id: "oll-2", label: "Orient (2nd half)", done: (s) => C.f2lSolved(s) && C.topOriented(s) },
    { id: "pll-corners", label: "Permute corners", done: (s) => C.f2lSolved(s) && C.topOriented(s) && C.llCornersPermuted(s) },
    { id: "pll", label: "Permute edges", done: C.solvedUpToAuf },
    { id: "auf", label: "AUF", done: C.isSolved },
  ],
};

export type LblMask = "cross" | "first-layer" | "second-layer";

export const LBL_MASKS: Record<LblMask, MaskRule> = {
  cross: (f, c) => (c.kind === "center" || (c.kind === "edge" && c.pos[1] === -1) ? "regular" : "ignored"),
  "first-layer": (f, c) => (c.kind === "center" || c.pos[1] === -1 ? "regular" : "ignored"),
  "second-layer": (f, c) => (c.kind === "center" || c.pos[1] === 0 ? "regular" : c.pos[1] === -1 ? "dim" : "ignored"),
};

export const lblMask = (name: LblMask, frame: Frame = IDENTITY_FRAME): Mask => buildMask(LBL_MASKS[name], frame);
