/**
 * Cube pictures as SVG strings — no DOM, no canvas: the same call works in a
 * browser, a worker, or on a server (Node/Bun), and the output is a plain
 * string you can cache, inline, serve or turn into PNG.
 *
 * Looks come from the same `Skin` as the 3D renderer (@cubecore/skin):
 * colours, mask colours, tile shapes per piece kind, custom SVG tile outlines,
 * stickerless tiles and the logo — one skin, one look in 3D and in pictures.
 *
 * Views:
 *   "iso" — 3D-looking cube showing U, F and R (like a case card)
 *   "top" — last-layer diagram: U face plus the side stickers of the top layer
 *   "net" — unfolded cube (U on top, L F R B across, D below)
 *
 * Every tile is drawn in its face's own (a, b) coordinates and then mapped to
 * the picture by an affine projection per view, so shapes, paths and logos
 * work the same way in all three views.
 */

import {
  type CenterSpins,
  FACELETS,
  FACE_BASIS,
  type Face,
  type Facelet,
  type Frame,
  IDENTITY_FRAME,
  type Mask,
  type Mat3,
  type State,
  type Vec3,
  apply,
  centerUp,
  colorAt,
  faceOfNormal,
  maskStateAt,
  solvedSpins,
  view as frameView,
} from "@cubecore/core";
import { SKINS, type Skin, type StickerShape, roundedOutline, stickerColor, stickerLayout, stickerlessOutline } from "@cubecore/skin";

export type View = "iso" | "top" | "net";

export interface SvgOptions {
  view?: View;
  /** Output width in px (height follows the view's aspect ratio). */
  size?: number;
  /** Looks — the same skin the 3D renderer uses. Default `SKINS.standard`. */
  skin?: Skin;
  mask?: Mask;
  /** Draw the cube as held in this frame (e.g. to show a case with the cross on D whatever face it was solved on). */
  frame?: Frame;
  /** Centre spins (see `spinsAfter`) — only matter for the skin's logo. Default: all upright. */
  spins?: CenterSpins;
}

type Pt = [number, number];
type Projection = (face: Face, p: Vec3) => Pt;

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const add = (p: Vec3, q: Vec3, k = 1): Vec3 => [p[0] + q[0] * k, p[1] + q[1] * k, p[2] + q[2] * k];
const dot = (p: Vec3, q: Vec3) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];

// ─── projections (affine, per face) ───

const COS30 = Math.cos(Math.PI / 6);
const isoProjection: Projection = (_face, p) => [(p[0] - p[2]) * COS30, (p[0] + p[2]) * 0.5 - p[1]];

/** Faces of the net sit apart, so stickerless tiles of neighbouring faces don't run into each other. */
const NET_GAP = 0.15;
const NET_CELL: Record<Face, Pt> = { U: [1, 0], L: [0, 1], F: [1, 1], R: [2, 1], B: [3, 1], D: [1, 2] };
const NET_ORIGIN = Object.fromEntries(Object.entries(NET_CELL).map(([f, [c, r]]) => [f, [c * (3 + NET_GAP), r * (3 + NET_GAP)]])) as Record<Face, Pt>;
const netProjection: Projection = (face, p) => {
  const { a, b } = FACE_BASIS[face];
  const [ox, oy] = NET_ORIGIN[face];
  return [ox + 1.5 + dot(p, a), oy + 1.5 - dot(p, b)];
};

/** Side stickers of the top layer are squashed into strips of this depth around the U face. */
const STRIP = 0.35;
const STRIP_GAP = 0.08;
const topProjection: Projection = (face, p) => {
  if (face === "U") return [1.5 + p[0], 1.5 + p[2]];
  const n = FACE_BASIS[face].n;
  const out = STRIP_GAP + (1.5 - p[1]) * STRIP;
  return [1.5 + p[0] + n[0] * out, 1.5 + p[2] + n[2] * out];
};

