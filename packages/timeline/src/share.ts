/**
 * Share payloads — a whole solve as one URL-safe string, e.g. for a link
 * fragment (`…#s=<payload>`) that a static app can open with no backend.
 * Building and reading the URL is the app's business; this is the codec. Only what can't be recomputed is stored: the recording
 * (scramble, every move with its time, the total) and a few facts about it.
 * Stage splits are NOT stored — the reader derives them (MethodTracker).
 *
 * Payload (version 1), base64url:
 *   byte    version
 *   byte    flags: bit0 DNF · bit1 hide times (show move counts only) · bit2 has start state
 *   text    method id ("cfop", "roux"… or empty) — varint length + UTF-8
 *   [11 B]  start state (core state codec bytes) when the solve didn't start from `scramble` on a solved cube
 *   …       the recording (see codec.ts)
 * A typical 100-move solve is ~250 characters.
 */

import { ByteReader, type State, decodeState, encodeState, fromBase64Url, toBase64Url, writeText } from "@cubecore/core";
import { readRecording, writeRecording } from "./codec";
import type { Recording } from "./recording";

export const SHARE_VERSION = 1;

export interface SharedSolve {
  recording: Recording;
  /** Method id the solve was analysed with, e.g. "cfop". */
  method?: string;
  dnf?: boolean;
  /** The sharer showed move counts, not times — a viewer should do the same. */
  hideTimes?: boolean;
  /** State the solve started from, when it isn't `scramble` applied to a solved cube (e.g. a scrambled-by-hand cube). */
  start?: State;
}

export function encodeShare(solve: SharedSolve): string {
  const out: number[] = [SHARE_VERSION, (solve.dnf ? 1 : 0) | (solve.hideTimes ? 2 : 0) | (solve.start ? 4 : 0)];
  writeText(out, solve.method ?? "");
  if (solve.start) {
    const code = encodeState(solve.start);
    if (!code) throw new Error("start is not a reachable cube state");
    out.push(...fromBase64Url(code)!);
  }
  writeRecording(out, solve.recording);
  return toBase64Url(out);
}

export function decodeShare(text: string): SharedSolve | null {
  const bytes = fromBase64Url(text);
  if (!bytes) return null;
  const r = new ByteReader(bytes);
  if (r.byte() !== SHARE_VERSION) return null;
  const flags = r.byte();
  if (flags === null || flags > 7) return null;
  const method = r.text(64);
  if (method === null) return null;
  let start: State | undefined;
  if (flags & 4) {
    const raw = r.bytes(11);
    const decoded = raw && decodeState(toBase64Url(raw));
    if (!decoded) return null;
    start = decoded;
  }
  const recording = readRecording(r);
  if (!recording || !r.done) return null;
  return {
    recording,
    ...(method ? { method } : {}),
    ...(flags & 1 ? { dnf: true } : {}),
    ...(flags & 2 ? { hideTimes: true } : {}),
    ...(start ? { start } : {}),
  };
}
