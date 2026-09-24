/**
 * Cube pictures as SVG strings — no DOM, no canvas: the same call works in a
 * browser, a worker, or on a server (Node/Bun), and the output is a plain
 * string you can cache, inline, serve or turn into PNG.
 *
 * Views:
 *   "iso" — 3D-looking cube showing U, F and R (like a case card)
 *   "top" — last-layer diagram: U face plus the side stickers of the top layer
 *   "net" — unfolded cube (U on top, L F R B across, D below)
 */

import {
  FACELETS,
  type Frame,
  IDENTITY_FRAME,
  type Mask,
  type MaskState,
  type State,
  type Vec3,
  colorAt,
  maskStateAt,
  view as frameView,
} from "@cubecore/core";

export type View = "iso" | "top" | "net";

export interface ColorScheme {
  /** Colour of each colour class, U R F D L B home-face order. */
  faces: readonly [string, string, string, string, string, string];
  ignored: string;
  oriented: string;
  /** 0..1 — how far "dim" stickers are pulled towards the body colour. */
  dimAmount: number;
  body: string;
  background: string | null;
}

export const SCHEMES = {
  western: { faces: ["#ffffff", "#e8322f", "#23b04a", "#ffd500", "#ff8a00", "#1e5eff"], ignored: "#6b6b6b", oriented: "#39c7d4", dimAmount: 0.55, body: "#111111", background: null },
  japanese: { faces: ["#ffffff", "#e8322f", "#23b04a", "#1e5eff", "#ff8a00", "#ffd500"], ignored: "#6b6b6b", oriented: "#39c7d4", dimAmount: 0.55, body: "#111111", background: null },
} satisfies Record<string, ColorScheme>;

export interface SvgOptions {
  view?: View;
  /** Output width in px (height follows the view's aspect ratio). */
  size?: number;
  scheme?: ColorScheme;
  mask?: Mask;
  /** Draw the cube as held in this frame (e.g. to show a case with the cross on D whatever face it was solved on). */
  frame?: Frame;
  /** Sticker corner radius, 0..0.5 of a sticker. */
  stickerRadius?: number;
  /** Gap between stickers, 0..0.3 of a cubie. */
  gap?: number;
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;

function mix(hex: string, towards: string, amount: number): string {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const a = p(hex), b = p(towards);
  return "#" + a.map((v, i) => Math.round(v + (b[i] - v) * amount).toString(16).padStart(2, "0")).join("");
}

function stickerFill(state: State, position: number, o: Required<Pick<SvgOptions, "scheme">> & SvgOptions): string | null {
  const st: MaskState = o.mask ? maskStateAt(o.mask, state, position) : "regular";
  const base = o.scheme.faces[colorAt(state, position)];
  switch (st) {
    case "regular":
      return base;
    case "dim":
      return mix(base, o.scheme.body, o.scheme.dimAmount);
    case "ignored":
      return o.scheme.ignored;
    case "oriented":
      return o.scheme.oriented;
    case "invisible":
      return null;
  }
}

/** Rounded polygon path through `pts` (convex, in order). */
function roundedPath(pts: [number, number][], radius: number): string {
  if (radius <= 0) return `M${pts.map((p) => p.map(r3).join(",")).join("L")}Z`;
  const n = pts.length;
  let d = "";
  for (let i = 0; i < n; i++) {
    const prev = pts[(i + n - 1) % n], cur = pts[i], next = pts[(i + 1) % n];
    const toward = (a: [number, number], b: [number, number]) => {
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const k = Math.min(radius, len / 2) / len;
      return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
    };
    const p1 = toward(cur, prev), p2 = toward(cur, next);
    d += `${i === 0 ? "M" : "L"}${r3(p1[0])},${r3(p1[1])}Q${r3(cur[0])},${r3(cur[1])} ${r3(p2[0])},${r3(p2[1])}`;
  }
  return d + "Z";
}

const TANGENTS: Record<string, [Vec3, Vec3]> = {
  U: [[1, 0, 0], [0, 0, 1]],
  D: [[1, 0, 0], [0, 0, -1]],
  F: [[1, 0, 0], [0, -1, 0]],
  B: [[-1, 0, 0], [0, -1, 0]],
  R: [[0, 0, -1], [0, -1, 0]],
  L: [[0, 0, 1], [0, -1, 0]],
};

// ─── iso ───

const COS30 = Math.cos(Math.PI / 6);
function iso(p: Vec3): [number, number] {
  return [(p[0] - p[2]) * COS30, (p[0] + p[2]) * 0.5 - p[1]];
}

function isoSvg(state: State, o: Required<Pick<SvgOptions, "scheme" | "size" | "stickerRadius" | "gap">> & SvgOptions): string {
  const faces = ["U", "F", "R"];
  const half = 0.5 - o.gap / 2;
  let body = "";
  let stickers = "";
  // Body: one polygon per visible face.
  const outer = (face: string): [number, number][] => {
    const f = FACELETS.find((x) => x.face === face && x.index % 9 === 4)!;
    const c: Vec3 = [f.normal[0] * 1.5, f.normal[1] * 1.5, f.normal[2] * 1.5];
    const [a, b] = TANGENTS[face];
    return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => iso([c[0] + (a[0] * u + b[0] * v) * 1.5, c[1] + (a[1] * u + b[1] * v) * 1.5, c[2] + (a[2] * u + b[2] * v) * 1.5]));
  };
  for (const face of faces) body += `<path d="${roundedPath(outer(face), 0.12)}" fill="${o.scheme.body}"/>`;
  for (const f of FACELETS) {
    if (!faces.includes(f.face)) continue;
    const fill = stickerFill(state, f.index, o);
    if (!fill) continue;
    const c: Vec3 = [f.pos[0] + f.normal[0] * 0.5, f.pos[1] + f.normal[1] * 0.5, f.pos[2] + f.normal[2] * 0.5];
    const [a, b] = TANGENTS[f.face];
    const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => iso([c[0] + (a[0] * u + b[0] * v) * half, c[1] + (a[1] * u + b[1] * v) * half, c[2] + (a[2] * u + b[2] * v) * half]));
    stickers += `<path d="${roundedPath(pts, o.stickerRadius * half * 2)}" fill="${fill}"/>`;
  }
  const w = 3 * COS30 * 2, h = 3 * 2;
  return wrap(`${body}${stickers}`, [-w / 2 - 0.1, -h / 2 - 0.1, w + 0.2, h + 0.2], o);
}

