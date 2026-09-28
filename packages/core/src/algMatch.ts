/**
 * Which algorithm was done — by what it does, not how it's written.
 *
 * An algorithm's EFFECT is the permutation its face turns make, relative to
 * the centres (as a smart cube reports them — toFaceTurns): M' = r R' =
 * R' L; L R' = R' L (turns on one axis commute); U U = U2 = U2';
 * rotations don't count (only where the pieces go relative to the
 * centres). So two writings of one algorithm are one effect, and a solve's
 * moves match it however they were done — with slips undone, in any order
 * on an axis.
 *
 *   const m = new AlgMatcher<string>();
 *   m.add("R U R' U' R' F R2 U' R' U' R U R' F'", "T-perm");
 *   m.matchSuffix(solveMoves)   // { data: "T-perm", start: 12, preAuf: "U", postAuf: "" } — moves 0–11 were a setup
 *
 * Up to a turn of the AUF face (U) before and after: an algorithm done from
 * another angle, or finished with an AUF, is the same algorithm.
 */

import { type Face } from "./geometry";
import { type Move, formatMove } from "./moves";
import { parseAlg } from "./notation";
import { OrientationTracker, toFaceTurns } from "./physical";
import { type State, applyMoves, solvedState } from "./state";

export interface AlgMatch<T> {
  data: T;
  /** Index of the first move of the match; the moves before it are a setup. */
  start: number;
  /** The AUF turn done before the algorithm ("" / "U" / "U2" / "U'"), as the moves were held. */
  preAuf: string;
  /** The AUF turn after it. */
  postAuf: string;
}

const key = (s: State) => String.fromCharCode(...s);

/** The effect of `moves` (any notation) as a key: where every sticker goes, relative to the centres. */
export function effectKey(moves: readonly Move[] | string): string {
  return key(applyMoves(solvedState(), toFaceTurns(moves).moves));
}

export class AlgMatcher<T> {
  private readonly effects = new Map<string, { data: T; preAuf: string; postAuf: string }>();
  private readonly aufs: string[];
  private readonly longest = { moves: 0 };

  /** @param aufFace the face turned for AUF (U for a last layer, or F2L's top). */
  constructor(aufFace: Face = "U") {
    this.aufs = ["", aufFace, `${aufFace}2`, `${aufFace}'`];
  }

  /** An algorithm and what it stands for; the first added wins a shared effect. Returns false when it can't be read. */
  add(alg: string, data: T): boolean {
    let faceTurns: Move[];
    try {
      faceTurns = toFaceTurns(parseAlg(alg.replace(/[()]/g, " "))).moves;
    } catch {
      return false;
    }
    if (faceTurns.length === 0) return false;
    this.longest.moves = Math.max(this.longest.moves, faceTurns.length);
    const body = faceTurns.map(formatMove).join(" ");
    for (const preAuf of this.aufs)
      for (const postAuf of this.aufs) {
        const k = key(applyMoves(solvedState(), [preAuf, body, postAuf].filter(Boolean).join(" ")));
        if (!this.effects.has(k)) this.effects.set(k, { data, preAuf, postAuf });
      }
    return true;
  }

  get size(): number {
    return this.effects.size;
  }

  /** The algorithm whose effect is exactly that of `moves` (any notation), or null. */
  match(moves: readonly Move[] | string): Omit<AlgMatch<T>, "start"> | null {
    const e = this.effects.get(effectKey(moves));
    return e ? { ...e } : null;
  }

  /**
   * The longest ending of `moves` that is one of the algorithms — what was
   * done last, and where it began (the moves before it: a setup, an
   * extraction…). Endings up to a few moves longer than the longest
   * algorithm are tried (slips, AUFs inside). Null when none is.
   */
  matchSuffix(moves: readonly Move[] | string, slack = 6): AlgMatch<T> | null {
    const list = typeof moves === "string" ? parseAlg(moves) : moves;
    // One tracker over the whole list: a rotation or wide move keeps holding for the moves after it.
    const t = new OrientationTracker();
    const faceTurns = list.map((m) => t.push(m));
    const from = Math.max(0, list.length - (this.longest.moves + slack));
    for (let start = from; start < list.length; start++) {
      const tail = faceTurns.slice(start).flat();
      const e = this.effects.get(key(applyMoves(solvedState(), tail)));
      if (e) return { ...e, start };
    }
    return null;
  }
}
