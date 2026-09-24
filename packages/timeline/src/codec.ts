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

import { type Amount, MOVE_FAMILIES, type Move } from "@cubecore/core";
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

function writeVarint(out: number[], value: number): void {
  let n = Math.max(0, Math.floor(value));
  while (n >= 128) {
    out.push((n % 128) | 128);
    n = Math.floor(n / 128);
  }
  out.push(n);
}

function pack(out: number[], values: number[], width: number): void {
  let acc = 0, bits = 0;
  for (const v of values) {
    acc |= v << bits;
    bits += width;
    while (bits >= 8) {
      out.push(acc & 255);
      acc >>>= 8;
      bits -= 8;
    }
  }
  if (bits > 0) out.push(acc & 255);
}

class Reader {
  pos = 0;
  constructor(private readonly b: Uint8Array) {}
  byte() {
    return this.pos < this.b.length ? this.b[this.pos++] : null;
  }
  varint(): number | null {
    let r = 0, scale = 1;
    for (let i = 0; i < 6; i++) {
      const x = this.byte();
      if (x === null) return null;
      r += (x & 127) * scale;
      if (x < 128) return r;
      scale *= 128;
    }
    return null;
  }
  packed(count: number, width: number): number[] | null {
    const need = Math.ceil((count * width) / 8);
    if (this.pos + need > this.b.length) return null;
    const out: number[] = [];
    let acc = 0, bits = 0, p = this.pos;
    for (let i = 0; i < count; i++) {
      while (bits < width) {
        acc |= this.b[p++] << bits;
        bits += 8;
      }
      out.push(acc & ((1 << width) - 1));
      acc >>>= width;
      bits -= width;
    }
    this.pos += need;
    return out;
  }
  get done() {
    return this.pos === this.b.length;
  }
}

const toB64 = (bytes: number[]) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
function fromB64(text: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(text) || text.length % 4 === 1) return null;
  try {
    return Uint8Array.from(atob(text.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

export function encodeRecording(rec: Recording): string {
  const out: number[] = [CODEC_VERSION];
  writeVarint(out, rec.totalMs);
  writeVarint(out, rec.scramble.length);
  pack(out, rec.scramble.map(symbolOf), 6);
  writeVarint(out, rec.moves.length);
  pack(out, rec.moves.map((m) => symbolOf(m.move)), 6);
  let prev = 0;
  for (const m of rec.moves) {
    const tick = Math.max(prev, Math.round(Math.max(0, m.t) / TICK_MS));
    writeVarint(out, tick - prev);
    prev = tick;
  }
  return toB64(out);
}

export function decodeRecording(text: string): Recording | null {
  const bytes = fromB64(text);
  if (!bytes) return null;
  const r = new Reader(bytes);
  if (r.byte() !== CODEC_VERSION) return null;
  const totalMs = r.varint();
  if (totalMs === null || totalMs > MAX_TIME) return null;
  const sLen = r.varint();
  if (sLen === null || sLen > MAX_MOVES) return null;
  const sSyms = r.packed(sLen, 6);
  const scramble = sSyms?.map(moveOf);
  if (!scramble || scramble.some((m) => m === null)) return null;
  const n = r.varint();
  if (n === null || n > MAX_MOVES) return null;
  const mSyms = r.packed(n, 6);
  const moves = mSyms?.map(moveOf);
  if (!moves || moves.some((m) => m === null)) return null;
  const timed = [];
  let tick = 0;
  for (let i = 0; i < n; i++) {
    const d = r.varint();
    if (d === null) return null;
    tick += d;
    timed.push({ move: moves[i]!, t: tick * TICK_MS });
  }
  if (!r.done) return null;
  if (timed.length && timed.at(-1)!.t > totalMs + TICK_MS) return null;
  return { scramble: scramble as Move[], moves: timed, totalMs };
}
