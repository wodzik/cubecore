/**
 * The solver worker's entry point: tables are built here, off the main
 * thread, and stay warm for the worker's lifetime. Use it through
 * `createSolverWorker()` (client.ts).
 */

import { handle } from "./handle";
import type { Envelope, Response } from "./protocol";

declare const self: { onmessage: ((e: MessageEvent<Envelope>) => void) | null; postMessage(r: Response): void };

self.onmessage = async (e) => {
  const { id, request } = e.data;
  try {
    self.postMessage({ id, ok: true, value: await handle(request) });
  } catch (err) {
    self.postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
