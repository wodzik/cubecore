/**
 * Compact, URL-safe encoding of a Recording (e.g. for share links or storing
 * many solves). Version 1, base64url without padding:
 *   byte    version
 *   varint  totalMs
 *   varint  scramble length, then 6-bit move symbols
 *   varint  move count,      then 6-bit move symbols
 *   varint× per move: time since the previous move in 10 ms ticks (rounded on
 *           the absolute time, so rounding never accumulates)
 * A move symbol = family index (MOVE_FAMILIES order) × 3 + amount (1, ', 2),
 * so every move family — slices, wide turns, rotations — fits.
 * Decoding is strict: unknown version, truncation, trailing bytes, absurd sizes
 * and bad symbols return null.
 */

import { type Amount, ByteReader, MOVE_FAMILIES, type Move, fromBase64Url, packBits, toBase64Url, writeVarint } from "@cubecore/core";
import type { Recording } from "./recording";

export const CODEC_VERSION = 1;
const TICK_MS = 10;
const AMOUNTS: Amount[] = [1, -1, 2];
const MAX_MOVES = 10_000;
const MAX_TIME = 24 * 3600 * 1000;

const symbolOf = (m: Move) => MOVE_FAMILIES.indexOf(m.family) * 3 + AMOUNTS.indexOf(m.amount);
const moveOf = (s: number): Move | null => {
  const family = MOVE_FAMILIES[Math.floor(s / 3)];
  return family ? { family, amount: AMOUNTS[s % 3] } : null;
};

/** Append a recording's bytes (everything after the version byte). */
export function writeRecording(out: number[], rec: Recording): void {
  writeVarint(out, rec.totalMs);
  writeVarint(out, rec.scramble.length);
  packBits(out, rec.scramble.map(symbolOf), 6);
  writeVarint(out, rec.moves.length);
  packBits(out, rec.moves.map((m) => symbolOf(m.move)), 6);
  let prev = 0;
  for (const m of rec.moves) {
    const tick = Math.max(prev, Math.round(Math.max(0, m.t) / TICK_MS));
    writeVarint(out, tick - prev);
    prev = tick;
  }
}

/** Read what `writeRecording` wrote; null on anything malformed. */
export function readRecording(r: ByteReader): Recording | null {
  const totalMs = r.varint();
  if (totalMs === null || totalMs > MAX_TIME) return null;
  const sLen = r.varint();
  if (sLen === null || sLen > MAX_MOVES) return null;
  const scramble = r.packed(sLen, 6)?.map(moveOf);
  if (!scramble || scramble.some((m) => m === null)) return null;
  const n = r.varint();
  if (n === null || n > MAX_MOVES) return null;
  const moves = r.packed(n, 6)?.map(moveOf);
  if (!moves || moves.some((m) => m === null)) return null;
  const timed = [];
  let tick = 0;
  for (let i = 0; i < n; i++) {
    const d = r.varint();
    if (d === null) return null;
    tick += d;
    timed.push({ move: moves[i]!, t: tick * TICK_MS });
  }
  if (timed.length && timed.at(-1)!.t > totalMs + TICK_MS) return null;
  return { scramble: scramble as Move[], moves: timed, totalMs };
}

export function encodeRecording(rec: Recording): string {
  const out: number[] = [CODEC_VERSION];
  writeRecording(out, rec);
  return toBase64Url(out);
}

export function decodeRecording(text: string): Recording | null {
  const bytes = fromBase64Url(text);
  if (!bytes) return null;
  const r = new ByteReader(bytes);
  if (r.byte() !== CODEC_VERSION) return null;
  const rec = readRecording(r);
  return rec && r.done ? rec : null;
}
