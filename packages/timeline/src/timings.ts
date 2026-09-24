/**
 * Per-stage timings of a recorded solve for a method, colour neutral
 * (uses core's MethodTracker). For each stage: recognition = pause before its
 * first move, execution = from that move to the stage's completion.
 */

import { type Method, MethodTracker, applyMoves, solvedState } from "@cubecore/core";
import type { Recording } from "./recording";

export interface StageTiming {
  stage: string;
  label: string;
  /** Index of the first move of this stage and number of moves in it. */
  firstMove: number;
  moveCount: number;
  startMs: number;
  endMs: number;
  recognitionMs: number;
  executionMs: number;
  totalMs: number;
  /** Completed on the same move as the previous stage (or before the solve started). */
  skipped: boolean;
  detail?: string;
}

export interface SolveTimings {
  stages: StageTiming[];
  /** Share of the solve spent turning rather than looking (0..1); null if the time is 0. */
  fluency: number | null;
  /** Face the method anchored on (e.g. the cross face), null if no stage was reached. */
  bottomFace: string | null;
}

export function stageTimings(method: Method, rec: Recording): SolveTimings {
  const tracker = new MethodTracker(method, applyMoves(solvedState(), rec.scramble));
  rec.moves.forEach((m) => tracker.push(m.move, m.t));
  const labels = new Map(method.stages.map((s) => [s.id, s.label]));
  const timeAfter = (moveIndex: number) => (moveIndex === 0 ? 0 : rec.moves[moveIndex - 1].t);

  let prevIndex = 0;
  let prevEnd = 0;
  const stages: StageTiming[] = tracker.boundaries.map((b) => {
    const endMs = timeAfter(b.moveIndex);
    const moveCount = b.moveIndex - prevIndex;
    // A move's timestamp is when it completed; its start is ~the previous move's time.
    const firstStart = moveCount > 0 ? (prevIndex === 0 ? 0 : rec.moves[prevIndex - 1].t) : endMs;
    const firstDone = moveCount > 0 ? rec.moves[prevIndex].t : endMs;
    const recognitionMs = moveCount > 0 ? Math.max(0, firstDone - firstStart - estimateTurnMs(rec)) : 0;
    const t: StageTiming = {
      stage: b.stage,
      label: labels.get(b.stage) ?? b.stage,
      firstMove: prevIndex,
      moveCount,
      startMs: prevEnd,
      endMs,
      recognitionMs,
      executionMs: Math.max(0, endMs - prevEnd - recognitionMs),
      totalMs: endMs - prevEnd,
      skipped: moveCount === 0,
      ...(b.detail ? { detail: b.detail } : {}),
    };
    prevIndex = b.moveIndex;
    prevEnd = endMs;
    return t;
  });
  const recognition = stages.reduce((s, x) => s + x.recognitionMs, 0);
  return {
    stages,
    fluency: rec.totalMs > 0 ? 1 - recognition / rec.totalMs : null,
    bottomFace: tracker.bottomFace,
  };
}

/**
 * Typical time of one turn in this solve (median gap between consecutive
 * moves, capped): the part of a pause that is really the first move itself.
 */
function estimateTurnMs(rec: Recording): number {
  const gaps = rec.moves.slice(1).map((m, i) => m.t - rec.moves[i].t).filter((g) => g > 0).sort((a, b) => a - b);
  if (gaps.length === 0) return 0;
  return Math.min(gaps[Math.floor(gaps.length / 2)], 250);
}
