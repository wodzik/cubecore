/**
 * The analyser in a Web Worker (the F2L tables build here, once, ~10 s;
 * then an analysis of all six cross colours takes ~0.5 s optimal / ~50 ms
 * by algorithms). Use it through `createAnalyzerWorker()`.
 */

import { ROUX_TRAINERS } from "@cubecore/roux";
import { STAGES, indexedDbTableStore, preloadStageTables } from "@cubecore/solve";
import { type AnalyzeOptions, type RouxAnalyzeOptions, type ZZAnalyzeOptions, analyzeRoux, analyzeScramble, analyzeZZ, f2lStage } from "./index";
import { ZZ_TRAINERS } from "@cubecore/zz";

// The tables (CFOP: cross + each pair piece; Roux: blocks, squares) survive reloads in IndexedDB: built once per device.
const STAGE_TABLES = [f2lStage(["FR", "FL", "BL", "BR"]), ZZ_TRAINERS.eocross(), ROUX_TRAINERS.fb(), ROUX_TRAINERS.ss("front"), ROUX_TRAINERS.ss("back"), STAGES["roux-blocks"]()];
const ready = typeof indexedDB !== "undefined" ? preloadStageTables(STAGE_TABLES, indexedDbTableStore()).catch(() => undefined) : Promise.resolve();

type Request = {
  id: number;
  method?: "cfop" | "roux" | "zz";
  scramble: string | number[];
  /** Options of the method asked for (CFOP / Roux / ZZ). */
  options: Record<string, unknown> & { known?: string[] };
};
declare const self: { onmessage: ((e: MessageEvent<Request>) => void) | null; postMessage(r: unknown): void };

self.onmessage = async (e) => {
  const { id, scramble, options, method } = e.data;
  await ready;
  try {
    const input = typeof scramble === "string" ? scramble : Uint8Array.from(scramble);
    self.postMessage({
      id,
      ok: true,
      value:
        method === "roux"
          ? analyzeRoux(input, options as RouxAnalyzeOptions)
          : method === "zz"
            ? analyzeZZ(input, options as ZZAnalyzeOptions)
            : analyzeScramble(input, options as AnalyzeOptions),
    });
  } catch (err) {
    self.postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