// ─── flat views (top, net) ───

function square(x: number, y: number, size: number, o: Required<Pick<SvgOptions, "stickerRadius" | "gap">>): string {
  const g = o.gap / 2, s = size - o.gap;
  return roundedPath([[x + g, y + g], [x + g + s, y + g], [x + g + s, y + g + s], [x + g, y + g + s]], o.stickerRadius * s);
}

const NET_ORIGIN: Record<string, [number, number]> = { U: [3, 0], L: [0, 3], F: [3, 3], R: [6, 3], B: [9, 3], D: [3, 6] };

function netSvg(state: State, o: Required<Pick<SvgOptions, "scheme" | "size" | "stickerRadius" | "gap">> & SvgOptions): string {
  let out = "";
  for (const f of FACELETS) {
    const fill = stickerFill(state, f.index, o);
    if (!fill) continue;
    const [ox, oy] = NET_ORIGIN[f.face];
    const i = f.index % 9;
    out += `<path d="${square(ox + (i % 3), oy + Math.floor(i / 3), 1, o)}" fill="${fill}"/>`;
  }
  return wrap(out, [-0.1, -0.1, 12.2, 9.2], o);
}

function topSvg(state: State, o: Required<Pick<SvgOptions, "scheme" | "size" | "stickerRadius" | "gap">> & SvgOptions): string {
  let out = "";
  const strip = 0.35;
  // U face, F at the bottom.
  for (const f of FACELETS.filter((x) => x.face === "U")) {
    const fill = stickerFill(state, f.index, o);
    if (fill) out += `<path d="${square(f.pos[0] + 1, f.pos[2] + 1, 1, o)}" fill="${fill}"/>`;
  }
  // Side stickers of the top layer as thin strips around the U face.
  const g = o.gap / 2;
  for (const f of FACELETS.filter((x) => x.pos[1] === 1 && x.face !== "U" && x.face !== "D")) {
    const fill = stickerFill(state, f.index, o);
    if (!fill) continue;
    let x: number, y: number, w: number, h: number;
    const along = (f.face === "F" || f.face === "B" ? f.pos[0] : f.pos[2]) + 1;
    if (f.face === "F") [x, y, w, h] = [along, 3 + g, 1, strip];
    else if (f.face === "B") [x, y, w, h] = [along, -strip - g, 1, strip];
    else if (f.face === "R") [x, y, w, h] = [3 + g, along, strip, 1];
    else [x, y, w, h] = [-strip - g, along, strip, 1];
    const pad = o.gap / 2;
    const rect: [number, number][] =
      w === 1
        ? [[x + pad, y], [x + 1 - pad, y], [x + 1 - pad, y + h], [x + pad, y + h]]
        : [[x, y + pad], [x + w, y + pad], [x + w, y + 1 - pad], [x, y + 1 - pad]];
    out += `<path d="${roundedPath(rect, o.stickerRadius * strip)}" fill="${fill}"/>`;
  }
  const e = strip + g + 0.1;
  return wrap(out, [-e, -e, 3 + 2 * e, 3 + 2 * e], o);
}

function wrap(content: string, box: [number, number, number, number], o: Required<Pick<SvgOptions, "scheme" | "size">>): string {
  const [x, y, w, h] = box.map(r3);
  const height = Math.round((o.size * h) / w);
  const bg = o.scheme.background ? `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${o.scheme.background}"/>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${w} ${h}" width="${o.size}" height="${height}">${bg}${content}</svg>`;
}

export function renderSvg(state: State, options: SvgOptions = {}): string {
  const o = {
    view: "iso" as View,
    size: 160,
    scheme: SCHEMES.western as ColorScheme,
    stickerRadius: 0.15,
    gap: 0.08,
    ...options,
  };
  const s = o.frame && o.frame !== IDENTITY_FRAME ? frameView(state, o.frame) : state;
  return o.view === "net" ? netSvg(s, o) : o.view === "top" ? topSvg(s, o) : isoSvg(s, o);
}
