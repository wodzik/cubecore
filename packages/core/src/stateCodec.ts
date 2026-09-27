/**
 * A cube state in 15 URL-safe characters (11 bytes): version, then 73 bits —
 * centre orientation (frame id, 5 bits), corner permutation (Lehmer rank, 16),
 * corner twists (7 base-3 digits, 12), edge permutation (rank, 29 in two
 * parts), edge flips (11). The last twist and flip follow from the others.
 * For links, QR codes, storage keys. Decoding is strict: anything that isn't
 * a state reachable by turning returns null.
 */

import { ByteReader, fromBase64Url, packFields, toBase64Url } from "./bytes";
import { type CubieState, fromCubies, isSolvable, permRank, permUnrank, toCubies } from "./cubies";
import { FRAMES } from "./frames";
import type { State } from "./state";

export const STATE_CODEC_VERSION = 1;
const WIDTHS = [5, 16, 12, 15, 14, 11];
const EP_LOW = 1 << 15;

export function encodeState(state: State): string | null {
  const c = toCubies(state);
  if (!c || !isSolvable(c)) return null;
  const twist = c.co.slice(0, 7).reduce((acc, t) => acc * 3 + t, 0);
  const flip = c.eo.slice(0, 11).reduce((acc, f) => acc * 2 + f, 0);
  const ep = permRank(c.ep);
  const out = [STATE_CODEC_VERSION];
  const fields = [c.frame.id, permRank(c.cp), twist, ep % EP_LOW, Math.floor(ep / EP_LOW), flip];
  packFields(out, fields, WIDTHS);
  return toBase64Url(out);
}

export function decodeState(text: string): State | null {
  const bytes = fromBase64Url(text);
  if (!bytes) return null;
  const r = new ByteReader(bytes);
  if (r.byte() !== STATE_CODEC_VERSION) return null;
  const f = r.fields(WIDTHS);
  if (!f || !r.done) return null;
  const [frameId, cpRank, twist, epLow, epHigh, flip] = f;
  const epRank = epHigh * EP_LOW + epLow;
  if (frameId >= 24 || cpRank >= 40320 || twist >= 2187 || epRank >= 479001600 || flip >= 2048) return null;
  const co: number[] = [];
  for (let i = 0, t = twist; i < 7; i++, t = Math.floor(t / 3)) co.unshift(t % 3);
  co.push((3 - (co.reduce((a, b) => a + b, 0) % 3)) % 3);
  const eo: number[] = [];
  for (let i = 0, t = flip; i < 11; i++, t = Math.floor(t / 2)) eo.unshift(t % 2);
  eo.push(eo.reduce((a, b) => a + b, 0) % 2);
  const c: CubieState = { frame: FRAMES[frameId], cp: permUnrank(cpRank, 8), co, ep: permUnrank(epRank, 12), eo };
  return isSolvable(c) ? fromCubies(c) : null;
}
