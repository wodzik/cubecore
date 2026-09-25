/**
 * The method engine's data model: a method is an ordered list of stages, each
 * a check on the CANONICAL view (see checks.ts / frames.ts). Concrete methods
 * live in their own packages (@cubecore/cfop, roux, zz, petrus, lbl) —
 * adding one needs no engine change.
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
  /**
   * The case this stage starts from (e.g. "OLL 27", "T", "OLL skip"),
   * recognised on the state the previous stage finished in.
   */
  recognize?(s: State): string | undefined;
}

export interface Method {
  id: string;
  name: string;
  stages: readonly Stage[];
}

const newItem = (done: readonly string[], earlier: readonly string[]) => done.find((x) => !earlier.includes(x));

/**
 * Four stages "`label` 1…4" for things finished in any order (F2L pairs,
 * LBL corners…): stage n is done once `count` lists n items (and `guard`
 * holds); its detail is the item that was just added.
 */
export function countedStages(prefix: string, label: string, count: (s: State) => readonly string[], guard: (s: State) => boolean): Stage[] {
  return [1, 2, 3, 4].map((n) => ({
    id: `${prefix}-${n}`,
    label: `${label} ${n}`,
    done: (s) => guard(s) && count(s).length >= n,
    detail: (s, earlier) => newItem(count(s), earlier),
  }));
}

/** Orient, permute, AUF — the last layer of CFOP, ZZ and Petrus. */
export const LAST_LAYER_STAGES: readonly Stage[] = [
  { id: "oll", label: "OLL", done: (s) => C.f2lSolved(s) && C.topOriented(s) },
  { id: "pll", label: "PLL", done: C.solvedUpToAuf },
  { id: "auf", label: "AUF", done: C.isSolved },
];
