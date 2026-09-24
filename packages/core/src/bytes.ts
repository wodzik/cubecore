/**
 * Byte helpers for compact, URL-safe encodings (state codec here, recordings
 * and share links in @cubecore/timeline): unsigned LEB128 varints, fixed-width
 * bit packing, base64url without padding. Readers are strict: running out of
 * bytes returns null instead of throwing.
 */

export function writeVarint(out: number[], value: number): void {
  let n = Math.max(0, Math.floor(value));
  while (n >= 128) {
    out.push((n % 128) | 128);
    n = Math.floor(n / 128);
  }
  out.push(n);
}

/** Append `values`, each `width` bits (≤ 24), least significant first. */
export function packBits(out: number[], values: readonly number[], width: number): void {
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

/** Append fields of different widths (each ≤ 24 bits) as one bit stream. */
export function packFields(out: number[], values: readonly number[], widths: readonly number[]): void {
  let acc = 0, bits = 0;
  values.forEach((v, i) => {
    acc |= v << bits;
    bits += widths[i];
    while (bits >= 8) {
      out.push(acc & 255);
      acc >>>= 8;
      bits -= 8;
    }
  });
  if (bits > 0) out.push(acc & 255);
}

export function writeText(out: number[], text: string): void {
  const bytes = new TextEncoder().encode(text);
  writeVarint(out, bytes.length);
  out.push(...bytes);
}

export class ByteReader {
  pos = 0;
  constructor(private readonly b: Uint8Array) {}

  byte(): number | null {
    return this.pos < this.b.length ? this.b[this.pos++] : null;
  }

  varint(): number | null {
    let r = 0, scale = 1;
    for (let i = 0; i < 7; i++) {
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

  /** Read fields written by `packFields`. */
  fields(widths: readonly number[]): number[] | null {
    const total = widths.reduce((a, b) => a + b, 0);
    const need = Math.ceil(total / 8);
    if (this.pos + need > this.b.length) return null;
    const out: number[] = [];
    let acc = 0, bits = 0, p = this.pos;
    for (const w of widths) {
      while (bits < w) {
        acc |= this.b[p++] << bits;
        bits += 8;
      }
      out.push(acc & ((1 << w) - 1));
      acc >>>= w;
      bits -= w;
    }
    this.pos += need;
    return out;
  }

  bytes(count: number): Uint8Array | null {
    if (this.pos + count > this.b.length) return null;
    const out = this.b.slice(this.pos, this.pos + count);
    this.pos += count;
    return out;
  }

  text(maxBytes = 256): string | null {
    const n = this.varint();
    if (n === null || n > maxBytes) return null;
    const raw = this.bytes(n);
    if (!raw) return null;
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(raw);
    } catch {
      return null;
    }
  }

  get done(): boolean {
    return this.pos === this.b.length;
  }
}

export const toBase64Url = (bytes: readonly number[] | Uint8Array): string =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export function fromBase64Url(text: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) return null;
  try {
    return Uint8Array.from(atob(text.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}