interface ViewDef {
  project: Projection;
  /** Is this facelet drawn? */
  shows: (f: Facelet) => boolean;
  /** Faces that get a logo (full-size faces only). */
  logoFaces: readonly Face[];
  /** Body outlines drawn under the tiles. */
  bodies: readonly Face[];
  box: [number, number, number, number];
}

const E = STRIP + STRIP_GAP + 0.1;
const VIEWS: Record<View, ViewDef> = {
  iso: { project: isoProjection, shows: (f) => f.face === "U" || f.face === "F" || f.face === "R", logoFaces: ["U", "F", "R"], bodies: ["U", "F", "R"], box: [-3 * COS30 - 0.1, -3.1, 6 * COS30 + 0.2, 6.2] },
  net: { project: netProjection, shows: () => true, logoFaces: ["U", "R", "F", "D", "L", "B"], bodies: ["U", "R", "F", "D", "L", "B"], box: [-0.1, -0.1, 12 + 3 * NET_GAP + 0.2, 9 + 2 * NET_GAP + 0.2] },
  top: { project: topProjection, shows: (f) => f.face === "U" || (f.pos[1] === 1 && f.face !== "D"), logoFaces: ["U"], bodies: ["U"], box: [-E, -E, 3 + 2 * E, 3 + 2 * E] },
};

// ─── drawing helpers ───

const polygon = (pts: readonly Pt[]) => `M${pts.map((p) => `${r3(p[0])},${r3(p[1])}`).join("L")}Z`;

/** Rounded polygon through `pts` (convex, in order) — the cubie body faces. */
function roundedPolygon(pts: Pt[], radius: number): string {
  const n = pts.length;
  let d = "";
  for (let i = 0; i < n; i++) {
    const prev = pts[(i + n - 1) % n], cur = pts[i], next = pts[(i + 1) % n];
    const toward = (a: Pt, b: Pt) => {
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const k = Math.min(radius, len / 2) / len;
      return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
    };
    const p1 = toward(cur, prev), p2 = toward(cur, next);
    d += `${i === 0 ? "M" : "L"}${r3(p1[0])},${r3(p1[1])}Q${r3(cur[0])},${r3(cur[1])} ${r3(p2[0])},${r3(p2[1])}`;
  }
  return d + "Z";
}

/** 3D point of local tile coordinates (x along a, y along b) on facelet `f`. */
function onFace(f: Facelet, x: number, y: number): Vec3 {
  const { a, b } = FACE_BASIS[f.face];
  return add(add(add(f.pos, f.normal, 0.5), a, x), b, y);
}

/**
 * SVG `matrix(...)` mapping a unit box (0..1, y down — SVG convention) of side
 * `side`, turned `quarters` CCW, onto facelet `f` in the picture.
 */
function boxTransform(f: Facelet, side: number, quarters: number, project: Projection): string {
  const c = Math.cos((quarters * Math.PI) / 2), s = Math.sin((quarters * Math.PI) / 2);
  const at = (px: number, py: number): Pt => {
    const lx = (px - 0.5) * side, ly = (0.5 - py) * side;
    return project(f.face, onFace(f, lx * c - ly * s, lx * s + ly * c));
  };
  const o = at(0, 0), x = at(1, 0), y = at(0, 1);
  return `matrix(${[x[0] - o[0], x[1] - o[1], y[0] - o[0], y[1] - o[1], o[0], o[1]].map((n) => r3(n)).join(" ")})`;
}

function tileShape(skin: Skin): StickerShape {
  const r = skin.stickers.radius;
  return skin.stickers.shape ?? { corner: { inner: r, outer: r }, edge: { inner: r, outer: r }, center: r };
}

