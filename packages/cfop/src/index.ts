/**
 * CFOP — cross, F2L (four pairs, any order), OLL, PLL, AUF — and its masks.
 * Built only from @cubecore/core check primitives, so it is colour and
 * orientation neutral: the cross can be on any face, in any colour scheme.
 *
 * Later here: OLL / PLL / COLL case recognition and alg sets as data.
 */

import { type Frame, IDENTITY_FRAME, LAST_LAYER_STAGES, type Mask, type MaskRule, type Method, buildMask, checks as C, countedStages } from "@cubecore/core";

export const CFOP: Method = {
  id: "cfop",
  name: "CFOP",
  stages: [
    { id: "cross", label: "Cross", done: C.crossSolved },
    ...countedStages("f2l", "F2L", C.solvedPairs, C.crossSolved),
    ...LAST_LAYER_STAGES,
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
