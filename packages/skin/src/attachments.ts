/**
 * Things attached to stickers: decals (any PNG / SVG image) and features
 * (extra geometry — holes, charging slots, anything an app defines).
 *
 * Both are chosen with a `StickerSelector` and belong to the STICKER, not to
 * a place on the cube: a charging port on the yellow centre stays on the
 * yellow centre whatever you turn, and turns with it (see core
 * `stickerTurn`). Coordinates are tile-local: x right / y up in the tile's
 * plane as it sat at home, in fractions of the tile's HALF side (so ±1 is
 * the tile's edge), z out of the tile.
 *
 * Skins stay plain data: a skin names a feature `type` and passes `params`;
 * the code that draws it is registered once with `defineFeature` — built-ins
 * below, apps add their own the same way.
 */

import { FACES, type Face } from "@cubecore/core";
import type * as THREE from "three";
import type { PieceKind } from "./shapes";

// ─── selectors ───

/**
 * Which stickers something applies to. Every given condition must hold; an
 * empty selector matches all 54. `faces` are HOME faces, i.e. colour classes:
 * with the western scheme "D" = the yellow stickers.
 */
export interface StickerSelector {
  faces?: readonly Face[];
  kinds?: readonly PieceKind[];
  /** Explicit home facelet indices (e.g. 4 = the U centre). */
  stickers?: readonly number[];
}

export function kindOfSticker(sticker: number): PieceKind {
  const i = sticker % 9;
  return i === 4 ? "center" : i % 2 === 0 ? "corner" : "edge";
}

export function selects(selector: StickerSelector, sticker: number): boolean {
  if (selector.faces && !selector.faces.includes(FACES[Math.floor(sticker / 9)])) return false;
  if (selector.kinds && !selector.kinds.includes(kindOfSticker(sticker))) return false;
  if (selector.stickers && !selector.stickers.includes(sticker)) return false;
  return true;
}

export const selectedStickers = (selector: StickerSelector): number[] => Array.from({ length: 54 }, (_, i) => i).filter((i) => selects(selector, i));

// ─── decals ───

export interface Decal {
  select: StickerSelector;
  /** URL, data: URL or an SVG string. */
  image: string;
  /** Width and height as a fraction of the tile side. */
  size: number;
  /** Centre offset, tile-local (fractions of the half side). Default [0, 0]. */
  offset?: readonly [number, number];
  /** Extra counter-clockwise quarter turns. Default 0. */
  rotate?: number;
  /** "multiply" lets an image drawn on white sit on any colour. */
  blend?: "normal" | "multiply";
  /** Draw only while the sticker is shown in full colour (not dimmed / greyed by a mask). Default true. */
  onlyRegular?: boolean;
}

/**
 * An SVG string as a data: URL; URLs and data: URLs pass through. An SVG
 * without width/height gets 512×512: browsers load such an image with no
 * intrinsic size, which leaves a WebGL texture empty.
 */
