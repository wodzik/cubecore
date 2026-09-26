/**
 * Sticker shapes — pure geometry, no three.js.
 *
 * Real cubes (e.g. GAN stickerless tiles) shape a tile by what piece it is on
 * and which way the face centre is: a corner tile rounds off the corner that
 * points at the centre, an edge tile rounds its inner side into a "tongue",
 * the centre tile is nearly round. `StickerShape` describes that with four
 * corner radii per piece kind; custom SVG paths can replace any kind.
 *
 * Local sticker frame: x = tangent `a`, y = tangent `b`, z = outward normal
 * (a × b = n). Coordinates of a sticker's corners are (±1, ±1)·half-size.
 */

import { FACELETS, FACE_BASIS, type Vec3 } from "@cubecore/core";

export type PieceKind = "corner" | "edge" | "center";

export interface CornerRadii {
  /** Radius of the corner(s) facing the face centre, as a fraction of the tile side (0..0.5). */
  inner: number;
  /** Radius of the other corners. */
  outer: number;
}

export interface StickerShape {
  corner: CornerRadii;
  edge: CornerRadii;
  /** Centre tiles: one radius for all four corners. */
  center: number;
}

/**
 * Custom tile outlines as SVG path data in a 0..1 box (y down, like SVG).
 * Convention: the face centre lies towards the BOTTOM-RIGHT for corner tiles
 * and towards the BOTTOM for edge tiles; centre tiles are drawn as-is.
 * The renderer rotates each path into place.
 */
export type StickerPaths = Partial<Record<PieceKind, string>>;

export { FACE_BASIS };

const dot = (p: Vec3, q: Vec3) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];

export interface StickerLayout {
  kind: PieceKind;
  /** Position of the tile on its face: (u, v) ∈ {-1, 0, 1}², in the face's (a, b) axes. */
  u: number;
  v: number;
  /**
   * Radii of the corners in local order: (+x,+y), (−x,+y), (−x,−y), (+x,−y)
   * — i.e. counter-clockwise from top-right.
   */
  radii: [number, number, number, number];
  /** Quarter turns (CCW) that bring the path convention's "centre direction" onto this tile's. */
  pathQuarters: number;
}

const LOCAL_CORNERS: [number, number][] = [[1, 1], [-1, 1], [-1, -1], [1, -1]];

export function stickerLayout(faceletIndex: number, shape: StickerShape): StickerLayout {
  const f = FACELETS[faceletIndex];
  const { a, b } = FACE_BASIS[f.face];
  const u = dot(f.pos, a), v = dot(f.pos, b);
  const kind: PieceKind = u === 0 && v === 0 ? "center" : u !== 0 && v !== 0 ? "corner" : "edge";
  let radii: [number, number, number, number];
  if (kind === "center") radii = [shape.center, shape.center, shape.center, shape.center];
  else {
    const r = kind === "corner" ? shape.corner : shape.edge;
    // A corner of the tile faces the centre when it points the opposite way to the tile's offset.
    radii = LOCAL_CORNERS.map(([sx, sy]) => {
      const inner = kind === "corner" ? sx === -Math.sign(u) && sy === -Math.sign(v) : u !== 0 ? sx === -Math.sign(u) : sy === -Math.sign(v);
      return inner ? r.inner : r.outer;
    }) as [number, number, number, number];
  }
  // Path convention (SVG, y down): centre towards bottom-right (corner) / bottom (edge). In local
  // coords (y up) that is direction (+1, −1) / (0, −1). Rotate it onto (−u, −v).
  const target: [number, number] = [-Math.sign(u), -Math.sign(v)];
  const from: [number, number] = kind === "corner" ? [1, -1] : [0, -1];
  let q = 0;
  let d = from;
  while (q < 4 && (d[0] !== target[0] || d[1] !== target[1])) {
    d = [-d[1], d[0]];
    q++;
  }
  return { kind, u, v, radii, pathQuarters: kind === "center" ? 0 : q % 4 };
}

/** Outline of a tile of side `side` with per-corner radii (fractions of `side`), as points CCW. */
export function roundedOutline(side: number, radii: readonly number[], segments = 8): [number, number][] {
  const h = side / 2;
  const pts: [number, number][] = [];
  LOCAL_CORNERS.forEach(([sx, sy], i) => {
    const r = Math.min(radii[i] * side, h);
    const cx = sx * (h - r), cy = sy * (h - r);
    // Arc from the corner's first edge to the second, going CCW.
    const start = Math.atan2(sy, sx) - Math.PI / 4;
    for (let k = 0; k <= segments; k++) {
      const t = start + (k / segments) * (Math.PI / 2);
      pts.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]);
    }
  });
  return pts;
}

