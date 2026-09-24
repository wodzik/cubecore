/**
 * Algorithm notation: parse, format, invert, simplify, mirror, metrics.
 *
 * Accepted: face turns (R R' R2 R2' R3), wide turns in both spellings
 * (r / Rw, r' / Rw'), slices M E S, rotations x y z, grouping with repetition
 * `(R U R' U')3`, commutators `[A, B]` = A B A' B', conjugates `[A: B]` =
 * A B A'. Typographic apostrophes (’ ′) are accepted, `//` starts a comment,
 * `.` is a pause (one beat). parseAlg flattens everything to a Move[];
 * parseAlgDocument also says where each move came from in the text.
 */

import { type Amount, type Move, type MoveFamily, FAMILY, amountQuarters, formatMove, invertMove, moveKind, toAmount } from "./moves";

export class NotationError extends Error {
  constructor(message: string, readonly position: number) {
    super(`${message} (at ${position})`);
  }
}

const FACE_LETTERS = "URFDLB";
const WIDE_LETTERS = "urfdlb";
const OTHER_LETTERS = "MESxyz";

/** Where a move (or pause) came from in the text: [start, end) character offsets. */
export interface SourceRange {
  start: number;
  end: number;
}

type Item = { move: Move; start: number; end: number } | { pause: true; start: number; end: number };

class Parser {
  private pos = 0;
  readonly comments: (SourceRange & { text: string })[] = [];
  constructor(private readonly text: string) {}

  parse(): Item[] {
    const items = this.sequence(null);
    this.skipSpace();
    if (this.pos < this.text.length) throw new NotationError(`Unexpected "${this.text[this.pos]}"`, this.pos);
    return items;
  }

  private skipSpace(): void {
    while (this.pos < this.text.length) {
      const c = this.text[this.pos];
      if (c === "/" && this.text[this.pos + 1] === "/") {
        const start = this.pos;
        while (this.pos < this.text.length && this.text[this.pos] !== "\n") this.pos++;
        this.comments.push({ start, end: this.pos, text: this.text.slice(start + 2, this.pos).trim() });
      } else if (/\s/.test(c)) this.pos++;
      else break;
    }
  }

  /** Items until `stop` (one of the given closing characters) or end of input. */
  private sequence(stop: string | null): Item[] {
    const out: Item[] = [];
    for (;;) {
      this.skipSpace();
      const c = this.text[this.pos];
      if (c === undefined || (stop !== null && stop.includes(c))) return out;
      if (c === "(") {
        this.pos++;
        const inner = this.sequence(")");
        this.expect(")");
        out.push(...repeat(inner, this.count()));
      } else if (c === "[") {
        this.pos++;
        const a = this.sequence(",:");
        const sep = this.text[this.pos];
        if (sep !== "," && sep !== ":") throw new NotationError('Expected "," or ":" in brackets', this.pos);
        this.pos++;
        const b = this.sequence("]");
        this.expect("]");
        const group = sep === "," ? [...a, ...b, ...invertItems(a), ...invertItems(b)] : [...a, ...b, ...invertItems(a)];
        out.push(...repeat(group, this.count()));
      } else if (c === ".") {
        // A pause (one beat, as in cubing.js).
        out.push({ pause: true, start: this.pos, end: this.pos + 1 });
        this.pos++;
      } else {
        const start = this.pos;
        const m = this.move();
        if (m) out.push({ move: m, start, end: this.pos }); // null = a full turn (R4), which does nothing
      }
    }
  }

  private expect(c: string): void {
    this.skipSpace();
    if (this.text[this.pos] !== c) throw new NotationError(`Expected "${c}"`, this.pos);
    this.pos++;
  }

  private count(): number {
    const m = /^\d+/.exec(this.text.slice(this.pos));
    if (!m) return 1;
    this.pos += m[0].length;
    return Number(m[0]);
  }

