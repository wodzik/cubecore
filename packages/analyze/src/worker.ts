/**
 * The analyser in a Web Worker (the F2L tables build here, once, ~10 s;
 * then an analysis of all six cross colours takes ~0.5 s optimal / ~50 ms
 * by algorithms). Use it through `createAnalyzerWorker()`.
 */

import { ROUX_TRAINERS } from "@cubecore/roux";
import { STAGES, indexedDbTableStore, preloadStageTables } from "@cubecore/solve";
import { type AnalyzeOptions, type RouxAnalyzeOptions, analyzeRoux, analyzeScramble, f2lStage } from "./index";

// The tables (CFOP: cross + each pair piece; Roux: blocks, squares) survive reloads in IndexedDB: built once per device.
const STAGE_TABLES = [f2lStage(["FR", "FL", "BL", "BR"]), ROUX_TRAINERS.fb(), ROUX_TRAINERS.ss("front"), ROUX_TRAINERS.ss("back"), STAGES["roux-blocks"]()];
const ready = typeof indexedDB !== "undefined" ? preloadStageTables(STAGE_TABLES, indexedDbTableStore()).catch(() => undefined) : Promise.resolve();

type Request = {
  id: number;
  method?: "cfop" | "roux";
  scramble: string | number[];
  options: Omit<AnalyzeOptions & RouxAnalyzeOptions, "known"> & { known?: string[] };
};
declare const self: { onmessage: ((e: MessageEvent<Request>) => void) | null; postMessage(r: unknown): void };

self.onmessage = async (e) => {
  const { id, scramble, options, method } = e.data;
  await ready;
  try {
    const input = typeof scramble === "string" ? scramble : Uint8Array.from(scramble);
    self.postMessage({ id, ok: true, value: method === "roux" ? analyzeRoux(input, options) : analyzeScramble(input, options) });
  } catch (err) {
    self.postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