export interface TileExtents {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

/**
 * Which sides of a tile lie on the cube's outer edge (in local x/y): e.g. the
 * top-left corner tile of a face has its −x and +y sides on the edge.
 */
export function outerSides(layout: StickerLayout): { xMin: boolean; xMax: boolean; yMin: boolean; yMax: boolean } {
  return { xMin: layout.u === -1, xMax: layout.u === 1, yMin: layout.v === -1, yMax: layout.v === 1 };
}

/**
 * A custom (path) outline made stickerless: the half of the tile towards
 * each outer side is stretched so that side reaches `edge` (from `half`), the
 * inner sides stay put. The path should run straight along its outer sides
 * and be square where two of them meet (the cube corner — the edge round
 * shapes it there).
 */
export function reachEdge(outline: readonly [number, number][], layout: StickerLayout, half: number, edge: number): [number, number][] {
  const o = outerSides(layout);
  const k = edge / half;
  return outline.map(([x, y]) => [(x < 0 && o.xMin) || (x > 0 && o.xMax) ? x * k : x, (y < 0 && o.yMin) || (y > 0 && o.yMax) ? y * k : y]);
}

/**
 * Stickerless tiles: sides on the cube's outer edge run all the way to
 * `edge` (the cubie face half-size plus a little overlap), so two faces'
 * colours meet directly on the cube's edges and corners with no black line
 * between them; the other sides keep the gap at `half`. A tile corner where
 * two outer sides meet (a cube corner) is sharp.
 */
export function stickerlessOutline(layout: StickerLayout, side: number, edge: number, segments = 8): [number, number][] {
  const half = side / 2;
  const o = outerSides(layout);
  const ext: TileExtents = { xMin: o.xMin ? -edge : -half, xMax: o.xMax ? edge : half, yMin: o.yMin ? -edge : -half, yMax: o.yMax ? edge : half };
  // Local corners in order (+,+), (−,+), (−,−), (+,−).
  const cornerOuter = [
    [o.xMax, o.yMax],
    [o.xMin, o.yMax],
    [o.xMin, o.yMin],
    [o.xMax, o.yMin],
  ];
  const radii = layout.radii.map((r, i) => (cornerOuter[i][0] && cornerOuter[i][1] ? 0 : r * side));
  return roundedRect(ext, radii, segments);
}

/** Rectangle with independent extents and absolute per-corner radii, CCW from the (+x,+y) corner. */
export function roundedRect(ext: TileExtents, radii: readonly number[], segments = 8): [number, number][] {
  const corners: [number, number, number, number][] = [
    [ext.xMax, ext.yMax, 1, 1],
    [ext.xMin, ext.yMax, -1, 1],
    [ext.xMin, ext.yMin, -1, -1],
    [ext.xMax, ext.yMin, 1, -1],
  ];
  const w = ext.xMax - ext.xMin, h = ext.yMax - ext.yMin;
  const pts: [number, number][] = [];
  corners.forEach(([x, y, sx, sy], i) => {
    const r = Math.min(radii[i], w / 2, h / 2);
    const cx = x - sx * r, cy = y - sy * r;
    const start = Math.atan2(sy, sx) - Math.PI / 4;
    if (r === 0) {
      pts.push([x, y]);
      return;
    }
    for (let k = 0; k <= segments; k++) {
      const t = start + (k / segments) * (Math.PI / 2);
      pts.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]);
    }
  });
  return pts;
}

/** A sticker laid on a (black) tile — see `Skin.stickers.overlay`. */
export interface StickerOverlay {
  /** Side of the sticker (fraction of a cubie face) — its inner sides. */
  size: number;
  centerSize?: number;
  /** How far the sticker keeps from the cube's outer edges (cubie units) — room for the rounded cube edge. */
  margin: number;
  /** Corner radii as in `StickerShape` (fractions of the sticker side). */
  shape: StickerShape;
  /** Radius where a corner sticker meets the cube's corner (cubie units). Default: its outer radius. */
  cornerRadius?: number;
  /** How far the sticker stands on the tile (cubie units). */
  thickness: number;
  /** Rounding of the sticker's edge (≤ thickness). Default: a hair. */
  bevel?: number;
}

/**
 * A sticker's outline on its tile: the inner sides at the sticker's size,
 * the sides on the cube's outer edge `margin` short of it (the black rounded
 * edge shows round it), per-corner radii from the shape; a corner sticker's
 * corner at the cube's corner takes `cornerRadius`.
 */
export function overlayOutline(faceletIndex: number, overlay: StickerOverlay, segments = 8): [number, number][] {
  const layout = stickerLayout(faceletIndex, overlay.shape);
  const half = (layout.kind === "center" ? (overlay.centerSize ?? overlay.size) : overlay.size) / 2;
  const out = 0.5 - overlay.margin;
  const o = outerSides(layout);
  const ext: TileExtents = { xMin: o.xMin ? -out : -half, xMax: o.xMax ? out : half, yMin: o.yMin ? -out : -half, yMax: o.yMax ? out : half };
  const side = 2 * half;
  const both = [
    [o.xMax, o.yMax],
    [o.xMin, o.yMax],
    [o.xMin, o.yMin],
    [o.xMax, o.yMin],
  ];
  const radii = layout.radii.map((r, i) => (both[i][0] && both[i][1] && overlay.cornerRadius !== undefined ? overlay.cornerRadius : r * side));
  return roundedRect(ext, radii, segments);
}
