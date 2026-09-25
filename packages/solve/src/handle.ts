/**
 * Runs one request — the same code in a worker (worker.ts) and on the main
 * thread (for tests, or apps that don't mind the wait).
 */

import { type AnyStageDef, FRAMES, isLseStage } from "@cubecore/core";
import { lseSolver } from "./lse";
import { type Request, seededRandom } from "./protocol";
import { randomScramble, sharedSolver, stageScramble } from "./scramble";
import { type StageDef, indexedDbTableStore, preloadStageTables, stageSolver } from "./stage";

/** Tables kept across sessions when the environment has IndexedDB (browsers, workers). */
const store = typeof indexedDB !== "undefined" ? indexedDbTableStore() : null;

export async function handle(r: Request): Promise<unknown> {
  const frame = "frameId" in r && r.frameId !== undefined ? FRAMES[r.frameId] : undefined;
  const random = "seed" in r && r.seed !== undefined ? seededRandom(r.seed) : undefined;
  switch (r.op) {
    case "warmUp":
      sharedSolver();
      if (store) await preloadStageTables(r.stages.filter((s) => !isLseStage(s)) as StageDef[], store);
      for (const s of r.stages) solverFor(s);
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
      return solverFor(r.stage).solve(r.state, { frame, all: r.all, limit: r.limit });
    case "stageDistance":
      return solverFor(r.stage).distance(r.state, { frame });
  }
}

/** The solver for a stage: piece stages (cross, blocks…) or last-six-edges stages (EOLR). */
const solverFor = (def: AnyStageDef) => (isLseStage(def) ? lseSolver(def) : stageSolver(def));
