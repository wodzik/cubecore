/**
 * The analyser in a Web Worker (the F2L tables build here, once, ~10 s;
 * then an analysis of all six cross colours takes ~0.5 s optimal / ~50 ms
 * by algorithms). Use it through `createAnalyzerWorker()`.
 */

import { indexedDbTableStore, preloadStageTables } from "@cubecore/solve";
import { type AnalyzeOptions, analyzeScramble, f2lStage } from "./index";

// The F2L tables (cross + each pair piece) survive reloads in IndexedDB: built once per device.
const ready =
  typeof indexedDB !== "undefined" ? preloadStageTables([f2lStage(["FR", "FL", "BL", "BR"])], indexedDbTableStore()).catch(() => undefined) : Promise.resolve();

type Request = { id: number; scramble: string | number[]; options: Omit<AnalyzeOptions, "known"> & { known?: string[] } };
declare const self: { onmessage: ((e: MessageEvent<Request>) => void) | null; postMessage(r: unknown): void };

self.onmessage = async (e) => {
  const { id, scramble, options } = e.data;
  await ready;
  try {
    const input = typeof scramble === "string" ? scramble : Uint8Array.from(scramble);
    self.postMessage({ id, ok: true, value: analyzeScramble(input, options) });
  } catch (err) {
    self.postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
