/**
 * The player's logic without the DOM — what the controls show and do, as
 * pure functions (tested in bun; the element only wires them to buttons).
 */

import { type Method, type Move, parseAlg } from "@cubecore/core";
import { type Recording, stageTimings } from "@cubecore/timeline";

/** A mark on the progress bar, e.g. where a stage ends. */
export interface Marker {
  /** ms of recording time. */
  time: number;
  label: string;
}

/** "12.34" under a minute, "1:02.34" above. */
export function formatTime(ms: number): string {
  const s = Math.max(0, ms) / 1000;
  if (s < 60) return s.toFixed(2);
  const m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(2).padStart(5, "0")}`;
}

/** An algorithm played at a steady tempo, as a recording: move i ends at (i + 1) × interval. */
export function tempoRecording(alg: string | readonly Move[], movesPerSecond: number): { recording: Recording; interval: number } {
  const moves = typeof alg === "string" ? parseAlg(alg) : [...alg];
  const interval = 1000 / Math.max(0.1, movesPerSecond);
  return {
    recording: { scramble: [], moves: moves.map((move, i) => ({ move, t: Math.round((i + 1) * interval) })), totalMs: Math.round(moves.length * interval) },
    interval,
  };
}

/** Where each stage of `method` ends in `rec` (skipped stages left out). */
export function stageMarkers(method: Method, rec: Recording): Marker[] {
  return stageTimings(method, rec)
    .stages.filter((s) => !s.skipped)
    .map((s) => ({ time: s.endMs, label: s.detail ? `${s.label} (${s.detail})` : s.label }));
}

/** Time to jump to for one move forward (+1) or back (−1) from `time`: the end of a move, or the start. */
export function stepTime(rec: Recording, time: number, direction: 1 | -1): number {
  const ends = rec.moves.map((m) => m.t);
  if (direction > 0) return ends.find((t) => t > time + 0.5) ?? rec.totalMs;
  const before = ends.filter((t) => t < time - 0.5);
  return before.length ? before[before.length - 1] : 0;
}

/** Fraction 0..1 of the way through. */
export const fraction = (time: number, duration: number) => (duration > 0 ? Math.min(1, Math.max(0, time / duration)) : 0);