export function imageUrl(image: string): string {
  const svg = image.trimStart();
  if (!svg.startsWith("<svg")) return image;
  const open = svg.slice(0, svg.indexOf(">") + 1);
  const sized = /\swidth=/.test(open) ? svg : svg.replace("<svg", '<svg width="512" height="512"');
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(sized)}`;
}

// ─── features ───

export interface FeatureUse {
  select: StickerSelector;
  /** A type registered with `defineFeature` ("holes", "slot", or your own). */
  type: string;
  params?: Record<string, unknown>;
}

export interface FeatureContext {
  /** Tile side in cubie units (tile-local ±1 = ± side / 2). */
  side: number;
  /** Height of the tile top above the cubie face. */
  thickness: number;
  params: Record<string, unknown>;
}

export interface FeatureDef {
  type: string;
  /**
   * three.js objects in tile-local 3D units: x/y in the tile plane (tile
   * centre = 0, cubie units — multiply fractions by side / 2), z = 0 on the
   * tile top. `three` is the renderer's three.js module.
   */
  build3d?(ctx: FeatureContext & { three: typeof THREE }): THREE.Object3D;
  /** SVG markup in the tile's box: x, y ∈ 0..1, y down, (0.5, 0.5) = tile centre. For @cubecore/image. */
  svg?(ctx: FeatureContext): string;
}

const REGISTRY = new Map<string, FeatureDef>();

/** Register (or replace) a feature type. */
export function defineFeature(def: FeatureDef): FeatureDef {
  REGISTRY.set(def.type, def);
  return def;
}

export const featureDef = (type: string): FeatureDef | undefined => REGISTRY.get(type);

// ─── built-in features ───

type Pt = readonly [number, number];
const num = (v: unknown, d: number) => (typeof v === "number" ? v : d);
const pts = (v: unknown, d: Pt[]): Pt[] => (Array.isArray(v) ? (v as Pt[]) : d);

/** Where the shade of a hole / slot is drawn: translucent black darkens any tile colour. */
function shade(three: typeof THREE, opacity: number): THREE.Material {
  return new three.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity, depthWrite: false });
}

/**
 * Round holes. params: `radius` (fraction of the tile side), `at` (tile-local
 * centres, fractions of the half side), `opacity` (0.38).
 */
defineFeature({
  type: "holes",
  build3d({ three, side, params }) {
    const g = new three.Group();
    const disc = new three.CircleGeometry(num(params.radius, 0.045) * side, 20);
    const mat = shade(three, num(params.opacity, 0.38));
    for (const [x, y] of pts(params.at, [[0.64, 0.64], [-0.64, 0.64], [-0.64, -0.64], [0.64, -0.64]])) {
      const m = new three.Mesh(disc, mat);
      m.position.set((x * side) / 2, (y * side) / 2, 0.001);
      g.add(m);
    }
    return g;
  },
  svg({ params }) {
    const r = num(params.radius, 0.045), o = num(params.opacity, 0.38);
    return pts(params.at, [[0.64, 0.64], [-0.64, 0.64], [-0.64, -0.64], [0.64, -0.64]])
      .map(([x, y]) => `<circle cx="${0.5 + x / 2}" cy="${0.5 - y / 2}" r="${r}" fill="#000" fill-opacity="${o}"/>`)
      .join("");
  },
});

/**
 * A rounded slot, e.g. a charging port. params: `width`, `height`, `radius`
 * (fractions of the tile side), `at` (tile-local centre), `opacity` (0.55).
 */
defineFeature({
  type: "slot",
  build3d({ three, side, params }) {
    const w = num(params.width, 0.3) * side, h = num(params.height, 0.1) * side;
    const r = Math.min(num(params.radius, 0.05) * side, w / 2, h / 2);
    const s = new three.Shape();
    s.moveTo(-w / 2 + r, -h / 2);
    s.lineTo(w / 2 - r, -h / 2);
    s.absarc(w / 2 - r, -h / 2 + r, r, -Math.PI / 2, 0, false);
    s.lineTo(w / 2, h / 2 - r);
    s.absarc(w / 2 - r, h / 2 - r, r, 0, Math.PI / 2, false);
    s.lineTo(-w / 2 + r, h / 2);
    s.absarc(-w / 2 + r, h / 2 - r, r, Math.PI / 2, Math.PI, false);
    s.lineTo(-w / 2, -h / 2 + r);
    s.absarc(-w / 2 + r, -h / 2 + r, r, Math.PI, Math.PI * 1.5, false);
    const m = new three.Mesh(new three.ShapeGeometry(s, 6), shade(three, num(params.opacity, 0.55)));
    const [x, y] = (params.at as Pt | undefined) ?? [0, 0];
    m.position.set((x * side) / 2, (y * side) / 2, 0.001);
    return m;
  },
  svg({ params }) {
    const w = num(params.width, 0.3), h = num(params.height, 0.1), r = Math.min(num(params.radius, 0.05), w / 2, h / 2);
    const [x, y] = (params.at as Pt | undefined) ?? [0, 0];
    return `<rect x="${0.5 + x / 2 - w / 2}" y="${0.5 - y / 2 - h / 2}" width="${w}" height="${h}" rx="${r}" fill="#000" fill-opacity="${num(params.opacity, 0.55)}"/>`;
  },
});
