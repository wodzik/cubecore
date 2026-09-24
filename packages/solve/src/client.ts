/**
 * The solvers in a Web Worker, with a Promise API — the main thread never
 * waits for table building (two-phase ~0.5 s, xcross tables ~3 s once).
 *
 *   const solver = createSolverWorker();
 *   await solver.warmUp([STAGES.xcross("FR")]);                       // optional: build early
 *   const { moves } = await solver.stageScramble({ stage: STAGES.cross(), length: 6, frame: frameFor("U"), from: cube.state });
 *
 * Requests are answered in order; call `terminate()` when done.
 */

import type { Frame, Move, State } from "@cubecore/core";
import type { Envelope, Request, Response, ScrambleResult } from "./protocol";
import type { ScramblePreset } from "./scramble";
import type { StageDef } from "./stage";

interface Common {
  frame?: Frame;
  from?: State;
  seed?: number;
  maxLength?: number;
  timeoutMs?: number;
}

export interface SolverClient {
  warmUp(stages?: StageDef[]): Promise<boolean>;
  solve(state: State, options?: { maxLength?: number; timeoutMs?: number }): Promise<Move[] | null>;
  solveBetween(from: State, to: State, options?: { maxLength?: number }): Promise<Move[] | null>;
  randomScramble(options?: Common & { preset?: ScramblePreset }): Promise<ScrambleResult>;
  stageScramble(options: Common & { stage: StageDef; length: number }): Promise<ScrambleResult | null>;
  stageSolve(stage: StageDef, state: State, options?: { frame?: Frame; all?: boolean; limit?: number }): Promise<Move[][]>;
  stageDistance(stage: StageDef, state: State, options?: { frame?: Frame }): Promise<number>;
  terminate(): void;
}

/** Wrap a worker (or anything that speaks the protocol) in the Promise API. */
export function solverClient(worker: Worker): SolverClient {
  let nextId = 1;
  const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  worker.onmessage = (e: MessageEvent<Response>) => {
    const p = pending.get(e.data.id);
    if (!p) return;
    pending.delete(e.data.id);
    if (e.data.ok) p.resolve(e.data.value);
    else p.reject(new Error(e.data.error));
  };
  const call = <T>(request: Request): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      worker.postMessage({ id, request } satisfies Envelope);
    });
  const common = (o: Common = {}) => ({ frameId: o.frame?.id, from: o.from, seed: o.seed, maxLength: o.maxLength, timeoutMs: o.timeoutMs });
  return {
    warmUp: (stages = []) => call({ op: "warmUp", stages }),
    solve: (state, o = {}) => call({ op: "solve", state, ...o }),
    solveBetween: (from, to, o = {}) => call({ op: "solveBetween", from, to, ...o }),
    randomScramble: (o = {}) => call({ op: "randomScramble", preset: o.preset, ...common(o) }),
    stageScramble: (o) => call({ op: "stageScramble", stage: o.stage, length: o.length, ...common(o) }),
    stageSolve: (stage, state, o = {}) => call({ op: "stageSolve", stage, state, frameId: o.frame?.id, all: o.all, limit: o.limit }),
    stageDistance: (stage, state, o = {}) => call({ op: "stageDistance", stage, state, frameId: o.frame?.id }),
    terminate: () => {
      worker.terminate();
      for (const p of pending.values()) p.reject(new Error("Solver worker terminated"));
      pending.clear();
    },
  };
}

/** Start the solver worker (bundlers pick up the worker file from this URL). */
export function createSolverWorker(): SolverClient {
  return solverClient(new Worker(new URL("./worker.ts", import.meta.url), { type: "module" }));
}
