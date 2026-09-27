/**
 * Segments — sections of a timeline for a progress bar: where each part
 * starts and ends, what it's called, and optionally where "looking" turns
 * into "turning". Plain data, independent of any method: a player shows
 * whatever segments it's given (guide chapters, stored stage times…);
 * `stageSegments` computes them from a recorded solve for any Method.
 */

import type { Method } from "@cubecore/core";
import type { Recording } from "./recording";
import { stageTimings } from "./timings";

export interface Segment {
  /** ms of recording time. */
  start: number;
  end: number;
  label: string;
  /** Stable id — becomes ::part(segment-<id>) for styling. */
  id?: string;
  /** Extra detail, e.g. the F2L slot or the OLL case. */
  detail?: string;
  /** End of the recognition pause (start ≤ split ≤ end): the part before it was looking, after it turning. */
  split?: number;
  /** Moves in the segment. */
  moves?: number;
  /** A colour of your own (else the player's palette). */
  color?: string;
}

/** The stages of `method` in a recorded solve as segments (skipped stages — no time of their own — left out). */
export function stageSegments(method: Method, rec: Recording): Segment[] {
  return stageTimings(method, rec)
    .stages.filter((s) => !s.skipped && s.endMs > s.startMs)
    .map((s) => ({
      start: s.startMs,
      end: s.endMs,
      label: s.label,
      id: s.stage,
      ...(s.detail ? { detail: s.detail } : {}),
      ...(s.recognitionMs > 0 ? { split: s.startMs + s.recognitionMs } : {}),
      moves: s.moveCount,
    }));
}

/** The segment `time` falls in (index), or −1. */
export function segmentAt(segments: readonly Segment[], time: number): number {
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    if (time >= s.start && (time < s.end || (i === segments.length - 1 && time <= s.end))) return i;
  }
  return -1;
}

/** How much of a segment has played at `time` (0..1). */
export function segmentPlayed(s: Segment, time: number): number {
  if (time <= s.start) return 0;
  if (time >= s.end) return 1;
  return (time - s.start) / (s.end - s.start);
}