  private move(): Move | null {
    const start = this.pos;
    const c = this.text[this.pos];
    let family: MoveFamily;
    if (FACE_LETTERS.includes(c)) {
      this.pos++;
      if (this.text[this.pos] === "w") {
        this.pos++;
        family = c.toLowerCase() as MoveFamily;
      } else family = c as MoveFamily;
    } else if (WIDE_LETTERS.includes(c) || OTHER_LETTERS.includes(c)) {
      this.pos++;
      family = c as MoveFamily;
    } else {
      throw new NotationError(`Unknown move "${c}"`, start);
    }
    let quarters = this.count();
    if (/['’′]/.test(this.text[this.pos] ?? "")) {
      this.pos++;
      quarters = -quarters;
    }
    const amount = toAmount(quarters);
    if (amount === null) return null;
    // Keep the way it's written when the amount alone would lose it (R2', R3, R3').
    const plain = amount === -1 ? -1 : amount;
    return quarters === plain ? { family, amount } : { family, amount, written: quarters };
  }
}

function repeat<T>(items: T[], n: number): T[] {
  const out: T[] = [];
  for (let i = 0; i < n; i++) out.push(...items);
  return out;
}

/** Inverse keeping each move's source (commutators / conjugates point back at what was written). */
function invertItems(items: Item[]): Item[] {
  return [...items].reverse().map((it) => ("move" in it ? { ...it, move: invertMove(it.move) } : it));
}

/**
 * An algorithm as written: the moves, where each came from in the text
 * (repeats and commutator inverses point at the move they copy), pauses (`.`,
 * one beat each — `pausesBefore[k]` counts the beats before move k), and
 * `// comments`. For showing the text in sync with playback.
 */
export interface AlgDocument {
  moves: Move[];
  sources: SourceRange[];
  pausesBefore: number[];
  comments: (SourceRange & { text: string })[];
}

export function parseAlgDocument(text: string): AlgDocument {
  const parser = new Parser(text);
  const items = parser.parse();
  const moves: Move[] = [], sources: SourceRange[] = [], pausesBefore: number[] = [];
  let beats = 0;
  for (const it of items) {
    if ("pause" in it) beats++;
    else {
      moves.push(it.move);
      sources.push({ start: it.start, end: it.end });
      pausesBefore.push(beats);
      beats = 0;
    }
  }
  return { moves, sources, pausesBefore, comments: parser.comments };
}

export function parseAlg(text: string): Move[] {
  return parseAlgDocument(text).moves;
}

export function formatAlg(moves: readonly Move[]): string {
  return moves.map(formatMove).join(" ");
}

export function invert(moves: readonly Move[]): Move[] {
  return [...moves].reverse().map(invertMove);
}

/** Merge adjacent turns of the same family (R R → R2, R R' → nothing), repeatedly. */
export function simplify(moves: readonly Move[]): Move[] {
  const out: Move[] = [];
  for (const m of moves) {
    const last = out[out.length - 1];
    if (last && last.family === m.family) {
      out.pop();
      const merged = toAmount(amountQuarters(last.amount) + amountQuarters(m.amount));
      if (merged !== null) out.push({ family: m.family, amount: merged });
    } else out.push(m);
  }
  return out;
}

const LAYER_MIRROR: Partial<Record<MoveFamily, MoveFamily>> = { R: "L", L: "R", r: "l", l: "r" };

/** Mirror left↔right (the plane between L and R): R ↔ L', U → U', M and x unchanged, … */
export function mirrorLR(moves: readonly Move[]): Move[] {
  return moves.map((m) => {
    const def = FAMILY[m.family];
    if (def.axis === 0) {
      const family = LAYER_MIRROR[m.family] ?? m.family;
      const flip = FAMILY[family].q !== def.q;
      return { family, amount: (flip && m.amount !== 2 ? -m.amount : m.amount) as Amount };
    }
    return invertMove(m);
  });
}

export type Metric = "htm" | "qtm" | "stm" | "etm";

/**
 * HTM: face/wide turn = 1, slice = 2 (two outer layers), rotation = 0.
 * QTM: like HTM but half turns count 2. STM: slices count 1. ETM: every token 1.
 */
export function moveCount(moves: readonly Move[], metric: Metric = "htm"): number {
  let n = 0;
  for (const m of moves) {
    const kind = moveKind(m);
    const half = m.amount === 2 ? 2 : 1;
    switch (metric) {
      case "etm":
        n += 1;
        break;
      case "stm":
        n += kind === "rotation" ? 0 : 1;
        break;
      case "htm":
        n += kind === "rotation" ? 0 : kind === "slice" ? 2 : 1;
        break;
      case "qtm":
        n += kind === "rotation" ? 0 : (kind === "slice" ? 2 : 1) * half;
        break;
    }
  }
  return n;
}
