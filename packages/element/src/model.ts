/**
 * The player's logic without the DOM — what the controls show and do, as
 * pure functions (tested in bun; the element only wires them to buttons).
 */

import { type Method, type Move, invert, parseAlg, parseAlgDocument } from "@cubecore/core";
import { type Recording, type Segment, stageTimings } from "@cubecore/timeline";

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

/**
 * An algorithm played at a steady tempo, as a recording: each move takes one
 * beat (1 / movesPerSecond), each pause (`.` in the text) one beat of stillness.
 */
export function tempoRecording(alg: string | readonly Move[], movesPerSecond: number): { recording: Recording; interval: number } {
  const doc = typeof alg === "string" ? parseAlgDocument(alg) : { moves: [...alg], pausesBefore: alg.map(() => 0) };
  const interval = 1000 / Math.max(0.1, movesPerSecond);
  let beats = 0;
  const moves = doc.moves.map((move, i) => {
    beats += doc.pausesBefore[i] + 1;
    return { move, t: Math.round(beats * interval) };
  });
  return { recording: { scramble: [], moves, totalMs: Math.round(beats * interval) }, interval };
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

/**
 * Moves that set the cube up before an algorithm plays: the setup, then —
 * for `anchor = "end"` (the algorithm SOLVES the cube) — the algorithm's
 * inverse, so playing it ends solved (or back at the setup).
 */
export function startMoves(setup: string | readonly Move[], alg: readonly Move[], anchor: "start" | "end" = "start"): Move[] {
  const s = typeof setup === "string" ? parseAlg(setup) : [...setup];
  return anchor === "end" ? [...s, ...invert(alg)] : s;
}

/** Default tooltip text of a segment: "F2L 2 · FL · 3.21 s (recognition 0.80 · execution 2.41) · 9 moves". */
export function segmentText(s: Segment): string {
  const parts = [s.label];
  if (s.detail) parts.push(s.detail);
  const total = `${formatTime(s.end - s.start)} s`;
  parts.push(s.split !== undefined ? `${total} (recognition ${formatTime(s.split - s.start)} · execution ${formatTime(s.end - s.split)})` : total);
  if (s.moves !== undefined) parts.push(`${s.moves} move${s.moves === 1 ? "" : "s"}`);
  return parts.join(" · ");
}
