import { describe, expect, it } from "bun:test";
import { applyMoves, frameFor, isSolved, solvedState } from "@cubecore/core";
import { STAGES, StageSolver, createSolverWorker } from "./index";

describe("solver worker", () => {
  it("answers scrambles, solves and stage requests off the main thread", async () => {
    const solver = createSolverWorker();
    try {
      expect(await solver.warmUp([STAGES.cross()])).toBe(true);
      const full = await solver.randomScramble({ seed: 1 });
      expect(full.moves.length).toBeGreaterThan(14);
      const again = await solver.randomScramble({ seed: 1 });
      expect(again.state.join()).toBe(full.state.join()); // seeded: reproducible
      const sol = (await solver.solve(full.state))!;
      expect(isSolved(applyMoves(full.state, sol))).toBe(true);
      const frame = frameFor("U");
      const cross = (await solver.stageScramble({ stage: STAGES.cross(), length: 5, frame, seed: 3 }))!;
      expect(new StageSolver(STAGES.cross()).distance(cross.state, { frame })).toBe(5);
      expect(await solver.stageDistance(STAGES.cross(), cross.state, { frame })).toBe(5);
      const all = await solver.stageSolve(STAGES.cross(), cross.state, { frame, all: true });
      expect(all.every((s) => s.length === 5)).toBe(true);
      expect(await solver.solveBetween(solvedState(), solvedState())).toEqual([]);
    } finally {
      solver.terminate();
    }
  });
});
