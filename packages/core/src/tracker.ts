/**
 * MethodTracker — follows a solve move by move and reports when each stage
 * of a method is reached, in any orientation and with any colour scheme.
 *
 * Colour neutrality: the method is followed independently in all 24 frames
 * (orientations) — each frame keeps its own progress. The result is the frame
 * that got furthest (ties: the one that got there first). So a cross or block
 * that happens to appear somewhere else — in the scramble, or mid-solve —
 * can't hijack the analysis: the real one overtakes it.
 */

import { type Frame, FRAMES, view } from "./frames";
import { FACES, type Face } from "./geometry";
import type { Method } from "./method";
import type { Move } from "./moves";
import { parseAlg } from "./notation";
import { type State, applyMove, applyMoves, solvedState } from "./state";

export interface StageBoundary {
  stage: string;
  /** Moves applied when the stage was reached (0 = already done before the first move). */
  moveIndex: number;
  /** Timestamp passed with that move (ms), if any. */
  time?: number;
  /** e.g. the F2L slot as physical faces ("FR", "UB"…) or "left"/"edges". */
  detail?: string;
  /** The case the stage started from, when the method recognises one ("OLL 27", "T", "PLL skip"…). */
  case?: string;
}

const SLOT_NAME = /^[FB][RL]$/;
const FACE_ORDER: Face[] = ["U", "D", "F", "B", "L", "R"];

/** Canonical slot name (e.g. "FR") → the physical faces it sits between in `frame`. */
function physicalSlot(detail: string, frame: Frame): string {
  if (!SLOT_NAME.test(detail)) return detail;
  const faces = [frame.face[detail[0] as Face], frame.face[detail[1] as Face]];
  return faces.sort((a, b) => FACE_ORDER.indexOf(a) - FACE_ORDER.indexOf(b)).join("");
}

interface FrameProgress {
  frame: Frame;
  stageIndex: number;
  details: string[];
  boundaries: StageBoundary[];
  /** Case recognised for each stage when it started. */
  cases: (string | undefined)[];
}

export class MethodTracker {
  private state: State;
  private moveCount = 0;
  private progress: FrameProgress[] = FRAMES.map((frame) => ({ frame, stageIndex: 0, details: [], boundaries: [], cases: [] }));

  constructor(readonly method: Method, start: State | string = solvedState()) {
    this.state = typeof start === "string" ? applyMoves(solvedState(), start) : new Uint8Array(start);
    const first = method.stages[0];
    if (first?.recognize) for (const p of this.progress) p.cases[0] = first.recognize(view(this.state, p.frame));
    this.advance(undefined);
  }

  /** Apply one or more moves (with an optional timestamp); returns stages newly reached by the leading frame. */
  push(move: Move | string, time?: number): StageBoundary[] {
    const moves = typeof move === "string" ? parseAlg(move) : [move];
    const before = this.boundaries.length;
    for (const m of moves) {
      this.state = applyMove(this.state, m);
      this.moveCount++;
      this.advance(time);
    }
    return this.boundaries.slice(before);
  }

  /**
   * The frame that got furthest. Ties — and at the end of a solve every frame
   * has "reached" every stage, since a solved cube passes them all — go to the
   * frame that reached its stages earliest overall (smallest sum of move
   * indices): the real cross/block was there all along, an accidental one
   * elsewhere only completes everything on the last moves.
   */
  private get best(): FrameProgress {
    const score = (p: FrameProgress) => p.boundaries.reduce((sum, b) => sum + b.moveIndex, 0);
    let best = this.progress[0];
    for (const p of this.progress) {
      if (p.stageIndex > best.stageIndex || (p.stageIndex === best.stageIndex && score(p) < score(best))) best = p;
    }
    return best;
  }

  /** Stage boundaries of the leading frame. */
  get boundaries(): readonly StageBoundary[] {
    return this.best.boundaries;
  }

  /**
   * The next stage, whether the method is finished, the leading frame (null
   * before the first stage) and the case the next stage started from, if
   * recognised (e.g. which OLL came up after F2L).
   */
  get current(): { next: string | null; done: boolean; frame: Frame | null; case?: string } {
    const best = this.best;
    const next = this.method.stages[best.stageIndex];
    const kase = best.cases[best.stageIndex];
    return { next: next?.id ?? null, done: !next, frame: best.stageIndex > 0 ? best.frame : null, ...(kase ? { case: kase } : {}) };
  }

  /** Physical face the method's canonical D (bottom) settled on — e.g. the cross face for CFOP. */
  get bottomFace(): Face | null {
    return this.current.frame?.face.D ?? null;
  }

  private advance(time: number | undefined): void {
    for (const p of this.progress) {
      let seen: State | null = null;
      for (;;) {
        const stage = this.method.stages[p.stageIndex];
        if (!stage) break;
        seen ??= view(this.state, p.frame);
        if (!stage.done(seen)) break;
        const raw = stage.detail?.(seen, p.details);
        if (raw) p.details.push(raw);
        const kase = p.cases[p.stageIndex];
        p.boundaries.push({
          stage: stage.id,
          moveIndex: this.moveCount,
          ...(time !== undefined ? { time } : {}),
          ...(raw ? { detail: physicalSlot(raw, p.frame) } : {}),
          ...(kase ? { case: kase } : {}),
        });
        p.stageIndex++;
        // The next stage starts here: recognise its case now (e.g. the OLL that came up after F2L).
        const following = this.method.stages[p.stageIndex];
        if (following?.recognize) p.cases[p.stageIndex] = following.recognize(seen);
      }
    }
  }
}

/** Convenience: stage boundaries of a whole solve. */
export function analyzeSolve(method: Method, scramble: string | readonly Move[], solution: string | readonly Move[], times?: readonly number[]): readonly StageBoundary[] {
  const tracker = new MethodTracker(method, applyMoves(solvedState(), scramble));
  const moves = typeof solution === "string" ? parseAlg(solution) : solution;
  moves.forEach((m, i) => tracker.push(m, times?.[i]));
  return tracker.boundaries;
}

export { FACES };