/** A physical centre's spin, re-expressed for the canonical face it plays in `frame`. */
function spinInFrame(spins: CenterSpins, state: State, centre: number, frame: Frame | undefined): number {
  const spin = spins[centre];
  if (!frame || frame === IDENTITY_FRAME) return spin;
  const f = FACELETS[state.indexOf(centre * 9 + 4)];
  const up = centerUp(f.face, spin);
  // Canonical vectors map to physical ones by `frame.matrix`; go back with its transpose.
  const m = frame.matrix;
  const t: Mat3 = [
    [m[0][0], m[1][0], m[2][0]],
    [m[0][1], m[1][1], m[2][1]],
    [m[0][2], m[1][2], m[2][2]],
  ];
  const face = faceOfNormal(apply(t, f.normal));
  const canonicalUp = apply(t, up);
  for (let k = 0; k < 4; k++) if (centerUp(face, k).every((v, i) => v === canonicalUp[i])) return k;
  return 0;
}

const imageHref = (image: string) => (image.trimStart().startsWith("<svg") ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(image)}` : image);
const attr = (v: string) => v.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

// ─── render ───

export function renderSvg(state: State, options: SvgOptions = {}): string {
  const viewName = options.view ?? "iso";
  const size = options.size ?? 160;
  const skin: Skin = options.skin ?? SKINS.standard;
  const v = VIEWS[viewName];
  const s = options.frame && options.frame !== IDENTITY_FRAME ? frameView(state, options.frame) : state;
  const side = skin.stickers.size * skin.cubieSize;
  const shape = tileShape(skin);

  let out = "";
  if (skin.background) out += `<rect x="${r3(v.box[0])}" y="${r3(v.box[1])}" width="${r3(v.box[2])}" height="${r3(v.box[3])}" fill="${skin.background}"/>`;

  // Plastic: one rounded square per drawn face.
  for (const face of v.bodies) {
    const f = FACELETS.find((x) => x.face === face && x.index % 9 === 4)!;
    const corners = ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as const).map(([u, w]) => v.project(face, onFace(f, u * 1.5, w * 1.5)));
    out += `<path d="${roundedPolygon(corners, skin.cubieRadius * 1.2)}" fill="${skin.body}"/>`;
  }

  for (const f of FACELETS) {
    if (!v.shows(f)) continue;
    const st = options.mask ? maskStateAt(options.mask, s, f.index) : "regular";
    const fill = stickerColor(skin, colorAt(s, f.index), st);
    if (!fill) continue;
    const layout = stickerLayout(f.index, shape);
    const path = skin.stickers.paths?.[layout.kind];
    if (path) {
      out += `<path d="${attr(path)}" transform="${boxTransform(f, side, layout.pathQuarters, v.project)}" fill="${fill}"/>`;
      continue;
    }
    // Stickerless: outer sides reach the cube edge (a hair past it, so neighbouring faces overlap instead of leaving an anti-aliased seam).
    const outline = skin.stickers.fillOuter ? stickerlessOutline(layout, side, 0.506, 6) : roundedOutline(side, layout.radii, 6);
    out += `<path d="${polygon(outline.map(([x, y]) => v.project(f.face, onFace(f, x, y))))}" fill="${fill}"/>`;
  }

  const logo = skin.logo;
  if (logo) {
    const pos = s.indexOf(logo.sticker);
    const f = FACELETS[pos];
    const visible = pos >= 0 && v.shows(f) && v.logoFaces.includes(f.face) && (!options.mask || maskStateAt(options.mask, s, pos) === "regular");
    if (visible) {
      const spin = logo.sticker % 9 === 4 ? spinInFrame(options.spins ?? solvedSpins(), state, Math.floor(logo.sticker / 9), options.frame) : 0;
      const blend = logo.blend === "multiply" ? ` style="mix-blend-mode:multiply"` : "";
      out += `<image href="${attr(imageHref(logo.image))}" width="1" height="1" preserveAspectRatio="xMidYMid meet" transform="${boxTransform(f, side * logo.size, spin, v.project)}"${blend}/>`;
    }
  }

  const [x, y, w, h] = v.box.map(r3);
  const height = Math.round((size * h) / w);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${w} ${h}" width="${size}" height="${height}">${out}</svg>`;
}
