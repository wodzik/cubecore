/**
 * Promise API for the analyser worker:
 *
 *   const analyzer = createAnalyzerWorker();
 *   const a = await analyzer.analyze(scramble, { f2l: "algorithms", known: myCases });
 */

import type { State } from "@cubecore/core";
import type { Analysis, AnalyzeOptions, RouxAnalysisResult, RouxAnalyzeOptions } from "./index";

export interface AnalyzerClient {
  /** CFOP. */
  analyze(scramble: string | State, options?: AnalyzeOptions): Promise<Analysis>;
  analyzeRoux(scramble: string | State, options?: RouxAnalyzeOptions): Promise<RouxAnalysisResult>;
  terminate(): void;
}

export function analyzerClient(worker: Worker): AnalyzerClient {
  let nextId = 1;
  const pending = new Map<number, { resolve: (v: never) => void; reject: (e: Error) => void }>();
  worker.onmessage = (e: MessageEvent<{ id: number; ok: boolean; value?: never; error?: string }>) => {
    const p = pending.get(e.data.id);
    if (!p) return;
    pending.delete(e.data.id);
    if (e.data.ok) p.resolve(e.data.value!);
    else p.reject(new Error(e.data.error));
  };
  const call = <T>(method: "cfop" | "roux", scramble: string | State, options: { known?: Iterable<string> } & Record<string, unknown>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve: resolve as (v: never) => void, reject });
      const { known, ...rest } = options;
      worker.postMessage({ id, method, scramble: typeof scramble === "string" ? scramble : [...scramble], options: { ...rest, ...(known ? { known: [...known] } : {}) } });
    });
  return {
    analyze: (scramble, options = {}) => call<Analysis>("cfop", scramble, options as never),
    analyzeRoux: (scramble, options = {}) => call<RouxAnalysisResult>("roux", scramble, options as never),
    terminate: () => {
      worker.terminate();
      for (const p of pending.values()) p.reject(new Error("Analyzer worker terminated"));
      pending.clear();
    },
  };
}

/** Start the analyser worker (bundlers pick up `./worker.ts`; or pass the URL of one you built). */
export function createAnalyzerWorker(url?: string | URL): AnalyzerClient {
  return analyzerClient(new Worker(url ?? new URL("./worker.ts", import.meta.url), { type: "module" }));
}
