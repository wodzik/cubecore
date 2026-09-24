/**
 * Solving methods as data: an ordered list of stages, each a check on the
 * CANONICAL view (see checks.ts / frames.ts). Adding a method needs no engine
 * change — just another entry here.
 *
 * Stages may report a `detail` (e.g. which F2L slot was just finished), in
 * canonical terms; the tracker translates it to physical faces.
 */

import * as C from "./checks";
import type { State } from "./state";

export interface Stage {
  id: string;
  label: string;
  done(s: State): boolean;
  /** Canonical slot / sub-step finished at this stage, given the details already reported. */
  detail?(s: State, earlier: readonly string[]): string | undefined;
}

export interface Method {
  id: string;
  name: string;
  stages: readonly Stage[];
}

const newSlot = (solved: readonly string[], earlier: readonly string[]) => solved.find((x) => !earlier.includes(x));

function counted(prefix: string, label: string, count: (s: State) => readonly string[], guard: (s: State) => boolean): Stage[] {
  return [1, 2, 3, 4].map((n) => ({
    id: `${prefix}-${n}`,
    label: `${label} ${n}`,
    done: (s) => guard(s) && count(s).length >= n,
    detail: (s, earlier) => newSlot(count(s), earlier),
  }));
}

const LAST_LAYER: Stage[] = [
  { id: "oll", label: "OLL", done: (s) => C.f2lSolved(s) && C.topOriented(s) },
  { id: "pll", label: "PLL", done: C.solvedUpToAuf },
  { id: "auf", label: "AUF", done: C.isSolved },
];

export const CFOP: Method = {
  id: "cfop",
  name: "CFOP",
  stages: [
    { id: "cross", label: "Cross", done: C.crossSolved },
    ...counted("f2l", "F2L", C.solvedPairs, C.crossSolved),
    ...LAST_LAYER,
  ],
};

export const LBL: Method = {
  id: "lbl",
  name: "Layer by layer",
  stages: [
    { id: "cross", label: "Cross", done: C.crossSolved },
    ...counted("corner", "Corner", (s) => C.SLOTS.filter((x) => C.slotCornerSolved(s, x)), C.crossSolved),
    ...counted("edge", "Edge", (s) => C.SLOTS.filter((x) => C.slotEdgeSolved(s, x)), C.firstLayerSolved),
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

export const ROUX: Method = {
  id: "roux",
  name: "Roux",
  stages: [
    { id: "fb", label: "First block", done: C.rouxFirstBlock },
    { id: "sb", label: "Second block", done: C.rouxSecondBlock },
    { id: "cmll", label: "CMLL", done: C.rouxCmll },
    { id: "eo", label: "EO", done: C.rouxEo },
    { id: "ulur", label: "UL/UR", done: C.rouxUlUr },
    { id: "l4e", label: "L4E", done: C.isSolved },
  ],
};

export const ZZ: Method = {
  id: "zz",
  name: "ZZ",
  stages: [
    { id: "eoline", label: "EOLine", done: C.eoLine },
    {
      id: "block-1",
      label: "First block",
      done: (s) => C.eoLine(s) && (C.leftBlockSolved(s) || C.rightBlockSolved(s)),
      detail: (s) => (C.leftBlockSolved(s) ? "left" : "right"),
    },
    { id: "block-2", label: "Second block", done: (s) => C.f2lSolved(s) && C.edgesOrientedFB(s) },
    ...LAST_LAYER,
  ],
};

export const PETRUS: Method = {
  id: "petrus",
  name: "Petrus",
  stages: [
    { id: "2x2x2", label: "2×2×2 block", done: C.block222Solved },
    { id: "2x2x3", label: "2×2×3 block", done: C.block223Solved },
    { id: "eo", label: "EO", done: (s) => C.block223Solved(s) && C.edgesOrientedFB(s) },
    { id: "f2l", label: "F2L", done: C.f2lSolved },
    ...LAST_LAYER,
  ],
};

export const METHODS: readonly Method[] = [CFOP, LBL, ROUX, ZZ, PETRUS];
export const methodById = (id: string) => METHODS.find((m) => m.id === id);
