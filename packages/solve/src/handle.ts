/**
 * Runs one request — the same code in a worker (worker.ts) and on the main
 * thread (for tests, or apps that don't mind the wait).
 */

import { FRAMES } from "@cubecore/core";
import { type Request, seededRandom } from "./protocol";
import { randomScramble, sharedSolver, stageScramble } from "./scramble";
import { indexedDbTableStore, preloadStageTables, stageSolver } from "./stage";

/** Tables kept across sessions when the environment has IndexedDB (browsers, workers). */
const store = typeof indexedDB !== "undefined" ? indexedDbTableStore() : null;

export async function handle(r: Request): Promise<unknown> {
  const frame = "frameId" in r && r.frameId !== undefined ? FRAMES[r.frameId] : undefined;
  const random = "seed" in r && r.seed !== undefined ? seededRandom(r.seed) : undefined;
  switch (r.op) {
    case "warmUp":
      sharedSolver();
      if (store) await preloadStageTables(r.stages, store);
      for (const s of r.stages) stageSolver(s);
      return true;
    case "solve":
      return sharedSolver().solve(r.state, r);
    case "solveBetween":
      return sharedSolver().solveBetween(r.from, r.to, r);
    case "randomScramble":
      return randomScramble({ preset: r.preset, frame, from: r.from, random, maxLength: r.maxLength, timeoutMs: r.timeoutMs });
    case "stageScramble":
      return stageScramble({ stage: r.stage, length: r.length, frame, from: r.from, random, maxLength: r.maxLength, timeoutMs: r.timeoutMs });
    case "stageSolve":
      return stageSolver(r.stage).solve(r.state, { frame, all: r.all, limit: r.limit });
    case "stageDistance":
      return stageSolver(r.stage).distance(r.state, { frame });
  }
}
