/**
 * Messages between the solver worker and its client. Everything is plain
 * data (structured-clone friendly): frames travel as their FRAMES id, a
 * random source as a seed, stages as StageDef data.
 */

import type { Move, State } from "@cubecore/core";
import type { ScramblePreset } from "./scramble";
import type { StageDef } from "./stage";

export interface Seeded {
  /** Seed for reproducible results; omitted = Math.random. */
  seed?: number;
  /** FRAMES id (0 = canonical). */
  frameId?: number;
  from?: State;
  maxLength?: number;
  timeoutMs?: number;
}

export type Request =
  | { op: "warmUp"; stages: StageDef[] }
  | { op: "solve"; state: State; maxLength?: number; timeoutMs?: number }
  | { op: "solveBetween"; from: State; to: State; maxLength?: number }
  | ({ op: "randomScramble"; preset?: ScramblePreset } & Seeded)
  | ({ op: "stageScramble"; stage: StageDef; length: number } & Seeded)
  | { op: "stageSolve"; stage: StageDef; state: State; frameId?: number; all?: boolean; limit?: number }
  | { op: "stageDistance"; stage: StageDef; state: State; frameId?: number };

export type Response = { id: number; ok: true; value: unknown } | { id: number; ok: false; error: string };

export interface Envelope {
  id: number;
  request: Request;
}

export type ScrambleResult = { moves: Move[]; state: State };

/** A small seeded generator (mulberry32). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
