/**
 * Test helpers for method packages (`@cubecore/core/testing`).
 */

import { FRAMES, type Frame, transformMoves } from "./frames";
import type { Method } from "./method";
import { invert, parseAlg } from "./notation";
import { applyMoves, solvedState } from "./state";
import { MethodTracker } from "./tracker";

/**
 * A solve built backwards: `segments` are the solver's steps; the scramble is
 * their inverse, so after segment k exactly the first k stages are done —
 * provided later segments don't disturb earlier stages. `frame` replays the
 * same solve held another way (colour / orientation neutrality tests).
 * Move i is pushed with time i × 100 ms.
 */
export function runSegments(method: Method, segments: readonly string[], frame: Frame = FRAMES[0]) {
  const moves = segments.map((s) => transformMoves(parseAlg(s), frame));
  const all = moves.flat();
  const tracker = new MethodTracker(method, applyMoves(solvedState(), invert(all)));
  all.forEach((m, i) => tracker.push(m, i * 100));
  const ends = moves.map((_, k) => moves.slice(0, k + 1).flat().length);
  return { tracker, ends, total: all.length };
}

/** "stage@moveIndex …" — compact form for comparing runs. */
export const stagesAt = (tracker: MethodTracker) => tracker.boundaries.map((b) => `${b.stage}@${b.moveIndex}`).join(" ");
